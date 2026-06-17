/**
 * Build the dashboard data envelope (KPIs + codebase graph snapshot).
 *
 * Self-contained: resolves the per-repo graph key the same way the core CLI
 * does (see lib/deeplake.mjs deriveProjectKey) so it finds the snapshot the
 * `hivemind graph build` command actually wrote under
 * ~/.hivemind/graphs/<key>/snapshots. KPIs come from the org-stats cache the
 * CLI maintains, falling back to local usage records, then to an empty state.
 * Prints a DashboardDataEnvelope JSON to stdout.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { loadCreds, deriveProjectKey, graphsHome, query, sqlStr, sqlIdent, tableNames } from "./lib/deeplake.mjs";

const cwd = process.argv[2] || process.cwd();

const BYTES_PER_TOKEN = 4;
const SAVINGS_MULTIPLIER = 1.7;

function bytesToSavedTokens(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return (SAVINGS_MULTIPLIER - 1) * (bytes / BYTES_PER_TOKEN);
}

function countUserGeneratedSkills(userName) {
  if (!userName) return 0;
  const dir = join(homedir(), ".claude", "skills");
  if (!existsSync(dir)) return 0;
  const suffix = `--${userName}`;
  try {
    let count = 0;
    for (const name of readdirSync(dir)) {
      const idx = name.lastIndexOf(suffix);
      if (idx > 0 && idx + suffix.length === name.length) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

function readUsageRecords() {
  const path = join(homedir(), ".deeplake", "usage-stats.jsonl");
  if (!existsSync(path)) return [];
  const out = [];
  try {
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed);
        if (typeof rec.endedAt === "string" && typeof rec.sessionId === "string") {
          out.push({
            memorySearchBytes: typeof rec.memorySearchBytes === "number" ? rec.memorySearchBytes : 0,
            memorySearchCount: typeof rec.memorySearchCount === "number" ? rec.memorySearchCount : 0,
          });
        }
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    return [];
  }
  return out;
}

const STATS_CACHE_TTL_MS = 3600_000;

function statsCachePath() {
  return join(homedir(), ".deeplake", "hivemind-stats-cache.json");
}

function statsScopeKey(creds) {
  return JSON.stringify({
    apiUrl: creds.apiUrl ?? "https://api.deeplake.ai",
    orgId: creds.orgId ?? "",
    userName: creds.userName ?? "",
  });
}

function nonNegNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function scopeFromServer(scope) {
  return {
    sessionsCount: nonNegNumber(scope?.sessions_count),
    memoryRecallCount: nonNegNumber(scope?.memory_recall_count),
    memorySearchBytes: nonNegNumber(scope?.memory_search_bytes),
  };
}

function readStatsCache(scopeKey) {
  try {
    if (!existsSync(statsCachePath())) return {};
    const parsed = JSON.parse(readFileSync(statsCachePath(), "utf-8"));
    if (!parsed || parsed.scopeKey !== scopeKey || typeof parsed.fetchedAt !== "number") return {};
    if (!parsed.data?.org) return {};
    const age = Date.now() - parsed.fetchedAt;
    if (age >= 0 && age < STATS_CACHE_TTL_MS) return { fresh: parsed.data, fetchedAt: parsed.fetchedAt };
    return { stale: parsed.data, fetchedAt: parsed.fetchedAt };
  } catch {
    return {};
  }
}

function writeStatsCache(scopeKey, data) {
  try {
    mkdirSync(dirname(statsCachePath()), { recursive: true });
    writeFileSync(statsCachePath(), JSON.stringify({ fetchedAt: Date.now(), scopeKey, data }), "utf-8");
  } catch {
    /* best-effort cache */
  }
}

/**
 * Resolve org/user activity stats the same way the core CLI does: fresh
 * cache first, then a live `GET /me/hivemind-stats`, then stale cache.
 * Returns null when no creds or the endpoint is unreachable with no cache.
 */
async function fetchOrgStats(creds) {
  if (!creds?.token) return null;
  const apiUrl = creds.apiUrl; // already sanitized by loadCreds()
  const scopeKey = statsScopeKey(creds);
  const { fresh, stale, fetchedAt } = readStatsCache(scopeKey);
  if (fresh) {
    return { org: fresh.org, user: fresh.user ?? fresh.org, fetchedAt: new Date(fetchedAt).toISOString(), stale: false, offline: false };
  }
  try {
    const resp = await fetch(`${apiUrl}/me/hivemind-stats`, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...(creds.orgId ? { "X-Activeloop-Org-Id": creds.orgId } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const body = await resp.json().catch(() => null);
      if (body && typeof body === "object") {
        const data = { org: scopeFromServer(body.org), user: scopeFromServer(body.user) };
        writeStatsCache(scopeKey, data);
        return { org: data.org, user: data.user, fetchedAt: new Date().toISOString(), stale: false, offline: false };
      }
    }
  } catch {
    /* fall through to stale */
  }
  if (stale) {
    return { org: stale.org, user: stale.user ?? stale.org, fetchedAt: new Date(fetchedAt).toISOString(), stale: true, offline: true };
  }
  return null;
}

/** Sum the locally-tracked recall events (count + bytes delivered). */
function readRecallEvents() {
  const path = join(homedir(), ".deeplake", "recall-events.jsonl");
  if (!existsSync(path)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  try {
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed);
        if (typeof rec.bytes === "number" && rec.bytes > 0) {
          count += 1;
          bytes += rec.bytes;
        }
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    return { count: 0, bytes: 0 };
  }
  return { count, bytes };
}

/** Real distinct-session count for this user from the sessions table. */
async function fetchDistinctSessions(creds) {
  if (!creds || !creds.userName) return null;
  try {
    const table = sqlIdent(tableNames().sessions);
    const rows = await query(
      creds,
      `SELECT COUNT(DISTINCT path) AS c FROM "${table}" WHERE author = '${sqlStr(creds.userName)}'`,
    );
    const c = rows && rows[0] ? Number(rows[0].c) : NaN;
    return Number.isFinite(c) ? c : null;
  } catch {
    return null;
  }
}

function resolveSnapshot(repoDir) {
  const snapshotsDir = join(repoDir, "snapshots");
  if (!existsSync(snapshotsDir)) return null;
  let snapshotPath = null;
  const pointer = join(repoDir, "latest-commit.txt");
  if (existsSync(pointer)) {
    try {
      const sha = readFileSync(pointer, "utf-8").trim();
      if (/^[a-f0-9]{7,64}$/i.test(sha)) {
        const candidate = join(snapshotsDir, `${sha}.json`);
        if (existsSync(candidate)) snapshotPath = candidate;
      }
    } catch {
      /* fall through to newest-file scan */
    }
  }
  if (!snapshotPath) {
    try {
      const candidates = readdirSync(snapshotsDir)
        .filter((n) => n.endsWith(".json"))
        .map((n) => ({ full: join(snapshotsDir, n), mtime: statSync(join(snapshotsDir, n)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (candidates[0]) snapshotPath = candidates[0].full;
    } catch {
      return null;
    }
  }
  if (!snapshotPath) return null;
  try {
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf-8"));
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

const creds = loadCreds();
const repoKey = deriveProjectKey(cwd);
const repoProject = basename(cwd);
const graph = resolveSnapshot(join(graphsHome(), repoKey));
const skillsCreated = countUserGeneratedSkills(creds?.userName);

// Sessions: real distinct-session count for this user from the sessions
// table (consistent with the Sessions tab), with org rollup as a fallback.
const distinctSessions = await fetchDistinctSessions(creds);
// Memory recall: tracked locally by the pre-tool-use hook into
// recall-events.jsonl. The server rollup does not yet count Cursor recalls,
// so this local store is the source of truth for memory-search / tokens-saved.
const recall = readRecallEvents();
const org = await fetchOrgStats(creds);

let sessionsCount = distinctSessions;
if (sessionsCount == null && org) sessionsCount = org.org.sessionsCount ?? null;

let kpis;
if (recall.count > 0) {
  kpis = {
    tokensSaved: bytesToSavedTokens(recall.bytes),
    tokensSource: "local",
    skillsCreated,
    memorySearches: recall.count,
    sessionsCount,
    userTokensSaved: bytesToSavedTokens(recall.bytes),
    orgStatsFetchedAt: null,
    orgStatsStale: false,
    orgStatsOffline: false,
  };
} else if (org && ((org.org.memoryRecallCount ?? 0) > 0 || (org.org.memorySearchBytes ?? 0) > 0)) {
  kpis = {
    tokensSaved: bytesToSavedTokens(org.org.memorySearchBytes ?? 0),
    tokensSource: "org",
    skillsCreated,
    memorySearches: org.org.memoryRecallCount ?? 0,
    sessionsCount,
    userTokensSaved: bytesToSavedTokens((org.user ?? org.org).memorySearchBytes ?? 0),
    orgStatsFetchedAt: org.fetchedAt,
    orgStatsStale: org.stale,
    orgStatsOffline: org.offline,
  };
} else {
  // Sessions are real; memory-recall metrics have not accumulated yet.
  kpis = {
    tokensSaved: null,
    tokensSource: "none",
    skillsCreated,
    memorySearches: 0,
    sessionsCount,
    userTokensSaved: null,
    orgStatsFetchedAt: org ? org.fetchedAt : null,
    orgStatsStale: org ? org.stale : false,
    orgStatsOffline: org ? org.offline : false,
  };
}

process.stdout.write(
  JSON.stringify({
    repoKey,
    repoProject,
    generatedAt: new Date().toISOString(),
    kpis,
    graph,
  }),
);
