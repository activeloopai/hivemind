/**
 * Data layer for `hivemind dashboard`.
 *
 * Loads two independent streams from local artifacts that other features
 * (codebase-graph feature branch, notifications/usage-tracker on main)
 * already produce — nothing here writes back. The dashboard is a
 * read-only render over what's on disk.
 *
 *   1. KPI snapshot
 *        - When creds + network are present, sums org-wide
 *          memorySearchBytes via fetchOrgStats (HTTP, with the 1-hour
 *          cache that notifications already maintains).
 *        - When org stats are unreachable, falls back to the local
 *          ~/.deeplake/usage-stats.jsonl record stream.
 *        - When neither exists (fresh install, no creds, no captured
 *          sessions yet), returns `tokensSource: "none"` so the
 *          renderer shows an empty-state card instead of "0 saved".
 *   2. Graph snapshot
 *        - Reads ~/.hivemind/graphs/<repo-key>/latest-commit.txt and
 *          loads the JSON it points at. Falls back to the newest *.json
 *          under snapshots/ when the pointer is missing or stale.
 *        - Returns null when no snapshot exists for this repo — the
 *          renderer then shows a graph empty-state with a hint to run
 *          `hivemind graph build` (the producer lives on the
 *          codebase-graph feature branch; the dashboard works without
 *          it).
 *
 * Why the savings formula constants are duplicated from
 * notifications/sources/primary-banner.ts: the banner lives in a
 * session-start hot path with no flexibility on imports, the dashboard
 * is a separate CLI entrypoint, and extracting a shared `savings.ts`
 * touches the banner's tested surface. Cheaper to duplicate two
 * constants and a one-line formula than to refactor a shipped path.
 * When the formula changes, both call sites update — grep for
 * SAVINGS_MULTIPLIER.
 */

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { loadCredentials, type Credentials } from "../commands/auth-creds.js";
import { fetchOrgStats, type OrgStats } from "../notifications/sources/org-stats.js";
import {
  countUserGeneratedSkills,
  readUsageRecords,
  sumMetric,
} from "../notifications/usage-tracker.js";
import { loadCurrentSnapshotDetails, workTreeIdFor } from "../graph/load-current.js";
import { lastBuildPath } from "../graph/last-build.js";
import { deriveProjectKey } from "../skillify/state.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("dashboard-data", msg);

/** BPE rule-of-thumb. Same value as primary-banner uses. */
const BYTES_PER_TOKEN = 4;

/** Published LoCoMo benchmark ratio (claude -p with hivemind uses 1/1.7
 *  the tokens of without). Same value as primary-banner uses. */
const SAVINGS_MULTIPLIER = 1.7;

export type TokensSource = "org" | "local" | "none";

export interface DashboardKpis {
  /** Org-wide (or local) cumulative tokens saved. null when neither
   *  source is available — distinguishes "empty install" from "0 saved". */
  tokensSaved: number | null;
  /** Which source produced tokensSaved. "none" => tokensSaved is null. */
  tokensSource: TokensSource;
  /** Skills authored by this user that are installed under
   *  ~/.claude/skills/. Local count; misses skills generated but not
   *  pulled to this machine. */
  skillsCreated: number;
  /** Memory-search count (recall hits org-wide or local). */
  memorySearches: number;
  /** Sessions counted in the source stream. null when source is "none". */
  sessionsCount: number | null;
  /** When source is "org", per-user contribution; when "local", same as
   *  tokensSaved (local stats ARE this user's contribution). null when
   *  source is "none". */
  userTokensSaved: number | null;
}

export interface DashboardGraphSummary {
  /** HEAD when the snapshot was built. null when graphify ran outside
   *  a git repo (snapshot named by content hash instead). */
  commitSha: string | null;
  /** Absolute path to the loaded snapshot file — surfaced so the HTML
   *  footer can show where the graph came from. */
  snapshotPath: string;
  nodeCount: number;
  edgeCount: number;
  /** Raw graphify-shape snapshot JSON. Embedded into the rendered HTML
   *  as a `<script type="application/json">` payload so the page is
   *  self-contained (no XHR back to disk). */
  snapshot: unknown;
}

export interface DashboardData {
  /** 16-char project key from deriveProjectKey — used as the on-disk
   *  directory name under ~/.hivemind/graphs/<repo-key>. */
  repoKey: string;
  /** Human-readable project name (basename of cwd). */
  repoProject: string;
  /** ISO timestamp at load time — shown in the HTML footer. */
  generatedAt: string;
  kpis: DashboardKpis;
  /** null when no snapshot exists yet for this repo. */
  graph: DashboardGraphSummary | null;
}

export interface LoadDashboardDataOptions {
  /** Project root. Defaults to process.cwd(). */
  cwd?: string;
  /** Override the graphs-home dir; falls back to env HIVEMIND_GRAPHS_HOME,
   *  then ~/.hivemind/graphs. Tests use this to point at a tmpdir. */
  graphsHome?: string;
  /** Override creds loading. Pass null to force "logged out" mode;
   *  undefined (default) calls loadCredentials() like the real CLI. */
  creds?: Credentials | null;
}

/** Resolution order for the graphs-home root:
 *    explicit opts.graphsHome arg > HIVEMIND_GRAPHS_HOME env > ~/.hivemind/graphs.
 *  Matches the producer's resolver on the codebase-graph branch. */
export function graphsRoot(): string {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join(homedir(), ".hivemind", "graphs");
}

function bytesToSavedTokens(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  const delivered = bytes / BYTES_PER_TOKEN;
  return (SAVINGS_MULTIPLIER - 1) * delivered;
}

interface SnapshotMin {
  nodes: unknown[];
  links: unknown[];
  graph?: { commit_sha?: string | null; repo_key?: string };
}

function snapshotSummary(snapshotPath: string, parsed: SnapshotMin): DashboardGraphSummary {
  return {
    commitSha: parsed.graph?.commit_sha ?? null,
    snapshotPath,
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.links.length,
    snapshot: parsed,
  };
}

function validSnapshotName(name: string): boolean {
  return /^[A-Za-z0-9._-]+\.json$/.test(name);
}

function parseSnapshot(path: string, repoKey: string, expectedCommitSha?: string): DashboardGraphSummary | null {
  if (!validSnapshotName(path.split("/").pop() ?? "")) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e: any) {
    log(`snapshot read failed: ${e?.message ?? String(e)}`);
    return null;
  }
  let parsed: SnapshotMin;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    log(`snapshot parse failed: ${e?.message ?? String(e)}`);
    return null;
  }
  if (!parsed || typeof parsed !== "object"
      || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
    log("snapshot shape invalid (missing nodes/links arrays)");
    return null;
  }
  const graph = parsed.graph;
  if (graph !== undefined && (typeof graph !== "object" || graph === null)) {
    log("snapshot identity invalid (graph metadata is not an object)");
    return null;
  }
  if (graph?.repo_key !== undefined && graph.repo_key !== repoKey) {
    log(`snapshot repo mismatch: expected ${repoKey}, got ${String(graph.repo_key)}`);
    return null;
  }
  if (expectedCommitSha !== undefined && graph?.commit_sha !== undefined && graph.commit_sha !== expectedCommitSha) {
    log(`snapshot head mismatch: pointer expects ${expectedCommitSha}, got ${String(graph?.commit_sha)}`);
    return null;
  }
  return snapshotSummary(path, parsed);
}

function resolveLegacySnapshot(repoDir: string, repoKey: string): DashboardGraphSummary | null {
  const snapshotsDir = join(repoDir, "snapshots");
  if (!existsSync(snapshotsDir)) return null;

  let snapshotPath: string | null = null;
  let pointedCommit: string | undefined;

  // Preferred path: follow latest-commit.txt. This is the canonical
  // pointer the producer maintains atomically alongside each build.
  const pointer = join(repoDir, "latest-commit.txt");
  if (existsSync(pointer)) {
    try {
      const sha = readFileSync(pointer, "utf-8").trim();
      if (sha && /^[A-Za-z0-9._-]+$/.test(sha)) {
        const candidate = join(snapshotsDir, `${sha}.json`);
        if (existsSync(candidate) && lstatSync(candidate).isFile()) {
          pointedCommit = sha;
          snapshotPath = candidate;
        }
        else log(`latest-commit.txt points at missing ${sha}.json — scanning snapshots/`);
      } else if (sha) {
        log("latest-commit.txt contains an unsafe snapshot name — scanning snapshots/");
      }
    } catch (e: any) {
      log(`latest-commit.txt read failed: ${e?.message ?? String(e)}`);
    }
  }

  // Fallback: pick the most-recently-modified *.json. Covers the
  // pre-pointer state and snapshots named by content hash (the
  // producer's fallback when commit_sha is null).
  if (!snapshotPath) {
    try {
      const candidates = readdirSync(snapshotsDir)
        .filter(validSnapshotName)
        .map(name => {
          const full = join(snapshotsDir, name);
          try {
            return lstatSync(full).isFile() ? { full, mtime: statSync(full).mtimeMs } : null;
          } catch {
            return null;
          }
        })
        .filter((candidate): candidate is { full: string; mtime: number } => candidate !== null)
        .sort((a, b) => b.mtime - a.mtime);
      for (const candidate of candidates) {
        if (parseSnapshot(candidate.full, repoKey)) {
          snapshotPath = candidate.full;
          break;
        }
      }
    } catch (e: any) {
      log(`snapshots/ scan failed: ${e?.message ?? String(e)}`);
    }
  }

  if (!snapshotPath) return null;

  return parseSnapshot(snapshotPath, repoKey, pointedCommit);
}

async function loadKpis(creds: Credentials | null): Promise<DashboardKpis> {
  const userName = creds?.userName;
  const skillsCreated = countUserGeneratedSkills(userName);

  const records = readUsageRecords();
  const localBytes = sumMetric(records, "memorySearchBytes");
  const localCount = sumMetric(records, "memorySearchCount");

  let orgStats: OrgStats | null = null;
  if (creds?.token) {
    try {
      orgStats = await fetchOrgStats(creds);
    } catch (e: any) {
      // fetchOrgStats already swallows network/parse failures and returns
      // null, but a future regression that throws shouldn't take the
      // dashboard down — surface the failure as "no org data" and let
      // the local fallback do its job.
      log(`fetchOrgStats threw: ${e?.message ?? String(e)}`);
    }
  }

  if (orgStats) {
    return {
      tokensSaved: bytesToSavedTokens(orgStats.org.memorySearchBytes),
      tokensSource: "org",
      skillsCreated,
      memorySearches: orgStats.org.memoryRecallCount,
      sessionsCount: orgStats.org.sessionsCount,
      userTokensSaved: bytesToSavedTokens(orgStats.user.memorySearchBytes),
    };
  }

  if (records.length > 0) {
    return {
      tokensSaved: bytesToSavedTokens(localBytes),
      tokensSource: "local",
      skillsCreated,
      memorySearches: localCount,
      sessionsCount: records.length,
      userTokensSaved: bytesToSavedTokens(localBytes),
    };
  }

  return {
    tokensSaved: null,
    tokensSource: "none",
    skillsCreated,
    memorySearches: 0,
    sessionsCount: null,
    userTokensSaved: null,
  };
}

/**
 * Build the data envelope handed to the renderer. Never throws — every
 * branch has a defined-but-empty fallback so the dashboard always
 * produces SOME page even on a fresh install with no creds, no
 * sessions, and no graph.
 */
export async function loadDashboardData(
  opts: LoadDashboardDataOptions = {},
): Promise<DashboardData> {
  const cwd = opts.cwd ?? process.cwd();
  const { key: repoKey, project: repoProject } = deriveProjectKey(cwd);
  const graphsHome = opts.graphsHome ?? graphsRoot();
  const repoDir = join(graphsHome, repoKey);

  // The graph producer owns a pointer per absolute worktree. Reuse that
  // resolver first; only old installations with no per-worktree state use the
  // legacy root pointer/mtime fallback below. A corrupt current pointer never
  // falls through to a sibling worktree's snapshot.
  const current = loadCurrentSnapshotDetails(cwd, { graphsHome });
  const hasCurrentState = [
    lastBuildPath(repoDir, workTreeIdFor(cwd)),
    lastBuildPath(repoDir),
  ].some(existsSync);
  const graph = current
    ? snapshotSummary(current.snapshotPath, current.snapshot as SnapshotMin)
    : hasCurrentState
      ? null
    : resolveLegacySnapshot(repoDir, repoKey);
  const creds = opts.creds === undefined ? loadCredentials() : opts.creds;
  const kpis = await loadKpis(creds);

  return {
    repoKey,
    repoProject,
    generatedAt: new Date().toISOString(),
    kpis,
    graph,
  };
}
