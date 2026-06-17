import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { credentialsPath, hivemindGraphsHome } from "../utils/paths";
import { readJson } from "../utils/fs-json";

export interface SessionSummaryResult {
  text: string | null;
  source: "remote" | "local" | "missing" | "unreachable" | "invalid";
  message: string | null;
  degradedHint: string | null;
}

export interface DashboardKpis {
  tokensSaved: number | null;
  tokensSource: "org" | "local" | "none";
  skillsCreated: number;
  memorySearches: number;
  sessionsCount: number | null;
  userTokensSaved: number | null;
  orgStatsFetchedAt?: string | null;
  orgStatsStale?: boolean;
  orgStatsOffline?: boolean;
}

export interface DashboardGraphSummary {
  commitSha: string | null;
  snapshotPath: string;
  nodeCount: number;
  edgeCount: number;
  snapshot: unknown;
}

export interface DashboardDataEnvelope {
  repoKey: string;
  repoProject: string;
  generatedAt: string;
  kpis: DashboardKpis;
  graph: DashboardGraphSummary | null;
}

export interface RecentSession {
  sessionId: string;
  endedAt: string;
  memorySearchCount: number;
  eventCount?: number;
  project?: string | null;
  hadRecall?: boolean;
}

export interface GoalsListResult {
  loggedOut: boolean;
  goals: Array<{ goalId: string; owner: string; status: string; text: string }>;
  message?: string;
}

function repoRootFromExtension(): string {
  return join(__dirname, "..", "..", "..", "..");
}

function loadDashboardScriptPath(): string {
  return join(__dirname, "..", "scripts", "load-dashboard.mjs");
}

function statsFilePath(): string {
  return join(homedir(), ".deeplake", "usage-stats.jsonl");
}

function readUsageRecords(): Array<{ endedAt: string; sessionId: string; memorySearchBytes: number; memorySearchCount: number }> {
  try {
    if (!existsSync(statsFilePath())) return [];
    const out: Array<{ endedAt: string; sessionId: string; memorySearchBytes: number; memorySearchCount: number }> = [];
    for (const line of readFileSync(statsFilePath(), "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as Partial<{ endedAt: string; sessionId: string; memorySearchBytes: number; memorySearchCount: number }>;
        if (rec.endedAt && rec.sessionId) {
          out.push({
            endedAt: rec.endedAt,
            sessionId: rec.sessionId,
            memorySearchBytes: rec.memorySearchBytes ?? 0,
            memorySearchCount: rec.memorySearchCount ?? 0,
          });
        }
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Collapse the surface forms of a git remote URL. Mirrors core src/utils/repo-identity.ts. */
function normalizeGitRemoteUrl(url: string): string {
  let s = url.trim();
  const schemeMatch = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
  if (schemeMatch) s = s.slice(schemeMatch[0].length);
  if (!scheme) {
    const scp = s.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (scp) s = `${scp[1]}/${scp[2]}`;
  }
  s = s.replace(/^[^@/]+@/, "");
  const defaultPorts: Record<string, string> = { http: "80", https: "443", ssh: "22", git: "9418" };
  if (scheme && defaultPorts[scheme]) {
    s = s.replace(new RegExp(`^([^/]+):${defaultPorts[scheme]}(/|$)`), "$1$2");
  }
  s = s.replace(/\.git\/?$/i, "");
  s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

/**
 * Stable per-repo key: sha1 of the normalized git remote (fallback to cwd),
 * first 16 hex chars. Mirrors core deriveProjectKey so the fallback resolves
 * the SAME ~/.hivemind/graphs/<key> dir that `hivemind graph build` writes.
 */
function deriveProjectKey(cwd: string): { key: string; project: string } {
  let project = basename(cwd);
  let signature: string | null = null;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf-8" }).trim();
    if (top) project = basename(top);
  } catch {
    /* not a git repo */
  }
  try {
    const raw = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd, encoding: "utf-8" }).trim();
    signature = raw ? normalizeGitRemoteUrl(raw) : null;
  } catch {
    signature = null;
  }
  const key = createHash("sha1").update(signature ?? cwd).digest("hex").slice(0, 16);
  return { key, project };
}

export function resolveSnapshot(repoDir: string): DashboardGraphSummary | null {
  const snapshotsDir = join(repoDir, "snapshots");
  if (!existsSync(snapshotsDir)) return null;
  let snapshotPath: string | null = null;
  const pointer = join(repoDir, "latest-commit.txt");
  if (existsSync(pointer)) {
    const sha = readFileSync(pointer, "utf-8").trim();
    // `latest-commit.txt` is on-disk data; validate it is a bare hex SHA
    // before using it in a path so a tampered value like `../../etc/foo`
    // cannot escape snapshots/. Mirrors the guard in scripts/load-dashboard.mjs.
    if (/^[a-f0-9]{7,64}$/i.test(sha)) {
      const candidate = join(snapshotsDir, `${sha}.json`);
      if (existsSync(candidate)) snapshotPath = candidate;
    }
  }
  if (!snapshotPath) {
    const candidates = readdirSync(snapshotsDir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => ({ full: join(snapshotsDir, n), mtime: statSync(join(snapshotsDir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (candidates[0]) snapshotPath = candidates[0].full;
  }
  if (!snapshotPath) return null;
  try {
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf-8")) as {
      nodes?: unknown[];
      links?: unknown[];
      graph?: { commit_sha?: string | null };
    };
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) return null;
    return {
      commitSha: parsed.graph?.commit_sha ?? null,
      snapshotPath,
      nodeCount: parsed.nodes.length,
      edgeCount: parsed.links.length,
      snapshot: parsed,
    };
  } catch {
    return null;
  }
}

/** Local-only fallback when the canonical loader script is unavailable. */
function loadDashboardDataFallback(cwd: string): DashboardDataEnvelope {
  const { key: repoKey, project: repoProject } = deriveProjectKey(cwd);
  const records = readUsageRecords();
  const localBytes = records.reduce((s, r) => s + r.memorySearchBytes, 0);
  const localCount = records.reduce((s, r) => s + r.memorySearchCount, 0);
  const BYTES_PER_TOKEN = 4;
  const SAVINGS_MULTIPLIER = 1.7;
  const saved = records.length > 0 ? (SAVINGS_MULTIPLIER - 1) * (localBytes / BYTES_PER_TOKEN) : null;
  return {
    repoKey,
    repoProject,
    generatedAt: new Date().toISOString(),
    kpis: {
      tokensSaved: saved,
      tokensSource: records.length > 0 ? "local" : "none",
      skillsCreated: 0,
      memorySearches: localCount,
      sessionsCount: records.length > 0 ? records.length : null,
      userTokensSaved: saved,
      orgStatsFetchedAt: null,
      orgStatsStale: false,
      orgStatsOffline: false,
    },
    graph: resolveSnapshot(join(hivemindGraphsHome(), repoKey)),
  };
}

/** Default hard timeout for a dashboard loader subprocess. A hung loader must
 * not wedge the dashboard pane, so every spawn below is bounded. */
const LOADER_TIMEOUT_MS = 60_000;

/** Grace window after a SIGTERM before escalating to SIGKILL, for a child that
 * ignores graceful termination (e.g. stuck in uninterruptible I/O). */
const KILL_GRACE_MS = 3_000;

/**
 * Spawn a Node loader script, collect stdout, and enforce a hard timeout that
 * SIGTERMs a hung child (mirrors the kill-timer in runHivemindCliAsync). The
 * promise always settles: on close, on spawn error, or on timeout. Callers
 * decide their own fallback from `{ ok, stdout }`.
 */
function spawnLoaderScript(
  argv: string[],
  cwd: string,
  timeoutMs = LOADER_TIMEOUT_MS,
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, {
      cwd,
      env: { ...process.env, NODE_OPTIONS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = (): void => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve({ ok, stdout });
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      // Escalate to SIGKILL if the child ignores SIGTERM within the grace
      // window. The promise has already settled (false); this only reaps a
      // wedged process so it can't linger.
      killTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already exited */ }
      }, KILL_GRACE_MS);
      finish(false);
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("close", (code) => { clearTimers(); finish(code === 0); });
    child.on("error", () => { clearTimers(); finish(false); });
  });
}

/** Load dashboard envelope via the canonical CLI data layer (`src/dashboard/data.ts`). */
export async function loadDashboardData(cwd: string): Promise<DashboardDataEnvelope> {
  const scriptPath = loadDashboardScriptPath();
  if (!existsSync(scriptPath)) {
    return loadDashboardDataFallback(cwd);
  }
  const { ok, stdout } = await spawnLoaderScript([scriptPath, cwd], repoRootFromExtension());
  if (!ok || !stdout.trim()) return loadDashboardDataFallback(cwd);
  try {
    return JSON.parse(stdout) as DashboardDataEnvelope;
  } catch {
    return loadDashboardDataFallback(cwd);
  }
}

export function invalidateOrgStatsCache(): void {
  const cachePath = join(homedir(), ".deeplake", "hivemind-stats-cache.json");
  try {
    if (existsSync(cachePath)) unlinkSync(cachePath);
  } catch {
    /* best-effort */
  }
}

export async function loadRecentSessions(_cwd: string): Promise<RecentSession[]> {
  const scriptPath = join(__dirname, "..", "scripts", "load-sessions.mjs");
  if (!existsSync(scriptPath)) return loadRecentSessionsFallback(_cwd);
  const { stdout } = await spawnLoaderScript([scriptPath, _cwd], repoRootFromExtension());
  try {
    return JSON.parse(stdout) as RecentSession[];
  } catch {
    return loadRecentSessionsFallback(_cwd);
  }
}

function loadRecentSessionsFallback(_cwd: string): RecentSession[] {
  return readUsageRecords()
    .slice(-20)
    .reverse()
    .map((r) => ({
      sessionId: r.sessionId,
      endedAt: r.endedAt,
      memorySearchCount: r.memorySearchCount,
      project: basename(_cwd),
      hadRecall: r.memorySearchCount > 0,
    }));
}

export interface RulesListResult {
  loggedOut: boolean;
  rules: Array<{ id: string; status: string; version: number; author: string; text: string }>;
  message?: string;
}

export async function loadRulesList(status: string, limit = 10): Promise<RulesListResult> {
  const scriptPath = join(__dirname, "..", "scripts", "load-rules.mjs");
  if (!existsSync(scriptPath)) {
    return { loggedOut: true, rules: [], message: "Rules loader unavailable." };
  }
  const { ok, stdout } = await spawnLoaderScript([scriptPath, status, String(limit)], repoRootFromExtension());
  if (!ok) return { loggedOut: true, rules: [], message: "Failed to load rules." };
  try {
    return JSON.parse(stdout) as RulesListResult;
  } catch {
    return { loggedOut: true, rules: [], message: "Failed to parse rules." };
  }
}

export async function loadGoalsList(filter: "mine" | "all" = "mine"): Promise<GoalsListResult> {
  const scriptPath = join(__dirname, "..", "scripts", "load-goals.mjs");
  if (!existsSync(scriptPath)) {
    return { loggedOut: true, goals: [], message: "Goals loader unavailable." };
  }
  const { ok, stdout } = await spawnLoaderScript([scriptPath, filter], repoRootFromExtension());
  if (!ok) return { loggedOut: false, goals: [], message: "Failed to load goals." };
  try {
    return JSON.parse(stdout) as GoalsListResult;
  } catch {
    return { loggedOut: false, goals: [], message: "Failed to parse goals." };
  }
}

/** Load session summary from remote memory table with local disk fallback. */
export async function loadSessionSummary(sessionId: string, cwd: string): Promise<SessionSummaryResult> {
  const creds = readJson<{ userName?: string }>(credentialsPath());
  const userName = creds?.userName ?? "";
  const scriptPath = join(__dirname, "..", "scripts", "load-session-summary.mjs");
  if (!existsSync(scriptPath)) {
    const path = join(homedir(), ".deeplake", "memory", "summaries", userName, `${sessionId}.md`);
    if (userName && existsSync(path)) {
      try {
        return {
          text: readFileSync(path, "utf-8"),
          source: "local",
          message: null,
          degradedHint: null,
        };
      } catch {
        /* fall through */
      }
    }
    return {
      text: null,
      source: "missing",
      message: `No summary file found for session ${sessionId}.`,
      degradedHint:
        "If cursor-agent is missing or logged out, summaries fail silently until PRD-002 health checks pass.",
    };
  }

  const { ok, stdout } = await spawnLoaderScript([scriptPath, sessionId, userName], repoRootFromExtension());
  if (!ok) {
    return {
      text: null,
      source: "unreachable",
      message: "Could not load session summary.",
      degradedHint: "Summary loader failed to start or timed out.",
    };
  }
  try {
    const parsed = JSON.parse(stdout) as {
      text?: string | null;
      source?: SessionSummaryResult["source"];
      message?: string | null;
    };
    const degradedHint =
      parsed.source === "unreachable"
        ? parsed.message ?? "Memory table unreachable."
        : parsed.source === "missing"
          ? "If cursor-agent is missing or logged out, summaries fail silently until PRD-002 health checks pass."
          : null;
    return {
      text: parsed.text ?? null,
      source: parsed.source ?? "missing",
      message: parsed.message ?? null,
      degradedHint,
    };
  } catch {
    return {
      text: null,
      source: "missing",
      message: `No summary found for session ${sessionId}.`,
      degradedHint: null,
    };
  }
}

export async function runHivemindCli(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return runHivemindCliAsync(args, cwd);
}

export function runHivemindCliAsync(
  args: string[],
  cwd: string,
  timeoutMs = 300_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // spawn() runs without a shell, so each array element is passed as a
    // distinct argv entry and cannot trigger shell injection. Do NOT prepend
    // a "--" separator: the hivemind CLI reads its subcommand from argv[0]
    // (see src/cli/index.ts `cmd = args[0]`) and has no leading-"--" handling,
    // so "hivemind -- <subcommand> ..." is parsed as the command literally
    // named "--" and exits with "Unknown command: --", breaking every
    // CLI-backed dashboard action. Option-injection hardening for
    // user-supplied positional values belongs in the CLI's per-subcommand
    // argument parser, not in a separator this CLI ignores.
    const child = spawn("hivemind", args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = (): void => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      // Escalate to SIGKILL if SIGTERM is ignored within the grace window.
      killTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already exited */ }
      }, KILL_GRACE_MS);
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.on("close", (code) => {
      clearTimers();
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimers();
      resolve({ ok: false, stdout, stderr: err.message });
    });
  });
}
