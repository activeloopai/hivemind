/**
 * `hivemind memory backfill` — stage knowledge from a fresh user's own past
 * local agent sessions into team memory, WITHOUT requiring sign-in.
 *
 * This is the memory analogue of `skillify mine-local`. Where mine-local
 * extracts reusable *skills*, this extracts the *knowledge graph* (entities,
 * decisions, relationships, facts) that the live SessionEnd path already
 * builds via the wiki prompt — but over the user's pre-Hivemind history.
 *
 * Two-phase, split at the upload boundary (see pending-memory-manifest.ts):
 *
 *   EXTRACT  (this command; no auth; runs in the background at install):
 *     1. Detect installed agents by session-dir presence (claude_code,
 *        codex, cursor, hermes).
 *     2. Enumerate local sessions, keep those modified within the window
 *        (default 6 weeks).
 *     3. Dedup against already-staged session ids.
 *     4. For each session: replay JSONL through the wiki prompt (claude -p),
 *        write the summary to ~/.claude/hivemind/pending-memory/<id>.md,
 *        compute the embedding LOCALLY via the embed daemon, and append an
 *        `uploaded: false` row to the manifest.
 *
 *   FLUSH    (separate, post-login): upload `uploaded: false` rows to the
 *     chosen org's `memory` table. Pure upload — no LLM, no embedding work,
 *     because extract already did both locally.
 *
 * v1 implements the dry-run enumeration end-to-end (zero LLM cost, shows
 * scope so the cost of a full run is known before it's paid). The extract
 * execution path delegates to the stage-only wiki-worker mode and is wired
 * in the next phase.
 */

import { homedir } from "node:os";

import {
  detectInstalledAgents,
  listLocalSessions,
  type SessionFile,
} from "../skillify/local-source.js";
import { projectNameFromCwd } from "../utils/project-name.js";
import { stagedSessionIds, PENDING_MEMORY_LOCK_PATH } from "../skillify/pending-memory-manifest.js";
import { stageSession, resolveClaudeBin, backfillSessionKey } from "../skillify/stage-memory.js";
import { existsSync, unlinkSync } from "node:fs";

/** Default look-back window: 6 weeks. Matches the cold-start retromine bound. */
const DEFAULT_WINDOW_DAYS = 42;

/**
 * Default cap on sessions extracted per run. A 6-week window can be 1000+
 * sessions, each costing one claude -p call — far too much to run blindly
 * at install. Extract the newest N (most relevant) by default; `--n all`
 * lifts the cap for users who explicitly want full history.
 */
const DEFAULT_MAX_SESSIONS = 50;

/** Concurrent claude -p extractions. Bounded to keep install-time load sane. */
const DEFAULT_CONCURRENCY = 4;

/** Per-session claude -p timeout (matches the live wiki-worker). */
const PER_SESSION_TIMEOUT_MS = 120_000;

/** Hard wall-clock budget for a whole extract run. */
const DEFAULT_BUDGET_MS = 15 * 60 * 1000;

/**
 * Sessions modified within this window are assumed in-flight (the agent —
 * often the very session that triggered the install — is still writing to
 * them). Extracting a live session times out on a large/locked file and
 * pollutes the summary with the install conversation itself. Mirrors
 * mine-local's IN_FLIGHT_MAX_AGE_MS.
 */
const IN_FLIGHT_MAX_AGE_MS = 60_000;

/** Parsed options controlling a `memory backfill` run. */
export interface BackfillOptions {
  /** Look-back window in days (sessions older than this are skipped). */
  windowDays: number;
  /** Stop before any LLM call; just report what would be staged. */
  dryRun: boolean;
  /** Re-stage sessions even if already present in the manifest. */
  force: boolean;
  /** Restrict to sessions whose cwd encodes to the current project. */
  projectOnly: boolean;
  /** Max sessions to extract this run. null = no cap (`--n all`). */
  maxSessions: number | null;
  /** List every per-session failure (key → reason) in the report. */
  verbose: boolean;
  /** Working directory used for cwd-bias and project scoping. */
  cwd: string;
}

/** Parse `memory backfill` argv into options, ignoring malformed numeric flags. */
export function parseBackfillArgs(argv: string[], cwd: string): BackfillOptions {
  const opts: BackfillOptions = {
    windowDays: DEFAULT_WINDOW_DAYS,
    dryRun: false,
    force: false,
    projectOnly: false,
    maxSessions: DEFAULT_MAX_SESSIONS,
    verbose: false,
    cwd,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--verbose" || a === "-v") opts.verbose = true;
    else if (a === "--project-only") opts.projectOnly = true;
    else if (a === "--window-days") {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) opts.windowDays = Math.floor(n);
    } else if (a === "--n") {
      const v = argv[++i];
      if (v === "all") opts.maxSessions = null;
      else {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) opts.maxSessions = Math.floor(n);
      }
    }
  }
  return opts;
}

/** The computed work-list for a run: what's in-window, deduped, and to extract. */
export interface BackfillPlan {
  windowDays: number;
  /** Cutoff epoch-ms; sessions with mtime < cutoff are excluded. */
  cutoffMs: number;
  /** Sessions inside the window, after project filter, before dedup. */
  inWindow: SessionFile[];
  /** Sessions already staged (skipped unless --force). */
  alreadyStaged: SessionFile[];
  /** Sessions that would be extracted this run (after the cap). */
  toExtract: SessionFile[];
  /** Eligible sessions dropped because they exceeded the cap (newest kept). */
  skippedByCap: number;
  /** Per-agent counts of toExtract, for the report. */
  byAgent: Record<string, number>;
}

/**
 * Pure planning core: given the full session list + the set of
 * already-staged ids, compute the plan. No filesystem/agent-detection — all
 * inputs are injected, so window/in-flight/dedup/cap logic is unit-testable.
 */
export function planFromSessions(
  all: SessionFile[],
  stagedIds: Set<string>,
  opts: BackfillOptions,
  now: number,
): BackfillPlan {
  const cutoffMs = now - opts.windowDays * 24 * 60 * 60 * 1000;
  const inFlightCutoff = now - IN_FLIGHT_MAX_AGE_MS;

  const inWindow = all.filter((s) => {
    if (s.mtime < cutoffMs) return false;
    // Skip the live session(s) still being written — including the one
    // that triggered this install.
    if (s.mtime >= inFlightCutoff) return false;
    if (opts.projectOnly && !s.inCwd) return false;
    return true;
  });
  // Newest first so a budget-capped run stages the most recent (most
  // relevant) work before older sessions.
  inWindow.sort((a, b) => b.mtime - a.mtime);

  const staged = opts.force ? new Set<string>() : stagedIds;
  const alreadyStaged: SessionFile[] = [];
  const eligible: SessionFile[] = [];
  for (const s of inWindow) {
    // Dedup on the same composite key the stager writes to the manifest, so
    // identical filename stems across agents don't false-match.
    if (staged.has(backfillSessionKey(s.agent, s.sessionId))) alreadyStaged.push(s);
    else eligible.push(s);
  }

  // Cap to the newest N (eligible is already sorted newest-first). `--n all`
  // sets maxSessions=null → no cap.
  const cap = opts.maxSessions;
  const toExtract = cap === null ? eligible : eligible.slice(0, cap);
  const skippedByCap = eligible.length - toExtract.length;

  const byAgent: Record<string, number> = {};
  for (const s of toExtract) byAgent[s.agent] = (byAgent[s.agent] ?? 0) + 1;

  return { windowDays: opts.windowDays, cutoffMs, inWindow, alreadyStaged, toExtract, skippedByCap, byAgent };
}

/**
 * Gather sessions from disk + the staging manifest, then delegate to the
 * pure planFromSessions core. `now` is injected for deterministic windowing.
 */
export function planBackfill(opts: BackfillOptions, now: number): BackfillPlan {
  const all = listLocalSessions(detectInstalledAgents(), opts.cwd);
  return planFromSessions(all, stagedSessionIds(), opts, now);
}

/** Render the human-readable plan/dry-run report (window, cap, by-agent counts). */
export function renderPlan(plan: BackfillPlan, opts: BackfillOptions): string {
  const lines: string[] = [];
  lines.push(`memory backfill — ${opts.dryRun ? "DRY RUN" : "plan"}`);
  lines.push(`  window:        last ${plan.windowDays} days`);
  lines.push(`  project-only:  ${opts.projectOnly ? `yes (${projectNameFromCwd(opts.cwd)})` : "no"}`);
  lines.push(`  in window:     ${plan.inWindow.length} session(s)`);
  lines.push(`  already staged:${" "}${plan.alreadyStaged.length}`);
  lines.push(`  cap:           ${opts.maxSessions === null ? "none (--n all)" : opts.maxSessions}`);
  lines.push(`  to extract:    ${plan.toExtract.length}${plan.skippedByCap ? ` (${plan.skippedByCap} over cap, newest kept)` : ""}`);
  const agents = Object.keys(plan.byAgent).sort();
  if (agents.length) {
    lines.push(`  by agent:      ${agents.map((a) => `${a}=${plan.byAgent[a]}`).join(", ")}`);
  }
  return lines.join("\n");
}

/** One session's failed-extraction outcome, surfaced in the run report. */
export interface BackfillFailure {
  /** Composite agent-id staging key (matches the manifest key). */
  session: string;
  /** Why it failed: a stageSession reason code, or `threw: <message>`. */
  reason: string;
}

/** Tally of an extract run: counts plus per-reason / per-session failure detail. */
export interface ExtractSummary {
  attempted: number;
  staged: number;
  embedded: number;
  failed: number;
  timedOutOnBudget: boolean;
  /** Per-reason failure tally, so a bare `N failed` is self-diagnosable. */
  failureReasons: Record<string, number>;
  /** Per-session failure detail, surfaced verbatim under --verbose. */
  failures: BackfillFailure[];
}

/** One session → staged outcome. Injectable so the executor is testable. */
export type StageFn = (
  session: SessionFile,
) => Promise<{ ok: boolean; embedded: boolean; reason?: string }>;

/** Clock injectable for budget tests. */
export type NowFn = () => number;

/** Default stager: real stage-only extraction via claude -p + local embed. */
function defaultStageFn(cwd: string, perSessionTimeoutMs: number): StageFn {
  const claudeBin = resolveClaudeBin();
  const project = projectNameFromCwd(cwd);
  return async (s) => {
    const res = await stageSession(
      { sessionId: s.sessionId, jsonlPath: s.path, agent: s.agent, project },
      { claudeBin, timeoutMs: perSessionTimeoutMs, skipEmbed: false, now: () => new Date().toISOString() },
    );
    return { ok: res.ok, embedded: res.embedded, reason: res.reason };
  };
}

/**
 * Run `toExtract` through the stage-only extractor with bounded concurrency
 * and a hard wall-clock budget. Newest-first ordering means a budget cutoff
 * drops the oldest, least-relevant sessions. Pure orchestration — each
 * worker writes its own summary + embedding + manifest row.
 */
export async function executeBackfill(
  toExtract: SessionFile[],
  opts: {
    concurrency: number;
    budgetMs: number;
    perSessionTimeoutMs: number;
    cwd: string;
    startMs: number;
    stage?: StageFn;
    now?: NowFn;
  },
): Promise<ExtractSummary> {
  const stage = opts.stage ?? defaultStageFn(opts.cwd, opts.perSessionTimeoutMs);
  const now = opts.now ?? Date.now;
  const summary: ExtractSummary = {
    attempted: 0, staged: 0, embedded: 0, failed: 0,
    timedOutOnBudget: false, failureReasons: {}, failures: [],
  };

  const recordFailure = (s: SessionFile, reason: string): void => {
    summary.failed++;
    summary.failureReasons[reason] = (summary.failureReasons[reason] ?? 0) + 1;
    summary.failures.push({ session: backfillSessionKey(s.agent, s.sessionId), reason });
  };

  const queue = [...toExtract];
  const deadline = opts.startMs + opts.budgetMs;

  async function worker(): Promise<void> {
    for (;;) {
      if (now() >= deadline) {
        if (queue.length) summary.timedOutOnBudget = true;
        return;
      }
      const s = queue.shift();
      if (!s) return;
      summary.attempted++;
      try {
        const res = await stage(s);
        if (res.ok) {
          summary.staged++;
          if (res.embedded) summary.embedded++;
        } else {
          recordFailure(s, res.reason ?? "unknown");
        }
      } catch (e) {
        // A stager that throws must not abort the whole run — count it as a
        // failed session and move on to the rest of the queue.
        recordFailure(s, `threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const n = Math.max(1, Math.min(opts.concurrency, toExtract.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return summary;
}

/**
 * Release the install-time spawn lock — ONLY when this process owns it.
 * The spawn worker (spawn-backfill-memory-worker.ts) acquires the lock and
 * sets HIVEMIND_BACKFILL_LOCK_OWNED=1 in the spawned process's env. A manual
 * `hivemind memory backfill` invocation never owns the lock, so it must not
 * delete one another (spawned) process is holding.
 */
export function releaseBackfillLock(lockPath: string = PENDING_MEMORY_LOCK_PATH): void {
  if (process.env.HIVEMIND_BACKFILL_LOCK_OWNED !== "1") return;
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch { /* best-effort */ }
}

/** CLI entry for `hivemind memory backfill`: plan, then extract unless --dry-run. */
export async function runBackfillMemory(argv: string[]): Promise<number> {
  const cwd = process.cwd();
  const opts = parseBackfillArgs(argv, cwd);
  // Everything that can throw runs inside the try so the finally always
  // releases the lock — a planBackfill/renderPlan failure must not strand a
  // worker-owned lock. releaseBackfillLock is itself a no-op unless this
  // process owns the lock, so the dry-run early return is safe under it.
  try {
    const plan = planBackfill(opts, Date.now());
    process.stdout.write(renderPlan(plan, opts) + "\n");
    if (opts.dryRun) return 0;
    return await runExtract(plan, cwd, opts);
  } finally {
    releaseBackfillLock();
  }
}

/**
 * Render the failure diagnostics for a finished run. Always emits a
 * per-reason tally when anything failed (so a bare `N failed` is never a
 * dead end), and lists every failing session under --verbose. Returns the
 * lines to print; empty when nothing failed.
 */
export function renderFailures(result: ExtractSummary, verbose: boolean): string[] {
  if (result.failed === 0) return [];
  const lines: string[] = [];
  const reasons = Object.keys(result.failureReasons).sort();
  lines.push(`  ${result.failed} session(s) failed:`);
  for (const r of reasons) lines.push(`    ${r}: ${result.failureReasons[r]}`);
  if (verbose) {
    lines.push("  failing sessions:");
    for (const f of result.failures) lines.push(`    ${f.session} — ${f.reason}`);
  } else {
    lines.push("  re-run with --verbose to list each failing session.");
  }
  return lines;
}

/**
 * Pure render of a finished extract run: the staged-count headline, the
 * failure diagnostics, and the process exit code. Exit 1 only when the run
 * was a total wash (something failed and nothing staged) so install-time
 * callers can detect a hard failure; a partial success still exits 0.
 */
export function summarizeExtract(
  result: ExtractSummary,
  verbose: boolean,
): { lines: string[]; exitCode: number } {
  const lines: string[] = [
    `staged ${result.staged}/${result.attempted} session(s) ` +
      `(${result.embedded} embedded, ${result.failed} failed` +
      `${result.timedOutOnBudget ? ", budget reached" : ""}). ` +
      `Sign in and run the flush to push them into team memory.`,
    ...renderFailures(result, verbose),
  ];
  const exitCode = result.failed > 0 && result.staged === 0 ? 1 : 0;
  return { lines, exitCode };
}

/**
 * Execute the planned extraction and print the outcome. Returns the process
 * exit code (1 only on a total wash — see {@link summarizeExtract}); a no-op
 * when the plan is empty.
 */
export async function runExtract(plan: BackfillPlan, cwd: string, opts: BackfillOptions): Promise<number> {

  if (plan.toExtract.length === 0) {
    process.stdout.write("nothing to extract; all in-window sessions already staged.\n");
    return 0;
  }

  const result = await executeBackfill(plan.toExtract, {
    concurrency: DEFAULT_CONCURRENCY,
    budgetMs: DEFAULT_BUDGET_MS,
    perSessionTimeoutMs: PER_SESSION_TIMEOUT_MS,
    cwd,
    startMs: Date.now(),
  });

  const { lines, exitCode } = summarizeExtract(result, opts.verbose);
  process.stdout.write(lines.join("\n") + "\n");
  void homedir;
  return exitCode;
}
