#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// dist/src/index-marker-store.js
var index_marker_store_exports = {};
__export(index_marker_store_exports, {
  buildIndexMarkerPath: () => buildIndexMarkerPath,
  getIndexMarkerDir: () => getIndexMarkerDir,
  hasFreshIndexMarker: () => hasFreshIndexMarker,
  writeIndexMarker: () => writeIndexMarker
});
import { existsSync as existsSync2, mkdirSync as mkdirSync4, readFileSync as readFileSync5, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join6 } from "node:path";
import { tmpdir } from "node:os";
function getIndexMarkerDir() {
  return process.env.HIVEMIND_INDEX_MARKER_DIR ?? join6(tmpdir(), "hivemind-deeplake-indexes");
}
function buildIndexMarkerPath(workspaceId, orgId, table, suffix) {
  const markerKey = [workspaceId, orgId, table, suffix].join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join6(getIndexMarkerDir(), `${markerKey}.json`);
}
function hasFreshIndexMarker(markerPath) {
  if (!existsSync2(markerPath))
    return false;
  try {
    const raw = JSON.parse(readFileSync5(markerPath, "utf-8"));
    const updatedAt = raw.updatedAt ? new Date(raw.updatedAt).getTime() : NaN;
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > INDEX_MARKER_TTL_MS)
      return false;
    return true;
  } catch {
    return false;
  }
}
function writeIndexMarker(markerPath) {
  mkdirSync4(getIndexMarkerDir(), { recursive: true });
  writeFileSync3(markerPath, JSON.stringify({ updatedAt: (/* @__PURE__ */ new Date()).toISOString() }), "utf-8");
}
var INDEX_MARKER_TTL_MS;
var init_index_marker_store = __esm({
  "dist/src/index-marker-store.js"() {
    "use strict";
    INDEX_MARKER_TTL_MS = Number(process.env.HIVEMIND_INDEX_MARKER_TTL_MS ?? 6 * 60 * 6e4);
  }
});

// dist/src/hooks/codex/pre-tool-use.js
import { join as join24, dirname as dirname13 } from "node:path";

// dist/src/utils/repo-identity.js
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
var DEFAULT_PORTS = {
  http: "80",
  https: "443",
  ssh: "22",
  git: "9418"
};
function normalizeGitRemoteUrl(url) {
  let s = url.trim();
  const schemeMatch = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
  if (schemeMatch)
    s = s.slice(schemeMatch[0].length);
  if (!scheme) {
    const scp = s.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (scp)
      s = `${scp[1]}/${scp[2]}`;
  }
  s = s.replace(/^[^@/]+@/, "");
  if (scheme && DEFAULT_PORTS[scheme]) {
    s = s.replace(new RegExp(`^([^/]+):${DEFAULT_PORTS[scheme]}(/|$)`), "$1$2");
  }
  s = s.replace(/\.git\/?$/i, "");
  s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}
function deriveProjectKey(cwd) {
  const absCwd = resolve(cwd);
  const project = basename(absCwd) || "unknown";
  let signature = null;
  try {
    const raw = execSync("git config --get remote.origin.url", {
      cwd: absCwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    signature = raw ? normalizeGitRemoteUrl(raw) : null;
  } catch {
  }
  const input = signature ?? absCwd;
  const key = createHash("sha1").update(input).digest("hex").slice(0, 16);
  return { key, project };
}

// dist/src/hooks/codex/pre-tool-use.js
import { fileURLToPath as fileURLToPath5 } from "node:url";
import { spawnSync } from "node:child_process";

// dist/src/utils/stdin.js
function readStdin() {
  return new Promise((resolve6, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => {
      try {
        resolve6(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Failed to parse hook input: ${err}`));
      }
    });
    process.stdin.on("error", reject);
  });
}

// dist/src/config.js
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, userInfo } from "node:os";
function loadConfig() {
  const home = homedir();
  const credPath = join(home, ".deeplake", "credentials.json");
  let creds = null;
  if (existsSync(credPath)) {
    try {
      creds = JSON.parse(readFileSync(credPath, "utf-8"));
    } catch {
      return null;
    }
  }
  const token = process.env.HIVEMIND_TOKEN ?? creds?.token;
  const orgId = process.env.HIVEMIND_ORG_ID ?? creds?.orgId;
  if (!token || !orgId)
    return null;
  return {
    token,
    orgId,
    orgName: creds?.orgName ?? orgId,
    userName: creds?.userName || userInfo().username || "unknown",
    workspaceId: process.env.HIVEMIND_WORKSPACE_ID ?? creds?.workspaceId ?? "default",
    apiUrl: process.env.HIVEMIND_API_URL ?? creds?.apiUrl ?? "https://api.deeplake.ai",
    tableName: process.env.HIVEMIND_TABLE ?? "memory",
    sessionsTableName: process.env.HIVEMIND_SESSIONS_TABLE ?? "sessions",
    skillsTableName: process.env.HIVEMIND_SKILLS_TABLE ?? "skills",
    // Defaults match the table name written into the SQL — keep aligned
    // with RULES_COLUMNS in deeplake-schema.ts and with the e2e test-org
    // override convention (memory_test / sessions_test → goals_test, etc.)
    // documented in CLAUDE.md.
    rulesTableName: process.env.HIVEMIND_RULES_TABLE ?? "hivemind_rules",
    // Goals + KPIs (refined design — VFS path classifier maps
    //   memory/goal/<user>/<status>/<uuid>.md → hivemind_goals row
    //   memory/kpi/<uuid>/<kpi_id>.md → hivemind_kpis row
    // See src/shell/deeplake-fs.ts for the translation logic and
    // GOALS_COLUMNS / KPIS_COLUMNS in deeplake-schema.ts for the
    // table shape.
    goalsTableName: process.env.HIVEMIND_GOALS_TABLE ?? "hivemind_goals",
    kpisTableName: process.env.HIVEMIND_KPIS_TABLE ?? "hivemind_kpis",
    // Per-file documentation kept fresh on code deltas. INSERT-only
    // version-bumped table (see DOCS_COLUMNS in deeplake-schema.ts).
    // Phase 1: written/read through the `hivemind docs` CLI + worker via the
    // src/docs store. NOT yet routed through the VFS path classifier — when
    // VFS routing lands it MUST use the INSERT-only store, never the goals
    // UPDATE-or-INSERT path (which is vulnerable to UPDATE-coalescing).
    docsTableName: process.env.HIVEMIND_DOCS_TABLE ?? "hivemind_docs",
    codebaseTableName: process.env.HIVEMIND_CODEBASE_TABLE ?? "codebase",
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join(home, ".deeplake", "memory")
  };
}

// dist/src/dir-config.js
import { readFileSync as readFileSync2 } from "node:fs";
import { dirname, join as join2, resolve as resolve2 } from "node:path";
var DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"];
function findDirConfig(startDir, stopAt) {
  let dir = resolve2(startDir);
  const boundary = stopAt ? resolve2(stopAt) : null;
  for (; ; ) {
    for (const name of DIR_CONFIG_FILENAMES) {
      const candidate = join2(dir, name);
      try {
        const raw = parseDirConfig(readFileSync2(candidate, "utf-8"));
        if (raw)
          return { path: candidate, raw };
      } catch {
      }
    }
    if (boundary && dir === boundary)
      break;
    const parent = dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}
function parseDirConfig(contents) {
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;
  const o = parsed;
  const out = {};
  if (typeof o.orgId === "string")
    out.orgId = o.orgId;
  if (typeof o.orgName === "string")
    out.orgName = o.orgName;
  if (typeof o.workspaceId === "string")
    out.workspaceId = o.workspaceId;
  if (typeof o.collect === "boolean")
    out.collect = o.collect;
  return out;
}
function resolveDirConfig(base, cwd, envOverride) {
  const found = findDirConfig(cwd);
  if (!found)
    return { config: base, collect: true, found: null };
  const orgLocked = !!(envOverride ? envOverride.HIVEMIND_ORG_ID : process.env.HIVEMIND_ORG_ID);
  const wsLocked = !!(envOverride ? envOverride.HIVEMIND_WORKSPACE_ID : process.env.HIVEMIND_WORKSPACE_ID);
  const config = {
    ...base,
    orgId: orgLocked ? base.orgId : found.raw.orgId ?? base.orgId,
    orgName: orgLocked ? base.orgName : found.raw.orgName ?? found.raw.orgId ?? base.orgName,
    workspaceId: wsLocked ? base.workspaceId : found.raw.workspaceId ?? base.workspaceId
  };
  return { config, collect: found.raw.collect !== false, found };
}

// dist/src/deeplake-api.js
import { randomUUID } from "node:crypto";

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname as dirname2, join as join3 } from "node:path";
import { homedir as homedir2 } from "node:os";
var LOG = join3(homedir2(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function log(tag, msg) {
  if (!isDebug())
    return;
  try {
    mkdirSync(dirname2(LOG), { recursive: true });
    appendFileSync(LOG, `${(/* @__PURE__ */ new Date()).toISOString()} [${tag}] ${msg}
`);
  } catch {
  }
}

// dist/src/utils/sql.js
function sqlStr(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\0/g, "").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
function sqlLike(value) {
  return sqlStr(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}
function sqlIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

// dist/src/embeddings/columns.js
var SUMMARY_EMBEDDING_COL = "summary_embedding";

// dist/src/utils/client-header.js
var DEEPLAKE_CLIENT_HEADER = "X-Deeplake-Client";
function deeplakeClientValue() {
  return "hivemind";
}
function deeplakeClientHeader() {
  return { [DEEPLAKE_CLIENT_HEADER]: deeplakeClientValue() };
}

// dist/src/deeplake-schema.js
var MEMORY_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "filename", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "summary", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "summary_embedding", sql: "FLOAT4[]" },
  { name: "author", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "mime_type", sql: "TEXT NOT NULL DEFAULT 'text/plain'" },
  { name: "size_bytes", sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "project", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "description", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "creation_date", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "last_update_date", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var SESSIONS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "filename", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "message", sql: "JSONB" },
  { name: "message_embedding", sql: "FLOAT4[]" },
  { name: "author", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "mime_type", sql: "TEXT NOT NULL DEFAULT 'application/json'" },
  { name: "size_bytes", sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "project", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "description", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "creation_date", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "last_update_date", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var SKILLS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "name", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "project", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "project_key", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "local_path", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "install", sql: "TEXT NOT NULL DEFAULT 'project'" },
  { name: "source_sessions", sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "source_agent", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "scope", sql: "TEXT NOT NULL DEFAULT 'me'" },
  { name: "author", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "contributors", sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "description", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "trigger_text", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "body", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var RULES_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "rule_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "text", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "scope", sql: "TEXT NOT NULL DEFAULT 'team'" },
  { name: "status", sql: "TEXT NOT NULL DEFAULT 'active'" },
  { name: "assigned_by", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var GOALS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "goal_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "owner", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "status", sql: "TEXT NOT NULL DEFAULT 'opened'" },
  { name: "content", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var KPIS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "goal_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "kpi_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "content", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" }
]);
var DOCS_COLUMNS = Object.freeze([
  { name: "id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "doc_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "content", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "anchors", sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "tier", sql: "TEXT NOT NULL DEFAULT 'fast'" },
  { name: "status", sql: "TEXT NOT NULL DEFAULT 'active'" },
  { name: "project", sql: "TEXT NOT NULL DEFAULT ''" },
  // Which shared view a row belongs to: `main` = the canonical truth
  // (written only by the elected refresh turn); `u:<user>|b:<branch>` =
  // a personal branch overlay (v2, opt-in). Reads default to `main`.
  { name: "scope", sql: "TEXT NOT NULL DEFAULT 'main'" },
  // Per-page source fingerprint: JSON `{file: git-blob-sha}` the page was
  // generated from. Drives freshness (stale iff it differs from HEAD's), the
  // overlay-divergence decision, the origin publish gate, and merge promotion.
  // Read only where needed (scoped reads) so generic reads stay heal-safe.
  { name: "source_fp", sql: "TEXT NOT NULL DEFAULT '{}'" },
  { name: "version", sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent", sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
  // Semantic-search vector over `content` (nomic, DOC_PREFIX). Nullable/empty
  // when embeddings are off or not yet backfilled — `docs/find/` guards with
  // ARRAY_LENGTH(...) > 0, exactly like grep-core does for summaries.
  { name: "content_embedding", sql: "FLOAT4[]" }
]);
function validateSchema(label, cols) {
  const seen = /* @__PURE__ */ new Set();
  for (const col of cols) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(col.name)) {
      throw new Error(`${label}: column name "${col.name}" is not a valid SQL identifier`);
    }
    if (seen.has(col.name)) {
      throw new Error(`${label}: duplicate column "${col.name}"`);
    }
    seen.add(col.name);
    const notNull = /\bNOT\s+NULL\b/i.test(col.sql);
    const hasDefault = /\bDEFAULT\b/i.test(col.sql);
    if (notNull && !hasDefault) {
      throw new Error(`${label}: column "${col.name}" is NOT NULL but has no DEFAULT \u2014 ALTER TABLE ADD COLUMN on a populated table would fail.`);
    }
  }
}
var CODEBASE_COLUMNS = Object.freeze([
  // Identity key (matches the PK below)
  { name: "org_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "workspace_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "repo_slug", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "user_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "worktree_id", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "commit_sha", sql: "TEXT NOT NULL DEFAULT ''" },
  // Observation metadata
  { name: "parent_sha", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "branch", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "ts", sql: "TIMESTAMP" },
  { name: "pushed_by", sql: "TEXT NOT NULL DEFAULT ''" },
  // Snapshot payload
  { name: "snapshot_sha256", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "snapshot_jsonb", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "node_count", sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "edge_count", sql: "BIGINT NOT NULL DEFAULT 0" },
  // Generator metadata (for drift diagnostics — what hivemind version produced this?)
  { name: "generator", sql: "TEXT NOT NULL DEFAULT 'hivemind-graph'" },
  { name: "generator_version", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "schema_version", sql: "BIGINT NOT NULL DEFAULT 1" }
]);
validateSchema("MEMORY_COLUMNS", MEMORY_COLUMNS);
validateSchema("SESSIONS_COLUMNS", SESSIONS_COLUMNS);
validateSchema("SKILLS_COLUMNS", SKILLS_COLUMNS);
validateSchema("RULES_COLUMNS", RULES_COLUMNS);
validateSchema("GOALS_COLUMNS", GOALS_COLUMNS);
validateSchema("KPIS_COLUMNS", KPIS_COLUMNS);
validateSchema("DOCS_COLUMNS", DOCS_COLUMNS);
validateSchema("CODEBASE_COLUMNS", CODEBASE_COLUMNS);
function buildCreateTableSql(tableName, cols) {
  const safe = sqlIdent(tableName);
  const colSql = cols.map((c) => `${c.name} ${c.sql}`).join(", ");
  return `CREATE TABLE IF NOT EXISTS "${safe}" (${colSql}) USING deeplake`;
}
function buildIntrospectionSql(tableName, workspaceId) {
  return `SELECT column_name FROM information_schema.columns WHERE table_name = '${sqlStr(tableName)}' AND table_schema = '${sqlStr(workspaceId)}'`;
}
async function healMissingColumns(args) {
  const safeTable = sqlIdent(args.tableName);
  const introspectSql = buildIntrospectionSql(args.tableName, args.workspaceId);
  const rows = await args.query(introspectSql);
  const existing = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const v = row?.column_name;
    if (typeof v === "string")
      existing.add(v.toLowerCase());
  }
  const missingCols = args.columns.filter((c) => !existing.has(c.name.toLowerCase()));
  const missing = missingCols.map((c) => c.name);
  if (missingCols.length === 0)
    return { missing, altered: [] };
  const altered = [];
  for (const col of missingCols) {
    try {
      await args.query(`ALTER TABLE "${safeTable}" ADD COLUMN ${col.name} ${col.sql}`);
      altered.push(col.name);
      args.log?.(`schema-heal: added "${args.tableName}"."${col.name}"`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists/i.test(msg))
        throw e;
      const recheck = await args.query(introspectSql);
      const present = recheck.some((r) => {
        const v = r?.column_name;
        return typeof v === "string" && v.toLowerCase() === col.name.toLowerCase();
      });
      if (!present)
        throw e;
      args.log?.(`schema-heal: "${args.tableName}"."${col.name}" appeared via race, treating as success`);
    }
  }
  return { missing, altered };
}

// dist/src/notifications/queue.js
import { readFileSync as readFileSync3, writeFileSync, mkdirSync as mkdirSync2, openSync, closeSync, unlinkSync, statSync } from "node:fs";
import { join as join4, resolve as resolve4 } from "node:path";
import { homedir as homedir3 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve as resolve3, relative, isAbsolute } from "node:path";
function isPathInsideHome(path2, home) {
  const r = resolve3(path2);
  const h = resolve3(home);
  if (r === h)
    return true;
  const rel = relative(h, r);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function renameAtomic(tmp, dest, opts = {}) {
  const rename = opts.rename ?? fsRenameSync;
  const cleanup = opts.cleanup ?? defaultCleanup;
  const maxAttempts = opts.maxAttempts ?? 10;
  const backoff = opts.backoff ?? defaultBackoff;
  for (let attempt = 0; ; attempt++) {
    try {
      rename(tmp, dest);
      return;
    } catch (e) {
      const code = e.code;
      const retryable = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!retryable || attempt >= maxAttempts - 1) {
        cleanup(tmp);
        throw e;
      }
      backoff(attempt);
    }
  }
}
function defaultCleanup(tmp) {
  try {
    fsUnlinkSync(tmp);
  } catch {
  }
}
function defaultBackoff(attempt) {
  const until = Date.now() + 10 * (attempt + 1);
  while (Date.now() < until) {
  }
}

// dist/src/notifications/queue.js
var log2 = (msg) => log("notifications-queue", msg);
var LOCK_RETRY_MAX = 50;
var LOCK_RETRY_BASE_MS = 5;
var LOCK_STALE_MS = 5e3;
function queuePath() {
  return join4(homedir3(), ".deeplake", "notifications-queue.json");
}
function lockPath() {
  return `${queuePath()}.lock`;
}
function readQueue() {
  try {
    const raw = readFileSync3(queuePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.queue)) {
      log2(`queue malformed \u2192 treating as empty`);
      return { queue: [] };
    }
    return { queue: parsed.queue };
  } catch {
    return { queue: [] };
  }
}
function _isQueuePathInsideHome(path2, home) {
  return isPathInsideHome(path2, home);
}
function writeQueue(q) {
  const path2 = queuePath();
  const home = resolve4(homedir3());
  if (!_isQueuePathInsideHome(path2, home)) {
    throw new Error(`notifications-queue write blocked: ${path2} is outside ${home}`);
  }
  mkdirSync2(join4(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path2}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameAtomic(tmp, path2);
}
async function withQueueLock(fn) {
  const path2 = lockPath();
  mkdirSync2(join4(homedir3(), ".deeplake"), { recursive: true, mode: 448 });
  let fd = null;
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      fd = openSync(path2, "wx", 384);
      break;
    } catch (e) {
      const code = e.code;
      if (code !== "EEXIST")
        throw e;
      try {
        const age = Date.now() - statSync(path2).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync(path2);
          continue;
        }
      } catch {
      }
      const delay = LOCK_RETRY_BASE_MS * (attempt + 1);
      await sleep(delay);
    }
  }
  if (fd === null) {
    log2(`lock acquisition gave up after ${LOCK_RETRY_MAX} attempts \u2014 proceeding unlocked (last-writer-wins)`);
    return fn();
  }
  try {
    return fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
    }
    try {
      unlinkSync(path2);
    } catch {
    }
  }
}
function sameDedupKey(a, b) {
  if (a.id !== b.id)
    return false;
  return JSON.stringify(a.dedupKey) === JSON.stringify(b.dedupKey);
}
async function enqueueNotification(n) {
  await withQueueLock(() => {
    const q = readQueue();
    if (q.queue.some((existing) => sameDedupKey(existing, n))) {
      return;
    }
    q.queue.push(n);
    writeQueue(q);
  });
}

// dist/src/commands/auth-creds.js
import { readFileSync as readFileSync4, writeFileSync as writeFileSync2, mkdirSync as mkdirSync3, unlinkSync as unlinkSync2, renameSync } from "node:fs";
import { join as join5 } from "node:path";
import { homedir as homedir4 } from "node:os";
function configDir() {
  return join5(homedir4(), ".deeplake");
}
function credsPath() {
  return join5(configDir(), "credentials.json");
}
function loadCredentials(readFile = (p) => readFileSync4(p, "utf-8")) {
  try {
    return JSON.parse(readFile(credsPath()));
  } catch (err) {
    if (err?.code === "ENOENT")
      return null;
    try {
      return JSON.parse(readFile(credsPath()));
    } catch {
      return null;
    }
  }
}

// dist/src/deeplake-api.js
var indexMarkerStorePromise = null;
function getIndexMarkerStore() {
  if (!indexMarkerStorePromise)
    indexMarkerStorePromise = Promise.resolve().then(() => (init_index_marker_store(), index_marker_store_exports));
  return indexMarkerStorePromise;
}
var log3 = (msg) => log("sdk", msg);
function summarizeSql(sql, maxLen = 220) {
  const compact = sql.replace(/\s+/g, " ").trim();
  return compact.length > maxLen ? `${compact.slice(0, maxLen)}...` : compact;
}
function traceSql(msg) {
  const traceEnabled = process.env.HIVEMIND_TRACE_SQL === "1" || process.env.HIVEMIND_DEBUG === "1";
  if (!traceEnabled)
    return;
  process.stderr.write(`[deeplake-sql] ${msg}
`);
  if (process.env.HIVEMIND_DEBUG === "1")
    log3(msg);
}
var _signalledBalanceExhausted = false;
function describeNetworkFailure(e, apiUrl) {
  const cause = e?.cause;
  const detail = cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e));
  return new Error(`Cannot reach the Deeplake API at ${apiUrl} (${detail}). If you are running inside an agent sandbox, outbound network access may be blocked \u2014 Codex's default sandbox blocks it, so run the command in your own terminal instead.`);
}
function isBalanceExhausted(status, bodyText) {
  return status === 402 && bodyText.includes("balance_cents");
}
function maybeSignalBalanceExhausted(status, bodyText) {
  if (!isBalanceExhausted(status, bodyText))
    return;
  if (_signalledBalanceExhausted)
    return;
  _signalledBalanceExhausted = true;
  log3(`balance exhausted \u2014 enqueuing session-start banner (body=${bodyText.slice(0, 120)})`);
  enqueueNotification({
    id: "balance-exhausted",
    severity: "warn",
    transient: true,
    title: "Hivemind credits exhausted \u2014 top up to keep capturing",
    body: `Sessions are not being saved and memory recall is returning empty. Top up at ${billingUrl()} to restore capture and recall.`,
    // Carries the org so a notice enqueued under one org is never rendered
    // after switching to another (observed: switching to a funded org still
    // showed the previous org's "credits exhausted" and linked to ITS billing
    // page). drainSessionStart drops queued notices whose org no longer
    // matches the credentials in force.
    dedupKey: { reason: "balance-zero", orgId: loadCredentials()?.orgId ?? null },
    // User-facing billing notice → user channel only. Never the model's
    // additionalContext: a "top up at <url>" instruction in the agent prompt
    // is a prompt-injection pattern external agents flag.
    userVisibleOnly: true
  }).catch((e) => {
    log3(`enqueue balance-exhausted failed: ${e instanceof Error ? e.message : String(e)}`);
  });
}
function billingUrl() {
  try {
    const c = loadCredentials();
    if (c?.orgId && c?.workspaceId) {
      return `https://deeplake.ai/${encodeURIComponent(c.orgId)}/workspace/${encodeURIComponent(c.workspaceId)}/billing`;
    }
  } catch {
  }
  return "https://deeplake.ai";
}
var RETRYABLE_CODES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var MAX_RETRIES = 3;
var BASE_DELAY_MS = 500;
var MAX_CONCURRENCY = 5;
function getQueryTimeoutMs() {
  return Number(process.env.HIVEMIND_QUERY_TIMEOUT_MS ?? 1e4);
}
function sleep2(ms, signal) {
  if (signal?.aborted)
    return Promise.reject(new Error("aborted"));
  return new Promise((resolve6, reject) => {
    const t = setTimeout(resolve6, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    }, { once: true });
  });
}
function isTimeoutError(error) {
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return name.includes("timeout") || name === "aborterror" || message.includes("timeout") || message.includes("timed out");
}
function isDuplicateIndexError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("duplicate key value violates unique constraint") || message.includes("pg_class_relname_nsp_index") || message.includes("already exists");
}
function isSessionInsertQuery(sql) {
  return /^\s*insert\s+into\s+"[^"]+"\s*\(\s*id\s*,\s*path\s*,\s*filename\s*,\s*message\s*,/i.test(sql);
}
function isTransientHtml403(text) {
  const body = text.toLowerCase();
  return body.includes("<html") || body.includes("403 forbidden") || body.includes("cloudflare") || body.includes("nginx");
}
var Semaphore = class {
  max;
  waiting = [];
  active = 0;
  constructor(max) {
    this.max = max;
  }
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise((resolve6) => this.waiting.push(resolve6));
  }
  release() {
    this.active--;
    const next = this.waiting.shift();
    if (next) {
      this.active++;
      next();
    }
  }
};
var DeeplakeApi = class {
  token;
  apiUrl;
  orgId;
  workspaceId;
  tableName;
  _pendingRows = [];
  _sem = new Semaphore(MAX_CONCURRENCY);
  _tablesCache = null;
  constructor(token, apiUrl, orgId, workspaceId, tableName) {
    this.token = token;
    this.apiUrl = apiUrl;
    this.orgId = orgId;
    this.workspaceId = workspaceId;
    this.tableName = tableName;
  }
  /** Execute SQL with retry on transient errors and bounded concurrency. */
  async query(sql, signal) {
    const startedAt = Date.now();
    const summary = summarizeSql(sql);
    traceSql(`query start: ${summary}`);
    await this._sem.acquire();
    try {
      const rows = await this._queryWithRetry(sql, signal);
      traceSql(`query ok (${Date.now() - startedAt}ms, rows=${rows.length}): ${summary}`);
      return rows;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      traceSql(`query fail (${Date.now() - startedAt}ms): ${summary} :: ${message}`);
      throw e;
    } finally {
      this._sem.release();
    }
  }
  async _queryWithRetry(sql, externalSignal) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (externalSignal?.aborted)
        throw new Error("Query aborted");
      let resp;
      const timeoutMs = getQueryTimeoutMs();
      try {
        const signal = externalSignal ? AbortSignal.any([externalSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
        resp = await fetch(`${this.apiUrl}/workspaces/${this.workspaceId}/tables/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "X-Activeloop-Org-Id": this.orgId,
            ...deeplakeClientHeader()
          },
          signal,
          body: JSON.stringify({ query: sql })
        });
      } catch (e) {
        if (isTimeoutError(e)) {
          lastError = new Error(`Query timeout after ${timeoutMs}ms`);
          throw lastError;
        }
        lastError = describeNetworkFailure(e, this.apiUrl);
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
          log3(`query retry ${attempt + 1}/${MAX_RETRIES} (fetch error: ${lastError.message}) in ${delay.toFixed(0)}ms`);
          await sleep2(delay, externalSignal);
          continue;
        }
        throw lastError;
      }
      if (resp.ok) {
        const raw = await resp.json();
        if (!raw?.rows || !raw?.columns)
          return [];
        return raw.rows.map((row) => Object.fromEntries(raw.columns.map((col, i) => [col, row[i]])));
      }
      const text = await resp.text().catch(() => "");
      const retryable403 = isSessionInsertQuery(sql) && (resp.status === 401 || resp.status === 403 && (text.length === 0 || isTransientHtml403(text)));
      const alreadyExists = resp.status === 500 && isDuplicateIndexError(text);
      if (!alreadyExists && attempt < MAX_RETRIES && (RETRYABLE_CODES.has(resp.status) || retryable403)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
        log3(`query retry ${attempt + 1}/${MAX_RETRIES} (${resp.status}) in ${delay.toFixed(0)}ms`);
        await sleep2(delay, externalSignal);
        continue;
      }
      maybeSignalBalanceExhausted(resp.status, text);
      if (isBalanceExhausted(resp.status, text)) {
        throw new Error(`Hivemind credits exhausted \u2014 sessions are not being saved and memory recall returns empty. Top up at ${billingUrl()} to restore capture and recall.`);
      }
      throw new Error(`Query failed: ${resp.status}: ${text.slice(0, 200)}`);
    }
    throw lastError ?? new Error("Query failed: max retries exceeded");
  }
  // ── Writes ──────────────────────────────────────────────────────────────────
  /** Queue rows for writing. Call commit() to flush. */
  appendRows(rows) {
    this._pendingRows.push(...rows);
  }
  /** Flush pending rows via SQL. */
  async commit() {
    if (this._pendingRows.length === 0)
      return;
    const rows = this._pendingRows;
    this._pendingRows = [];
    const CONCURRENCY = 10;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      await Promise.allSettled(chunk.map((r) => this.upsertRowSql(r)));
    }
    log3(`commit: ${rows.length} rows`);
  }
  async upsertRowSql(row) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const cd = row.creationDate ?? ts;
    const lud = row.lastUpdateDate ?? ts;
    const exists = await this.query(`SELECT path FROM "${this.tableName}" WHERE path = '${sqlStr(row.path)}' LIMIT 1`);
    if (exists.length > 0) {
      let setClauses = `summary = E'${sqlStr(row.contentText)}', ${SUMMARY_EMBEDDING_COL} = NULL, mime_type = '${sqlStr(row.mimeType)}', size_bytes = ${row.sizeBytes}, last_update_date = '${lud}'`;
      if (row.project !== void 0)
        setClauses += `, project = '${sqlStr(row.project)}'`;
      if (row.description !== void 0)
        setClauses += `, description = '${sqlStr(row.description)}'`;
      await this.query(`UPDATE "${this.tableName}" SET ${setClauses} WHERE path = '${sqlStr(row.path)}'`);
    } else {
      const id = randomUUID();
      let cols = `id, path, filename, summary, ${SUMMARY_EMBEDDING_COL}, mime_type, size_bytes, creation_date, last_update_date`;
      let vals = `'${id}', '${sqlStr(row.path)}', '${sqlStr(row.filename)}', E'${sqlStr(row.contentText)}', NULL, '${sqlStr(row.mimeType)}', ${row.sizeBytes}, '${cd}', '${lud}'`;
      if (row.project !== void 0) {
        cols += ", project";
        vals += `, '${sqlStr(row.project)}'`;
      }
      if (row.description !== void 0) {
        cols += ", description";
        vals += `, '${sqlStr(row.description)}'`;
      }
      await this.query(`INSERT INTO "${this.tableName}" (${cols}) VALUES (${vals})`);
    }
  }
  /** Update specific columns on a row by path. */
  async updateColumns(path2, columns) {
    const setClauses = Object.entries(columns).map(([col, val]) => typeof val === "number" ? `${col} = ${val}` : `${col} = '${sqlStr(String(val))}'`).join(", ");
    await this.query(`UPDATE "${this.tableName}" SET ${setClauses} WHERE path = '${sqlStr(path2)}'`);
  }
  // ── Convenience ─────────────────────────────────────────────────────────────
  /** Create a BM25 search index on a column. */
  async createIndex(column) {
    await this.query(`CREATE INDEX IF NOT EXISTS idx_${sqlStr(column)}_bm25 ON "${this.tableName}" USING deeplake_index ("${column}")`);
  }
  buildLookupIndexName(table, suffix) {
    return `idx_${table}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, "_");
  }
  async ensureLookupIndex(table, suffix, columnsSql) {
    const markers = await getIndexMarkerStore();
    const markerPath = markers.buildIndexMarkerPath(this.workspaceId, this.orgId, table, suffix);
    if (markers.hasFreshIndexMarker(markerPath))
      return;
    const indexName = this.buildLookupIndexName(table, suffix);
    try {
      await this.query(`CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" ${columnsSql}`);
      markers.writeIndexMarker(markerPath);
    } catch (e) {
      if (isDuplicateIndexError(e)) {
        markers.writeIndexMarker(markerPath);
        return;
      }
      log3(`index "${indexName}" skipped: ${e.message}`);
    }
  }
  /**
   * Heal any missing columns on a table so it matches one of the schema
   * definitions in `deeplake-schema.ts`. One SELECT against
   * `information_schema.columns` per call, then `ALTER TABLE ADD COLUMN`
   * only the genuinely missing ones — never blanket, never `IF NOT
   * EXISTS`.
   *
   * History: an earlier path used a local marker file (`col_<name>` under
   * the index-marker dir) to skip even the SELECT after the first
   * confirmation, plus per-column ALTERs for `summary_embedding`,
   * `message_embedding`, `agent`, `plugin_version`. The marker existed
   * because Deeplake used to expose a ~30s post-ALTER bug where
   * subsequent INSERTs failed, so we wanted to keep ALTER traffic to a
   * minimum. The bug was re-verified on 2026-05-18 against
   * `api.deeplake.ai` (`test_plugin` org) and no longer reproduces
   * (71/71 INSERTs OK, first success 2ms after ALTER). The single SELECT
   * + targeted ALTER pattern survives the marker removal because: each
   * ALTER still costs ~800ms (so blanket sweeps are wasteful) and the
   * diff produces clearer logs than "ALTER all with IF NOT EXISTS".
   */
  async healSchema(table, columns) {
    await healMissingColumns({
      query: (sql) => this.query(sql),
      tableName: table,
      workspaceId: this.workspaceId,
      columns,
      log: log3
    });
  }
  /** List all tables in the workspace (with retry). */
  async listTables(forceRefresh = false) {
    if (!forceRefresh && this._tablesCache)
      return [...this._tablesCache];
    const { tables, cacheable } = await this._fetchTables();
    if (cacheable)
      this._tablesCache = [...tables];
    return tables;
  }
  /**
   * Like listTables() but returns null when the list could NOT be trusted
   * (the fetch failed / was non-cacheable). Callers gating a read on table
   * existence use this to tell a genuinely-empty workspace ([]) apart from a
   * failed lookup (null): on [] they can safely skip the read (no table → no
   * 42P01), on null they must fall back to SELECT-then-catch so a transient
   * lookup blip doesn't drop a read of a table that really exists.
   */
  async knownTablesOrNull() {
    if (this._tablesCache)
      return [...this._tablesCache];
    const { tables, cacheable } = await this._fetchTables();
    if (!cacheable)
      return null;
    this._tablesCache = [...tables];
    return [...tables];
  }
  async _fetchTables() {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch(`${this.apiUrl}/workspaces/${this.workspaceId}/tables`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            "X-Activeloop-Org-Id": this.orgId,
            ...deeplakeClientHeader()
          }
        });
        if (resp.ok) {
          const data = await resp.json();
          return {
            tables: (data.tables ?? []).map((t) => t.table_name),
            cacheable: true
          };
        }
        if (attempt < MAX_RETRIES && RETRYABLE_CODES.has(resp.status)) {
          await sleep2(BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200);
          continue;
        }
        return { tables: [], cacheable: false };
      } catch {
        if (attempt < MAX_RETRIES) {
          await sleep2(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        return { tables: [], cacheable: false };
      }
    }
    return { tables: [], cacheable: false };
  }
  /**
   * Run a `CREATE TABLE` with an extra outer retry budget. The base
   * `query()` already retries 3 times on fetch errors (~3.5s total), but a
   * failed CREATE is permanent corruption — every subsequent SELECT against
   * the missing table fails. Wrapping in an outer loop with longer backoff
   * (2s, 5s, then 10s) gives us ~17s of reach across transient network
   * blips before giving up. Failures still propagate; getApi() resets its
   * cache on init failure (openclaw plugin) so the next call retries the
   * whole init flow.
   */
  async createTableWithRetry(sql, label) {
    const OUTER_BACKOFFS_MS = [2e3, 5e3, 1e4];
    let lastErr = null;
    for (let attempt = 0; attempt <= OUTER_BACKOFFS_MS.length; attempt++) {
      try {
        await this.query(sql);
        return;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        log3(`CREATE TABLE "${label}" attempt ${attempt + 1}/${OUTER_BACKOFFS_MS.length + 1} failed: ${msg}`);
        if (attempt < OUTER_BACKOFFS_MS.length) {
          await sleep2(OUTER_BACKOFFS_MS[attempt]);
        }
      }
    }
    throw lastErr;
  }
  /** Create the memory table if it doesn't already exist. Heal missing columns on existing tables. */
  async ensureTable(name) {
    if (!MEMORY_COLUMNS.some((c) => c.name === SUMMARY_EMBEDDING_COL)) {
      throw new Error(`MEMORY_COLUMNS missing "${SUMMARY_EMBEDDING_COL}" (embeddings/columns.ts drift)`);
    }
    const tbl = sqlIdent(name ?? this.tableName);
    const tables = await this.listTables();
    if (!tables.includes(tbl)) {
      log3(`table "${tbl}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(tbl, MEMORY_COLUMNS), tbl);
      log3(`table "${tbl}" created`);
      if (!tables.includes(tbl))
        this._tablesCache = [...tables, tbl];
    }
    await this.healSchema(tbl, MEMORY_COLUMNS);
  }
  /** Create the sessions table (uses JSONB for message since every row is a JSON event). */
  async ensureSessionsTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log3(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, SESSIONS_COLUMNS), safe);
      log3(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, SESSIONS_COLUMNS);
    await this.ensureLookupIndex(safe, "path_creation_date", `("path", "creation_date")`);
  }
  /**
   * Create the skills table.
   *
   * One row per skill version. Workers INSERT a fresh row on every KEEP /
   * MERGE rather than UPDATE-ing in place, so the full version history is
   * recoverable. Uniqueness in the *current* state is by (project_key, name)
   * — newer rows shadow older ones at read time (ORDER BY version DESC).
   * This sidesteps the Deeplake UPDATE-coalescing quirk that bit the wiki
   * worker.
   */
  /**
   * Create the codebase table. One row per (org, workspace, repo, user,
   * worktree, commit) — see CODEBASE_COLUMNS for the schema. Healing
   * + index follow the same pattern as ensureSessionsTable.
   */
  async ensureCodebaseTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log3(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, CODEBASE_COLUMNS), safe);
      log3(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, CODEBASE_COLUMNS);
    await this.ensureLookupIndex(safe, "codebase_identity", `("org_id", "workspace_id", "repo_slug", "user_id", "worktree_id", "commit_sha")`);
  }
  async ensureSkillsTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log3(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, SKILLS_COLUMNS), safe);
      log3(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, SKILLS_COLUMNS);
    await this.ensureLookupIndex(safe, "project_key_name", `("project_key", "name")`);
  }
  /**
   * Create the rules table.
   *
   * One row per rule version (same write pattern as skills): edits INSERT
   * a fresh row with version+1, reads pick latest per rule_id via
   * `ORDER BY version DESC LIMIT 1`. Sidesteps the Deeplake
   * UPDATE-coalescing quirk by never UPDATEing.
   */
  async ensureRulesTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log3(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, RULES_COLUMNS), safe);
      log3(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, RULES_COLUMNS);
    await this.ensureLookupIndex(safe, "rule_id_version", `("rule_id", "version")`);
  }
  /**
   * Create the goals table.
   *
   * Backed by the VFS path convention memory/goal/<owner>/<status>/<goal_id>.md.
   * INSERT-only version-bumped: rm and mv operations translate to fresh
   * v=N+1 rows (status flips for mv → closed; rm is the same soft-close).
   * The (goal_id, version) index lets the VFS dispatch a cheap latest-row
   * read on cat / Read of a single goal.
   */
  async ensureGoalsTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log3(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, GOALS_COLUMNS), safe);
      log3(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, GOALS_COLUMNS);
    await this.ensureLookupIndex(safe, "goal_id_version", `("goal_id", "version")`);
    await this.ensureLookupIndex(safe, "owner_status", `("owner", "status")`);
  }
  /**
   * Create the kpis table.
   *
   * Backed by memory/kpi/<goal_id>/<kpi_id>.md. KPI rows do NOT carry
   * owner — ownership derives from the parent goal via logical join on
   * goal_id. INSERT-only version-bumped. (goal_id, kpi_id) index is the
   * canonical lookup the VFS uses on Read and Write.
   */
  async ensureKpisTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log3(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, KPIS_COLUMNS), safe);
      log3(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, KPIS_COLUMNS);
    await this.ensureLookupIndex(safe, "goal_id_kpi_id", `("goal_id", "kpi_id")`);
  }
  /**
   * Create the docs table — per-file documentation kept fresh on code deltas.
   *
   * INSERT-only version-bumped (same write pattern as rules/skills): every
   * edit appends a fresh row with version+1, reads pick the latest per
   * doc_id via `ORDER BY version DESC LIMIT 1` (see src/docs/read.ts).
   * Sidesteps the Deeplake UPDATE-coalescing quirk by never UPDATEing.
   * The (doc_id, version) index is what the latest-row read scans.
   */
  async ensureDocsTable(name) {
    const safe = sqlIdent(name);
    const tables = await this.listTables();
    if (!tables.includes(safe)) {
      log3(`table "${safe}" not found, creating`);
      await this.createTableWithRetry(buildCreateTableSql(safe, DOCS_COLUMNS), safe);
      log3(`table "${safe}" created`);
      if (!tables.includes(safe))
        this._tablesCache = [...tables, safe];
    }
    await this.healSchema(safe, DOCS_COLUMNS);
    await this.ensureLookupIndex(safe, "doc_id_version", `("doc_id", "version")`);
  }
};

// dist/src/shell/grep-core.js
var TOOL_INPUT_FIELDS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "prompt",
  "subagent_type",
  "query",
  "url",
  "notebook_path",
  "old_string",
  "new_string",
  "content",
  "skill",
  "args",
  "taskId",
  "status",
  "subject",
  "description",
  "to",
  "message",
  "summary",
  "max_results"
];
var TOOL_RESPONSE_DROP = /* @__PURE__ */ new Set([
  // Note: `stderr` is intentionally NOT in this set. The `stdout` high-signal
  // branch below already de-dupes it for the common case (appends as suffix
  // when non-empty). If a tool response has ONLY `stderr` and no `stdout`
  // (hard-failure on some tools), the generic cleanup preserves it so the
  // error message reaches Claude instead of collapsing to `[ok]`.
  "interrupted",
  "isImage",
  "noOutputExpected",
  "type",
  "structuredPatch",
  "userModified",
  "originalFile",
  "replaceAll",
  "totalDurationMs",
  "totalTokens",
  "totalToolUseCount",
  "usage",
  "toolStats",
  "durationMs",
  "durationSeconds",
  "bytes",
  "code",
  "codeText",
  "agentId",
  "agentType",
  "verificationNudgeNeeded",
  "numLines",
  "numFiles",
  "truncated",
  "statusChange",
  "updatedFields",
  "isAgent",
  "success"
]);
function maybeParseJson(v) {
  if (typeof v !== "string")
    return v;
  const s = v.trim();
  if (s[0] !== "{" && s[0] !== "[")
    return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}
function snakeCase(k) {
  return k.replace(/([A-Z])/g, "_$1").toLowerCase();
}
function camelCase(k) {
  return k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function formatToolInput(raw) {
  const p = maybeParseJson(raw);
  if (typeof p !== "object" || p === null)
    return String(p ?? "");
  const parts = [];
  for (const k of TOOL_INPUT_FIELDS) {
    if (p[k] === void 0)
      continue;
    const v = p[k];
    parts.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  for (const k of ["glob", "output_mode", "limit", "offset"]) {
    if (p[k] !== void 0)
      parts.push(`${k}: ${p[k]}`);
  }
  return parts.length ? parts.join("\n") : JSON.stringify(p);
}
function formatToolResponse(raw, inp, toolName) {
  const r = maybeParseJson(raw);
  if (typeof r !== "object" || r === null)
    return String(r ?? "");
  if (toolName === "Edit" || toolName === "Write" || toolName === "MultiEdit") {
    return r.filePath ? `[wrote ${r.filePath}]` : "[ok]";
  }
  if (typeof r.stdout === "string") {
    const stderr = r.stderr;
    return r.stdout + (stderr ? `
stderr: ${stderr}` : "");
  }
  if (typeof r.content === "string")
    return r.content;
  if (r.file && typeof r.file === "object") {
    const f = r.file;
    if (typeof f.content === "string")
      return `[${f.filePath ?? ""}]
${f.content}`;
    if (typeof f.base64 === "string")
      return `[binary ${f.filePath ?? ""}: ${f.base64.length} base64 chars]`;
  }
  if (Array.isArray(r.filenames))
    return r.filenames.join("\n");
  if (Array.isArray(r.matches)) {
    return r.matches.map((m) => typeof m === "string" ? m : JSON.stringify(m)).join("\n");
  }
  if (Array.isArray(r.results)) {
    return r.results.map((x) => typeof x === "string" ? x : x?.title ?? x?.url ?? JSON.stringify(x)).join("\n");
  }
  const inpObj = maybeParseJson(inp);
  const kept = {};
  for (const [k, v] of Object.entries(r)) {
    if (TOOL_RESPONSE_DROP.has(k))
      continue;
    if (v === "" || v === false || v == null)
      continue;
    if (typeof inpObj === "object" && inpObj) {
      const inObj = inpObj;
      if (k in inObj && JSON.stringify(inObj[k]) === JSON.stringify(v))
        continue;
      const snake = snakeCase(k);
      if (snake in inObj && JSON.stringify(inObj[snake]) === JSON.stringify(v))
        continue;
      const camel = camelCase(k);
      if (camel in inObj && JSON.stringify(inObj[camel]) === JSON.stringify(v))
        continue;
    }
    kept[k] = v;
  }
  return Object.keys(kept).length ? JSON.stringify(kept) : "[ok]";
}
function formatToolCall(obj) {
  return `[tool:${obj?.tool_name ?? "?"}]
input: ${formatToolInput(obj?.tool_input)}
response: ${formatToolResponse(obj?.tool_response, obj?.tool_input, obj?.tool_name)}`;
}
function emptySessionBodyNotice(rowCount) {
  const plural = rowCount === 1 ? "row" : "rows";
  return `[hivemind: this session has ${rowCount} stored ${plural} but the message body is empty \u2014 capture recorded metadata (size only) without content, so the transcript body is unavailable. This is not an empty file; there is nothing to read here.]`;
}
function normalizeContent(path2, raw) {
  if (!path2.includes("/sessions/"))
    return raw;
  if (!raw || raw[0] !== "{")
    return raw;
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (Array.isArray(obj.turns)) {
    const dateHeader = obj.date_time ? `(${String(obj.date_time)}) ` : "";
    const lines = obj.turns.map((t) => {
      const sp = String(t?.speaker ?? t?.name ?? "?").trim();
      const tx = String(t?.text ?? t?.content ?? "").replace(/\s+/g, " ").trim();
      const tag = t?.dia_id ? `[${t.dia_id}] ` : "";
      return `${dateHeader}${tag}${sp}: ${tx}`;
    });
    const out2 = lines.join("\n");
    return out2.trim() ? out2 : raw;
  }
  if (obj.turn && typeof obj.turn === "object" && !Array.isArray(obj.turn)) {
    const t = obj.turn;
    const sp = String(t.speaker ?? t.name ?? "?").trim();
    const tx = String(t.text ?? t.content ?? "").replace(/\s+/g, " ").trim();
    const tag = t.dia_id ? `[${String(t.dia_id)}] ` : "";
    const dateHeader = obj.date_time ? `(${String(obj.date_time)}) ` : "";
    const line = `${dateHeader}${tag}${sp}: ${tx}`;
    return line.trim() ? line : raw;
  }
  const stripRecalled = (t) => {
    const i = t.indexOf("<recalled-memories>");
    if (i === -1)
      return t;
    const j = t.lastIndexOf("</recalled-memories>");
    if (j === -1 || j < i)
      return t;
    const head = t.slice(0, i);
    const tail = t.slice(j + "</recalled-memories>".length);
    return (head + tail).replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n");
  };
  let out = null;
  if (obj.type === "user_message") {
    out = `[user] ${stripRecalled(String(obj.content ?? ""))}`;
  } else if (obj.type === "assistant_message") {
    const agent = obj.agent_type ? ` (agent=${obj.agent_type})` : "";
    out = `[assistant${agent}] ${stripRecalled(String(obj.content ?? ""))}`;
  } else if (obj.type === "tool_call") {
    out = formatToolCall(obj);
  }
  if (out === null)
    return raw;
  const trimmed = out.trim();
  if (!trimmed || trimmed === "[user]" || trimmed === "[assistant]" || /^\[tool:[^\]]*\]\s+input:\s+\{\}\s+response:\s+\{\}$/.test(trimmed))
    return raw;
  return out;
}
function buildPathCondition(targetPath) {
  if (!targetPath || targetPath === "/")
    return "";
  const clean = targetPath.replace(/\/+$/, "");
  if (/[*?]/.test(clean)) {
    const likePattern = sqlLike(clean).replace(/\*/g, "%").replace(/\?/g, "_");
    return `path LIKE '${likePattern}' ESCAPE '\\'`;
  }
  const base = clean.split("/").pop() ?? "";
  if (base.includes(".")) {
    return `path = '${sqlStr(clean)}'`;
  }
  return `(path = '${sqlStr(clean)}' OR path LIKE '${sqlLike(clean)}/%' ESCAPE '\\')`;
}
async function searchDeeplakeTables(api, memoryTable, sessionsTable, opts, meta) {
  const { pathFilter, contentScanOnly, likeOp, escapedPattern, prefilterPattern, prefilterPatterns, queryEmbedding, multiWordPatterns } = opts;
  const limit = opts.limit ?? 100;
  if (queryEmbedding && queryEmbedding.length > 0) {
    const vecLit = serializeFloat4Array(queryEmbedding);
    const semanticLimit = Math.min(limit, Number(process.env.HIVEMIND_SEMANTIC_LIMIT ?? "20"));
    const lexicalLimit = Math.min(limit, Number(process.env.HIVEMIND_HYBRID_LEXICAL_LIMIT ?? "20"));
    const filterPatternsForLex = contentScanOnly ? prefilterPatterns && prefilterPatterns.length > 0 ? prefilterPatterns : prefilterPattern ? [prefilterPattern] : [] : [escapedPattern];
    const memLexFilter = buildContentFilter("summary::text", likeOp, filterPatternsForLex);
    const sessLexFilter = buildContentFilter("message::text", likeOp, filterPatternsForLex);
    const memLexQuery = memLexFilter ? `SELECT path, summary::text AS content, 0 AS source_order, '' AS creation_date, 1.0 AS score FROM "${memoryTable}" WHERE 1=1${pathFilter}${memLexFilter} LIMIT ${lexicalLimit}` : null;
    const sessLexQuery = sessLexFilter ? `SELECT path, message::text AS content, 1 AS source_order, COALESCE(creation_date::text, '') AS creation_date, 1.0 AS score FROM "${sessionsTable}" WHERE 1=1${pathFilter}${sessLexFilter} LIMIT ${lexicalLimit}` : null;
    const memSemQuery = `SELECT path, summary::text AS content, 0 AS source_order, '' AS creation_date, (summary_embedding <#> ${vecLit}) AS score FROM "${memoryTable}" WHERE ARRAY_LENGTH(summary_embedding, 1) > 0${pathFilter} ORDER BY score DESC LIMIT ${semanticLimit}`;
    const sessSemQuery = `SELECT path, message::text AS content, 1 AS source_order, COALESCE(creation_date::text, '') AS creation_date, (message_embedding <#> ${vecLit}) AS score FROM "${sessionsTable}" WHERE ARRAY_LENGTH(message_embedding, 1) > 0${pathFilter} ORDER BY score DESC LIMIT ${semanticLimit}`;
    const parts = [memSemQuery, sessSemQuery];
    if (memLexQuery)
      parts.push(memLexQuery);
    if (sessLexQuery)
      parts.push(sessLexQuery);
    const unionSql = parts.map((q) => `(${q})`).join(" UNION ALL ");
    const outerLimit = semanticLimit + lexicalLimit;
    const rows2 = await api.query(`SELECT path, content, source_order, creation_date, score FROM (` + unionSql + `) AS combined ORDER BY score DESC LIMIT ${outerLimit}`);
    if (meta && rows2.length >= outerLimit)
      meta.truncated = true;
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const row of rows2) {
      const p = String(row["path"]);
      if (seen.has(p))
        continue;
      seen.add(p);
      unique.push({ path: p, content: String(row["content"] ?? "") });
    }
    return unique;
  }
  const filterPatterns = contentScanOnly ? prefilterPatterns && prefilterPatterns.length > 0 ? prefilterPatterns : prefilterPattern ? [prefilterPattern] : [] : multiWordPatterns && multiWordPatterns.length > 1 ? multiWordPatterns : [escapedPattern];
  const memFilter = buildContentFilter("summary::text", likeOp, filterPatterns);
  const sessFilter = buildContentFilter("message::text", likeOp, filterPatterns);
  const memQuery = `SELECT path, summary::text AS content, 0 AS source_order, '' AS creation_date FROM "${memoryTable}" WHERE 1=1${pathFilter}${memFilter} LIMIT ${limit}`;
  const sessQuery = `SELECT path, message::text AS content, 1 AS source_order, COALESCE(creation_date::text, '') AS creation_date FROM "${sessionsTable}" WHERE 1=1${pathFilter}${sessFilter} LIMIT ${limit}`;
  const rows = await api.query(`SELECT path, content, source_order, creation_date FROM ((${memQuery}) UNION ALL (${sessQuery})) AS combined ORDER BY path, source_order, creation_date`);
  if (meta) {
    let memCount = 0;
    let sessCount = 0;
    for (const row of rows) {
      if (Number(row["source_order"]) === 0)
        memCount++;
      else
        sessCount++;
    }
    if (memCount >= limit || sessCount >= limit)
      meta.truncated = true;
  }
  return rows.map((row) => ({
    path: String(row["path"]),
    content: String(row["content"] ?? "")
  }));
}
async function searchDocs(query, docsTable, opts) {
  const { pathFilter, contentScanOnly, likeOp, escapedPattern, prefilterPattern, prefilterPatterns, queryEmbedding, multiWordPatterns } = opts;
  const safeDocsTable = sqlIdent(docsTable);
  const limit = opts.limit ?? 100;
  const projFilter = opts.project !== void 0 ? ` AND (project = '${sqlStr(opts.project)}' OR project = '')` : "";
  const active = ` AND status = 'active'${projFilter}`;
  const dedup = (rows2) => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const row of rows2) {
      const p = String(row["path"]);
      if (seen.has(p))
        continue;
      seen.add(p);
      out.push({ path: p, content: String(row["content"] ?? "") });
    }
    return out;
  };
  if (queryEmbedding && queryEmbedding.length > 0) {
    const vecLit = serializeFloat4Array(queryEmbedding);
    const semanticLimit = Math.min(limit, Number(process.env.HIVEMIND_SEMANTIC_LIMIT ?? "20"));
    const lexicalLimit = Math.min(limit, Number(process.env.HIVEMIND_HYBRID_LEXICAL_LIMIT ?? "20"));
    const filterPatternsForLex = contentScanOnly ? prefilterPatterns && prefilterPatterns.length > 0 ? prefilterPatterns : prefilterPattern ? [prefilterPattern] : [] : [escapedPattern];
    const lexFilter = buildContentFilter("content::text", likeOp, filterPatternsForLex);
    const lexQuery = lexFilter ? `SELECT doc_id AS path, content::text AS content, 1.0 AS score FROM "${safeDocsTable}" WHERE 1=1${pathFilter}${active}${lexFilter} LIMIT ${lexicalLimit}` : null;
    const semQuery = `SELECT doc_id AS path, content::text AS content, (content_embedding <#> ${vecLit}) AS score FROM "${safeDocsTable}" WHERE ARRAY_LENGTH(content_embedding, 1) > 0${pathFilter}${active} ORDER BY score DESC LIMIT ${semanticLimit}`;
    const parts = [semQuery];
    if (lexQuery)
      parts.push(lexQuery);
    const unionSql = parts.map((q) => `(${q})`).join(" UNION ALL ");
    const rows2 = await query(`SELECT path, content, score FROM (${unionSql}) AS combined ORDER BY score DESC LIMIT ${semanticLimit + lexicalLimit}`);
    return dedup(rows2);
  }
  const filterPatterns = contentScanOnly ? prefilterPatterns && prefilterPatterns.length > 0 ? prefilterPatterns : prefilterPattern ? [prefilterPattern] : [] : multiWordPatterns && multiWordPatterns.length > 1 ? multiWordPatterns : [escapedPattern];
  const filter = buildContentFilter("content::text", likeOp, filterPatterns);
  const rows = await query(`SELECT doc_id AS path, content::text AS content FROM "${safeDocsTable}" WHERE 1=1${pathFilter}${active}${filter} LIMIT ${limit}`);
  return dedup(rows);
}
function serializeFloat4Array(vec) {
  const parts = [];
  for (const v of vec) {
    if (!Number.isFinite(v))
      return "NULL";
    parts.push(String(v));
  }
  return `ARRAY[${parts.join(",")}]::float4[]`;
}
function buildPathFilter(targetPath) {
  const condition = buildPathCondition(targetPath);
  return condition ? ` AND ${condition}` : "";
}
function extractRegexLiteralPrefilter(pattern) {
  if (!pattern)
    return null;
  const parts = [];
  let current = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (!next)
        return null;
      if (/[dDsSwWbBAZzGkKpP]/.test(next))
        return null;
      current += next;
      i++;
      continue;
    }
    if (ch === ".") {
      if (pattern[i + 1] === "*") {
        if (current)
          parts.push(current);
        current = "";
        i++;
        continue;
      }
      return null;
    }
    if ("|()[]{}+?^$".includes(ch) || ch === "*")
      return null;
    current += ch;
  }
  if (current)
    parts.push(current);
  const literal = parts.reduce((best, part) => part.length > best.length ? part : best, "");
  return literal.length >= 2 ? literal : null;
}
function extractRegexAlternationPrefilters(pattern) {
  if (!pattern.includes("|"))
    return null;
  const parts = [];
  let current = "";
  let escaped = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escaped) {
      current += `\\${ch}`;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "|") {
      if (!current)
        return null;
      parts.push(current);
      current = "";
      continue;
    }
    if ("()[]{}^$".includes(ch))
      return null;
    current += ch;
  }
  if (escaped || !current)
    return null;
  parts.push(current);
  const literals = [...new Set(parts.map((part) => extractRegexLiteralPrefilter(part)).filter((part) => typeof part === "string" && part.length >= 2))];
  return literals.length > 0 ? literals : null;
}
function buildGrepSearchOptions(params, targetPath) {
  const hasRegexMeta = !params.fixedString && /[.*+?^${}()|[\]\\]/.test(params.pattern);
  const literalPrefilter = hasRegexMeta ? extractRegexLiteralPrefilter(params.pattern) : null;
  const alternationPrefilters = hasRegexMeta ? extractRegexAlternationPrefilters(params.pattern) : null;
  const multiWordPatterns = !hasRegexMeta ? params.pattern.split(/\s+/).filter((w) => w.length > 2).slice(0, 4) : [];
  return {
    pathFilter: buildPathFilter(targetPath),
    contentScanOnly: hasRegexMeta,
    likeOp: process.env.HIVEMIND_GREP_LIKE === "case-sensitive" ? "LIKE" : "ILIKE",
    escapedPattern: sqlLike(params.pattern),
    prefilterPattern: literalPrefilter ? sqlLike(literalPrefilter) : void 0,
    prefilterPatterns: alternationPrefilters?.map((literal) => sqlLike(literal)),
    multiWordPatterns: multiWordPatterns.length > 1 ? multiWordPatterns.map((w) => sqlLike(w)) : void 0
  };
}
function buildContentFilter(column, likeOp, patterns) {
  if (patterns.length === 0)
    return "";
  if (patterns.length === 1)
    return ` AND ${column} ${likeOp} '%${patterns[0]}%'`;
  return ` AND (${patterns.map((pattern) => `${column} ${likeOp} '%${pattern}%'`).join(" OR ")})`;
}
function compileGrepRegex(params) {
  let reStr = params.fixedString ? params.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : params.pattern;
  if (params.wordMatch)
    reStr = `\\b${reStr}\\b`;
  try {
    return new RegExp(reStr, params.ignoreCase ? "i" : "");
  } catch {
    return new RegExp(params.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), params.ignoreCase ? "i" : "");
  }
}
function refineGrepMatches(rows, params, forceMultiFilePrefix) {
  const re = compileGrepRegex(params);
  const multi = forceMultiFilePrefix ?? rows.length > 1;
  const output = [];
  for (const row of rows) {
    if (!row.content)
      continue;
    const lines = row.content.split("\n");
    const matched = [];
    for (let i = 0; i < lines.length; i++) {
      const hit = re.test(lines[i]);
      if (hit !== !!params.invertMatch) {
        if (params.filesOnly) {
          output.push(row.path);
          break;
        }
        const prefix = multi ? `${row.path}:` : "";
        const ln = params.lineNumber ? `${i + 1}:` : "";
        matched.push(`${prefix}${ln}${lines[i]}`);
      }
    }
    if (!params.filesOnly) {
      if (params.countOnly) {
        output.push(`${multi ? `${row.path}:` : ""}${matched.length}`);
      } else {
        output.push(...matched);
      }
    }
  }
  return output;
}
async function grepBothTables(api, memoryTable, sessionsTable, params, targetPath, queryEmbedding) {
  const meta = { truncated: false };
  const rows = await searchDeeplakeTables(api, memoryTable, sessionsTable, {
    ...buildGrepSearchOptions(params, targetPath),
    queryEmbedding
  }, meta);
  const seen = /* @__PURE__ */ new Set();
  const unique = rows.filter((r) => seen.has(r.path) ? false : (seen.add(r.path), true));
  const normalized = unique.map((r) => ({ path: r.path, content: normalizeContent(r.path, r.content) }));
  if (queryEmbedding && queryEmbedding.length > 0) {
    const emitAllLines = process.env.HIVEMIND_SEMANTIC_EMIT_ALL !== "false";
    if (emitAllLines) {
      const lines = [];
      for (const r of normalized) {
        for (const line of r.content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed)
            lines.push(`${r.path}:${line}`);
        }
      }
      return withTruncationNotice(lines, meta.truncated);
    }
  }
  return withTruncationNotice(refineGrepMatches(normalized, params), meta.truncated);
}
var TRUNCATION_NOTICE = "[hivemind: results incomplete \u2014 a per-source row cap was hit, so more matches likely exist. Narrow the path or use a more specific pattern to see them.]";
function withTruncationNotice(lines, truncated) {
  if (!truncated)
    return lines;
  return lines.length > 0 ? [...lines, TRUNCATION_NOTICE] : [TRUNCATION_NOTICE];
}

// dist/src/utils/output-cap.js
var CLAUDE_OUTPUT_CAP_BYTES = 8 * 1024;
function byteLen(str) {
  return Buffer.byteLength(str, "utf8");
}
function capOutputForClaude(output, options = {}) {
  const maxBytes = options.maxBytes ?? CLAUDE_OUTPUT_CAP_BYTES;
  if (byteLen(output) <= maxBytes)
    return output;
  const kind = options.kind ?? "output";
  const footerReserve = 220;
  const budget = Math.max(1, maxBytes - footerReserve);
  let running = 0;
  const lines = output.split("\n");
  const keptLines = [];
  for (const line of lines) {
    const lineBytes = byteLen(line) + 1;
    if (running + lineBytes > budget)
      break;
    keptLines.push(line);
    running += lineBytes;
  }
  if (keptLines.length === 0) {
    const buf = Buffer.from(output, "utf8");
    let cutByte = Math.min(budget, buf.length);
    while (cutByte > 0 && (buf[cutByte] & 192) === 128)
      cutByte--;
    const slice = buf.subarray(0, cutByte).toString("utf8");
    const footer2 = `
... [${kind} truncated: ${(byteLen(output) / 1024).toFixed(1)} KB total; refine with '| head -N' or a tighter pattern]`;
    return slice + footer2;
  }
  const totalLines = lines.length - (lines[lines.length - 1] === "" ? 1 : 0);
  const elidedLines = Math.max(0, totalLines - keptLines.length);
  const elidedBytes = byteLen(output) - byteLen(keptLines.join("\n"));
  const footer = `
... [${kind} truncated: ${elidedLines} more lines (${(elidedBytes / 1024).toFixed(1)} KB) elided \u2014 refine with '| head -N' or a tighter pattern]`;
  return keptLines.join("\n") + footer;
}

// dist/src/embeddings/client.js
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { openSync as openSync2, closeSync as closeSync2, writeSync, unlinkSync as unlinkSync3, existsSync as existsSync3, readFileSync as readFileSync6 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join7 } from "node:path";

// dist/src/embeddings/protocol.js
var DEFAULT_SOCKET_DIR = "/tmp";
var DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1e3;
var DEFAULT_CLIENT_TIMEOUT_MS = 2e3;
function socketPathFor(uid, dir = DEFAULT_SOCKET_DIR) {
  return `${dir}/hivemind-embed-${uid}.sock`;
}
function pidPathFor(uid, dir = DEFAULT_SOCKET_DIR) {
  return `${dir}/hivemind-embed-${uid}.pid`;
}

// dist/src/embeddings/client.js
var SHARED_DAEMON_PATH = join7(homedir5(), ".hivemind", "embed-deps", "embed-daemon.js");
var log4 = (m) => log("embed-client", m);
function getUid() {
  const uid = typeof process.getuid === "function" ? process.getuid() : void 0;
  return uid !== void 0 ? String(uid) : process.env.USER ?? "default";
}
var _recycledStuckDaemon = false;
var EmbedClient = class {
  socketPath;
  pidPath;
  timeoutMs;
  daemonEntry;
  autoSpawn;
  spawnWaitMs;
  nextId = 0;
  helloVerified = false;
  constructor(opts = {}) {
    const uid = getUid();
    const dir = opts.socketDir ?? "/tmp";
    this.socketPath = socketPathFor(uid, dir);
    this.pidPath = pidPathFor(uid, dir);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS;
    this.daemonEntry = opts.daemonEntry ?? process.env.HIVEMIND_EMBED_DAEMON ?? (existsSync3(SHARED_DAEMON_PATH) ? SHARED_DAEMON_PATH : void 0);
    this.autoSpawn = opts.autoSpawn ?? true;
    this.spawnWaitMs = opts.spawnWaitMs ?? 5e3;
  }
  /**
   * Returns an embedding vector, or null on timeout/failure. Hooks MUST treat
   * null as "skip embedding column" — never block the write path on us.
   *
   * Fire-and-forget spawn on miss: if the daemon isn't up, this call returns
   * null AND kicks off a background spawn. The next call finds a ready daemon.
   *
   * Stuck-daemon recycle: if the daemon returns a transformers-missing
   * error (typical after a marketplace upgrade left an older daemon process
   * alive but with no node_modules accessible from its bundle path), we
   * SIGTERM it and clear its sock/pid so the very next call spawns a fresh
   * daemon from the current bundle. Without this, the stuck daemon would
   * keep poisoning every session until its 10-minute idle-out fires.
   */
  async embed(text, kind = "document") {
    const v = await this.embedAttempt(text, kind);
    if (v !== "recycled")
      return v;
    if (!this.autoSpawn)
      return null;
    this.trySpawnDaemon();
    await this.waitForDaemonReady();
    const retry = await this.embedAttempt(text, kind);
    return retry === "recycled" ? null : retry;
  }
  /**
   * One round-trip: connect → verify → embed. Returns:
   *  - number[]  : embedding vector (happy path)
   *  - null      : timeout / daemon error / transformers-missing
   *  - "recycled": verifyDaemonOnce killed the daemon mid-call;
   *                caller should respawn and retry once.
   */
  async embedAttempt(text, kind) {
    let sock;
    try {
      sock = await this.connectOnce();
    } catch {
      if (this.autoSpawn)
        this.trySpawnDaemon();
      return null;
    }
    try {
      const recycled = await this.verifyDaemonOnce(sock);
      if (recycled) {
        return "recycled";
      }
      const id = String(++this.nextId);
      const req = { op: "embed", id, kind, text };
      const resp = await this.sendAndWait(sock, req);
      if (resp.error || !("embedding" in resp) || !resp.embedding) {
        const err = resp.error ?? "no embedding";
        log4(`embed err: ${err}`);
        if (isTransformersMissingError(err)) {
          this.handleTransformersMissing(err);
        }
        return null;
      }
      return resp.embedding;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log4(`embed failed: ${err}`);
      return null;
    } finally {
      try {
        sock.end();
      } catch {
      }
    }
  }
  /**
   * Poll for the sock file to come back after `trySpawnDaemon` — used by
   * the recycle retry path. Best-effort: caps at `spawnWaitMs` and
   * returns regardless so the retry attempt can run.
   */
  async waitForDaemonReady() {
    const deadline = Date.now() + this.spawnWaitMs;
    while (Date.now() < deadline) {
      if (existsSync3(this.socketPath))
        return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  /**
   * Send a `hello` on first successful connect per EmbedClient instance.
   * If the daemon answers with a path that doesn't match our configured
   * daemonEntry — typical after a marketplace upgrade replaced the bundle
   * — SIGTERM the daemon + clear sock/pid so the next call spawns from the
   * current bundle.
   *
   * `helloVerified` is set ONLY after we've seen a compatible response,
   * so a transient probe failure or a recycle-triggering mismatch leaves
   * the flag false; the next reconnect re-runs verification against
   * whatever daemon is then live (typically the fresh spawn).
   */
  async verifyDaemonOnce(sock) {
    if (this.helloVerified)
      return false;
    if (!this.daemonEntry) {
      this.helloVerified = true;
      return false;
    }
    const id = String(++this.nextId);
    const req = { op: "hello", id };
    let resp;
    try {
      resp = await this.sendAndWait(sock, req);
    } catch (e) {
      log4(`hello probe failed (inconclusive, will retry next connect): ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    const hello = resp;
    if (_recycledStuckDaemon) {
      return false;
    }
    if (!hello.daemonPath) {
      _recycledStuckDaemon = true;
      log4(`daemon does not implement hello (older protocol); recycling`);
      this.recycleDaemon(hello.pid);
      return true;
    }
    if (hello.daemonPath !== this.daemonEntry && !existsSync3(hello.daemonPath)) {
      _recycledStuckDaemon = true;
      log4(`daemon path no longer on disk \u2014 running=${hello.daemonPath} (gone) expected=${this.daemonEntry}; recycling`);
      this.recycleDaemon(hello.pid);
      return true;
    }
    this.helloVerified = true;
    return false;
  }
  /**
   * On a transformers-missing error from the daemon, SIGTERM the stuck
   * daemon (the bundle daemon that can't find its deps) and clear
   * sock/pid so the next call spawns fresh.
   *
   * Previously this also enqueued a user-visible "Hivemind embeddings
   * disabled — deps missing" notification telling the user to run
   * `hivemind embeddings install`. The notification was removed because
   * (a) the recycle alone often fixes the issue silently, and (b) the
   * warning kept stacking on top of the primary session-start banner
   * which clashed with the single-slot priority model. The `detail`
   * argument is retained for future telemetry / debug logging.
   */
  handleTransformersMissing(_detail) {
    if (!_recycledStuckDaemon) {
      _recycledStuckDaemon = true;
      this.recycleDaemon(null);
    }
  }
  /**
   * Best-effort SIGTERM + sock/pid cleanup. Tolerant of every missing-file
   * combination and dead-PID cases.
   *
   * Identity check: gate the SIGTERM on the daemon's socket file still
   * existing. We know the daemon was alive moments ago (we either just
   * got a hello response or the caller saw a transformers-missing error
   * the daemon emitted), but if the socket file is gone by the time we
   * try to kill, the daemon process is also gone and the PID we
   * captured may already have been recycled by the OS to an unrelated
   * user process. Mirrors the gate added to `killEmbedDaemon` in the
   * CLI — same failure mode, rarer trigger.
   */
  recycleDaemon(reportedPid) {
    let pid = reportedPid;
    if (pid === null) {
      try {
        pid = Number.parseInt(readFileSync6(this.pidPath, "utf-8").trim(), 10);
      } catch {
      }
    }
    if (Number.isFinite(pid) && pid !== null && pid > 0 && existsSync3(this.socketPath)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    } else if (pid !== null) {
      log4(`recycle: socket gone, skipping SIGTERM on possibly-stale pid ${pid}`);
    }
    try {
      unlinkSync3(this.socketPath);
    } catch {
    }
    try {
      unlinkSync3(this.pidPath);
    } catch {
    }
  }
  /**
   * Wait up to spawnWaitMs for the daemon to accept connections, spawning if
   * necessary. Meant for SessionStart / long-running batches — not the hot path.
   */
  async warmup() {
    try {
      const s = await this.connectOnce();
      s.end();
      return true;
    } catch {
      if (!this.autoSpawn)
        return false;
      this.trySpawnDaemon();
      try {
        const s = await this.waitForSocket();
        s.end();
        return true;
      } catch {
        return false;
      }
    }
  }
  connectOnce() {
    return new Promise((resolve6, reject) => {
      const sock = connect(this.socketPath);
      const to = setTimeout(() => {
        sock.destroy();
        reject(new Error("connect timeout"));
      }, this.timeoutMs);
      sock.once("connect", () => {
        clearTimeout(to);
        resolve6(sock);
      });
      sock.once("error", (e) => {
        clearTimeout(to);
        reject(e);
      });
    });
  }
  trySpawnDaemon() {
    let fd;
    try {
      fd = openSync2(this.pidPath, "wx", 384);
      writeSync(fd, String(process.pid));
    } catch (e) {
      if (this.isPidFileStale()) {
        try {
          unlinkSync3(this.pidPath);
        } catch {
        }
        try {
          fd = openSync2(this.pidPath, "wx", 384);
          writeSync(fd, String(process.pid));
        } catch {
          return;
        }
      } else {
        return;
      }
    }
    if (!this.daemonEntry || !existsSync3(this.daemonEntry)) {
      log4(`daemonEntry not configured or missing: ${this.daemonEntry}`);
      try {
        closeSync2(fd);
        unlinkSync3(this.pidPath);
      } catch {
      }
      return;
    }
    try {
      const child = spawn(process.execPath, [this.daemonEntry], {
        detached: true,
        stdio: "ignore",
        // SW_HIDE: the daemon is auto-spawned from the backfill path, which
        // itself runs detached — without this it flashes a console. No-op on
        // POSIX.
        windowsHide: true,
        env: process.env
      });
      child.unref();
      log4(`spawned daemon pid=${child.pid}`);
    } finally {
      closeSync2(fd);
    }
  }
  isPidFileStale() {
    try {
      const raw = readFileSync6(this.pidPath, "utf-8").trim();
      const pid = Number(raw);
      if (!pid || Number.isNaN(pid))
        return true;
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    } catch {
      return true;
    }
  }
  async waitForSocket() {
    const deadline = Date.now() + this.spawnWaitMs;
    let delay = 30;
    while (Date.now() < deadline) {
      await sleep3(delay);
      delay = Math.min(delay * 1.5, 300);
      if (!existsSync3(this.socketPath))
        continue;
      try {
        return await this.connectOnce();
      } catch {
      }
    }
    throw new Error("daemon did not become ready within spawnWaitMs");
  }
  sendAndWait(sock, req) {
    return new Promise((resolve6, reject) => {
      let buf = "";
      const to = setTimeout(() => {
        sock.destroy();
        reject(new Error("request timeout"));
      }, this.timeoutMs);
      sock.setEncoding("utf-8");
      sock.on("data", (chunk) => {
        buf += chunk;
        const nl = buf.indexOf("\n");
        if (nl === -1)
          return;
        const line = buf.slice(0, nl);
        clearTimeout(to);
        try {
          resolve6(JSON.parse(line));
        } catch (e) {
          reject(e);
        }
      });
      sock.on("error", (e) => {
        clearTimeout(to);
        reject(e);
      });
      sock.on("end", () => {
        clearTimeout(to);
        reject(new Error("connection closed without response"));
      });
      sock.write(JSON.stringify(req) + "\n");
    });
  }
};
function sleep3(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function isTransformersMissingError(err) {
  if (/hivemind embeddings install/i.test(err))
    return true;
  return /@huggingface\/transformers/i.test(err);
}

// dist/src/embeddings/disable.js
import { createRequire } from "node:module";
import { homedir as homedir7 } from "node:os";
import { join as join9 } from "node:path";
import { pathToFileURL } from "node:url";

// dist/src/user-config.js
import { existsSync as existsSync4, mkdirSync as mkdirSync5, readFileSync as readFileSync7, renameSync as renameSync2, writeFileSync as writeFileSync4 } from "node:fs";
import { homedir as homedir6 } from "node:os";
import { dirname as dirname3, join as join8 } from "node:path";
var _configPath = () => process.env.HIVEMIND_CONFIG_PATH ?? join8(homedir6(), ".deeplake", "config.json");
var _cache = null;
var _migrated = false;
function readUserConfig() {
  if (_cache !== null)
    return _cache;
  const path2 = _configPath();
  if (!existsSync4(path2)) {
    _cache = {};
    return _cache;
  }
  try {
    const raw = readFileSync7(path2, "utf-8");
    const parsed = JSON.parse(raw);
    _cache = isPlainObject(parsed) ? parsed : {};
  } catch {
    _cache = {};
  }
  return _cache;
}
function writeUserConfig(patch) {
  const current = readUserConfig();
  const merged = deepMerge(current, patch);
  const path2 = _configPath();
  const dir = dirname3(path2);
  if (!existsSync4(dir))
    mkdirSync5(dir, { recursive: true });
  const tmp = `${path2}.tmp.${process.pid}`;
  writeFileSync4(tmp, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  renameSync2(tmp, path2);
  _cache = merged;
  return merged;
}
function getEmbeddingsEnabled() {
  const cfg = readUserConfig();
  if (cfg.embeddings && typeof cfg.embeddings.enabled === "boolean") {
    return cfg.embeddings.enabled;
  }
  if (_migrated) {
    return migrationValueFromEnv();
  }
  _migrated = true;
  const enabled = migrationValueFromEnv();
  try {
    writeUserConfig({ embeddings: { enabled } });
  } catch {
    _cache = { ...cfg ?? {}, embeddings: { ...cfg?.embeddings ?? {}, enabled } };
  }
  return enabled;
}
function migrationValueFromEnv() {
  const raw = process.env.HIVEMIND_EMBEDDINGS;
  if (raw === void 0)
    return false;
  if (raw === "false")
    return false;
  return true;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepMerge(base, patch) {
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key];
    const baseVal = base[key];
    if (isPlainObject(patchVal) && isPlainObject(baseVal)) {
      out[key] = { ...baseVal, ...patchVal };
    } else if (patchVal !== void 0) {
      out[key] = patchVal;
    }
  }
  return out;
}

// dist/src/embeddings/disable.js
var cachedStatus = null;
function defaultResolveTransformers() {
  const sharedDir = join9(homedir7(), ".hivemind", "embed-deps");
  try {
    createRequire(pathToFileURL(`${sharedDir}/`).href).resolve("@huggingface/transformers");
    return;
  } catch {
  }
  createRequire(import.meta.url).resolve("@huggingface/transformers");
}
var _resolve = defaultResolveTransformers;
var _readEnabled = getEmbeddingsEnabled;
function detectStatus() {
  if (!_readEnabled())
    return "user-disabled";
  try {
    _resolve();
    return "enabled";
  } catch {
    return "no-transformers";
  }
}
function embeddingsStatus() {
  if (cachedStatus !== null)
    return cachedStatus;
  cachedStatus = detectStatus();
  return cachedStatus;
}
function embeddingsDisabled() {
  return embeddingsStatus() !== "enabled";
}

// dist/src/hooks/grep-direct.js
import { fileURLToPath } from "node:url";
import { dirname as dirname4, join as join10 } from "node:path";
var SEMANTIC_ENABLED = process.env.HIVEMIND_SEMANTIC_SEARCH !== "false" && !embeddingsDisabled();
var SEMANTIC_TIMEOUT_MS = Number(process.env.HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS ?? "500");
function resolveDaemonPath() {
  return join10(dirname4(fileURLToPath(import.meta.url)), "..", "embeddings", "embed-daemon.js");
}
var sharedEmbedClient = null;
function getEmbedClient() {
  if (!sharedEmbedClient) {
    sharedEmbedClient = new EmbedClient({
      daemonEntry: resolveDaemonPath(),
      timeoutMs: SEMANTIC_TIMEOUT_MS
    });
  }
  return sharedEmbedClient;
}
function patternIsSemanticFriendly(pattern, fixedString) {
  if (!pattern || pattern.length < 2)
    return false;
  if (fixedString)
    return true;
  const meta = pattern.match(/[|()\[\]{}+?^$\\]/g);
  if (!meta)
    return true;
  return meta.length <= 1;
}
function splitFirstPipelineStage(cmd) {
  const input = cmd.trim();
  let quote = null;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (ch === "\\" && quote === '"') {
        escaped = true;
      }
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "|")
      return input.slice(0, i).trim();
  }
  return quote ? null : input;
}
function tokenizeGrepStage(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[++i];
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "\\" && i + 1 < input.length) {
      current += input[++i];
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote)
    return null;
  if (current)
    tokens.push(current);
  return tokens;
}
function parseBashGrep(cmd) {
  const first = splitFirstPipelineStage(cmd);
  if (!first)
    return null;
  const matchTool = first.match(/^(grep|egrep|fgrep|rg)\b/);
  if (!matchTool)
    return null;
  const tool = matchTool[1];
  const isFixed = tool === "fgrep";
  const isRg = tool === "rg";
  const tokens = tokenizeGrepStage(first);
  if (!tokens || tokens.length === 0)
    return null;
  let ignoreCase = false, wordMatch = false, filesOnly = false, countOnly = false, lineNumber = isRg, invertMatch = false, fixedString = isFixed;
  const explicitPatterns = [];
  let ti = 1;
  while (ti < tokens.length) {
    const token = tokens[ti];
    if (token === "--") {
      ti++;
      break;
    }
    if (!token.startsWith("-") || token === "-")
      break;
    if (token.startsWith("--")) {
      const [flag, inlineValue] = token.split("=", 2);
      const rgValueLongs = /* @__PURE__ */ new Set([
        "--type",
        "--type-not",
        "--type-add",
        "--type-clear",
        "--glob",
        "--iglob",
        "--threads",
        "--max-columns",
        "--max-depth",
        "--max-filesize",
        "--pre",
        "--pre-glob",
        "--replace",
        "--encoding",
        "--color",
        "--colors",
        "--sort",
        "--sortr",
        "--context-separator",
        "--field-context-separator",
        "--field-match-separator",
        "--path-separator",
        "--hostname-bin"
      ]);
      const handlers = {
        "--ignore-case": () => {
          ignoreCase = true;
          return false;
        },
        "--word-regexp": () => {
          wordMatch = true;
          return false;
        },
        "--files-with-matches": () => {
          filesOnly = true;
          return false;
        },
        // rg uses `--files` to list files (without searching). For our purposes
        // it's similar enough to `-l` that we treat it as filesOnly.
        "--files": () => {
          filesOnly = true;
          return false;
        },
        "--count": () => {
          countOnly = true;
          return false;
        },
        "--count-matches": () => {
          countOnly = true;
          return false;
        },
        "--line-number": () => {
          lineNumber = true;
          return false;
        },
        "--no-line-number": () => {
          lineNumber = false;
          return false;
        },
        "--invert-match": () => {
          invertMatch = true;
          return false;
        },
        "--fixed-strings": () => {
          fixedString = true;
          return false;
        },
        "--after-context": () => inlineValue === void 0,
        "--before-context": () => inlineValue === void 0,
        "--context": () => inlineValue === void 0,
        "--max-count": () => inlineValue === void 0,
        "--regexp": () => {
          if (inlineValue !== void 0) {
            explicitPatterns.push(inlineValue);
            return false;
          }
          return true;
        }
      };
      let consumeNext = handlers[flag]?.() ?? false;
      if (!consumeNext && isRg && rgValueLongs.has(flag) && inlineValue === void 0) {
        consumeNext = true;
      }
      if (consumeNext) {
        ti++;
        if (ti >= tokens.length)
          return null;
        if (flag === "--regexp")
          explicitPatterns.push(tokens[ti]);
      }
      ti++;
      continue;
    }
    const rgValueShorts = new Set(isRg ? ["t", "T", "g", "j", "M", "r", "E"] : []);
    const shortFlags = token.slice(1);
    let consumedValueFlag = false;
    for (let i = 0; i < shortFlags.length; i++) {
      const flag = shortFlags[i];
      switch (flag) {
        case "i":
          ignoreCase = true;
          break;
        case "w":
          wordMatch = true;
          break;
        case "l":
          filesOnly = true;
          break;
        case "c":
          countOnly = true;
          break;
        case "n":
          lineNumber = true;
          break;
        case "N":
          lineNumber = false;
          break;
        // rg --no-line-number short form
        case "v":
          invertMatch = true;
          break;
        case "F":
          fixedString = true;
          break;
        case "r":
          if (isRg) {
            if (i === shortFlags.length - 1) {
              ti++;
              if (ti >= tokens.length)
                return null;
            }
            consumedValueFlag = true;
            i = shortFlags.length;
          }
          break;
        case "R":
        case "E":
          if (isRg && flag === "E") {
            if (i === shortFlags.length - 1) {
              ti++;
              if (ti >= tokens.length)
                return null;
            }
            consumedValueFlag = true;
            i = shortFlags.length;
          }
          break;
        case "A":
        case "B":
        case "C":
        case "m":
          if (i === shortFlags.length - 1) {
            ti++;
            if (ti >= tokens.length)
              return null;
          }
          i = shortFlags.length;
          break;
        case "e": {
          const inlineValue = shortFlags.slice(i + 1);
          if (inlineValue) {
            explicitPatterns.push(inlineValue);
          } else {
            ti++;
            if (ti >= tokens.length)
              return null;
            explicitPatterns.push(tokens[ti]);
          }
          i = shortFlags.length;
          break;
        }
        default:
          if (rgValueShorts.has(flag)) {
            if (i === shortFlags.length - 1) {
              ti++;
              if (ti >= tokens.length)
                return null;
            }
            consumedValueFlag = true;
            i = shortFlags.length;
          }
          break;
      }
    }
    void consumedValueFlag;
    ti++;
  }
  const pattern = explicitPatterns.length > 0 ? explicitPatterns[0] : tokens[ti];
  if (!pattern)
    return null;
  let target = explicitPatterns.length > 0 ? tokens[ti] ?? "/" : tokens[ti + 1] ?? "/";
  if (target === "." || target === "./")
    target = "/";
  return {
    pattern,
    targetPath: target,
    ignoreCase,
    wordMatch,
    filesOnly,
    countOnly,
    lineNumber,
    invertMatch,
    fixedString
  };
}
async function handleGrepDirect(api, table, sessionsTable, params) {
  if (!params.pattern)
    return null;
  const matchParams = {
    pattern: params.pattern,
    ignoreCase: params.ignoreCase,
    wordMatch: params.wordMatch,
    filesOnly: params.filesOnly,
    countOnly: params.countOnly,
    lineNumber: params.lineNumber,
    invertMatch: params.invertMatch,
    fixedString: params.fixedString
  };
  let queryEmbedding = null;
  if (SEMANTIC_ENABLED && patternIsSemanticFriendly(params.pattern, params.fixedString)) {
    try {
      queryEmbedding = await getEmbedClient().embed(params.pattern, "query");
    } catch {
      queryEmbedding = null;
    }
  }
  const output = await grepBothTables(api, table, sessionsTable, matchParams, params.targetPath, queryEmbedding);
  const joined = output.join("\n") || "(no matches)";
  return capOutputForClaude(joined, { kind: "grep" });
}

// dist/src/graph/vfs-handler.js
import { existsSync as existsSync7, mkdirSync as mkdirSync9, readFileSync as readFileSync10, renameSync as renameSync5, writeFileSync as writeFileSync7 } from "node:fs";
import { createHash as createHash3 } from "node:crypto";
import { join as join14, dirname as dirname8 } from "node:path";

// dist/src/graph/last-build.js
import { existsSync as existsSync5, mkdirSync as mkdirSync6, readFileSync as readFileSync8, renameSync as renameSync3, writeFileSync as writeFileSync5 } from "node:fs";
import { dirname as dirname5, join as join11 } from "node:path";
function lastBuildPath(baseDir, worktreeId) {
  if (worktreeId !== void 0) {
    return join11(baseDir, "worktrees", worktreeId, ".last-build.json");
  }
  return join11(baseDir, ".last-build.json");
}
function readLastBuild(baseDir, worktreeId) {
  let path2 = lastBuildPath(baseDir, worktreeId);
  if (!existsSync5(path2)) {
    if (worktreeId === void 0)
      return null;
    const legacy = lastBuildPath(baseDir, void 0);
    if (!existsSync5(legacy))
      return null;
    path2 = legacy;
  }
  let raw;
  try {
    raw = readFileSync8(path2, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object")
    return null;
  const o = parsed;
  if (typeof o.ts !== "number" || !Number.isFinite(o.ts))
    return null;
  if (o.commit_sha !== null && typeof o.commit_sha !== "string")
    return null;
  if (typeof o.snapshot_sha256 !== "string")
    return null;
  const out = { ts: o.ts, commit_sha: o.commit_sha, snapshot_sha256: o.snapshot_sha256 };
  if (typeof o.node_count === "number" && Number.isFinite(o.node_count) && o.node_count >= 0) {
    out.node_count = o.node_count;
  }
  if (typeof o.edge_count === "number" && Number.isFinite(o.edge_count) && o.edge_count >= 0) {
    out.edge_count = o.edge_count;
  }
  return out;
}

// dist/src/graph/snapshot.js
import { createHash as createHash2 } from "node:crypto";
import { mkdirSync as mkdirSync8, renameSync as renameSync4, writeFileSync as writeFileSync6 } from "node:fs";
import { homedir as homedir8 } from "node:os";
import { dirname as dirname7, join as join13 } from "node:path";

// dist/src/graph/history.js
import { appendFileSync as appendFileSync2, existsSync as existsSync6, mkdirSync as mkdirSync7, readFileSync as readFileSync9 } from "node:fs";
import { dirname as dirname6, join as join12 } from "node:path";

// dist/src/graph/resolve/cross-file.js
import { posix } from "node:path";

// dist/src/graph/snapshot.js
function graphsRoot() {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join13(homedir8(), ".hivemind", "graphs");
}
function repoDir(repoKey) {
  return join13(graphsRoot(), repoKey);
}

// dist/src/graph/render/neighborhood.js
var CAP = 25;
function renderNeighborhood(snap, file) {
  const allFiles = [...new Set(snap.nodes.map((n) => n.source_file))];
  let resolved = null;
  if (allFiles.includes(file)) {
    resolved = file;
  } else {
    const matches = allFiles.filter((f) => f.endsWith(file) || f.includes(file));
    if (matches.length === 1) {
      resolved = matches[0];
    } else if (matches.length > 1) {
      const lines2 = [];
      lines2.push(`"${file}" matches multiple files \u2014 which did you mean?`);
      lines2.push("");
      for (const m of matches.slice(0, 10))
        lines2.push(`  ${m}`);
      if (matches.length > 10)
        lines2.push(`  ... and ${matches.length - 10} more`);
      return lines2.join("\n");
    }
  }
  if (resolved === null) {
    const lines2 = [];
    lines2.push(`No nodes for "${file}".`);
    const parts = file.split("/").filter((p) => p.length > 2);
    const close = allFiles.filter((f) => parts.some((p) => f.includes(p))).slice(0, 3);
    if (close.length > 0) {
      lines2.push("Did you mean:");
      for (const c of close)
        lines2.push(`  ${c}`);
    }
    return lines2.join("\n");
  }
  const fileNodes = snap.nodes.filter((n) => n.source_file === resolved);
  const fileNodeIds = new Set(fileNodes.map((n) => n.id));
  const fileOf = /* @__PURE__ */ new Map();
  for (const n of snap.nodes)
    fileOf.set(n.id, n.source_file);
  const sorted = [...fileNodes].sort((a, b) => {
    const la = parseLocation(a.source_location);
    const lb = parseLocation(b.source_location);
    if (la !== lb)
      return la - lb;
    return a.label.localeCompare(b.label);
  });
  const lines = [];
  lines.push(`## Symbols in ${resolved}`);
  lines.push("");
  if (sorted.length === 0) {
    lines.push("  (no symbols)");
  } else {
    for (const n of sorted) {
      const exp = n.exported ? "exported" : "internal";
      lines.push(`  ${n.label.padEnd(32)} ${n.kind.padEnd(12)} ${exp.padEnd(10)} ${n.source_location}`);
    }
  }
  lines.push("");
  lines.push("## Cross-file neighbors");
  lines.push("");
  lines.push("Note: 'calls' edges are intra-file only in the current extractor \u2014 cross-file");
  lines.push("neighbors here are driven mainly by 'imports' edges.");
  lines.push("");
  const outgoing = [];
  const incoming = [];
  for (const e of snap.links) {
    const srcIn = fileNodeIds.has(e.source);
    const tgtIn = fileNodeIds.has(e.target);
    if (srcIn === tgtIn)
      continue;
    if (srcIn) {
      const tgtFile = fileOf.get(e.target);
      if (tgtFile !== void 0 && tgtFile !== resolved)
        outgoing.push(e);
    } else {
      const srcFile = fileOf.get(e.source);
      if (srcFile !== void 0 && srcFile !== resolved)
        incoming.push(e);
    }
  }
  renderDirectionGroup(lines, outgoing, "Outgoing", "source");
  renderDirectionGroup(lines, incoming, "Incoming", "target");
  return lines.join("\n");
}
function renderDirectionGroup(lines, edges, label, selfField) {
  const otherField = selfField === "source" ? "target" : "source";
  const byRelation = /* @__PURE__ */ new Map();
  for (const e of edges) {
    const otherId = e[otherField];
    const rel = e.relation;
    let nodeMap = byRelation.get(rel);
    if (!nodeMap) {
      nodeMap = /* @__PURE__ */ new Map();
      byRelation.set(rel, nodeMap);
    }
    nodeMap.set(otherId, (nodeMap.get(otherId) ?? 0) + 1);
  }
  if (byRelation.size === 0) {
    lines.push(`${label}: (none)`);
    lines.push("");
    return;
  }
  lines.push(`${label}:`);
  let totalShown = 0;
  const sortedRels = [...byRelation.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [rel, nodeMap] of sortedRels) {
    const entries = [...nodeMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    lines.push(`  ${rel} (${entries.length}):`);
    let shownInRel = 0;
    for (const [otherId, cnt] of entries) {
      if (totalShown >= CAP)
        break;
      const suffix = cnt > 1 ? ` \xD7${cnt}` : "";
      lines.push(`    ${otherId}${suffix}`);
      shownInRel++;
      totalShown++;
    }
    const remaining = entries.length - shownInRel;
    if (remaining > 0)
      lines.push(`    ... and ${remaining} more`);
  }
  if (totalShown >= CAP) {
    const total = [...byRelation.values()].reduce((s, m) => s + m.size, 0);
    if (total > CAP)
      lines.push(`  ... and ${total - CAP} more`);
  }
  lines.push("");
}
function parseLocation(loc) {
  const m = loc.match(/^L(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// dist/src/graph/render/layers.js
var LAYER_RULES = [
  { layer: "Tests", test: (p) => p.includes("/tests/") || p.includes(".test.") || p.includes("/__tests__/") },
  { layer: "Hooks", test: (p) => p.includes("/hooks/") },
  { layer: "CLI", test: (p) => p.includes("/cli/") || p.includes("/commands/") },
  { layer: "Graph", test: (p) => p.includes("/graph/") },
  { layer: "Shell/VFS", test: (p) => p.includes("/shell/") },
  { layer: "Embeddings", test: (p) => p.includes("/embeddings/") },
  { layer: "Skillify", test: (p) => p.includes("/skillify/") },
  { layer: "Config", test: (p) => /(?:^|\/)config\.[^/]+$/.test(p) || /\.config\.[^/]+$/.test(p) },
  { layer: "Utils", test: (p) => p.includes("/utils/") }
];
function layerOf(sourceFile) {
  const p = sourceFile.startsWith("/") ? sourceFile : `/${sourceFile}`;
  for (const rule of LAYER_RULES) {
    if (rule.test(p))
      return rule.layer;
  }
  return "Core";
}
function renderLayers(snap) {
  try {
    const layerNodes = /* @__PURE__ */ new Map();
    const layerFiles = /* @__PURE__ */ new Map();
    for (const node of snap.nodes) {
      const layer = layerOf(node.source_file);
      layerNodes.set(layer, (layerNodes.get(layer) ?? 0) + 1);
      let fileMap = layerFiles.get(layer);
      if (!fileMap) {
        fileMap = /* @__PURE__ */ new Map();
        layerFiles.set(layer, fileMap);
      }
      fileMap.set(node.source_file, (fileMap.get(node.source_file) ?? 0) + 1);
    }
    if (layerNodes.size === 0) {
      return "No nodes in snapshot \u2014 nothing to layer.";
    }
    const sorted = [...layerNodes.entries()].sort(([, a], [, b]) => b - a);
    const lines = [];
    lines.push("## Architectural Layers");
    lines.push("");
    for (const [layer, count] of sorted) {
      lines.push(`${layer.padEnd(14)} ${String(count).padStart(4)} node${count === 1 ? "" : "s"}`);
      const fileMap = layerFiles.get(layer);
      const topFiles = [...fileMap.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);
      for (const [file, n] of topFiles) {
        lines.push(`  ${String(n).padStart(3)}  ${file}`);
      }
      if (fileMap.size > 5) {
        lines.push(`       ... and ${fileMap.size - 5} more file${fileMap.size - 5 === 1 ? "" : "s"}`);
      }
    }
    lines.push("");
    lines.push(`Total: ${snap.nodes.length} node${snap.nodes.length === 1 ? "" : "s"} across ${sorted.length} layer${sorted.length === 1 ? "" : "s"}`);
    return lines.join("\n");
  } catch {
    return "Failed to render layer view.";
  }
}

// dist/src/graph/render/tour.js
var LINE_CAP = 60;
function renderTour(snap) {
  if (snap.nodes.length === 0) {
    return "Graph is empty \u2014 no nodes to tour.";
  }
  const nodeMap = /* @__PURE__ */ new Map();
  for (const n of snap.nodes)
    nodeMap.set(n.id, n);
  const inDegOrig = /* @__PURE__ */ new Map();
  for (const n of snap.nodes)
    inDegOrig.set(n.id, 0);
  for (const e of snap.links) {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      inDegOrig.set(e.target, (inDegOrig.get(e.target) ?? 0) + 1);
    }
  }
  const entryPoints = snap.nodes.filter((n) => n.exported && inDegOrig.get(n.id) === 0).sort((a, b) => a.id.localeCompare(b.id));
  const entrySet = new Set(entryPoints.map((n) => n.id));
  const revAdj = /* @__PURE__ */ new Map();
  const inDegRev = /* @__PURE__ */ new Map();
  for (const n of snap.nodes) {
    revAdj.set(n.id, []);
    inDegRev.set(n.id, 0);
  }
  for (const e of snap.links) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target))
      continue;
    revAdj.get(e.target).push(e.source);
    inDegRev.set(e.source, (inDegRev.get(e.source) ?? 0) + 1);
  }
  const queue = [];
  for (const n of snap.nodes) {
    if (inDegRev.get(n.id) === 0)
      queue.push(n.id);
  }
  queue.sort();
  const topoOrder = [];
  while (queue.length > 0) {
    const id = queue.shift();
    topoOrder.push(id);
    const newReady = [];
    for (const dep of revAdj.get(id) ?? []) {
      const d = (inDegRev.get(dep) ?? 0) - 1;
      inDegRev.set(dep, d);
      if (d === 0)
        newReady.push(dep);
    }
    if (newReady.length > 0) {
      for (const x of newReady)
        queue.push(x);
      queue.sort();
    }
  }
  const topoSet = new Set(topoOrder);
  const cyclic = snap.nodes.filter((n) => !topoSet.has(n.id)).sort((a, b) => a.id.localeCompare(b.id));
  const walkthrough = topoOrder.filter((id) => !entrySet.has(id));
  const totalNodes = snap.nodes.length;
  const lines = [];
  lines.push(`# Code Graph Tour \u2014 ${totalNodes} node${totalNodes !== 1 ? "s" : ""}`);
  lines.push("");
  lines.push(`## Entry points (${entryPoints.length})`);
  if (entryPoints.length === 0) {
    lines.push("  (none \u2014 all exported nodes have at least one incoming edge)");
  } else {
    lines.push("  Exported symbols with no incoming edges \u2014 likely top-level public API.");
    lines.push("");
    for (let i = 0; i < entryPoints.length; i++) {
      if (lines.length >= LINE_CAP) {
        lines.push(`  ... and ${entryPoints.length - i} more`);
        break;
      }
      lines.push(`  ${i + 1}. ${entryPoints[i].id}  [${entryPoints[i].kind}]`);
    }
  }
  lines.push("");
  lines.push(`## Walkthrough \u2014 dependency order (${walkthrough.length})`);
  if (walkthrough.length === 0) {
    lines.push("  (all non-entry nodes are cyclic)");
  } else {
    lines.push("  Dependencies before dependents (bottom-up).");
    lines.push("");
    for (let i = 0; i < walkthrough.length; i++) {
      if (lines.length >= LINE_CAP) {
        lines.push(`  ... and ${walkthrough.length - i} more`);
        break;
      }
      const n = nodeMap.get(walkthrough[i]);
      lines.push(`  ${i + 1}. ${n.id}  [${n.kind}]`);
    }
  }
  lines.push("");
  if (cyclic.length > 0) {
    lines.push(`## Cyclic / remaining (${cyclic.length})`);
    lines.push("  These nodes form cycles and were not reached by topological sort.");
    lines.push("");
    for (let i = 0; i < cyclic.length; i++) {
      if (lines.length >= LINE_CAP) {
        lines.push(`  ... and ${cyclic.length - i} more`);
        break;
      }
      lines.push(`  ${i + 1}. ${cyclic[i].id}  [${cyclic[i].kind}]`);
    }
    lines.push("");
  }
  lines.push(`Total: ${entryPoints.length} entry + ${walkthrough.length} walkthrough` + (cyclic.length > 0 ? ` + ${cyclic.length} cyclic` : "") + ` = ${totalNodes} nodes`);
  return lines.join("\n");
}

// dist/src/graph/render/path.js
function resolvePattern(snap, pattern) {
  const needle = pattern.toLowerCase();
  return snap.nodes.filter((n) => n.id.toLowerCase().includes(needle) || n.label.toLowerCase().includes(needle)).map((n) => n.id).sort();
}
function buildAdjacency(snap, undirected) {
  const adj = /* @__PURE__ */ new Map();
  const nodeIds = /* @__PURE__ */ new Set();
  for (const n of snap.nodes) {
    adj.set(n.id, []);
    nodeIds.add(n.id);
  }
  for (const edge of snap.links) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))
      continue;
    adj.get(edge.source).push({ neighborId: edge.target, edge, reversed: false });
    if (undirected) {
      adj.get(edge.target).push({ neighborId: edge.source, edge, reversed: true });
    }
  }
  for (const neighbors of adj.values()) {
    neighbors.sort((a, b) => a.neighborId.localeCompare(b.neighborId) || a.edge.relation.localeCompare(b.edge.relation) || (a.reversed === b.reversed ? 0 : a.reversed ? 1 : -1));
  }
  return adj;
}
function bfs(adj, fromId, toId) {
  if (fromId === toId)
    return [];
  const parent = /* @__PURE__ */ new Map();
  const visited = /* @__PURE__ */ new Set([fromId]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const { neighborId, edge, reversed } of adj.get(current) ?? []) {
      if (visited.has(neighborId))
        continue;
      visited.add(neighborId);
      parent.set(neighborId, { parentId: current, hop: { edge, reversed } });
      if (neighborId === toId) {
        const hops = [];
        let cur = toId;
        while (cur !== fromId) {
          const p = parent.get(cur);
          hops.unshift(p.hop);
          cur = p.parentId;
        }
        return hops;
      }
      queue.push(neighborId);
    }
  }
  return null;
}
function renderHops(fromId, hops, undirected) {
  const lines = [];
  lines.push(`${undirected ? "Undirected path" : "Directed path"}  (${hops.length} hop${hops.length === 1 ? "" : "s"}):`);
  lines.push("");
  lines.push(`  ${fromId}`);
  for (const { edge, reversed } of hops) {
    if (reversed) {
      lines.push(`    <--${edge.relation}--  ${edge.source}  [real edge: ${edge.source} \u2192 ${edge.target}]`);
    } else {
      lines.push(`    --${edge.relation}-->  ${edge.target}`);
    }
  }
  if (undirected) {
    lines.push("");
    lines.push("Note: no directed path exists. Arrows with <-- are traversed against their declared direction.");
  }
  return lines.join("\n");
}
function candidateList(pattern, ids) {
  const lines = [`"${pattern}" matches ${ids.length} nodes \u2014 be more specific:`];
  lines.push("");
  const shown = ids.slice(0, 20);
  for (let i = 0; i < shown.length; i++)
    lines.push(`  [${i + 1}]  ${shown[i]}`);
  if (ids.length > 20)
    lines.push(`  ... and ${ids.length - 20} more`);
  return lines.join("\n");
}
function renderPath(snap, fromPattern, toPattern) {
  const fromIds = resolvePattern(snap, fromPattern);
  const toIds = resolvePattern(snap, toPattern);
  if (fromIds.length === 0) {
    return `No node matches "${fromPattern}". Try cat memory/graph/find/<pattern> to explore.`;
  }
  if (toIds.length === 0) {
    return `No node matches "${toPattern}". Try cat memory/graph/find/<pattern> to explore.`;
  }
  if (fromIds.length > 1)
    return candidateList(fromPattern, fromIds);
  if (toIds.length > 1)
    return candidateList(toPattern, toIds);
  const fromId = fromIds[0];
  const toId = toIds[0];
  if (fromId === toId) {
    return `"${fromId}" is the same node on both ends \u2014 path length 0.`;
  }
  const dirPath = bfs(buildAdjacency(snap, false), fromId, toId);
  if (dirPath !== null)
    return renderHops(fromId, dirPath, false);
  const undirPath = bfs(buildAdjacency(snap, true), fromId, toId);
  if (undirPath !== null)
    return renderHops(fromId, undirPath, true);
  const fromNode = snap.nodes.find((n) => n.id === fromId);
  const toNode = snap.nodes.find((n) => n.id === toId);
  const sameFile = fromNode && toNode && fromNode.source_file === toNode.source_file;
  const context = sameFile ? `Both are in ${fromNode.source_file} \u2014 same file but no connecting edges.` : `Sources: ${fromNode?.source_file ?? "?"} vs ${toNode?.source_file ?? "?"} \u2014 they appear disconnected.`;
  return [`No path found between:`, `  from: ${fromId}`, `  to:   ${toId}`, ``, context].join("\n");
}

// dist/src/graph/render/impact.js
var IMPACT_CAP = 80;
var MAX_DEPTH = 25;
var DEP_RELATIONS = /* @__PURE__ */ new Set(["calls", "imports", "extends", "implements", "method_of"]);
function reverseBfs(snap, seeds, maxDepth = MAX_DEPTH) {
  const nodeIds = new Set(snap.nodes.map((n) => n.id));
  const incoming = /* @__PURE__ */ new Map();
  for (const e of snap.links) {
    if (!DEP_RELATIONS.has(e.relation))
      continue;
    if (!nodeIds.has(e.source))
      continue;
    const list = incoming.get(e.target);
    if (list)
      list.push(e);
    else
      incoming.set(e.target, [e]);
  }
  const depthOf = /* @__PURE__ */ new Map();
  const viaOf = /* @__PURE__ */ new Map();
  let frontier = [];
  for (const s of seeds) {
    if (!depthOf.has(s)) {
      depthOf.set(s, 0);
      frontier.push(s);
    }
  }
  frontier.sort();
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    depth++;
    const next = [];
    for (const id of frontier) {
      const edges = (incoming.get(id) ?? []).slice().sort((a, b) => a.source.localeCompare(b.source) || a.relation.localeCompare(b.relation));
      for (const e of edges) {
        if (depthOf.has(e.source))
          continue;
        depthOf.set(e.source, depth);
        viaOf.set(e.source, { rel: e.relation, from: id });
        next.push(e.source);
      }
    }
    next.sort();
    frontier = next;
  }
  return { depthOf, viaOf };
}
function renderImpact(snap, pattern) {
  const needle = pattern.toLowerCase();
  const matches = snap.nodes.filter((n) => n.id.toLowerCase().includes(needle));
  if (matches.length === 0) {
    return `No node matches "${pattern}". Try cat memory/graph/find/${pattern} to explore.`;
  }
  if (matches.length > 1) {
    const lines2 = [`"${pattern}" matches ${matches.length} nodes \u2014 be more specific:`, ""];
    for (const m of matches.slice(0, 20))
      lines2.push(`  ${m.id}`);
    if (matches.length > 20)
      lines2.push(`  ... and ${matches.length - 20} more`);
    return lines2.join("\n");
  }
  const target = matches[0];
  const { depthOf, viaOf } = reverseBfs(snap, [target.id]);
  const dependents = [...depthOf.entries()].filter(([id]) => id !== target.id);
  const total = dependents.length;
  const lines = [];
  lines.push(`Impact of ${target.id}`);
  if (target.signature)
    lines.push(`  ${target.signature}`);
  lines.push("");
  if (total === 0) {
    lines.push("No resolved dependents \u2014 nothing in the graph reaches this symbol.");
    lines.push("(Cross-file resolution is partial; this is a lower bound, not proof it's unused.)");
    return lines.join("\n");
  }
  lines.push(`${total} dependent${total === 1 ? "" : "s"} (transitive), by depth:`);
  lines.push("");
  const byDepth = /* @__PURE__ */ new Map();
  for (const [id, d] of dependents) {
    const list = byDepth.get(d) ?? [];
    list.push(id);
    byDepth.set(d, list);
  }
  let shown = 0;
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const ids = byDepth.get(d).sort();
    lines.push(`  depth ${d} (${ids.length}):`);
    for (const id of ids) {
      if (shown >= IMPACT_CAP)
        break;
      const via = viaOf.get(id);
      const tag = via ? `  [${via.rel} \u2192 ${via.from}]` : "";
      lines.push(`    ${id}${tag}`);
      shown++;
    }
    if (shown >= IMPACT_CAP)
      break;
  }
  if (total > shown)
    lines.push(`  ... and ${total - shown} more`);
  lines.push("");
  lines.push("Note: only RESOLVED edges are traversed (cross-file resolution is partial),");
  lines.push("so this is a lower bound on impact, not a completeness guarantee.");
  return lines.join("\n");
}

// dist/src/graph/vfs-handler.js
function workTreeIdFor(cwd) {
  return createHash3("sha256").update(cwd).digest("hex").slice(0, 16);
}
function handleGraphVfs(subpath, cwd) {
  const path2 = subpath.replace(/^\/+/, "");
  if (path2 === "" || path2 === "/") {
    return { kind: "ok", body: dirListing() };
  }
  if (path2 === "index.md" || path2 === "index") {
    return loadSnapshotOrError(cwd, (snap, baseDir) => ({
      kind: "ok",
      body: renderIndex(snap, baseDir, cwd)
    }));
  }
  if (path2.startsWith("find/")) {
    const pattern = path2.slice("find/".length);
    if (pattern === "") {
      return { kind: "not-found", message: "find/ requires a pattern: cat memory/graph/find/<keyword>" };
    }
    return loadSnapshotOrError(cwd, (snap, baseDir) => ({
      kind: "ok",
      body: renderFind(snap, pattern, baseDir, workTreeIdFor(cwd))
    }));
  }
  if (path2.startsWith("show/")) {
    const key = path2.slice("show/".length);
    if (key === "") {
      return { kind: "not-found", message: "show/ requires a handle or pattern" };
    }
    return loadSnapshotOrError(cwd, (snap, baseDir) => ({
      kind: "ok",
      body: renderShow(snap, key, baseDir, workTreeIdFor(cwd))
    }));
  }
  if (path2.startsWith("query/")) {
    const pattern = path2.slice("query/".length);
    if (pattern === "") {
      return { kind: "not-found", message: "query/ requires a pattern: cat memory/graph/query/<keyword>" };
    }
    return loadSnapshotOrError(cwd, (snap, baseDir) => ({
      kind: "ok",
      body: renderQuery(snap, pattern, baseDir, workTreeIdFor(cwd))
    }));
  }
  if (path2.startsWith("impact/")) {
    const pattern = path2.slice("impact/".length);
    if (pattern === "") {
      return { kind: "not-found", message: "impact/ requires a pattern: cat memory/graph/impact/<symbol>" };
    }
    return loadSnapshotOrError(cwd, (snap) => ({ kind: "ok", body: renderImpact(snap, pattern) }));
  }
  if (path2.startsWith("neighborhood/")) {
    const file = path2.slice("neighborhood/".length);
    if (file === "") {
      return { kind: "not-found", message: "neighborhood/ requires a file path: cat memory/graph/neighborhood/<file>" };
    }
    return loadSnapshotOrError(cwd, (snap) => ({ kind: "ok", body: renderNeighborhood(snap, file) }));
  }
  if (path2 === "layers" || path2 === "layers/" || path2 === "layers/index.md") {
    return loadSnapshotOrError(cwd, (snap) => ({ kind: "ok", body: renderLayers(snap) }));
  }
  if (path2 === "tour" || path2 === "tour/" || path2 === "tour/index.md") {
    return loadSnapshotOrError(cwd, (snap) => ({ kind: "ok", body: renderTour(snap) }));
  }
  if (path2.startsWith("path/")) {
    const rest = path2.slice("path/".length);
    const slash = rest.indexOf("/");
    if (slash <= 0 || slash === rest.length - 1) {
      return { kind: "not-found", message: "path/ needs two patterns: cat memory/graph/path/<from>/<to> (each a symbol-name substring, no slash)" };
    }
    const fromPattern = rest.slice(0, slash);
    const toPattern = rest.slice(slash + 1);
    return loadSnapshotOrError(cwd, (snap) => ({ kind: "ok", body: renderPath(snap, fromPattern, toPattern) }));
  }
  return {
    kind: "not-found",
    message: `Unknown endpoint: graph/${path2}
Available: index.md, find/<pattern>, query/<pattern>, show/<handle-or-pattern>, impact/<pattern>, neighborhood/<file>, layers, tour, path/<from>/<to>`
  };
}
function loadSnapshotOrError(cwd, fn) {
  let key;
  let baseDir;
  try {
    key = deriveProjectKey(cwd).key;
    baseDir = repoDir(key);
  } catch (e) {
    return { kind: "no-graph", message: `Cannot derive repo identity: ${e instanceof Error ? e.message : String(e)}` };
  }
  const wt = workTreeIdFor(cwd);
  const last = readLastBuild(baseDir, wt);
  if (last === null) {
    return {
      kind: "no-graph",
      message: "No local graph for this worktree yet. Run `hivemind graph build` (or `hivemind graph pull` if a teammate has built this commit)."
    };
  }
  const fileBase = last.commit_sha ?? last.snapshot_sha256;
  const snapPath = join14(baseDir, "snapshots", `${fileBase}.json`);
  if (!existsSync7(snapPath)) {
    return { kind: "no-graph", message: `Snapshot file missing on disk: ${snapPath}` };
  }
  let snap;
  try {
    snap = JSON.parse(readFileSync10(snapPath, "utf8"));
  } catch (e) {
    return { kind: "no-graph", message: `Failed to parse snapshot: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(snap.nodes) || !Array.isArray(snap.links)) {
    return { kind: "no-graph", message: "Snapshot schema is invalid (missing nodes/links arrays)." };
  }
  try {
    return fn(snap, baseDir);
  } catch (e) {
    return { kind: "no-graph", message: `Failed to render graph view: ${e instanceof Error ? e.message : String(e)}` };
  }
}
function dirListing() {
  return [
    "index.md",
    "find/",
    "query/",
    "show/",
    "impact/",
    "neighborhood/",
    "layers",
    "tour",
    "path/"
  ].join("\n");
}
function renderIndex(snap, baseDir, cwd) {
  const commit = snap.graph.commit_sha?.slice(0, 7) ?? "no-commit";
  const fullCommit = snap.graph.commit_sha ?? "no-commit";
  const totalNodes = snap.nodes.length;
  const totalEdges = snap.links.length;
  const byFile = {};
  for (const n of snap.nodes)
    byFile[n.source_file] = (byFile[n.source_file] ?? 0) + 1;
  const topFiles = Object.entries(byFile).sort(([, a], [, b]) => b - a).slice(0, 8);
  const byRel = {};
  for (const e of snap.links)
    byRel[e.relation] = (byRel[e.relation] ?? 0) + 1;
  const byKind = {};
  for (const n of snap.nodes)
    byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
  const lines = [];
  lines.push(`# Code Graph \u2014 ${snap.observation.repo_project}`);
  lines.push("");
  lines.push(`Commit:  ${fullCommit}  (built ${snap.observation.ts})`);
  lines.push(`Branch:  ${snap.observation.branch ?? "(detached)"}`);
  lines.push(`Source:  ${join14(baseDir, "snapshots", `${commit ? snap.graph.commit_sha : "?"}.json`)}`);
  lines.push("");
  lines.push(`Nodes:   ${totalNodes}    Edges: ${totalEdges}`);
  lines.push("");
  lines.push("## How to query");
  lines.push("  cat ~/.deeplake/memory/graph/query/<pattern>");
  lines.push("    2-in-1: search + expand the top matches with their 1-hop");
  lines.push("    neighbors (callers/callees/imports/heritage). Start here.");
  lines.push("    Multi-token AND: query/<a>+<b> requires both tokens.");
  lines.push("");
  lines.push("  cat ~/.deeplake/memory/graph/find/<pattern>");
  lines.push("    Case-insensitive substring match on node id + label.");
  lines.push("    Emits numbered handles [1] [2] ... saved for this worktree.");
  lines.push("");
  lines.push("  cat ~/.deeplake/memory/graph/show/<handle-or-pattern>");
  lines.push("    <handle>: a digit from a prior `find/`/`query/` (e.g. 3).");
  lines.push("    <pattern>: a substring; resolves to a unique node if possible,");
  lines.push("               or shows candidates if ambiguous.");
  lines.push("    Output: node detail + 1-hop neighbors grouped by edge kind.");
  lines.push("");
  lines.push("  Also: neighborhood/<file> \xB7 layers \xB7 tour \xB7 path/<from>/<to>");
  lines.push("");
  lines.push("## Node kinds");
  for (const [k, n] of Object.entries(byKind).sort(([, a], [, b]) => b - a)) {
    lines.push(`  ${k.padEnd(12)} ${n}`);
  }
  lines.push("");
  lines.push("## Edge kinds");
  for (const [k, n] of Object.entries(byRel).sort(([, a], [, b]) => b - a)) {
    lines.push(`  ${k.padEnd(12)} ${n}`);
  }
  lines.push("");
  lines.push("## Top files by node count");
  for (const [f, n] of topFiles) {
    lines.push(`  ${String(n).padStart(4)}  ${f}`);
  }
  lines.push("");
  lines.push(`Limitations:`);
  lines.push(`  - TypeScript / JavaScript / Python. AST-based, no semantic similarity edges yet.`);
  lines.push(`  - Cross-file 'calls'/'imports'/'extends' ARE resolved for relative named/namespace`);
  lines.push(`    imports; bare (npm)/aliased/barrel/dynamic imports stay unresolved. So a node`);
  lines.push(`    with "Incoming (0)" is not proof of dead code \u2014 a caller may reach it via an`);
  lines.push(`    unresolved import path. (Python cross-file resolution is a follow-up; Python is`);
  lines.push(`    intra-file + structure only for now.)`);
  lines.push(`  - Stale after edits \u2014 if a file's mtime is newer than the build, read the live source.`);
  void cwd;
  return lines.join("\n");
}
function findMatches(snap, pattern) {
  const tokens = pattern.toLowerCase().split(/[\s+]+/).filter((t) => t.length > 0);
  if (tokens.length === 0)
    return [];
  if (tokens.length === 1) {
    const needle = tokens[0];
    const matches2 = [];
    for (const n of snap.nodes) {
      if (n.id.toLowerCase().includes(needle) || n.label.toLowerCase().includes(needle))
        matches2.push(n);
    }
    matches2.sort((a, b) => {
      const ra = rank(a, needle);
      const rb = rank(b, needle);
      if (ra !== rb)
        return ra - rb;
      return a.id.localeCompare(b.id);
    });
    if (matches2.length === 0)
      return fuzzyMatches(snap, needle);
    return matches2;
  }
  const matches = [];
  for (const n of snap.nodes) {
    const id = n.id.toLowerCase();
    const lbl = n.label.toLowerCase();
    if (tokens.every((t) => id.includes(t) || lbl.includes(t)))
      matches.push(n);
  }
  const score = (n) => tokens.reduce((s, t) => s + rank(n, t), 0);
  matches.sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb)
      return sa - sb;
    return a.id.localeCompare(b.id);
  });
  return matches;
}
function fuzzyMatches(snap, needle) {
  if (needle.length < 3)
    return [];
  const maxDist = Math.max(1, Math.floor(needle.length / 4));
  const scored = [];
  for (const n of snap.nodes) {
    const d = editDistance(needle, n.label.toLowerCase(), maxDist);
    if (d <= maxDist)
      scored.push({ n, d });
  }
  scored.sort((a, b) => a.d !== b.d ? a.d - b.d : a.n.id.localeCompare(b.n.id));
  return scored.slice(0, 25).map((s) => s.n);
}
function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap)
    return cap + 1;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++)
    prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin)
        rowMin = cur[j];
    }
    if (rowMin > cap)
      return cap + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
function renderFind(snap, pattern, baseDir, worktreeId) {
  const matches = findMatches(snap, pattern);
  const capped = matches.slice(0, 50);
  if (capped.length === 0) {
    return `No matches for "${pattern}" in ${snap.nodes.length} nodes.
Try a shorter or different substring.`;
  }
  saveHandles(baseDir, worktreeId, capped.map((n) => n.id), pattern);
  const lines = [];
  lines.push(`${matches.length} match${matches.length === 1 ? "" : "es"} for "${pattern}"${matches.length > capped.length ? ` (showing first ${capped.length})` : ""}:`);
  lines.push("");
  for (let i = 0; i < capped.length; i++) {
    const n = capped[i];
    const tag = n.exported ? "exported" : "internal";
    lines.push(`  [${i + 1}]  ${n.id}   ${n.kind} (${tag})`);
  }
  lines.push("");
  lines.push("Use: cat ~/.deeplake/memory/graph/show/<N> to see node + 1-hop neighbors");
  return lines.join("\n");
}
var QUERY_TOP_N = 5;
var QUERY_NEIGHBOR_CAP = 8;
function renderQuery(snap, pattern, baseDir, worktreeId) {
  const matches = findMatches(snap, pattern);
  if (matches.length === 0) {
    return `No matches for "${pattern}" in ${snap.nodes.length} nodes.
Try a shorter or different substring, or cat memory/graph/find/<pattern>.`;
  }
  const top = matches.slice(0, QUERY_TOP_N);
  saveHandles(baseDir, worktreeId, top.map((n) => n.id), pattern);
  const topIds = new Set(top.map((n) => n.id));
  const outByNode = /* @__PURE__ */ new Map();
  const inByNode = /* @__PURE__ */ new Map();
  for (const e of snap.links) {
    if (topIds.has(e.source))
      (outByNode.get(e.source) ?? setGet(outByNode, e.source)).push(e);
    if (topIds.has(e.target))
      (inByNode.get(e.target) ?? setGet(inByNode, e.target)).push(e);
  }
  const lines = [];
  lines.push(`Query "${pattern}" \u2014 ${matches.length} match${matches.length === 1 ? "" : "es"}, expanded top ${top.length} (1 hop)`);
  lines.push("");
  for (let i = 0; i < top.length; i++) {
    const n = top[i];
    const tags = [n.exported ? "exported" : "internal"];
    if (n.is_entrypoint)
      tags.push("entrypoint");
    if (n.fan_in !== void 0)
      tags.push(`fan_in=${n.fan_in}`);
    if (n.fan_out !== void 0)
      tags.push(`fan_out=${n.fan_out}`);
    lines.push(`[${i + 1}] ${n.id}  ${n.kind} (${tags.join(", ")})`);
    if (n.signature)
      lines.push(`      ${n.signature}`);
    renderHopGroup(lines, outByNode.get(n.id) ?? [], "OUT", "target");
    renderHopGroup(lines, inByNode.get(n.id) ?? [], "IN", "source");
    lines.push("");
  }
  lines.push("Use: cat ~/.deeplake/memory/graph/show/<N> for full detail on a match.");
  return lines.join("\n");
}
function setGet(m, key) {
  const list = [];
  m.set(key, list);
  return list;
}
function renderHopGroup(lines, edges, dir, otherField) {
  if (edges.length === 0)
    return;
  const byRel = /* @__PURE__ */ new Map();
  for (const e of edges) {
    let counts = byRel.get(e.relation);
    if (!counts) {
      counts = /* @__PURE__ */ new Map();
      byRel.set(e.relation, counts);
    }
    const id = e[otherField];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [rel, counts] of [...byRel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const arrow = dir === "OUT" ? `--${rel}-->` : `<--${rel}--`;
    const ids = [...counts.keys()].sort();
    const shown = ids.slice(0, QUERY_NEIGHBOR_CAP).map((id) => {
      const c = counts.get(id);
      return c > 1 ? `${id} \xD7${c}` : id;
    });
    const more = ids.length > shown.length ? `  (+${ids.length - shown.length} more)` : "";
    lines.push(`      ${arrow} ${shown.join(", ")}${more}`);
  }
}
function renderShow(snap, key, baseDir, worktreeId) {
  if (/^\d+$/.test(key)) {
    const idx = parseInt(key, 10);
    const handles = loadHandles(baseDir, worktreeId);
    if (handles === null) {
      return `Handle [${idx}] not resolvable: no recent find/ in this worktree. Run cat memory/graph/find/<pattern> first.`;
    }
    if (idx < 1 || idx > handles.ids.length) {
      return `Handle [${idx}] out of range. Last find/${handles.pattern} produced ${handles.ids.length} matches.`;
    }
    const nodeId = handles.ids[idx - 1];
    const node = snap.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return `Handle [${idx}] points at "${nodeId}" but that node is no longer in the snapshot (graph rebuilt since last find?). Re-run find.`;
    }
    return renderNodeDetail(snap, node);
  }
  const needle = key.toLowerCase();
  const matches = snap.nodes.filter((n) => n.id.toLowerCase().includes(needle));
  if (matches.length === 0) {
    return `No node matches "${key}". Try cat memory/graph/find/${key} for fuzzy search.`;
  }
  if (matches.length === 1) {
    return renderNodeDetail(snap, matches[0]);
  }
  saveHandles(baseDir, worktreeId, matches.slice(0, 50).map((n) => n.id), key);
  const lines = [];
  lines.push(`"${key}" matches ${matches.length} nodes. Pick one:`);
  lines.push("");
  for (let i = 0; i < Math.min(matches.length, 50); i++) {
    lines.push(`  [${i + 1}]  ${matches[i].id}`);
  }
  lines.push("");
  lines.push("Use: cat ~/.deeplake/memory/graph/show/<N>");
  return lines.join("\n");
}
function renderNodeDetail(snap, node) {
  const incoming = [];
  const outgoing = [];
  for (const e of snap.links) {
    if (e.target === node.id)
      incoming.push(e);
    if (e.source === node.id)
      outgoing.push(e);
  }
  const groupBy = (es) => {
    const m = /* @__PURE__ */ new Map();
    for (const e of es) {
      const list = m.get(e.relation) ?? [];
      list.push(e);
      m.set(e.relation, list);
    }
    return m;
  };
  const inGrp = groupBy(incoming);
  const outGrp = groupBy(outgoing);
  const lines = [];
  lines.push(`Node: ${node.id}`);
  lines.push(`  source: ${node.source_file}:${node.source_location}`);
  lines.push(`  kind:   ${node.kind}`);
  lines.push(`  label:  ${node.label}`);
  if (node.signature)
    lines.push(`  sig:    ${node.signature}`);
  if (node.doc)
    lines.push(`  doc:    ${node.doc}`);
  const tags = [node.exported ? "exported" : "internal"];
  if (node.is_entrypoint)
    tags.push("entrypoint");
  if (node.fan_in !== void 0)
    tags.push(`fan_in=${node.fan_in}`);
  if (node.fan_out !== void 0)
    tags.push(`fan_out=${node.fan_out}`);
  lines.push(`  ${tags.join("  ")}`);
  lines.push("");
  const inHint = incoming.length === 0 ? "  \u2014 no resolved callers (cross-file resolution is partial; not proof of dead code)" : ":";
  lines.push(`Incoming (${incoming.length})${inHint}`);
  for (const [rel, es] of [...inGrp.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${rel} (${es.length}):`);
    for (const e of es.slice(0, 20)) {
      lines.push(`    ${e.source}`);
    }
    if (es.length > 20)
      lines.push(`    ... and ${es.length - 20} more`);
  }
  lines.push("");
  lines.push(`Outgoing (${outgoing.length})${outgoing.length === 0 ? "  \u2014 this node has no edges out" : ":"}`);
  for (const [rel, es] of [...outGrp.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${rel} (${es.length}):`);
    for (const e of es.slice(0, 20)) {
      lines.push(`    ${e.target}`);
    }
    if (es.length > 20)
      lines.push(`    ... and ${es.length - 20} more`);
  }
  return lines.join("\n");
}
function rank(n, needle) {
  const lbl = n.label.toLowerCase();
  const id = n.id.toLowerCase();
  if (lbl === needle)
    return 0;
  if (lbl.startsWith(needle))
    return 1;
  if (lbl.includes(needle))
    return 2;
  if (id.includes(needle))
    return 3;
  return 4;
}
function handlesPath(baseDir, worktreeId) {
  return join14(baseDir, "worktrees", worktreeId, ".find-handles.json");
}
function saveHandles(baseDir, worktreeId, ids, pattern) {
  const path2 = handlesPath(baseDir, worktreeId);
  const payload = { pattern, ts: Date.now(), ids };
  try {
    mkdirSync9(dirname8(path2), { recursive: true });
    const tmp = `${path2}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync7(tmp, JSON.stringify(payload));
    renameSync5(tmp, path2);
  } catch {
  }
}
function loadHandles(baseDir, worktreeId) {
  const path2 = handlesPath(baseDir, worktreeId);
  if (!existsSync7(path2))
    return null;
  try {
    const parsed = JSON.parse(readFileSync10(path2, "utf8"));
    if (parsed === null || typeof parsed !== "object")
      return null;
    const o = parsed;
    if (typeof o.pattern !== "string")
      return null;
    if (typeof o.ts !== "number")
      return null;
    if (!Array.isArray(o.ids))
      return null;
    if (!o.ids.every((s) => typeof s === "string"))
      return null;
    return { pattern: o.pattern, ts: o.ts, ids: o.ids };
  } catch {
    return null;
  }
}

// dist/src/graph/graph-command.js
var GRAPH_ROOT = "/graph";
var GRAPH_PREFIX = "/graph/";
function tokenize(s) {
  return s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}
function stripQuotes(p) {
  if (p.length >= 2 && (p[0] === '"' && p[p.length - 1] === '"' || p[0] === "'" && p[p.length - 1] === "'")) {
    return p.slice(1, -1);
  }
  return p;
}
function parseReadTargetPath(rewrittenCommand) {
  const cmd = rewrittenCommand.replace(/\s+2>\S+/g, "").trim();
  const pipeIdx = cmd.indexOf("|");
  let readPart = cmd;
  if (pipeIdx >= 0) {
    readPart = cmd.slice(0, pipeIdx).trim();
    const after = cmd.slice(pipeIdx + 1).trim();
    if (after.includes("|"))
      return null;
    if (!/^(?:head|tail)\b/.test(after))
      return null;
    if (!/^cat\b/.test(readPart))
      return null;
  }
  const tokens = tokenize(readPart);
  if (tokens.length === 0)
    return null;
  const verb = tokens[0];
  if (verb !== "cat" && verb !== "head" && verb !== "tail")
    return null;
  const operands = [];
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith("-")) {
      if ((verb === "head" || verb === "tail") && (tok === "-n" || tok === "--lines"))
        i++;
      continue;
    }
    operands.push(tok);
    if (operands.length > 1)
      return null;
  }
  return operands.length === 1 ? stripQuotes(operands[0]) : null;
}
function hasTraversal(virtualPath) {
  return virtualPath.split("/").includes("..");
}
function tryGraphRead(rewrittenCommand, cwd) {
  const ls = rewrittenCommand.replace(/\s+2>\S+/g, "").trim().match(/^ls\s+(?:-\S+\s+)*(\S+)\s*$/);
  if (ls) {
    const dir = stripQuotes(ls[1]).replace(/\/+$/, "") || "/";
    if (dir === GRAPH_ROOT)
      return "index.md\nfind/\nquery/\nshow/\nimpact/\nneighborhood/\nlayers\ntour\npath/\n";
    return null;
  }
  const virtualPath = parseReadTargetPath(rewrittenCommand);
  if (virtualPath === null)
    return null;
  if (hasTraversal(virtualPath))
    return null;
  const normalized = virtualPath.replace(/\/+$/, "") || "/";
  if (normalized === GRAPH_ROOT)
    return "index.md\nfind/\nquery/\nshow/\nimpact/\nneighborhood/\nlayers\ntour\npath/\n";
  if (!virtualPath.startsWith(GRAPH_PREFIX))
    return null;
  const subpath = virtualPath.slice(GRAPH_PREFIX.length);
  const result = handleGraphVfs(subpath, cwd);
  return result.kind === "ok" ? result.body : `(${result.kind}) ${result.message}`;
}

// dist/src/docs/stable-read.js
var defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function stableUnionRows(query, sql, opts = {}) {
  const idKey = opts.idKey ?? "id";
  const stableReads = Math.max(1, opts.stableReads ?? 3);
  const maxReads = Math.max(stableReads, opts.maxReads ?? 10);
  const delayMs = opts.delayMs ?? 0;
  const sleep4 = opts.sleep ?? defaultSleep;
  const union = /* @__PURE__ */ new Map();
  let stableStreak = 0;
  let reads = 0;
  while (reads < maxReads) {
    const rows = await query(sql);
    reads++;
    let grew = false;
    for (const row of rows) {
      const k = String(row[idKey] ?? "");
      if (k === "")
        continue;
      if (!union.has(k)) {
        union.set(k, row);
        grew = true;
      }
    }
    stableStreak = grew ? 0 : stableStreak + 1;
    if (stableStreak >= stableReads)
      break;
    if (reads < maxReads)
      await sleep4(delayMs);
  }
  opts.log?.(`stable-read: ${union.size} rows after ${reads} reads (streak ${stableStreak})`);
  return [...union.values()];
}

// dist/src/docs/branch-scope.js
var MAIN_SCOPE = "main";
function pickByScopePrecedence(rows, readerScope) {
  let best = null;
  let bestRank = -1;
  for (const r of rows) {
    const s = r.scope || MAIN_SCOPE;
    const rank2 = s === readerScope ? 2 : s === MAIN_SCOPE ? 1 : 0;
    if (rank2 === 0)
      continue;
    if (best === null || rank2 > bestRank || rank2 === bestRank && r.version > best.version) {
      best = r;
      bestRank = rank2;
    }
  }
  return best;
}

// dist/src/docs/read.js
function buildProjectFilter(opts) {
  const clauses = [];
  if (opts.project !== void 0) {
    clauses.push(`project = '${sqlStr(opts.project)}'`);
  } else if (opts.projectOrLegacy !== void 0) {
    clauses.push(`(project = '${sqlStr(opts.projectOrLegacy)}' OR project = '')`);
  }
  if (opts.scope !== void 0) {
    clauses.push(`scope = '${sqlStr(opts.scope)}'`);
  }
  return clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
}
var SELECT_COLS = "id, doc_id, path, content, anchors, tier, status, project, version, created_at, updated_at, agent, plugin_version";
function isMissingColumnError(err) {
  const m = err instanceof Error ? err.message : String(err);
  return /(does not exist|no such column|unknown column|undefined column)/i.test(m) && /(scope|source_fp|column)/i.test(m);
}
async function scopedUnion(query, buildSql) {
  const tiers = [`${SELECT_COLS}, scope, source_fp`, `${SELECT_COLS}, scope`, SELECT_COLS];
  let lastErr;
  for (let i = 0; i < tiers.length; i++) {
    try {
      return await stableUnionRows(query, buildSql(tiers[i]));
    } catch (e) {
      if (i === tiers.length - 1 || !isMissingColumnError(e))
        throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}
async function listDocMeta(query, tableName, opts = {}) {
  const safe = sqlIdent(tableName);
  const clauses = [];
  if (opts.dirPrefix !== void 0 && opts.dirPrefix !== "") {
    clauses.push(`doc_id LIKE '${sqlLike(opts.dirPrefix)}/%'`);
  }
  if (opts.project !== void 0) {
    clauses.push(`(project = '${sqlStr(opts.project)}' OR project = '')`);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const scoped = opts.readerScope !== void 0;
  const baseCols = "id, doc_id, version, updated_at, status, tier";
  let rows;
  try {
    rows = await stableUnionRows(query, `SELECT ${scoped ? `${baseCols}, scope` : baseCols} FROM "${safe}"${where}`);
  } catch (e) {
    if (!scoped || !isMissingColumnError(e))
      throw e;
    rows = await stableUnionRows(query, `SELECT ${baseCols} FROM "${safe}"${where}`);
  }
  const candidates = /* @__PURE__ */ new Map();
  const latest = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const doc_id = String(r.doc_id ?? "");
    if (doc_id === "")
      continue;
    if (doc_id === "_meta")
      continue;
    const vRaw = r.version;
    const version = typeof vRaw === "number" ? vRaw : Number(vRaw);
    if (!Number.isFinite(version))
      continue;
    const updated_at = String(r.updated_at ?? "");
    const tier = String(r.tier ?? "fast");
    const meta = { doc_id, version, updated_at, status: String(r.status ?? ""), tier: tier === "slow" ? "slow" : "fast" };
    if (scoped) {
      const cand = { ...meta, scope: String(r.scope || "main") };
      const list = candidates.get(doc_id);
      if (list)
        list.push(cand);
      else
        candidates.set(doc_id, [cand]);
      continue;
    }
    const prev = latest.get(doc_id);
    if (!prev || version > prev.version || version === prev.version && updated_at > prev.updated_at) {
      latest.set(doc_id, meta);
    }
  }
  if (scoped) {
    for (const [doc_id, list] of candidates) {
      const winner = pickByScopePrecedence(list, opts.readerScope);
      if (winner)
        latest.set(doc_id, { doc_id: winner.doc_id, version: winner.version, updated_at: winner.updated_at, status: winner.status, tier: winner.tier });
    }
  }
  return [...latest.values()];
}
async function listDocsByIds(query, tableName, docIds, opts = {}) {
  const ids = [...new Set(docIds.filter((d) => d !== ""))];
  if (ids.length === 0)
    return [];
  const safe = sqlIdent(tableName);
  const inList = ids.map((d) => `'${sqlStr(d)}'`).join(", ");
  const projFilter = buildProjectFilter(opts);
  const scoped = opts.readerScope !== void 0;
  const rows = scoped ? await scopedUnion(query, (cols) => `SELECT ${cols} FROM "${safe}" WHERE doc_id IN (${inList})${projFilter}`) : await stableUnionRows(query, `SELECT ${SELECT_COLS} FROM "${safe}" WHERE doc_id IN (${inList})${projFilter}`);
  const candidates = /* @__PURE__ */ new Map();
  const latest = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const row = normalize(r);
    if (!row)
      continue;
    if (scoped) {
      const list = candidates.get(row.doc_id);
      if (list)
        list.push(row);
      else
        candidates.set(row.doc_id, [row]);
      continue;
    }
    const prev = latest.get(row.doc_id);
    if (!prev || row.version > prev.version || row.version === prev.version && row.updated_at > prev.updated_at) {
      latest.set(row.doc_id, row);
    }
  }
  if (scoped) {
    for (const [doc_id, list] of candidates) {
      const winner = pickByScopePrecedence(list, opts.readerScope);
      if (winner)
        latest.set(doc_id, winner);
    }
  }
  return [...latest.values()];
}
async function getDocLatest(query, tableName, docId, opts = {}) {
  const safe = sqlIdent(tableName);
  const projFilter = buildProjectFilter(opts);
  if (opts.readerScope !== void 0) {
    const raw2 = await scopedUnion(query, (cols) => `SELECT ${cols} FROM "${safe}" WHERE doc_id = '${sqlStr(docId)}'${projFilter}`);
    const rows = raw2.map(normalize).filter((r) => r !== null);
    return pickByScopePrecedence(rows, opts.readerScope);
  }
  const raw = await stableUnionRows(query, `SELECT ${SELECT_COLS} FROM "${safe}" WHERE doc_id = '${sqlStr(docId)}'${projFilter}`);
  let best = null;
  for (const r of raw) {
    const row = normalize(r);
    if (!row)
      continue;
    if (best === null || row.version > best.version || row.version === best.version && (row.updated_at.localeCompare(best.updated_at) > 0 || row.updated_at === best.updated_at && row.id.localeCompare(best.id) > 0)) {
      best = row;
    }
  }
  return best;
}
function parseAnchors(raw) {
  let arr = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "")
      return [];
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr))
    return [];
  const out = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const sid = item.symbol_id;
      const hash = item.content_hash;
      if (typeof sid === "string" && typeof hash === "string") {
        out.push({ symbol_id: sid, content_hash: hash });
      }
    }
  }
  return out;
}
function normalize(row) {
  const vRaw = row.version;
  const version = typeof vRaw === "number" ? vRaw : typeof vRaw === "string" ? Number(vRaw) : NaN;
  if (!Number.isFinite(version))
    return null;
  const tier = String(row.tier ?? "fast");
  return {
    id: String(row.id ?? ""),
    doc_id: String(row.doc_id ?? ""),
    path: String(row.path ?? ""),
    content: String(row.content ?? ""),
    anchors: parseAnchors(row.anchors),
    tier: tier === "slow" ? "slow" : "fast",
    status: String(row.status ?? ""),
    project: String(row.project ?? ""),
    // `||` (not `??`): a stored empty scope is a legacy/unstamped row and must
    // resolve as main, not as a distinct "" identity that hides from precedence.
    scope: String(row.scope || "main"),
    source_fp: String(row.source_fp ?? "{}"),
    version,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    agent: String(row.agent ?? ""),
    plugin_version: String(row.plugin_version ?? "")
  };
}

// dist/src/docs/index-render.js
function dirOf(docId) {
  const i = docId.lastIndexOf("/");
  return i < 0 ? "" : docId.slice(0, i);
}
function childUnder(atDir, docId) {
  const prefix = atDir === "" ? "" : atDir + "/";
  if (!docId.startsWith(prefix))
    return null;
  const rest = docId.slice(prefix.length);
  if (rest === "" || rest.startsWith("/"))
    return null;
  const slash = rest.indexOf("/");
  if (slash < 0)
    return { kind: "file", name: rest };
  return { kind: "dir", name: rest.slice(0, slash) };
}
function firstDocLine(content, max = 90) {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line === "---")
      continue;
    return line.length > max ? line.slice(0, max - 1).trimEnd() + "\u2026" : line;
  }
  return "";
}
function dateOnly(ts) {
  return ts.slice(0, 10);
}
function buildDocsIndex(meta, atDir = "", summaries = /* @__PURE__ */ new Map()) {
  const active = meta.filter((m) => m.status === "active");
  const subdirs = /* @__PURE__ */ new Map();
  const files = [];
  for (const m of active) {
    const child = childUnder(atDir, m.doc_id);
    if (!child)
      continue;
    if (child.kind === "file") {
      files.push(m);
    } else {
      const agg = subdirs.get(child.name);
      if (agg) {
        agg.count++;
        if (m.updated_at > agg.latest)
          agg.latest = m.updated_at;
      } else {
        subdirs.set(child.name, { count: 1, latest: m.updated_at });
      }
    }
  }
  const title = atDir === "" ? "# Docs Index" : `# Docs: ${atDir}/`;
  const lines = [
    title,
    "",
    "Per-file documentation, kept fresh on code changes. Drill into a directory,",
    "or open a file's doc directly. Metadata only \u2014 open a leaf for the content.",
    ""
  ];
  if (subdirs.size > 0) {
    lines.push("## Directories", "");
    lines.push("| Directory | Docs | Last updated |");
    lines.push("|-----------|------|--------------|");
    for (const name of [...subdirs.keys()].sort()) {
      const agg = subdirs.get(name);
      const rel = `${name}/index.md`;
      lines.push(`| [${name}/](${rel}) | ${agg.count} | ${dateOnly(agg.latest)} |`);
    }
    lines.push("");
  }
  if (files.length > 0) {
    lines.push("## Files", "");
    const hasSummary = files.some((f) => (summaries.get(f.doc_id) ?? "") !== "");
    if (hasSummary) {
      lines.push("| File | Version | Updated | Summary |");
      lines.push("|------|---------|---------|---------|");
    } else {
      lines.push("| File | Version | Updated |");
      lines.push("|------|---------|---------|");
    }
    for (const f of files.sort((a, b) => a.doc_id.localeCompare(b.doc_id))) {
      const base = f.doc_id.slice(f.doc_id.lastIndexOf("/") + 1);
      const rel = `${base}.md`;
      const ver = `v${f.version}`;
      if (hasSummary) {
        lines.push(`| [${base}](${rel}) | ${ver} | ${dateOnly(f.updated_at)} | ${summaries.get(f.doc_id) ?? ""} |`);
      } else {
        lines.push(`| [${base}](${rel}) | ${ver} | ${dateOnly(f.updated_at)} |`);
      }
    }
    lines.push("");
  }
  if (subdirs.size === 0 && files.length === 0) {
    lines.push(atDir === "" ? "_(no docs yet \u2014 run `hivemind docs generate`)_" : `_(no docs under ${atDir}/)_`);
    lines.push("");
  }
  const totalActive = active.length;
  const archived = meta.length - totalActive;
  lines.push("---", `${totalActive} active doc(s)${archived > 0 ? `, ${archived} archived` : ""}.`);
  return lines.join("\n");
}

// dist/src/docs/fingerprint.js
function computeFingerprintAt(git, ref, files) {
  const fp = {};
  if (files.length === 0)
    return fp;
  const out = git(["ls-tree", ref, "--", ...files]);
  if (out === null)
    return fp;
  for (const line of out.split("\n")) {
    const tab = line.indexOf("	");
    if (tab < 0)
      continue;
    const meta = line.slice(0, tab).trim().split(/\s+/);
    const path2 = line.slice(tab + 1);
    if (meta.length >= 3 && meta[1] === "blob" && path2)
      fp[path2] = meta[2];
  }
  return fp;
}
function computeFingerprint(git, files) {
  return computeFingerprintAt(git, "HEAD", files);
}
function parseFingerprint(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string")
        out[k] = v;
    }
    return out;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      return parseFingerprint(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return {};
}
function changedFiles(a, b) {
  const changed = [];
  const keys = /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys)
    if (a[k] !== b[k])
      changed.push(k);
  return changed.sort();
}

// dist/src/docs/wiki-generate.js
import { readFileSync as readFileSync12, statSync as statSync2 } from "node:fs";
import { join as join16 } from "node:path";

// dist/src/docs/anchors.js
import { createHash as createHash4 } from "node:crypto";
import { readFileSync as readFileSync11 } from "node:fs";
import { join as join15 } from "node:path";

// dist/src/docs/write.js
import { randomUUID as randomUUID2 } from "node:crypto";

// dist/src/docs/candidates.js
import { execFileSync } from "node:child_process";

// dist/src/docs/wiki-generate.js
var WIKI_DOC_PREFIX = "wiki/";
var PAGE_STYLE = [
  "Write for an engineer new to this subsystem. Cover: what the subsystem is for,",
  "how its pieces fit together (data flow, who calls whom), and any surprising",
  "behavior. Use `## ` section headings.",
  "EVIDENCE RULE: state ONLY facts you can tie to a specific file and symbol you",
  "actually saw. Name the file when you attribute behavior to it. If you did not",
  "see the code for a claim, do not make the claim. Never state general rules or",
  'invariants ("X is immutable", "Y rejects Z", "almost everything goes through W")',
  "unless a specific line you saw says exactly that \u2014 prefer describing what one",
  "named function does over generalizing across the subsystem.",
  'NEVER cite line numbers or numeric counts ("line 887", "~60 methods") \u2014 line',
  "numbers rot with every commit and you cannot know them reliably; anchor claims",
  "to file + symbol names only.",
  "Do NOT include a file listing section; one is appended mechanically.",
  "Output ONLY markdown, no preamble, no outer code fence. Keep it under ~4000 characters."
].join("\n");
function parseFilesIndex(content) {
  const m = /^## Files\s*$([\s\S]*?)(?=^## |\n*$(?![\s\S]))/m.exec(content);
  if (!m)
    return [];
  const files = [];
  for (const line of m[1].split("\n")) {
    const item = /^- `(.+)`\s*$/.exec(line.trim());
    if (item)
      files.push(item[1]);
  }
  return files;
}

// dist/src/docs/private-store.js
import { mkdirSync as mkdirSync10, readFileSync as readFileSync13, writeFileSync as writeFileSync8, renameSync as renameSync6, existsSync as existsSync8 } from "node:fs";
import { homedir as homedir9 } from "node:os";
import { createHash as createHash5 } from "node:crypto";
import { dirname as dirname9, join as join17 } from "node:path";
function privateStoreRoot() {
  return process.env.HIVEMIND_DOCS_PRIVATE_DIR || join17(homedir9(), ".hivemind", "docs-private");
}
function storeFile(project, scope) {
  const key = createHash5("sha256").update(`${project}\0${scope}`).digest("hex");
  return join17(privateStoreRoot(), `${key}.json`);
}
function readMap(file) {
  try {
    if (!existsSync8(file))
      return {};
    const raw = JSON.parse(readFileSync13(file, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return {};
    return raw;
  } catch {
    return {};
  }
}
function readPrivateDoc(project, scope, docId) {
  return readMap(storeFile(project, scope))[docId] ?? null;
}

// dist/src/docs/vfs-handler.js
async function handleDocsVfs(subpath, query, tableName, opts = {}) {
  const path2 = subpath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path2 === "find" || path2.startsWith("find/") && !path2.endsWith(".md")) {
    const q = path2 === "find" ? "" : path2.slice("find/".length).trim();
    if (q === "") {
      return { kind: "ok", body: "Usage: cat <memory>/docs/find/<query> \u2014 search docs by meaning/keyword." };
    }
    const queryEmbedding = opts.embedQuery ? await opts.embedQuery(q) : null;
    const searchOpts = {
      pathFilter: "",
      contentScanOnly: false,
      likeOp: "ILIKE",
      escapedPattern: sqlLike(q),
      queryEmbedding,
      limit: 20,
      project: opts.project
    };
    const hits = await searchDocs(query, tableName, searchOpts);
    if (hits.length === 0)
      return { kind: "ok", body: `No docs match "${q}".` };
    const lines = [`${hits.length} doc(s) match "${q}"${queryEmbedding ? " (semantic + keyword)" : " (keyword)"}:`, ""];
    for (const h of hits)
      lines.push(`## ${h.path}
${firstDocLine(h.content)}`);
    lines.push("", `Open one with: cat <memory>/docs/<path>.md`);
    return { kind: "ok", body: lines.join("\n") };
  }
  let dir = null;
  if (path2 === "" || path2 === "index.md")
    dir = "";
  else if (path2.endsWith("/index.md"))
    dir = path2.slice(0, -"/index.md".length);
  else if (!path2.endsWith(".md"))
    dir = path2;
  if (dir !== null) {
    const meta = (await listDocMeta(query, tableName, { dirPrefix: dir, project: opts.project, readerScope: opts.readerScope })).map((r) => ({
      doc_id: r.doc_id,
      version: r.version,
      updated_at: r.updated_at,
      status: r.status,
      tier: r.tier
    }));
    const directFiles = meta.filter((m) => m.status === "active" && dirOf(m.doc_id) === dir).map((m) => m.doc_id);
    const summaries = /* @__PURE__ */ new Map();
    if (directFiles.length > 0) {
      for (const d of await listDocsByIds(query, tableName, directFiles, { projectOrLegacy: opts.project, readerScope: opts.readerScope })) {
        summaries.set(d.doc_id, firstDocLine(d.content));
      }
    }
    return { kind: "ok", body: buildDocsIndex(meta, dir, summaries) };
  }
  const docId = path2.slice(0, -".md".length);
  if (opts.project !== void 0 && opts.readerScope && opts.readerScope !== MAIN_SCOPE) {
    const priv = readPrivateDoc(opts.project, opts.readerScope, docId);
    if (priv) {
      const banner2 = staleBanner(opts.git, priv.doc_id, priv.content, priv.source_fp);
      const header2 = `# ${priv.doc_id}
visibility: private (this branch, not pushed)  updated: ${priv.updated_at}
---
`;
      return { kind: "ok", body: header2 + banner2 + priv.content };
    }
  }
  const row = await getDocLatest(query, tableName, docId, { projectOrLegacy: opts.project, readerScope: opts.readerScope });
  if (!row)
    return { kind: "not-found", message: `${subpath}: No such file or directory` };
  const banner = staleBanner(opts.git, row.doc_id, row.content, row.source_fp);
  const header = `# ${row.doc_id}
version: ${row.version}  tier: ${row.tier}  status: ${row.status}  updated: ${row.updated_at}
---
`;
  return { kind: "ok", body: header + banner + row.content };
}
function staleBanner(git, docId, content, source_fp) {
  if (!git || !source_fp)
    return "";
  const files = docId.startsWith(WIKI_DOC_PREFIX) ? parseFilesIndex(content) : [docId];
  const changed = changedFiles(parseFingerprint(source_fp), computeFingerprint(git, files));
  if (changed.length === 0)
    return "";
  return `> [!] This page may be stale \u2014 ${changed.length} source file(s) changed since it was written. Confirm against the source before relying on it: ${changed.join(", ")}

`;
}

// dist/src/docs/embed.js
import { dirname as dirname10, join as join18 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function resolveEmbedDaemonPath() {
  return join18(dirname10(fileURLToPath2(import.meta.url)), "embeddings", "embed-daemon.js");
}
function makeQueryEmbedder() {
  if (embeddingsDisabled())
    return async () => null;
  const client = new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() });
  return async (text) => {
    try {
      return await client.embed(text, "query");
    } catch {
      return null;
    }
  };
}

// dist/src/hooks/virtual-table-query.js
function normalizeSessionPart(path2, content) {
  return normalizeContent(path2, content);
}
var INDEX_LIMIT_PER_SECTION = 50;
function buildVirtualIndexContent(summaryRows, sessionRows = [], opts = {}) {
  const lines = [
    "# Session Index",
    "",
    "Two sources are available. Consult the section relevant to the question.",
    ""
  ];
  lines.push("## memory", "");
  if (summaryRows.length === 0) {
    lines.push("_(empty \u2014 no summaries ingested yet)_");
  } else {
    lines.push("AI-generated summaries per session. Read these first for topic-level overviews.");
    lines.push("");
    if (opts.summaryTruncated) {
      lines.push(`_Showing ${INDEX_LIMIT_PER_SECTION} most-recent of many \u2014 older summaries reachable via \`Grep pattern="..." path="~/.deeplake/memory"\`._`);
      lines.push("");
    }
    lines.push("| Session | Created | Last Updated | Project | Description |");
    lines.push("|---------|---------|--------------|---------|-------------|");
    for (const row of summaryRows) {
      const p = row["path"] || "";
      const match = p.match(/\/summaries\/([^/]+)\/([^/]+)\.md$/);
      if (!match)
        continue;
      const summaryUser = match[1];
      const sessionId = match[2];
      const relPath = `summaries/${summaryUser}/${sessionId}.md`;
      const project = row["project"] || "";
      const description = row["description"] || "";
      const creationDate = row["creation_date"] || "";
      const lastUpdateDate = row["last_update_date"] || "";
      lines.push(`| [${sessionId}](${relPath}) | ${creationDate} | ${lastUpdateDate} | ${project} | ${description} |`);
    }
  }
  lines.push("");
  lines.push("## sessions", "");
  if (sessionRows.length === 0) {
    lines.push("_(empty \u2014 no session records ingested yet)_");
  } else {
    lines.push("Raw session records (dialogue, tool calls). Read for exact detail / quotes.");
    lines.push("");
    if (opts.sessionTruncated) {
      lines.push(`_Showing ${INDEX_LIMIT_PER_SECTION} most-recent of many \u2014 older sessions reachable via \`Grep pattern="..." path="~/.deeplake/memory"\`._`);
      lines.push("");
    }
    lines.push("| Session | Created | Last Updated | Description |");
    lines.push("|---------|---------|--------------|-------------|");
    for (const row of sessionRows) {
      const p = row["path"] || "";
      const rel = p.startsWith("/") ? p.slice(1) : p;
      const filename = p.split("/").pop() ?? p;
      const description = row["description"] || "";
      const creationDate = row["creation_date"] || "";
      const lastUpdateDate = row["last_update_date"] || "";
      lines.push(`| [${filename}](${rel}) | ${creationDate} | ${lastUpdateDate} | ${description} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
function buildUnionQuery(memoryQuery, sessionsQuery) {
  return `SELECT path, content, size_bytes, creation_date, source_order FROM ((${memoryQuery}) UNION ALL (${sessionsQuery})) AS combined ORDER BY path, source_order, creation_date`;
}
function buildInList(paths) {
  return paths.map((path2) => `'${sqlStr(path2)}'`).join(", ");
}
function buildDirFilter(dirs) {
  const cleaned = [...new Set(dirs.map((dir) => dir.replace(/\/+$/, "") || "/"))];
  if (cleaned.length === 0 || cleaned.includes("/"))
    return "";
  const clauses = cleaned.map((dir) => `path LIKE '${sqlLike(dir)}/%' ESCAPE '\\'`);
  return ` WHERE ${clauses.join(" OR ")}`;
}
async function queryUnionRows(api, memoryQuery, sessionsQuery) {
  const unionQuery = buildUnionQuery(memoryQuery, sessionsQuery);
  try {
    return await api.query(unionQuery);
  } catch (unionErr) {
    const settled = await Promise.allSettled([
      api.query(memoryQuery),
      api.query(sessionsQuery)
    ]);
    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    if (fulfilled.length === 0)
      throw unionErr;
    return fulfilled.flatMap((r) => r.value);
  }
}
async function readVirtualPathContents(api, memoryTable, sessionsTable, virtualPaths) {
  const uniquePaths = [...new Set(virtualPaths)];
  const result = new Map(uniquePaths.map((path2) => [path2, null]));
  if (uniquePaths.length === 0)
    return result;
  const inList = buildInList(uniquePaths);
  const rows = await queryUnionRows(api, `SELECT path, summary::text AS content, NULL::bigint AS size_bytes, '' AS creation_date, 0 AS source_order FROM "${memoryTable}" WHERE path IN (${inList})`, `SELECT path, message::text AS content, NULL::bigint AS size_bytes, COALESCE(creation_date::text, '') AS creation_date, 1 AS source_order FROM "${sessionsTable}" WHERE path IN (${inList})`);
  const memoryHits = /* @__PURE__ */ new Map();
  const sessionHits = /* @__PURE__ */ new Map();
  const sessionRowCounts = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const path2 = row["path"];
    const sourceOrder = Number(row["source_order"] ?? 0);
    if (typeof path2 !== "string")
      continue;
    if (sourceOrder !== 0) {
      sessionRowCounts.set(path2, (sessionRowCounts.get(path2) ?? 0) + 1);
    }
    const content = row["content"];
    if (typeof content !== "string")
      continue;
    if (sourceOrder === 0) {
      memoryHits.set(path2, content);
    } else {
      const normalized = normalizeSessionPart(path2, content);
      if (!normalized)
        continue;
      const current = sessionHits.get(path2) ?? [];
      current.push(normalized);
      sessionHits.set(path2, current);
    }
  }
  for (const path2 of uniquePaths) {
    if (memoryHits.has(path2)) {
      result.set(path2, memoryHits.get(path2) ?? null);
      continue;
    }
    const sessionParts = sessionHits.get(path2) ?? [];
    if (sessionParts.length > 0) {
      result.set(path2, sessionParts.join("\n"));
      continue;
    }
    const rowCount = sessionRowCounts.get(path2) ?? 0;
    if (rowCount > 0) {
      result.set(path2, emptySessionBodyNotice(rowCount));
    }
  }
  if (result.get("/index.md") === null && uniquePaths.includes("/index.md")) {
    const fetchLimit = INDEX_LIMIT_PER_SECTION + 1;
    const [summaryRows, sessionRows] = await Promise.all([
      api.query(`SELECT path, project, description, creation_date, last_update_date FROM "${memoryTable}" WHERE path LIKE '/summaries/%' ORDER BY last_update_date DESC LIMIT ${fetchLimit}`).catch(() => []),
      api.query(`SELECT path, MAX(description) AS description, MIN(creation_date) AS creation_date, MAX(last_update_date) AS last_update_date FROM "${sessionsTable}" WHERE path LIKE '/sessions/%' GROUP BY path ORDER BY MAX(last_update_date) DESC LIMIT ${fetchLimit}`).catch(() => [])
    ]);
    const summaryTruncated = summaryRows.length > INDEX_LIMIT_PER_SECTION;
    const sessionTruncated = sessionRows.length > INDEX_LIMIT_PER_SECTION;
    result.set("/index.md", buildVirtualIndexContent(summaryRows.slice(0, INDEX_LIMIT_PER_SECTION), sessionRows.slice(0, INDEX_LIMIT_PER_SECTION), { summaryTruncated, sessionTruncated }));
  }
  return result;
}
async function listVirtualPathRowsForDirs(api, memoryTable, sessionsTable, dirs) {
  const uniqueDirs = [...new Set(dirs.map((dir) => dir.replace(/\/+$/, "") || "/"))];
  const filter = buildDirFilter(uniqueDirs);
  const rows = await queryUnionRows(api, `SELECT path, NULL::text AS content, size_bytes, '' AS creation_date, 0 AS source_order FROM "${memoryTable}"${filter}`, `SELECT path, NULL::text AS content, size_bytes, '' AS creation_date, 1 AS source_order FROM "${sessionsTable}"${filter}`);
  const deduped = dedupeRowsByPath(rows.map((row) => ({
    path: row["path"],
    size_bytes: row["size_bytes"]
  })));
  const byDir = /* @__PURE__ */ new Map();
  for (const dir of uniqueDirs)
    byDir.set(dir, []);
  for (const row of deduped) {
    const path2 = row["path"];
    if (typeof path2 !== "string")
      continue;
    for (const dir of uniqueDirs) {
      const prefix = dir === "/" ? "/" : `${dir}/`;
      if (dir === "/" || path2.startsWith(prefix)) {
        byDir.get(dir)?.push(row);
      }
    }
  }
  return byDir;
}
async function readVirtualPathContent(api, memoryTable, sessionsTable, virtualPath) {
  return (await readVirtualPathContents(api, memoryTable, sessionsTable, [virtualPath])).get(virtualPath) ?? null;
}
async function listVirtualPathRows(api, memoryTable, sessionsTable, dir) {
  return (await listVirtualPathRowsForDirs(api, memoryTable, sessionsTable, [dir])).get(dir.replace(/\/+$/, "") || "/") ?? [];
}
async function findVirtualPaths(api, memoryTable, sessionsTable, dir, filenamePattern) {
  const normalizedDir = dir.replace(/\/+$/, "") || "/";
  const likePath = `${sqlLike(normalizedDir === "/" ? "" : normalizedDir)}/%`;
  const rows = await queryUnionRows(api, `SELECT path, NULL::text AS content, NULL::bigint AS size_bytes, '' AS creation_date, 0 AS source_order FROM "${memoryTable}" WHERE path LIKE '${likePath}' ESCAPE '\\' AND filename LIKE '${filenamePattern}' ESCAPE '\\'`, `SELECT path, NULL::text AS content, NULL::bigint AS size_bytes, '' AS creation_date, 1 AS source_order FROM "${sessionsTable}" WHERE path LIKE '${likePath}' ESCAPE '\\' AND filename LIKE '${filenamePattern}' ESCAPE '\\'`);
  return [...new Set(rows.map((row) => row["path"]).filter((value) => typeof value === "string" && value.length > 0))];
}
function dedupeRowsByPath(rows) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const row of rows) {
    const path2 = typeof row["path"] === "string" ? row["path"] : "";
    if (!path2 || seen.has(path2))
      continue;
    seen.add(path2);
    unique.push(row);
  }
  return unique;
}

// dist/src/hooks/bash-command-compiler.js
function isQuoted(ch) {
  return ch === "'" || ch === '"';
}
function splitTopLevel(input, operators) {
  const parts = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote)
        quote = null;
      current += ch;
      continue;
    }
    if (isQuoted(ch)) {
      quote = ch;
      current += ch;
      continue;
    }
    const matched = operators.find((op) => input.startsWith(op, i));
    if (matched) {
      const trimmed2 = current.trim();
      if (trimmed2)
        parts.push(trimmed2);
      current = "";
      i += matched.length - 1;
      continue;
    }
    current += ch;
  }
  if (quote)
    return null;
  const trimmed = current.trim();
  if (trimmed)
    parts.push(trimmed);
  return parts;
}
function tokenizeShellWords(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[++i];
      } else {
        current += ch;
      }
      continue;
    }
    if (isQuoted(ch)) {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote)
    return null;
  if (current)
    tokens.push(current);
  return tokens;
}
function expandBraceToken(token) {
  const match = token.match(/\{([^{}]+)\}/);
  if (!match)
    return [token];
  const [expr] = match;
  const prefix = token.slice(0, match.index);
  const suffix = token.slice((match.index ?? 0) + expr.length);
  let variants = [];
  const numericRange = match[1].match(/^(-?\d+)\.\.(-?\d+)$/);
  if (numericRange) {
    const start = Number(numericRange[1]);
    const end = Number(numericRange[2]);
    const step = start <= end ? 1 : -1;
    for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
      variants.push(String(value));
    }
  } else {
    variants = match[1].split(",");
  }
  return variants.flatMap((variant) => expandBraceToken(`${prefix}${variant}${suffix}`));
}
function stripAllowedModifiers(segment) {
  const ignoreMissing = /\s2>\/dev\/null\s*$/.test(segment);
  const clean = segment.replace(/\s2>\/dev\/null\s*$/g, "").replace(/\s2>&1\s*/g, " ").trim();
  return { clean, ignoreMissing };
}
function hasUnsupportedRedirection(segment) {
  let quote = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote)
        quote = null;
      continue;
    }
    if (isQuoted(ch)) {
      quote = ch;
      continue;
    }
    if (ch === ">" || ch === "<")
      return true;
  }
  return false;
}
function parseHeadTailStage(stage) {
  const tokens = tokenizeShellWords(stage);
  if (!tokens || tokens.length === 0)
    return null;
  const [cmd, ...rest] = tokens;
  if (cmd !== "head" && cmd !== "tail")
    return null;
  if (rest.length === 0)
    return { lineLimit: 10, fromEnd: cmd === "tail" };
  if (rest.length === 1) {
    const count = Number(rest[0]);
    if (!Number.isFinite(count)) {
      return { lineLimit: 10, fromEnd: cmd === "tail" };
    }
    return { lineLimit: Math.abs(count), fromEnd: cmd === "tail" };
  }
  if (rest.length === 2 && /^-\d+$/.test(rest[0])) {
    const count = Number(rest[0]);
    if (!Number.isFinite(count))
      return null;
    return { lineLimit: Math.abs(count), fromEnd: cmd === "tail" };
  }
  if (rest.length === 2 && rest[0] === "-n") {
    const count = Number(rest[1]);
    if (!Number.isFinite(count))
      return null;
    return { lineLimit: Math.abs(count), fromEnd: cmd === "tail" };
  }
  if (rest.length === 3 && rest[0] === "-n") {
    const count = Number(rest[1]);
    if (!Number.isFinite(count))
      return null;
    return { lineLimit: Math.abs(count), fromEnd: cmd === "tail" };
  }
  return null;
}
function isValidPipelineHeadTailStage(stage) {
  const tokens = tokenizeShellWords(stage);
  if (!tokens || tokens[0] !== "head" && tokens[0] !== "tail")
    return false;
  if (tokens.length === 1)
    return true;
  if (tokens.length === 2)
    return /^-\d+$/.test(tokens[1]);
  if (tokens.length === 3)
    return tokens[1] === "-n" && /^-?\d+$/.test(tokens[2]);
  return false;
}
function parseFindNamePatterns(tokens) {
  const patterns = [];
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "-type") {
      i += 1;
      continue;
    }
    if (token === "-o")
      continue;
    if (token === "-name") {
      const pattern = tokens[i + 1];
      if (!pattern)
        return null;
      patterns.push(pattern);
      i += 1;
      continue;
    }
    return null;
  }
  return patterns.length > 0 ? patterns : null;
}
function parseCompiledSegment(segment) {
  const { clean, ignoreMissing } = stripAllowedModifiers(segment);
  if (hasUnsupportedRedirection(clean))
    return null;
  const pipeline = splitTopLevel(clean, ["|"]);
  if (!pipeline || pipeline.length === 0)
    return null;
  const tokens = tokenizeShellWords(pipeline[0]);
  if (!tokens || tokens.length === 0)
    return null;
  if (tokens[0] === "echo" && pipeline.length === 1) {
    const text = tokens.slice(1).join(" ");
    return { kind: "echo", text };
  }
  if (tokens[0] === "cat") {
    const paths = tokens.slice(1).flatMap(expandBraceToken);
    if (paths.length === 0)
      return null;
    let lineLimit = 0;
    let fromEnd = false;
    let countLines2 = false;
    if (pipeline.length > 1) {
      if (pipeline.length !== 2)
        return null;
      const pipeStage = pipeline[1].trim();
      if (/^wc\s+-l\s*$/.test(pipeStage)) {
        if (paths.length !== 1)
          return null;
        countLines2 = true;
      } else {
        if (!isValidPipelineHeadTailStage(pipeStage))
          return null;
        const headTail = parseHeadTailStage(pipeStage);
        if (!headTail)
          return null;
        lineLimit = headTail.lineLimit;
        fromEnd = headTail.fromEnd;
      }
    }
    return { kind: "cat", paths, lineLimit, fromEnd, countLines: countLines2, ignoreMissing };
  }
  if (tokens[0] === "head" || tokens[0] === "tail") {
    if (pipeline.length !== 1)
      return null;
    const parsed = parseHeadTailStage(clean);
    if (!parsed)
      return null;
    const headTokens = tokenizeShellWords(clean);
    if (!headTokens)
      return null;
    if (headTokens[1] === "-n" && headTokens.length < 4 || /^-\d+$/.test(headTokens[1] ?? "") && headTokens.length < 3 || headTokens.length === 2 && /^-?\d+$/.test(headTokens[1] ?? ""))
      return null;
    const path2 = headTokens[headTokens.length - 1];
    if (path2 === "head" || path2 === "tail" || path2 === "-n")
      return null;
    return {
      kind: "cat",
      paths: expandBraceToken(path2),
      lineLimit: parsed.lineLimit,
      fromEnd: parsed.fromEnd,
      countLines: false,
      ignoreMissing
    };
  }
  if (tokens[0] === "wc" && tokens[1] === "-l" && pipeline.length === 1 && tokens[2]) {
    return {
      kind: "cat",
      paths: expandBraceToken(tokens[2]),
      lineLimit: 0,
      fromEnd: false,
      countLines: true,
      ignoreMissing
    };
  }
  if (tokens[0] === "ls" && pipeline.length === 1) {
    const dirs = tokens.slice(1).filter((token) => !token.startsWith("-")).flatMap(expandBraceToken);
    const longFormat = tokens.some((token) => token.startsWith("-") && token.includes("l"));
    return { kind: "ls", dirs: dirs.length > 0 ? dirs : ["/"], longFormat };
  }
  if (tokens[0] === "find") {
    if (pipeline.length > 3)
      return null;
    const dir = tokens[1];
    if (!dir)
      return null;
    const patterns = parseFindNamePatterns(tokens);
    if (!patterns)
      return null;
    const countOnly = pipeline.length === 2 && /^wc\s+-l\s*$/.test(pipeline[1].trim());
    if (countOnly) {
      if (patterns.length !== 1)
        return null;
      return { kind: "find", dir, pattern: patterns[0], countOnly };
    }
    if (pipeline.length >= 2) {
      const xargsTokens = tokenizeShellWords(pipeline[1].trim());
      if (!xargsTokens || xargsTokens[0] !== "xargs")
        return null;
      const xargsArgs = xargsTokens.slice(1);
      while (xargsArgs[0] && xargsArgs[0].startsWith("-")) {
        if (xargsArgs[0] === "-r") {
          xargsArgs.shift();
          continue;
        }
        return null;
      }
      const grepCmd = xargsArgs.join(" ");
      const grepParams2 = parseBashGrep(grepCmd);
      if (!grepParams2)
        return null;
      let lineLimit = 0;
      if (pipeline.length === 3) {
        const headStage = pipeline[2].trim();
        if (!isValidPipelineHeadTailStage(headStage))
          return null;
        const headTail = parseHeadTailStage(headStage);
        if (!headTail || headTail.fromEnd)
          return null;
        lineLimit = headTail.lineLimit;
      }
      return { kind: "find_grep", dir, patterns, params: grepParams2, lineLimit };
    }
    if (patterns.length !== 1)
      return null;
    return { kind: "find", dir, pattern: patterns[0], countOnly };
  }
  const grepParams = parseBashGrep(clean);
  if (grepParams) {
    let lineLimit = 0;
    if (pipeline.length > 1) {
      if (pipeline.length !== 2)
        return null;
      const headStage = pipeline[1].trim();
      if (!isValidPipelineHeadTailStage(headStage))
        return null;
      const headTail = parseHeadTailStage(headStage);
      if (!headTail || headTail.fromEnd)
        return null;
      lineLimit = headTail.lineLimit;
    }
    return { kind: "grep", params: grepParams, lineLimit };
  }
  return null;
}
function parseCompiledBashCommand(cmd) {
  if (cmd.includes("||"))
    return null;
  const segments = splitTopLevel(cmd, ["&&", ";", "\n"]);
  if (!segments || segments.length === 0)
    return null;
  const parsed = segments.map(parseCompiledSegment);
  if (parsed.some((segment) => segment === null))
    return null;
  return parsed;
}
function applyLineWindow(content, lineLimit, fromEnd) {
  if (lineLimit <= 0)
    return content;
  const lines = content.split("\n");
  return (fromEnd ? lines.slice(-lineLimit) : lines.slice(0, lineLimit)).join("\n");
}
function countLines(content) {
  return content === "" ? 0 : content.split("\n").length;
}
function renderDirectoryListing(dir, rows, longFormat) {
  const entries = /* @__PURE__ */ new Map();
  const prefix = dir === "/" ? "/" : `${dir}/`;
  for (const row of rows) {
    const path2 = row["path"];
    if (!path2.startsWith(prefix) && dir !== "/")
      continue;
    const rest = dir === "/" ? path2.slice(1) : path2.slice(prefix.length);
    const slash = rest.indexOf("/");
    const name = slash === -1 ? rest : rest.slice(0, slash);
    if (!name)
      continue;
    const existing = entries.get(name);
    if (slash !== -1) {
      if (!existing)
        entries.set(name, { isDir: true, size: 0 });
    } else {
      entries.set(name, { isDir: false, size: Number(row["size_bytes"] ?? 0) });
    }
  }
  if (entries.size === 0)
    return `ls: cannot access '${dir}': No such file or directory`;
  const lines = [];
  for (const [name, info] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (longFormat) {
      const type = info.isDir ? "drwxr-xr-x" : "-rw-r--r--";
      const size = String(info.isDir ? 0 : info.size).padStart(6);
      lines.push(`${type} 1 user user ${size} ${name}${info.isDir ? "/" : ""}`);
    } else {
      lines.push(name + (info.isDir ? "/" : ""));
    }
  }
  return lines.join("\n");
}
async function executeCompiledBashCommand(api, memoryTable, sessionsTable, cmd, deps = {}) {
  const { readVirtualPathContentsFn = readVirtualPathContents, listVirtualPathRowsForDirsFn = listVirtualPathRowsForDirs, findVirtualPathsFn = findVirtualPaths, handleGrepDirectFn = handleGrepDirect } = deps;
  const plan = parseCompiledBashCommand(cmd);
  if (!plan)
    return null;
  const readPaths = [...new Set(plan.flatMap((segment) => segment.kind === "cat" ? segment.paths : []))];
  const listDirs = [...new Set(plan.flatMap((segment) => segment.kind === "ls" ? segment.dirs.map((dir) => dir.replace(/\/+$/, "") || "/") : []))];
  const contentMap = readPaths.length > 0 ? await readVirtualPathContentsFn(api, memoryTable, sessionsTable, readPaths) : /* @__PURE__ */ new Map();
  const dirRowsMap = listDirs.length > 0 ? await listVirtualPathRowsForDirsFn(api, memoryTable, sessionsTable, listDirs) : /* @__PURE__ */ new Map();
  const outputs = [];
  for (const segment of plan) {
    if (segment.kind === "echo") {
      outputs.push(segment.text);
      continue;
    }
    if (segment.kind === "cat") {
      const contents = [];
      for (const path2 of segment.paths) {
        const content = contentMap.get(path2) ?? null;
        if (content === null) {
          if (segment.ignoreMissing)
            continue;
          return null;
        }
        contents.push(content);
      }
      const combined = contents.join("");
      if (segment.countLines) {
        outputs.push(`${countLines(combined)} ${segment.paths[0]}`);
      } else {
        outputs.push(applyLineWindow(combined, segment.lineLimit, segment.fromEnd));
      }
      continue;
    }
    if (segment.kind === "ls") {
      for (const dir of segment.dirs) {
        outputs.push(renderDirectoryListing(dir.replace(/\/+$/, "") || "/", dirRowsMap.get(dir.replace(/\/+$/, "") || "/") ?? [], segment.longFormat));
      }
      continue;
    }
    if (segment.kind === "find") {
      const filenamePattern = sqlLike(segment.pattern).replace(/\*/g, "%").replace(/\?/g, "_");
      const paths = await findVirtualPathsFn(api, memoryTable, sessionsTable, segment.dir.replace(/\/+$/, "") || "/", filenamePattern);
      outputs.push(segment.countOnly ? String(paths.length) : paths.join("\n") || "(no matches)");
      continue;
    }
    if (segment.kind === "find_grep") {
      const dir = segment.dir.replace(/\/+$/, "") || "/";
      const candidateBatches = await Promise.all(segment.patterns.map((pattern) => findVirtualPathsFn(api, memoryTable, sessionsTable, dir, sqlLike(pattern).replace(/\*/g, "%").replace(/\?/g, "_"))));
      const candidatePaths = [...new Set(candidateBatches.flat())];
      if (candidatePaths.length === 0) {
        outputs.push("(no matches)");
        continue;
      }
      const candidateContents = await readVirtualPathContentsFn(api, memoryTable, sessionsTable, candidatePaths);
      const matched = refineGrepMatches(candidatePaths.flatMap((path2) => {
        const content = candidateContents.get(path2);
        if (content === null || content === void 0)
          return [];
        return [{ path: path2, content: normalizeContent(path2, content) }];
      }), segment.params);
      const limited = segment.lineLimit > 0 ? matched.slice(0, segment.lineLimit) : matched;
      outputs.push(limited.join("\n") || "(no matches)");
      continue;
    }
    if (segment.kind === "grep") {
      const result = await handleGrepDirectFn(api, memoryTable, sessionsTable, segment.params);
      if (result === null)
        return null;
      if (segment.lineLimit > 0) {
        outputs.push(result.split("\n").slice(0, segment.lineLimit).join("\n"));
      } else {
        outputs.push(result);
      }
      continue;
    }
  }
  return capOutputForClaude(outputs.join("\n"), { kind: "bash" });
}

// dist/src/hooks/query-cache.js
import { mkdirSync as mkdirSync11, readFileSync as readFileSync14, rmSync, writeFileSync as writeFileSync9 } from "node:fs";
import { join as join19 } from "node:path";
import { homedir as homedir10 } from "node:os";
var log5 = (msg) => log("query-cache", msg);
var DEFAULT_CACHE_ROOT = join19(homedir10(), ".deeplake", "query-cache");
var INDEX_CACHE_FILE = "index.md";
function getSessionQueryCacheDir(sessionId, deps = {}) {
  const { cacheRoot = DEFAULT_CACHE_ROOT } = deps;
  return join19(cacheRoot, sessionId);
}
function readCachedIndexContent(sessionId, deps = {}) {
  const { logFn = log5 } = deps;
  try {
    return readFileSync14(join19(getSessionQueryCacheDir(sessionId, deps), INDEX_CACHE_FILE), "utf-8");
  } catch (e) {
    if (e?.code === "ENOENT")
      return null;
    logFn(`read failed for session=${sessionId}: ${e.message}`);
    return null;
  }
}
function writeCachedIndexContent(sessionId, content, deps = {}) {
  const { logFn = log5 } = deps;
  try {
    const dir = getSessionQueryCacheDir(sessionId, deps);
    mkdirSync11(dir, { recursive: true });
    writeFileSync9(join19(dir, INDEX_CACHE_FILE), content, "utf-8");
  } catch (e) {
    logFn(`write failed for session=${sessionId}: ${e.message}`);
  }
}

// dist/src/utils/direct-run.js
import { resolve as resolve5 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
function isDirectRun(metaUrl) {
  const entry = process.argv[1];
  if (!entry)
    return false;
  try {
    return resolve5(fileURLToPath3(metaUrl)) === resolve5(entry);
  } catch {
    return false;
  }
}

// dist/src/hooks/memory-path-utils.js
import { homedir as homedir11 } from "node:os";
import { join as join20 } from "node:path";
var MEMORY_PATH = join20(homedir11(), ".deeplake", "memory");
var TILDE_PATH = "~/.deeplake/memory";
var HOME_VAR_PATH = "$HOME/.deeplake/memory";
var SAFE_BUILTINS = /* @__PURE__ */ new Set([
  "cat",
  "ls",
  "cp",
  "mv",
  "rm",
  "rmdir",
  "mkdir",
  "touch",
  "ln",
  "chmod",
  "stat",
  "readlink",
  "du",
  "tree",
  "file",
  // sed and awk removed: sed supports `-e '1e <cmd>'` (execute shell command)
  // and awk supports `system()` / `|` pipelines — both enable arbitrary code
  // execution through the just-bash fallback.
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "cut",
  "tr",
  "sort",
  "uniq",
  "wc",
  "head",
  "tail",
  "tac",
  "rev",
  "nl",
  "fold",
  "expand",
  "unexpand",
  "paste",
  "join",
  "comm",
  "column",
  "diff",
  "strings",
  "split",
  // xargs removed: it executes its input as a child command (`… | xargs curl`).
  // `find` stays because the VFS serves `find -name`, but isSafe() rejects the
  // command-dispatching `-exec/-execdir/-ok/-okdir` primaries below.
  "find",
  "which",
  "jq",
  "yq",
  "xan",
  "base64",
  "od",
  // tar removed: --to-command=<cmd> executes an arbitrary program per entry.
  // env removed: `env <cmd>` runs an arbitrary program.
  "gzip",
  "gunzip",
  "zcat",
  "md5sum",
  "sha1sum",
  "sha256sum",
  "echo",
  "printf",
  "tee",
  "pwd",
  "cd",
  "basename",
  "dirname",
  "printenv",
  "hostname",
  "whoami",
  // timeout and time removed: both are wrappers that run an arbitrary child
  // command (`timeout 1 curl …`, `time curl …`).
  "date",
  "seq",
  "expr",
  "sleep",
  "true",
  "false",
  "test",
  "alias",
  "unalias",
  "history",
  "help",
  "clear"
  // Shell control keywords removed: as a stage's first token they let a child
  // command ride in as a later token (`if true; then curl …; fi` splits into a
  // `then curl …` stage whose leading `then` would otherwise pass). No VFS
  // handler emulates control flow, so dropping them only sends such commands to
  // the guidance/deny path — they never reach a real shell.
]);
function stripHeredocBodies(cmd) {
  if (!cmd.includes("<<"))
    return cmd;
  const lines = cmd.split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    kept.push(line);
    const heredoc = line.match(/<<-?\s*(['"])([A-Za-z_]\w*)\1/);
    if (!heredoc)
      continue;
    const delimiter = heredoc[2];
    const stripTabs = line.includes("<<-");
    while (i + 1 < lines.length) {
      const body = lines[++i];
      const probe = stripTabs ? body.replace(/^\t+/, "") : body;
      if (probe === delimiter)
        break;
    }
  }
  return kept.join("\n");
}
function isSafe(cmd) {
  const validated = stripHeredocBodies(cmd);
  if (/\$\(|`|<\(|\$'/.test(validated))
    return false;
  const stripped = validated.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  if (/(?:^|\s)-(?:exec|execdir|ok|okdir)\b/.test(stripped))
    return false;
  const stages = stripped.split(/\||;|&&|\|\||\n/);
  for (const stage of stages) {
    const firstToken = stage.trim().split(/\s+/)[0] ?? "";
    if (firstToken && !SAFE_BUILTINS.has(firstToken))
      return false;
  }
  return true;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var MEMORY_BOUNDARY = "(?![A-Za-z0-9._-])";
var MEMORY_PREFIX_RE = new RegExp("(?:" + [MEMORY_PATH, TILDE_PATH, HOME_VAR_PATH].map(escapeRe).join("|") + ")" + MEMORY_BOUNDARY);
function touchesMemory(p) {
  return MEMORY_PREFIX_RE.test(p);
}
function rewritePaths(cmd) {
  const tail = "(?:\\/|" + MEMORY_BOUNDARY + ")";
  return cmd.replace(new RegExp(escapeRe(MEMORY_PATH) + tail, "g"), "/").replace(new RegExp(escapeRe(TILDE_PATH) + tail, "g"), "/").replace(new RegExp('"' + escapeRe(HOME_VAR_PATH) + tail + '"', "g"), '"/"').replace(new RegExp(escapeRe(HOME_VAR_PATH) + tail, "g"), "/");
}

// dist/src/skillify/skillopt-trigger.js
import { spawn as spawn2 } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// dist/src/skillify/state-dir.js
import { homedir as homedir12 } from "node:os";
import { join as join21 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join21(homedir12(), ".deeplake", "state", "skillify");
}

// dist/src/skillify/skill-invocations.js
function pathToSkillRef(s) {
  if (typeof s !== "string")
    return null;
  const m = s.match(/\/skills\/(?:[^/\s"'`]+\/)*([^/\s"'`]+)\/SKILL\.md/);
  return m ? m[1] : null;
}
function splitOrgSkill(skill) {
  if (skill.includes(":"))
    return null;
  if (skill.includes("/") || skill.includes("\\") || skill.includes(".."))
    return null;
  const i = skill.lastIndexOf("--");
  if (i <= 0 || i + 2 >= skill.length)
    return null;
  return { name: skill.slice(0, i), author: skill.slice(i + 2) };
}

// dist/src/skillify/manifest.js
import { existsSync as existsSync10, lstatSync, mkdirSync as mkdirSync12, readFileSync as readFileSync15, renameSync as renameSync8, unlinkSync as unlinkSync4, writeFileSync as writeFileSync10 } from "node:fs";
import { dirname as dirname12, join as join23 } from "node:path";

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync9, renameSync as renameSync7 } from "node:fs";
import { dirname as dirname11, join as join22 } from "node:path";
var dlog = (msg) => log("skillify-migrate", msg);
var attempted = false;
function migrateLegacyStateDir() {
  if (process.env.HIVEMIND_STATE_DIR?.trim())
    return;
  if (attempted)
    return;
  attempted = true;
  const current = getStateDir();
  const legacy = join22(dirname11(current), "skilify");
  if (!existsSync9(legacy))
    return;
  if (existsSync9(current))
    return;
  try {
    renameSync7(legacy, current);
    dlog(`migrated ${legacy} -> ${current}`);
  } catch (err) {
    const code = err.code;
    if (code === "EXDEV" || code === "EPERM" || code === "ENOENT" || code === "EEXIST" || code === "ENOTEMPTY") {
      dlog(`migration skipped (${code}); legacy dir left as-is or another process handled it`);
      return;
    }
    throw err;
  }
}

// dist/src/skillify/manifest.js
function emptyManifest() {
  return { version: 1, entries: [] };
}
function manifestPath() {
  return join23(getStateDir(), "pulled.json");
}
function loadManifest(path2 = manifestPath()) {
  migrateLegacyStateDir();
  if (!existsSync10(path2))
    return emptyManifest();
  let raw;
  try {
    raw = readFileSync15(path2, "utf-8");
  } catch {
    return emptyManifest();
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object")
      return emptyManifest();
    if (parsed.version !== 1 || !Array.isArray(parsed.entries))
      return emptyManifest();
    const entries = [];
    for (const e of parsed.entries) {
      if (!e || typeof e !== "object")
        continue;
      if (typeof e.dirName !== "string" || !e.dirName)
        continue;
      if (e.dirName.includes("/") || e.dirName.includes("\\") || e.dirName.includes(".."))
        continue;
      if (typeof e.name !== "string" || !e.name)
        continue;
      if (typeof e.author !== "string")
        continue;
      if (typeof e.installRoot !== "string" || !e.installRoot)
        continue;
      if (e.install !== "global" && e.install !== "project")
        continue;
      const symlinks = Array.isArray(e.symlinks) ? e.symlinks.filter((p) => typeof p === "string" && p.length > 0 && (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) && // absolute (POSIX or Windows)
      !p.includes("..")) : [];
      entries.push({
        dirName: e.dirName,
        name: e.name,
        // Optional — preserved for cross-run cap-collision detection. Absent on
        // legacy entries; only carry a valid string through.
        ...typeof e.rawName === "string" && e.rawName ? { rawName: e.rawName } : {},
        author: e.author,
        projectKey: typeof e.projectKey === "string" ? e.projectKey : "",
        remoteVersion: typeof e.remoteVersion === "number" ? e.remoteVersion : 1,
        install: e.install,
        installRoot: e.installRoot,
        pulledAt: typeof e.pulledAt === "string" ? e.pulledAt : (/* @__PURE__ */ new Date()).toISOString(),
        symlinks
      });
    }
    return { version: 1, entries };
  } catch {
    return emptyManifest();
  }
}

// dist/src/skillify/skillopt-env.js
var SKILLOPT_ENV = {
  /** User-set kill switch: "1" disables the whole trigger. */
  DISABLED: "HIVEMIND_SKILLOPT_DISABLED",
  /** Recursion guard the trigger sets on the spawned worker so the worker can't re-arm. */
  WORKER: "HIVEMIND_SKILLOPT_WORKER",
  /** Worker inputs, handed trigger → worker via the child env. */
  SESSION: "HIVEMIND_SKILLOPT_SESSION",
  SKILL: "HIVEMIND_SKILLOPT_SKILL",
  REACTION: "HIVEMIND_SKILLOPT_REACTION",
  TOOL_USE_ID: "HIVEMIND_SKILLOPT_TOOL_USE_ID",
  /** Which agent's CLI runs the judge/proposer (claude_code/codex/hermes/cursor/pi). */
  AGENT: "HIVEMIND_SKILLOPT_AGENT",
  /** K-message judgment-window size override. */
  JUDGE_WINDOW: "HIVEMIND_SKILLOPT_JUDGE_WINDOW"
};

// dist/src/skillify/skillopt-trigger.js
var DEFAULT_JUDGE_WINDOW = 3;
function judgeWindow(env = process.env) {
  const n = Number(env[SKILLOPT_ENV.JUDGE_WINDOW]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_JUDGE_WINDOW;
}
function defaultIsOrgSkill(skillRef) {
  try {
    return loadManifest().entries.some((e) => e.dirName === skillRef);
  } catch {
    return false;
  }
}
function pendingFile(sessionId) {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200);
  return path.join(getStateDir(), "skillopt", "pending", `${safe}.json`);
}
var fileStore = {
  load(sessionId) {
    try {
      return JSON.parse(fs.readFileSync(pendingFile(sessionId), "utf8"));
    } catch {
      return null;
    }
  },
  save(sessionId, p) {
    try {
      const f = pendingFile(sessionId);
      if (p === null) {
        try {
          fs.unlinkSync(f);
        } catch {
        }
        return;
      }
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(p));
      fs.renameSync(tmp, f);
    } catch {
    }
  }
};
function markSkillPending(sessionId, skillRef, toolUseId, deps = {}) {
  if (!sessionId || !skillRef)
    return false;
  if (!splitOrgSkill(skillRef))
    return false;
  if (!(deps.isOrgSkill ?? defaultIsOrgSkill)(skillRef))
    return false;
  (deps.store ?? fileStore).save(sessionId, { skill: skillRef, budget: judgeWindow(deps.env ?? process.env), toolUseId });
  return true;
}

// dist/src/hooks/shared/skillopt-hook.js
function skillRefFromSkillFileRead(toolName, toolInput) {
  if (/^read$/i.test(toolName))
    return pathToSkillRef(toolInput?.path);
  return pathToSkillRef(toolInput?.command);
}
function armSkillOptOnSkillUse(sessionId, toolName, toolInput, toolUseId) {
  try {
    if (process.env[SKILLOPT_ENV.DISABLED] === "1")
      return;
    let ref = null;
    if (toolName === "Skill") {
      const s = toolInput?.skill;
      ref = typeof s === "string" ? s : null;
    } else {
      ref = skillRefFromSkillFileRead(toolName, toolInput);
    }
    if (ref)
      markSkillPending(sessionId, ref, toolUseId);
  } catch {
  }
}

// dist/src/hooks/codex/pre-tool-use.js
var __bundleDir = dirname13(fileURLToPath5(import.meta.url));
var log6 = (msg) => log("codex-pre", msg);
function buildUnsupportedGuidance() {
  return "This command is not supported for ~/.deeplake/memory/ operations. Only bash builtins are available: cat, ls, grep, echo, jq, head, tail, wc, sort, find, etc. Do NOT use python, python3, node, curl, or other interpreters. Rewrite your command using only bash tools and retry.";
}
function buildIndexContent(rows) {
  const lines = ["# Memory Index", "", `${rows.length} sessions:`, ""];
  for (const row of rows) {
    const path2 = row["path"];
    const project = row["project"] || "";
    const description = (row["description"] || "").slice(0, 120);
    const date = (row["creation_date"] || "").slice(0, 10);
    lines.push(`- [${path2}](${path2}) ${date} ${project ? `[${project}]` : ""} ${description}`);
  }
  return lines.join("\n");
}
async function processCodexPreToolUse(input, deps = {}) {
  const { config: baseConfig = loadConfig(), createApi = (table, activeConfig) => new DeeplakeApi(activeConfig.token, activeConfig.apiUrl, activeConfig.orgId, activeConfig.workspaceId, table), executeCompiledBashCommandFn = executeCompiledBashCommand, readVirtualPathContentsFn = readVirtualPathContents, readVirtualPathContentFn = readVirtualPathContent, listVirtualPathRowsFn = listVirtualPathRows, findVirtualPathsFn = findVirtualPaths, handleGrepDirectFn = handleGrepDirect, readCachedIndexContentFn = readCachedIndexContent, writeCachedIndexContentFn = writeCachedIndexContent, runVfsShellFn = (command) => {
    const shellBundle = join24(__bundleDir, "shell", "deeplake-shell.js");
    const proc = spawnSync("node", [shellBundle, "-c", command], {
      encoding: "utf-8",
      timeout: 1e4
    });
    return { status: proc.status, stdout: proc.stdout ?? "" };
  }, tryGraphReadFn = tryGraphRead, logFn = log6 } = deps;
  const config = baseConfig ? resolveDirConfig(baseConfig, input.cwd ?? process.cwd()).config : baseConfig;
  const cmd = input.tool_input?.command ?? "";
  logFn(`hook fired: cmd=${cmd}`);
  if (!touchesMemory(cmd))
    return { action: "pass" };
  const rewritten = rewritePaths(cmd);
  const graphBody = tryGraphReadFn(rewritten, input.cwd ?? process.cwd());
  if (graphBody !== null) {
    logFn(`graph vfs intercept: ${rewritten}`);
    return { action: "block", output: graphBody, rewrittenCommand: rewritten };
  }
  if (!isSafe(rewritten)) {
    logFn(`unsupported command, blocking with guidance: ${rewritten}`);
    return {
      action: "block",
      output: buildUnsupportedGuidance(),
      rewrittenCommand: rewritten
    };
  }
  if (config) {
    const table = process.env["HIVEMIND_TABLE"] ?? "memory";
    const sessionsTable = process.env["HIVEMIND_SESSIONS_TABLE"] ?? "sessions";
    const api = createApi(table, config);
    const readVirtualPathContentsWithCache = async (cachePaths) => {
      const uniquePaths = [...new Set(cachePaths)];
      const result = new Map(uniquePaths.map((path2) => [path2, null]));
      const cachedIndex = uniquePaths.includes("/index.md") ? readCachedIndexContentFn(input.session_id) : null;
      const remainingPaths = cachedIndex === null ? uniquePaths : uniquePaths.filter((path2) => path2 !== "/index.md");
      if (cachedIndex !== null) {
        result.set("/index.md", cachedIndex);
      }
      if (remainingPaths.length > 0) {
        const fetched = await readVirtualPathContentsFn(api, table, sessionsTable, remainingPaths);
        for (const [path2, content] of fetched)
          result.set(path2, content);
      }
      const fetchedIndex = result.get("/index.md");
      if (typeof fetchedIndex === "string") {
        writeCachedIndexContentFn(input.session_id, fetchedIndex);
      }
      return result;
    };
    try {
      const lsDocs = rewritten.match(/^ls\s+(?:-[a-zA-Z]+\s+)*\/docs\/?\s*$/);
      if (lsDocs) {
        logFn("docs vfs intercept: ls /docs");
        const r = await handleDocsVfs("", (sql) => api.query(sql), process.env["HIVEMIND_DOCS_TABLE"] ?? config.docsTableName, { project: deriveProjectKey(input.cwd ?? process.cwd()).key });
        const body = r.kind === "ok" ? r.body : "(docs unavailable)";
        return { action: "block", output: body, rewrittenCommand: rewritten };
      }
      const compiled = await executeCompiledBashCommandFn(api, table, sessionsTable, rewritten, {
        readVirtualPathContentsFn: async (_api, _memoryTable, _sessionsTable, cachePaths) => readVirtualPathContentsWithCache(cachePaths)
      });
      if (compiled !== null) {
        return { action: "block", output: compiled, rewrittenCommand: rewritten };
      }
      let virtualPath = null;
      let lineLimit = 0;
      let fromEnd = false;
      const catCmd = rewritten.replace(/\s+2>\S+/g, "").trim();
      const catPipeHead = catCmd.match(/^cat\s+(\S+?)\s*(?:\|[^|]*)*\|\s*head\s+(?:-n?\s*)?(-?\d+)\s*$/);
      if (catPipeHead) {
        virtualPath = catPipeHead[1];
        lineLimit = Math.abs(parseInt(catPipeHead[2], 10));
      }
      if (!virtualPath) {
        const catMatch = catCmd.match(/^cat\s+(\S+)\s*$/);
        if (catMatch)
          virtualPath = catMatch[1];
      }
      if (!virtualPath) {
        const headMatch = rewritten.match(/^head\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/) ?? rewritten.match(/^head\s+(\S+)\s*$/);
        if (headMatch) {
          if (headMatch[2]) {
            virtualPath = headMatch[2];
            lineLimit = Math.abs(parseInt(headMatch[1], 10));
          } else {
            virtualPath = headMatch[1];
            lineLimit = 10;
          }
        }
      }
      if (!virtualPath) {
        const tailMatch = rewritten.match(/^tail\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/) ?? rewritten.match(/^tail\s+(\S+)\s*$/);
        if (tailMatch) {
          fromEnd = true;
          if (tailMatch[2]) {
            virtualPath = tailMatch[2];
            lineLimit = Math.abs(parseInt(tailMatch[1], 10));
          } else {
            virtualPath = tailMatch[1];
            lineLimit = 10;
          }
        }
      }
      if (!virtualPath) {
        const wcMatch = rewritten.match(/^wc\s+-l\s+(\S+)\s*$/);
        if (wcMatch) {
          virtualPath = wcMatch[1];
          lineLimit = -1;
        }
      }
      if (virtualPath && (virtualPath === "/docs" || virtualPath.startsWith("/docs/"))) {
        logFn(`docs vfs intercept: ${virtualPath}`);
        const docsTable = process.env["HIVEMIND_DOCS_TABLE"] ?? config.docsTableName;
        const sub = virtualPath === "/docs" ? "" : virtualPath.slice("/docs/".length);
        const r = await handleDocsVfs(sub, (sql) => api.query(sql), docsTable, { embedQuery: makeQueryEmbedder(), project: deriveProjectKey(input.cwd ?? process.cwd()).key });
        const body = r.kind === "ok" ? r.body : `${virtualPath}: No such file or directory`;
        return { action: "block", output: body, rewrittenCommand: rewritten };
      }
      if (virtualPath && !virtualPath.endsWith("/")) {
        logFn(`direct read: ${virtualPath}`);
        let content = virtualPath === "/index.md" ? readCachedIndexContentFn(input.session_id) : null;
        if (content === null) {
          content = await readVirtualPathContentFn(api, table, sessionsTable, virtualPath);
        }
        if (content === null && virtualPath === "/index.md") {
          const idxRows = await api.query(`SELECT path, project, description, creation_date FROM "${table}" WHERE path LIKE '/summaries/%' ORDER BY creation_date DESC`);
          content = buildIndexContent(idxRows);
        }
        if (content !== null) {
          if (virtualPath === "/index.md") {
            writeCachedIndexContentFn(input.session_id, content);
          }
          if (lineLimit === -1) {
            return { action: "block", output: `${content.split("\n").length} ${virtualPath}`, rewrittenCommand: rewritten };
          }
          if (lineLimit > 0) {
            const lines = content.split("\n");
            content = fromEnd ? lines.slice(-lineLimit).join("\n") : lines.slice(0, lineLimit).join("\n");
          }
          return { action: "block", output: content, rewrittenCommand: rewritten };
        }
        logFn(`virtual path not found: ${virtualPath}`);
        return { action: "block", output: `${virtualPath}: No such file or directory`, rewrittenCommand: rewritten };
      }
      const lsMatch = rewritten.match(/^ls\s+(?:-[a-zA-Z]+\s+)*(\S+)?\s*$/);
      if (lsMatch) {
        const dir = (lsMatch[1] ?? "/").replace(/\/+$/, "") || "/";
        const isLong = /\s-[a-zA-Z]*l/.test(rewritten);
        logFn(`direct ls: ${dir}`);
        const rows = await listVirtualPathRowsFn(api, table, sessionsTable, dir);
        const entries = /* @__PURE__ */ new Map();
        const prefix = dir === "/" ? "/" : `${dir}/`;
        for (const row of rows) {
          const path2 = row["path"];
          if (!path2.startsWith(prefix) && dir !== "/")
            continue;
          const rest = dir === "/" ? path2.slice(1) : path2.slice(prefix.length);
          const slash = rest.indexOf("/");
          const name = slash === -1 ? rest : rest.slice(0, slash);
          if (!name)
            continue;
          const existing = entries.get(name);
          if (slash !== -1) {
            if (!existing)
              entries.set(name, { isDir: true, size: 0 });
          } else {
            entries.set(name, { isDir: false, size: row["size_bytes"] ?? 0 });
          }
        }
        if (entries.size > 0) {
          const lines = [];
          for (const [name, info] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
            if (isLong) {
              const type = info.isDir ? "drwxr-xr-x" : "-rw-r--r--";
              const size = info.isDir ? "0" : String(info.size).padStart(6);
              lines.push(`${type} 1 user user ${size} ${name}${info.isDir ? "/" : ""}`);
            } else {
              lines.push(name + (info.isDir ? "/" : ""));
            }
          }
          return { action: "block", output: lines.join("\n"), rewrittenCommand: rewritten };
        }
        return {
          action: "block",
          output: `ls: cannot access '${dir}': No such file or directory`,
          rewrittenCommand: rewritten
        };
      }
      const findMatch = rewritten.match(/^find\s+(\S+)\s+-name\s+(?:'([^']+)'|"([^"]+)"|([^\s|]+))\s*(?:\|\s*wc\s+-l)?\s*$/);
      if (findMatch) {
        const dir = findMatch[1].replace(/\/+$/, "") || "/";
        const rawPattern = findMatch[2] ?? findMatch[3] ?? findMatch[4] ?? "";
        const namePattern = sqlLike(rawPattern).replace(/\*/g, "%").replace(/\?/g, "_");
        logFn(`direct find: ${dir} -name '${rawPattern}'`);
        const paths = await findVirtualPathsFn(api, table, sessionsTable, dir, namePattern);
        let result = paths.join("\n") || "";
        if (/\|\s*wc\s+-l\s*$/.test(rewritten))
          result = String(paths.length);
        return {
          action: "block",
          output: result || "(no matches)",
          rewrittenCommand: rewritten
        };
      }
      const grepParams = parseBashGrep(rewritten);
      if (grepParams) {
        logFn(`direct grep: pattern=${grepParams.pattern} path=${grepParams.targetPath}`);
        const result = await handleGrepDirectFn(api, table, sessionsTable, grepParams);
        if (result !== null) {
          return { action: "block", output: result, rewrittenCommand: rewritten };
        }
      }
    } catch (e) {
      logFn(`direct query failed: ${e.message}`);
    }
  }
  const isWriteRedirect = /^\s*(echo|printf|tee)\b/.test(rewritten) && /(^|[^0-9&>])>>?/.test(rewritten);
  logFn(`unroutable memory command, falling back to VFS shell: ${rewritten}`);
  try {
    const proc = runVfsShellFn(rewritten);
    if (proc.status === 0 || proc.stdout && proc.stdout.trim()) {
      const output = (proc.stdout?.trim() ?? "") || "(done)";
      if (isWriteRedirect) {
        const replacementCommand = `printf '%s\\n' '${output.replace(/'/g, `'\\''`)}'`;
        return { action: "allow", output, replacementCommand, rewrittenCommand: rewritten };
      }
      return { action: "block", output, rewrittenCommand: rewritten };
    }
    return { action: "block", output: buildUnsupportedGuidance(), rewrittenCommand: rewritten };
  } catch {
    return { action: "block", output: buildUnsupportedGuidance(), rewrittenCommand: rewritten };
  }
}
async function main() {
  const input = await readStdin();
  try {
    armSkillOptOnSkillUse(input.session_id, input.tool_name, input.tool_input, input.tool_use_id);
  } catch {
  }
  const decision = await processCodexPreToolUse(input);
  if (decision.action === "pass")
    return;
  if (decision.action === "allow") {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { command: decision.replacementCommand ?? "true" }
      }
    }));
    process.exit(0);
  }
  if (decision.output)
    process.stderr.write(decision.output);
  process.exit(2);
}
if (isDirectRun(import.meta.url)) {
  main().catch((e) => {
    log6(`fatal: ${e.message}`);
    process.exit(0);
  });
}
export {
  buildUnsupportedGuidance,
  isSafe,
  processCodexPreToolUse,
  rewritePaths,
  touchesMemory
};
