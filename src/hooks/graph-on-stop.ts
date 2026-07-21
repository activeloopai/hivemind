/**
 * Auto-build hook for the codebase-graph feature (Phase 1.5).
 *
 * Registered in harnesses/claude-code/hooks/hooks.json under BOTH "Stop" AND
 * "SessionEnd" with async: true. Why both:
 *   - "Stop" fires after every model turn in INTERACTIVE Claude sessions.
 *     Rate-limit gate (10 min default) keeps the per-turn cost ~5ms in
 *     the skip path; you get near-real-time graph freshness while coding.
 *   - "SessionEnd" fires at session close. It's the ONLY end-of-session
 *     event that fires in `claude -p` non-interactive mode (where Stop
 *     is skipped). Without this registration `claude -p --plugin-dir`
 *     would run the agent and exit without ever rebuilding the graph.
 *
 * Double-firing race: at session close, Stop fires (async) THEN SessionEnd
 * fires (async) almost simultaneously. Both processes read the pre-build
 * .last-build.json and both pass the gate. Without protection, both would
 * run a full build in parallel.
 *
 * Mitigation: cross-process build lock via acquireBuildLock(). Atomic
 * O_CREAT|O_EXCL on `.build.in-flight`. First-to-acquire runs the build;
 * the other logs "lock held-by-other" and exits without work. Stale locks
 * (process crashed mid-build) are auto-recovered after 5 minutes. See
 * src/graph/build-lock.ts.
 *
 * Common-case workload (when the gate skips):
 *
 *   1. Read ~/.hivemind/graphs/<key>/.last-build.json
 *   2. If now - lastBuild.ts < TICK_INTERVAL_MS → exit 0 (rate limit)
 *   3. Get HEAD via git rev-parse. If null → exit 0 (not in a git repo)
 *   4. If HEAD == lastBuild.commit_sha → exit 0 (no new commits)
 *   5. If `git diff --name-only <last-commit>..HEAD -- '*.ts' '*.tsx' | wc -l` < 1
 *      → exit 0 (threshold gate; only commit-touched source files trigger)
 *   6. Otherwise: run the build inline (cache makes warm rebuild ~85ms)
 *
 * Total cost on a "skip" path: ~5ms (one file read + one git call).
 * Total cost on a "build" path: ~85ms warm / ~2.5s cold (full rebuild).
 *
 * Important: this hook does NOT block Claude Code (async: true) and never
 * blocks the user. Errors are logged to .graph-on-stop.log and swallowed —
 * a buggy hook must never break the user's session.
 *
 * Process model: runs in-process (no detached spawn). With async: true,
 * Claude Code launches us and moves on; we run to completion in our own
 * lifetime and exit. No daemon, no PID file, no cross-platform issues.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { acquireBuildLock, releaseBuildLock } from "../graph/build-lock.js";
import { readLastBuild } from "../graph/last-build.js";
import { repoDir } from "../graph/snapshot.js";
import { isDirectRun } from "../utils/direct-run.js";
import { deriveProjectKey } from "../utils/repo-identity.js";

/**
 * Mirror of workTreeIdFor in src/commands/graph.ts. Kept inline (rather
 * than as a shared util) so the gate hook stays leanly self-contained —
 * one sha256-hex-truncate, no extra module dependency.
 */
function workTreeIdFor(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

/**
 * How long between auto-rebuilds. The first SessionEnd after this interval
 * AND after a commit-with-source-changes is the one that fires the build.
 * Earlier SessionEnds within the window skip the build. Override via
 * HIVEMIND_GRAPH_TICK_INTERVAL_MS for tests.
 */
function tickIntervalMs(): number {
  const raw = process.env.HIVEMIND_GRAPH_TICK_INTERVAL_MS;
  if (raw === undefined) return 10 * 60 * 1000; // 10 minutes
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10 * 60 * 1000;
}

/**
 * Glob list applied to `git diff --name-only`. Mirrors the isSourceFile filter
 * in src/commands/graph.ts — TypeScript + JavaScript (B7), excluding .d.ts.
 */
const SOURCE_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.py", "*.pyi", ":(exclude)*.d.ts"];

/**
 * Run the gate logic, return whether a build should fire.
 *
 * Exported for unit testing — main() composes this with the side-effecting
 * runBuildCommand + logging.
 */
export interface GateContext {
  cwd: string;
  now: number;
  intervalMs: number;
  envDisable: boolean;
}

export interface GateDecision {
  fire: boolean;
  reason: string;
}

export function decideGate(ctx: GateContext): GateDecision {
  if (ctx.envDisable) return { fire: false, reason: "disabled (HIVEMIND_GRAPH_ON_STOP=0)" };

  const { key: repoKey } = deriveProjectKey(ctx.cwd);
  const baseDir = repoDir(repoKey);
  // Per-worktree gate: read THIS worktree's .last-build.json so we don't
  // skip a build that *another* worktree just finished. Without the
  // worktreeId, two checkouts of the same repo would share a singleton
  // .last-build.json and the gate would refuse to rebuild for either.
  const last = readLastBuild(baseDir, workTreeIdFor(ctx.cwd));

  // CodeRabbit P1: check git state BEFORE the first-build fast-path.
  // Without this, the hook fires on a brand-new non-git directory (which
  // hits last === null) and creates snapshots for arbitrary non-repo cwds
  // — contradicting the documented "not in a git repo → exit 0" skip.
  const head = readGitCommit(ctx.cwd);
  if (head === null) {
    return { fire: false, reason: "not in a git repo" };
  }

  if (last === null) {
    // Never built for this worktree before AND we're in a git repo: fire
    // so the user gets an initial snapshot. The build populates
    // .last-build.json so subsequent invocations see a non-null entry.
    return { fire: true, reason: "first build (no prior .last-build.json)" };
  }

  if (ctx.now - last.ts < ctx.intervalMs) {
    return { fire: false, reason: `rate limit (${Math.round((ctx.now - last.ts) / 1000)}s < ${Math.round(ctx.intervalMs / 1000)}s)` };
  }

  if (head === last.commit_sha) {
    return { fire: false, reason: "HEAD unchanged since last build" };
  }

  // Threshold gate: did any source file change between last-build commit and HEAD?
  const changedSourceCount = countSourceDiff(ctx.cwd, last.commit_sha, head);
  if (changedSourceCount < 1) {
    return { fire: false, reason: "no source files changed since last build" };
  }

  return { fire: true, reason: `${changedSourceCount} source file(s) changed since last build` };
}

/**
 * Returns the count of source files that changed between commit `from` and
 * commit `to`. Returns 0 on any git error (treat as "no change" for safety —
 * better to skip a build we should have done than to spin on a broken repo).
 *
 * Uses execFileSync with an argv array (not a shell command string) so the
 * globs are passed directly to git without shell quoting — critical on
 * Windows cmd.exe where single quotes are NOT quoting syntax and would
 * otherwise be treated as literal characters in the pathspec.
 */
function countSourceDiff(cwd: string, from: string | null, to: string): number {
  // If `from` is null, we can't diff; treat as "everything changed" so we
  // rebuild from scratch. This pairs with the "first build" branch above.
  if (from === null) return 1;
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", `${from}..${to}`, "--", ...SOURCE_GLOBS],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return out === "" ? 0 : out.split("\n").length;
  } catch {
    return 0;
  }
}

function readGitCommit(cwd: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Test seam for main(): allows injecting runBuildCommand + lock helpers so
 * tests can exercise the orchestration without touching real git state /
 * spawning the bundled build. Production code wires the real
 * implementations via the default parameter.
 */
export interface MainDeps {
  runBuildCommand?: (args: string[]) => Promise<void>;
  acquireBuildLock?: (baseDir: string) => { acquired: boolean; reason: string };
  releaseBuildLock?: (baseDir: string) => void;
  decideGate?: (ctx: GateContext) => GateDecision;
}

/**
 * Main entrypoint. Called from the bundled file. Reads minimal context from
 * the Claude Code stdin payload (cwd if provided, else process.cwd()).
 * Catches all errors and logs to .graph-on-stop.log so a hook bug never
 * crashes the user's session.
 */
export async function main(deps: MainDeps = {}): Promise<void> {
  const acquireFn = deps.acquireBuildLock ?? acquireBuildLock;
  const releaseFn = deps.releaseBuildLock ?? releaseBuildLock;
  const gateFn = deps.decideGate ?? decideGate;
  // Disable switch for users / CI:
  //   HIVEMIND_GRAPH_ON_STOP=0   → no-op
  const envDisable = process.env.HIVEMIND_GRAPH_ON_STOP === "0";
  // Claude Code passes a JSON payload on stdin; we don't need anything from
  // it for Phase 1 (cwd is process.cwd()), so we skip the read entirely.
  const ctx: GateContext = {
    cwd: process.cwd(),
    now: Date.now(),
    intervalMs: tickIntervalMs(),
    envDisable,
  };

  let decision: GateDecision;
  try {
    decision = gateFn(ctx);
  } catch (err) {
    logToFile(ctx.cwd, `decideGate threw: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  logToFile(ctx.cwd, `gate: ${decision.fire ? "FIRE" : "SKIP"} (${decision.reason})`);
  if (!decision.fire) return;

  // Cross-process lock: prevents the race where Stop and SessionEnd both
  // pass the gate (because both read the pre-build .last-build.json) and
  // start the build in parallel. The first to call acquireBuildLock wins;
  // the other logs SKIP-held-by-other and exits cheaply.
  const { key: repoKey } = deriveProjectKey(ctx.cwd);
  const baseDir = repoDir(repoKey);
  const lock = acquireFn(baseDir);
  if (!lock.acquired) {
    logToFile(ctx.cwd, `build skipped: lock ${lock.reason}`);
    return;
  }
  logToFile(ctx.cwd, `lock: ${lock.reason}`);

  // The trigger label here is what gets recorded in history.jsonl. We use
  // "session-end" as the canonical name for "an auto-trigger from this
  // hook" — even though the hook also runs from Stop in interactive mode.
  // The history entry's value is "what registered hook fired the build",
  // not "which underlying event"; both feed the same gate + lock so the
  // distinction is invisible to consumers.
  try {
    // Lazy-load runBuildCommand so this hook's MODULE LOAD never depends on
    // the tree-sitter native extractors. runBuildCommand → extract/index →
    // `import Parser from "tree-sitter"` is a chain of static ESM imports;
    // pulling it at the top of this file would make Node resolve tree-sitter
    // at load time. tree-sitter is an optionalDependency (may be absent on a
    // codex/cursor install whose native build failed — Node 24 / arm64), so
    // an unresolved package would abort module load with ERR_MODULE_NOT_FOUND
    // and exit the Stop hook with code 1 — BEFORE main()'s catch can swallow
    // it. Deferring the import to here (behind the gate, inside this try)
    // means a missing extractor degrades to a logged skip + exit 0, per this
    // hook's contract that "a buggy hook must never break the user's session".
    // The esbuild build for this entry uses `splitting` so the dynamic import
    // stays a runtime chunk load (mirrors the CLI fix in bundle/cli.js).
    const runBuildFn =
      deps.runBuildCommand ?? (await import("../commands/graph.js")).runBuildCommand;
    await runBuildFn(["--trigger", "session-end"]);
  } catch (err) {
    logToFile(ctx.cwd, `build threw: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    releaseFn(baseDir);
  }
}

function logToFile(cwd: string, line: string): void {
  try {
    const { key } = deriveProjectKey(cwd);
    const dir = repoDir(key);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, ".graph-on-stop.log"), `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // best-effort
  }
}

// Only invoke main() when this file is the process entry point (i.e., the
// Claude Code hook command launched us). Imports from tests must NOT trigger
// the side-effecting build pipeline.
if (isDirectRun(import.meta.url)) {
  main().catch((err) => {
    // Never let an unhandled promise rejection crash the hook process —
    // Claude Code captures the exit code and a non-zero would surface as
    // a noisy error to the user even though the hook is async:true.
    // eslint-disable-next-line no-console
    console.error(`graph-on-stop fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(0);
  });
}
