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

// dist/src/skillify/skillopt-worker.js
import path2 from "node:path";
import { accessSync, constants as fsConstants } from "node:fs";

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
var LOG = join(homedir(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function log(tag, msg) {
  if (!isDebug())
    return;
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${(/* @__PURE__ */ new Date()).toISOString()} [${tag}] ${msg}
`);
  } catch {
  }
}

// dist/src/dir-config.js
import { readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname2, join as join3, resolve } from "node:path";

// dist/src/config.js
import { readFileSync, existsSync } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2, userInfo } from "node:os";
function loadConfig() {
  const home = homedir2();
  const credPath = join2(home, ".deeplake", "credentials.json");
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
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join2(home, ".deeplake", "memory")
  };
}

// dist/src/dir-config.js
var DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"];
function findDirConfig(startDir, stopAt) {
  let dir = resolve(startDir);
  const boundary = stopAt ? resolve(stopAt) : null;
  for (; ; ) {
    for (const name of DIR_CONFIG_FILENAMES) {
      const candidate = join3(dir, name);
      try {
        const raw = parseDirConfig(readFileSync2(candidate, "utf-8"));
        if (raw)
          return { path: candidate, raw };
      } catch {
      }
    }
    if (boundary && dir === boundary)
      break;
    const parent = dirname2(dir);
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
function loadRoutedConfig(cwd = process.cwd()) {
  const base = loadConfig();
  if (!base)
    return null;
  return resolveDirConfig(base, cwd).config;
}

// dist/src/deeplake-api.js
import { randomUUID } from "node:crypto";

// dist/src/utils/sql.js
function sqlStr(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\0/g, "").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
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
function isMissingTableError(message) {
  if (!message)
    return false;
  if (/permission denied|must be owner/i.test(message))
    return false;
  if (/\bcolumn\b/i.test(message))
    return false;
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}
function isMissingColumnError(message) {
  if (!message)
    return false;
  if (/permission denied|must be owner/i.test(message))
    return false;
  return /column ["']?[A-Za-z_][A-Za-z0-9_]*["']? .*does not exist/i.test(message) || /unknown column/i.test(message) || /no such column/i.test(message);
}

// dist/src/notifications/queue.js
import { readFileSync as readFileSync3, writeFileSync, mkdirSync as mkdirSync2, openSync, closeSync, unlinkSync, statSync } from "node:fs";
import { join as join4, resolve as resolve3 } from "node:path";
import { homedir as homedir3 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve as resolve2, relative, isAbsolute } from "node:path";
function isPathInsideHome(path3, home) {
  const r = resolve2(path3);
  const h = resolve2(home);
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
function _isQueuePathInsideHome(path3, home) {
  return isPathInsideHome(path3, home);
}
function writeQueue(q) {
  const path3 = queuePath();
  const home = resolve3(homedir3());
  if (!_isQueuePathInsideHome(path3, home)) {
    throw new Error(`notifications-queue write blocked: ${path3} is outside ${home}`);
  }
  mkdirSync2(join4(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path3}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameAtomic(tmp, path3);
}
async function withQueueLock(fn) {
  const path3 = lockPath();
  mkdirSync2(join4(homedir3(), ".deeplake"), { recursive: true, mode: 448 });
  let fd = null;
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      fd = openSync(path3, "wx", 384);
      break;
    } catch (e) {
      const code = e.code;
      if (code !== "EEXIST")
        throw e;
      try {
        const age = Date.now() - statSync(path3).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync(path3);
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
      unlinkSync(path3);
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
  return new Promise((resolve5, reject) => {
    const t = setTimeout(resolve5, ms);
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
    await new Promise((resolve5) => this.waiting.push(resolve5));
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
  async updateColumns(path3, columns) {
    const setClauses = Object.entries(columns).map(([col, val]) => typeof val === "number" ? `${col} = ${val}` : `${col} = '${sqlStr(String(val))}'`).join(", ");
    await this.query(`UPDATE "${this.tableName}" SET ${setClauses} WHERE path = '${sqlStr(path3)}'`);
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

// dist/src/skillify/state-dir.js
import { homedir as homedir5 } from "node:os";
import { join as join7 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join7(homedir5(), ".deeplake", "state", "skillify");
}

// dist/src/skillify/agent-model.js
import { spawn as nodeSpawn } from "node:child_process";

// dist/src/skillify/gate-runner.js
import { existsSync as existsSync3 } from "node:fs";
import { createRequire } from "node:module";
import { homedir as homedir6 } from "node:os";
import { join as join8 } from "node:path";
var requireForCp = createRequire(import.meta.url);
var { execFileSync: runChildProcess } = requireForCp("node:child_process");
var inheritedEnv = process;
function firstExistingPath(candidates) {
  for (const c of candidates) {
    if (existsSync3(c))
      return c;
  }
  return null;
}
function findAgentBin(agent) {
  const home = homedir6();
  switch (agent) {
    // /usr/bin/<name> is included in every candidate list — that's the
    // common Linux package-manager install path (apt, dnf, pacman). Old
    // code used `which` which always checked it; the static-scan fix
    // dropped `which`, so /usr/bin needs to be explicit. CodeRabbit on
    // #170 caught the gap.
    case "claude_code":
      return firstExistingPath([
        join8(home, ".claude", "local", "claude"),
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        join8(home, ".npm-global", "bin", "claude"),
        join8(home, ".local", "bin", "claude"),
        "/opt/homebrew/bin/claude"
      ]) ?? join8(home, ".claude", "local", "claude");
    case "codex":
      return firstExistingPath([
        "/usr/local/bin/codex",
        "/usr/bin/codex",
        join8(home, ".npm-global", "bin", "codex"),
        join8(home, ".local", "bin", "codex"),
        "/opt/homebrew/bin/codex"
      ]) ?? "/usr/local/bin/codex";
    case "cursor":
      return firstExistingPath([
        "/usr/local/bin/cursor-agent",
        "/usr/bin/cursor-agent",
        join8(home, ".npm-global", "bin", "cursor-agent"),
        join8(home, ".local", "bin", "cursor-agent"),
        "/opt/homebrew/bin/cursor-agent"
      ]) ?? "/usr/local/bin/cursor-agent";
    case "hermes":
      return firstExistingPath([
        join8(home, ".local", "bin", "hermes"),
        "/usr/local/bin/hermes",
        "/usr/bin/hermes",
        join8(home, ".npm-global", "bin", "hermes"),
        "/opt/homebrew/bin/hermes"
      ]) ?? join8(home, ".local", "bin", "hermes");
    case "pi":
      return firstExistingPath([
        join8(home, ".local", "bin", "pi"),
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        join8(home, ".npm-global", "bin", "pi"),
        "/opt/homebrew/bin/pi"
      ]) ?? join8(home, ".local", "bin", "pi");
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
var SKILLOPT_ENV_PREFIX = "HIVEMIND_SKILLOPT_";
function modelEnvNames(agent, role) {
  const A = agent.toUpperCase();
  return [`${SKILLOPT_ENV_PREFIX}${A}_${role.toUpperCase()}_MODEL`, `${SKILLOPT_ENV_PREFIX}${A}_MODEL`];
}
function providerEnvName(agent) {
  return `${SKILLOPT_ENV_PREFIX}${agent.toUpperCase()}_PROVIDER`;
}

// dist/src/skillify/agent-model.js
var fold = (system, user) => `${system}

${user}`;
var DISPATCH = {
  claude_code: {
    // --tools "" = empty allow-list = NO tools (authoritative over built-ins AND MCP);
    // --strict-mcp-config ignores user MCP entirely. The verified-safe no-tools path.
    buildArgs: (model, _p, system, user) => [
      "-p",
      user,
      "--model",
      model ?? "sonnet",
      "--no-session-persistence",
      "--output-format",
      "json",
      "--system-prompt",
      system,
      "--tools",
      "",
      "--strict-mcp-config"
    ],
    parse: (out) => {
      try {
        return String(JSON.parse(out).result ?? "");
      } catch {
        return out;
      }
    },
    model: (role) => role === "judge" ? "haiku" : "sonnet"
  },
  codex: {
    // `-s read-only`: model-generated shell commands can't write/exec — the safest
    // codex-exec mode for untrusted prompt text. --skip-git-repo-check: the detached
    // worker isn't in a trusted git dir. No system-prompt flag → fold into the prompt.
    buildArgs: (model, _p, system, user) => [
      "exec",
      "--skip-git-repo-check",
      "-s",
      "read-only",
      ...model ? ["-m", model] : [],
      fold(system, user)
    ],
    parse: (out) => out,
    model: () => void 0
    // codex uses its configured default model
  },
  hermes: {
    // -z oneshot via the user's provider; --ignore-user-config drops user MCP/skills,
    // so an explicit -m/--provider is required (matches the wiki worker's defaults).
    // NOTE: the openrouter-style default model below is only valid for openrouter.
    // A user on another provider MUST set HIVEMIND_SKILLOPT_HERMES_PROVIDER + _MODEL
    // to a valid id — e.g. AWS Bedrock needs an INFERENCE-PROFILE id like
    // `us.anthropic.claude-haiku-4-5-20251001-v1:0` (a bare model id, or a legacy
    // one, is rejected by Bedrock and hermes swallows the error → empty output).
    buildArgs: (model, provider, system, user) => [
      "-z",
      fold(system, user),
      "--provider",
      provider ?? "openrouter",
      "-m",
      model ?? "anthropic/claude-haiku-4-5",
      "--yolo",
      "--ignore-user-config"
    ],
    parse: (out) => out,
    model: () => void 0,
    // falls back to the buildArgs default
    provider: "openrouter"
  },
  cursor: {
    buildArgs: (model, _p, system, user) => [
      "--print",
      "--model",
      model ?? "auto",
      "--force",
      "--output-format",
      "text",
      fold(system, user)
    ],
    parse: (out) => out,
    model: () => void 0
  },
  pi: {
    // The google/gemini default needs a Google API key. A user on another provider
    // MUST set HIVEMIND_SKILLOPT_PI_PROVIDER + _MODEL — e.g. AWS Bedrock uses provider
    // `amazon-bedrock` and an inference-profile model id like
    // `us.anthropic.claude-haiku-4-5-20251001-v1:0`. With a wrong default pi exits
    // non-zero ("No API key found") → surfaced loudly via the exit-code guard, not silent.
    buildArgs: (model, provider, system, user) => [
      "--print",
      "--provider",
      provider ?? "google",
      "--model",
      model ?? "gemini-2.5-flash",
      fold(system, user)
    ],
    parse: (out) => out,
    model: () => void 0
  }
};
function envModel(agent, role, env) {
  const [specific, fallback] = modelEnvNames(agent, role);
  return env[specific] ?? env[fallback];
}
function envProvider(agent, env) {
  return env[providerEnvName(agent)];
}
function agentModel(opts) {
  const env = opts.env ?? process.env;
  const d = DISPATCH[opts.agent];
  const modelOverride = opts.model ?? envModel(opts.agent, opts.role, env);
  const providerOverride = opts.provider ?? envProvider(opts.agent, env);
  const model = modelOverride ?? d.model(opts.role);
  const provider = providerOverride ?? d.provider;
  const timeoutMs = opts.timeoutMs ?? 12e4;
  const spawnFn = opts.spawnImpl ?? nodeSpawn;
  const bin = opts.bin ?? findAgentBin(opts.agent);
  return (system, user) => new Promise((resolve5, reject) => {
    if (providerOverride && !modelOverride && (opts.agent === "hermes" || opts.agent === "pi")) {
      return reject(new Error(`${opts.agent}: provider overridden to '${provider}' without a model \u2014 set ${modelEnvNames(opts.agent, opts.role)[1]} to a valid id for that provider`));
    }
    const args = d.buildArgs(model, provider, system, user);
    const child = spawnFn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...env, HIVEMIND_CAPTURE: "false", HIVEMIND_WIKI_WORKER: "1" },
      windowsHide: true
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${opts.agent} timed out`));
    }, timeoutMs);
    child.stdout?.on("data", (x) => {
      out += String(x);
    });
    child.stderr?.on("data", (x) => {
      err += String(x);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(new Error(`${opts.agent} exit ${code}: ${err.slice(0, 200)}`));
      const text = d.parse(out);
      if (!text.trim())
        return reject(new Error(`${opts.agent} returned empty output (exit 0) \u2014 misconfigured provider/model?`));
      resolve5(text);
    });
  });
}
function detectScorerAgent(env = process.env) {
  const explicit = env[SKILLOPT_ENV.AGENT];
  if (explicit && ["claude_code", "codex", "cursor", "hermes", "pi"].includes(explicit)) {
    return explicit;
  }
  if (env.CLAUDECODE === "1" || env.CLAUDE_CODE_ENTRYPOINT)
    return "claude_code";
  if (env.CODEX_HOME || env.CODEX_SESSION_ID)
    return "codex";
  return "claude_code";
}

// dist/src/skillify/skill-invocations.js
function parseMessage(m) {
  if (m == null)
    return null;
  if (typeof m === "string") {
    try {
      return JSON.parse(m);
    } catch {
      return null;
    }
  }
  if (typeof m === "object")
    return m;
  return null;
}
function pathToSkillRef(s) {
  if (typeof s !== "string")
    return null;
  const m = s.match(/\/skills\/(?:[^/\s"'`]+\/)*([^/\s"'`]+)\/SKILL\.md/);
  return m ? m[1] : null;
}
function invokedSkillRef(msg) {
  if (msg.type !== "tool_call")
    return null;
  let input = msg.tool_input;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = msg.tool_input;
    }
  }
  if (msg.tool_name === "Skill") {
    const skill = input?.skill;
    return typeof skill === "string" && skill.length > 0 ? skill : null;
  }
  const io = input;
  return pathToSkillRef(io?.path) ?? pathToSkillRef(io?.command);
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
function likeEscape(s) {
  return s.replace(/([\\%_])/g, "\\$1");
}
async function sessionTurns(query, sessionsTable, inv) {
  const sid = sqlStr(likeEscape(inv.sessionId));
  const rows = await query(`SELECT message FROM "${sessionsTable}" WHERE path LIKE '/sessions/%${sid}%' ESCAPE '\\' ORDER BY creation_date ASC`);
  const turns = [];
  let invIndex = -1;
  for (const r of rows) {
    const j = parseMessage(r.message);
    if (!j)
      continue;
    if (typeof j.session_id === "string" && j.session_id !== inv.sessionId)
      continue;
    const ref = invokedSkillRef(j);
    if (ref) {
      const p = splitOrgSkill(ref);
      if (invIndex < 0 && p && p.name === inv.name && p.author === inv.author && (typeof j.timestamp !== "string" || !inv.ts || j.timestamp === inv.ts)) {
        invIndex = turns.length;
      }
      continue;
    }
    const text = typeof j.content === "string" ? j.content.trim() : "";
    if (!text)
      continue;
    if (j.type === "user_message")
      turns.push({ role: "USER", text });
    else if (j.type === "assistant_message")
      turns.push({ role: "ASSISTANT", text });
  }
  if (invIndex < 0)
    invIndex = turns.length;
  return { turns, invIndex };
}
async function windowedTurns(query, sessionsTable, inv, opts = {}) {
  const before = opts.before ?? 3;
  const after = opts.after ?? 6;
  const { turns, invIndex } = await sessionTurns(query, sessionsTable, inv);
  const start = Math.max(0, invIndex - before);
  return { turns: turns.slice(start, invIndex + after), pivot: invIndex - start };
}
function elide(text, maxChars) {
  if (text.length <= maxChars)
    return text;
  const head = text.slice(0, Math.floor(maxChars * 0.55));
  const tail = text.slice(text.length - Math.floor(maxChars * 0.45));
  return `${head}

\u2026[${text.length - maxChars} chars elided]\u2026

${tail}`;
}
async function windowAroundInvocation(query, sessionsTable, inv, opts = {}) {
  const { turns } = await windowedTurns(query, sessionsTable, inv, opts);
  return elide(turns.map((t) => `${t.role}: ${t.text}`).join("\n\n"), opts.maxChars ?? 4e3);
}

// dist/src/skillify/claude-model.js
import { spawn } from "node:child_process";
function claudeModel(model, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 12e4;
  return (system, user) => new Promise((resolve5, reject) => {
    const args = [
      "-p",
      user,
      "--model",
      model,
      "--no-session-persistence",
      "--output-format",
      "json",
      "--system-prompt",
      system,
      // Empty allow-list = NO tools available. Authoritative: it covers built-ins AND
      // any MCP/configured tools (a deny-list can't enumerate those), so prompt-injected
      // transcript text in the judge/proposer prompt can never trigger tool use.
      "--tools",
      "",
      // --strict-mcp-config ignores the user's MCP config entirely (--tools only denies
      // USE, not LOADING) — a broken/oversized user MCP schema would otherwise fail every
      // judge/proposer call before it returns JSON, silently stopping proposals.
      "--strict-mcp-config"
    ];
    const child = spawn(findAgentBin("claude_code"), args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HIVEMIND_CAPTURE: "false", HIVEMIND_WIKI_WORKER: "1" },
      // CREATE_NO_WINDOW: the skillopt engine's judge/proposer steps run inside
      // the detached, console-less skillopt/mine-local worker, so without it
      // Windows pops a visible console window for the claude child. No-op on POSIX.
      windowsHide: true
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(new Error(`claude exit ${code}: ${err.slice(0, 200)}`));
      try {
        resolve5(String(JSON.parse(out).result ?? ""));
      } catch {
        resolve5(out);
      }
    });
  });
}

// dist/src/skillify/success-judge.js
var SYSTEM = `You are a strict engineering reviewer. Judge ONLY whether the user's task was actually accomplished CORRECTLY in this session slice. Ignore whether the user seemed happy or polite \u2014 a praised-but-wrong answer is a FAILURE. Reply with ONLY a JSON object: {"success": 0 or 1, "confidence": 0.0-1.0, "reason": "<=200 chars citing concrete evidence"}.`;
function buildUserPrompt(window) {
  return `Session slice (USER/ASSISTANT turns around a skill invocation):

${window}

Did the user's task get accomplished correctly? JSON only.`;
}
function extractJson(raw) {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence)
    s = fence[1].trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b <= a)
    return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}
function parseVerdict(raw) {
  const j = extractJson(raw);
  if (!j)
    return { success: 1, confidence: 0, reason: "unparseable judge output" };
  const fail = j.success === 0 || j.success === "0" || j.success === false;
  const confidence = typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.5;
  const reason = typeof j.reason === "string" ? j.reason.slice(0, 240) : "";
  return { success: fail ? 0 : 1, confidence, reason };
}
async function judgeSuccess(window, opts = {}) {
  if (!window.trim())
    return { success: 1, confidence: 0, reason: "empty window" };
  const model = opts.model ?? claudeModel("haiku");
  try {
    return parseVerdict(await model(SYSTEM, buildUserPrompt(window)));
  } catch (e) {
    return { success: 1, confidence: 0, reason: `judge failed: ${e?.message ?? String(e)}` };
  }
}

// dist/src/skillify/skill-edits.js
var SU_START = "<!-- SLOW_UPDATE_START -->";
var SU_END = "<!-- SLOW_UPDATE_END -->";
function protectedRange(skill) {
  const a = skill.indexOf(SU_START);
  const b = skill.indexOf(SU_END);
  if (a === -1 || b === -1 || b < a)
    return null;
  return [a, b + SU_END.length];
}
function targetsProtected(skill, target) {
  const r = protectedRange(skill);
  if (!r || !target)
    return false;
  const idx = skill.indexOf(target);
  if (idx === -1)
    return false;
  return idx < r[1] && idx + target.length > r[0];
}
function selectEdits(edits, budget) {
  return edits.slice(0, Math.max(0, budget));
}
function applyEdits(skill, edits) {
  let s = skill;
  const report = [];
  let applied = 0;
  const ok = (msg) => {
    applied++;
    report.push(`OK ${msg}`);
  };
  for (const e of edits) {
    if (e.target && targetsProtected(s, e.target)) {
      report.push(`SKIP ${e.op}: targets protected slow-update region`);
      continue;
    }
    switch (e.op) {
      case "append": {
        const content = (e.content ?? "").trim();
        if (!content) {
          report.push("SKIP append: empty content");
          break;
        }
        const r = protectedRange(s);
        if (r)
          s = s.slice(0, r[0]) + content + "\n\n" + s.slice(r[0]);
        else
          s = s.replace(/\s*$/, "") + "\n\n" + content + "\n";
        ok(`append (+${content.length} chars)`);
        break;
      }
      case "insert_after": {
        const target = e.target ?? "";
        const content = (e.content ?? "").trim();
        if (!target || !content) {
          report.push("SKIP insert_after: missing target/content");
          break;
        }
        const idx = s.indexOf(target);
        if (idx === -1) {
          report.push("SKIP insert_after: target not found");
          break;
        }
        const lineEnd = s.indexOf("\n", idx + target.length);
        const at = lineEnd === -1 ? s.length : lineEnd;
        s = s.slice(0, at) + "\n" + content + s.slice(at);
        ok("insert_after");
        break;
      }
      case "replace": {
        const target = e.target ?? "";
        const content = e.content ?? "";
        if (!target) {
          report.push("SKIP replace: missing target");
          break;
        }
        const idx = s.indexOf(target);
        if (idx === -1) {
          report.push("SKIP replace: target not found");
          break;
        }
        s = s.slice(0, idx) + content + s.slice(idx + target.length);
        ok("replace");
        break;
      }
      case "delete": {
        const target = e.target ?? "";
        if (!target) {
          report.push("SKIP delete: missing target");
          break;
        }
        const idx = s.indexOf(target);
        if (idx === -1) {
          report.push("SKIP delete: target not found");
          break;
        }
        s = s.slice(0, idx) + s.slice(idx + target.length);
        ok("delete");
        break;
      }
      default:
        report.push(`SKIP unknown op: ${e.op}`);
    }
  }
  return { skill: s, report, applied };
}

// dist/src/skillify/skill-proposer.js
var SYSTEM2 = `You improve an engineering SKILL document that has been producing repeated, confirmed failures. Diagnose the SINGLE recurring weakness behind the failures and propose a SMALL set of structured edits that fix it. Do NOT rewrite the whole doc, and do NOT touch anything between ${SU_START} and ${SU_END}. Reply with ONLY a JSON array of edits, each: {"op":"append|insert_after|replace|delete","target":"<exact existing text to anchor on; required for insert_after/replace/delete>","content":"<new text; required for append/insert_after/replace>"}. Prefer the smallest change that fixes the weakness.`;
function buildUserPrompt2(body, failures, priorEdits) {
  const cases = failures.slice(0, 8).map((f, i) => `${i + 1}. ${f}`).join("\n");
  const prior = priorEdits.length ? `

ALREADY TRIED for this skill on earlier runs (do NOT repeat these \u2014 propose something different, or nothing):
${priorEdits.slice(0, 12).map((p) => `- ${p}`).join("\n")}` : "";
  return `CURRENT SKILL:
${body}

CONFIRMED FAILURES it produced (user pushed back AND a judge confirmed the task was not accomplished):
${cases}${prior}

Propose the bounded edits. JSON array only.`;
}
var OPS = /* @__PURE__ */ new Set(["append", "insert_after", "replace", "delete"]);
function parseEdits(raw) {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence)
    s = fence[1].trim();
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a === -1 || b <= a)
    return [];
  let arr;
  try {
    arr = JSON.parse(s.slice(a, b + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr))
    return [];
  const out = [];
  for (const e of arr) {
    if (!e || typeof e !== "object")
      continue;
    const op = e.op;
    if (typeof op !== "string" || !OPS.has(op))
      continue;
    const target = e.target;
    const content = e.content;
    out.push({
      op,
      ...typeof target === "string" ? { target } : {},
      ...typeof content === "string" ? { content } : {}
    });
  }
  return out;
}
async function proposeSkillEdit(skillBody, failures, cfg = {}) {
  const budget = cfg.editBudget ?? 3;
  const model = cfg.model ?? claudeModel("sonnet");
  let raw;
  try {
    raw = await model(SYSTEM2, buildUserPrompt2(skillBody, failures, cfg.priorEdits ?? []));
  } catch {
    return { edits: [], editedBody: skillBody, report: ["proposer model call failed"], changed: false };
  }
  const edits = selectEdits(parseEdits(raw), budget);
  const { skill, report, applied } = applyEdits(skillBody, edits);
  return { edits, editedBody: skill, report, changed: applied > 0 };
}

// dist/src/skillify/skills-table.js
import { randomUUID as randomUUID2 } from "node:crypto";
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
async function insertSkillRow(args) {
  const id = args.id ?? randomUUID2();
  const sourceSessionsJson = JSON.stringify(args.sourceSessions);
  const contributorsJson = JSON.stringify(args.contributors);
  const sql = `INSERT INTO "${sqlIdent(args.tableName)}" (id, name, project, project_key, local_path, install, source_sessions, source_agent, scope, author, contributors, description, trigger_text, body, version, created_at, updated_at) VALUES ('${esc(id)}', '${esc(args.name)}', '${esc(args.project)}', '${esc(args.projectKey)}', '${esc(args.localPath)}', '${esc(args.install)}', '${esc(sourceSessionsJson)}', '${esc(args.sourceAgent)}', '${esc(args.scope)}', '${esc(args.author)}', '${esc(contributorsJson)}', '${esc(args.description)}', '${esc(args.trigger ?? "")}', '${esc(args.body)}', ${args.version}, '${esc(args.createdAt)}', '${esc(args.updatedAt)}')`;
  try {
    await args.query(sql);
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingTableError(msg)) {
      await args.query(buildCreateTableSql(args.tableName, SKILLS_COLUMNS));
      await healMissingColumns({
        query: args.query,
        tableName: args.tableName,
        workspaceId: args.workspaceId,
        columns: SKILLS_COLUMNS
      });
      await args.query(sql);
      return;
    }
    if (isMissingColumnError(msg)) {
      const result = await healMissingColumns({
        query: args.query,
        tableName: args.tableName,
        workspaceId: args.workspaceId,
        columns: SKILLS_COLUMNS
      });
      if (result.missing.length === 0)
        throw e;
      await args.query(sql);
      return;
    }
    throw e;
  }
}

// dist/src/skillify/skill-org-publish.js
var SKILLOPT_CONTRIBUTOR = "skillopt";
function asString(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asStringArray(v) {
  if (Array.isArray(v))
    return v.map(asString);
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(asString) : [];
    } catch {
      return [];
    }
  }
  return [];
}
async function readCurrentSkillRow(query, skillsTable, name, author) {
  const rows = await query(`SELECT name, author, project, project_key, local_path, install, source_sessions, source_agent, scope, contributors, description, trigger_text, body, version, created_at FROM "${sqlIdent(skillsTable)}" WHERE name = '${sqlStr(name)}' AND author = '${sqlStr(author)}' ORDER BY version DESC, created_at DESC LIMIT 1`);
  const r = rows?.[0];
  if (!r)
    return null;
  const version = Number(r.version);
  return {
    name: asString(r.name) || name,
    author: asString(r.author) || author,
    project: asString(r.project),
    projectKey: asString(r.project_key),
    localPath: asString(r.local_path),
    install: asString(r.install) === "global" ? "global" : "project",
    sourceSessions: asStringArray(r.source_sessions),
    sourceAgent: asString(r.source_agent),
    scope: asString(r.scope) === "team" ? "team" : "me",
    contributors: asStringArray(r.contributors),
    description: asString(r.description),
    trigger: asString(r.trigger_text),
    body: asString(r.body),
    version: Number.isFinite(version) && version > 0 ? version : 1,
    createdAt: asString(r.created_at)
  };
}
function appendUnique(base, add) {
  const out = [...base];
  for (const a of add)
    if (a && !out.includes(a))
      out.push(a);
  return out;
}
async function publishImprovedSkill(opts) {
  const version = opts.current.version + 1;
  const base = opts.current.contributors.length ? opts.current.contributors : [opts.current.author];
  const contributors = appendUnique(base, [opts.collaborator, SKILLOPT_CONTRIBUTOR]);
  await insertSkillRow({
    query: opts.query,
    tableName: opts.tableName,
    workspaceId: opts.workspaceId,
    name: opts.current.name,
    author: opts.current.author,
    project: opts.current.project,
    projectKey: opts.current.projectKey,
    localPath: opts.current.localPath,
    install: opts.current.install,
    sourceSessions: opts.current.sourceSessions,
    sourceAgent: opts.current.sourceAgent,
    scope: "team",
    contributors,
    description: opts.current.description,
    trigger: opts.current.trigger,
    body: opts.newBody,
    version,
    createdAt: opts.now,
    updatedAt: opts.now
  });
  return { version };
}

// dist/src/skillify/skillopt-improve.js
function likeEscape2(s) {
  return s.replace(/([\\%_])/g, "\\$1");
}
async function findInvocation(query, sessionsTable, sessionId, name, author, toolUseId) {
  const sid = sqlStr(likeEscape2(sessionId));
  const rows = await query(`SELECT message FROM "${sqlIdent(sessionsTable)}" WHERE path LIKE '/sessions/%${sid}%' ESCAPE '\\' ORDER BY creation_date ASC`);
  let latest = null;
  let pinned = null;
  for (const r of rows) {
    const m = parseMessage(r.message);
    if (!m)
      continue;
    if (typeof m.session_id === "string" && m.session_id !== sessionId)
      continue;
    const ref = invokedSkillRef(m);
    if (!ref)
      continue;
    const p = splitOrgSkill(ref);
    if (!p || p.name !== name || p.author !== author)
      continue;
    const inv = { sessionId, name, author, ts: typeof m.timestamp === "string" ? m.timestamp : "" };
    latest = inv;
    if (toolUseId && m.tool_use_id === toolUseId)
      pinned = inv;
  }
  return pinned ?? latest;
}
var DEFAULT_INVOCATION_RETRIES = 5;
var DEFAULT_INVOCATION_BACKOFF_MS = 3e3;
var realSleep = (ms) => new Promise((resolve5) => setTimeout(resolve5, ms));
async function findInvocationWithRetry(opts, name, author) {
  const retries = opts.invocationRetries ?? DEFAULT_INVOCATION_RETRIES;
  const backoffMs = opts.invocationBackoffMs ?? DEFAULT_INVOCATION_BACKOFF_MS;
  const sleep3 = opts.sleep ?? realSleep;
  for (let attempt = 0; ; attempt++) {
    const inv = await findInvocation(opts.query, opts.sessionsTable, opts.sessionId, name, author, opts.toolUseId);
    if (inv)
      return inv;
    if (attempt >= retries)
      return null;
    await sleep3(backoffMs * (attempt + 1));
  }
}
async function improveSkillIfFailed(opts) {
  const none = (reason) => ({ judged: false, failed: false, improved: false, reason });
  const parts = splitOrgSkill(opts.skillRef);
  if (!parts)
    return none("not an org skill");
  const inv = await findInvocationWithRetry(opts, parts.name, parts.author);
  if (!inv)
    return none("invocation not found in session");
  let window = await windowAroundInvocation(opts.query, opts.sessionsTable, inv);
  if (opts.reaction?.trim())
    window += `

USER: ${opts.reaction.trim()}`;
  const verdict = await judgeSuccess(window, { model: opts.judge });
  if (verdict.success !== 0)
    return { judged: true, failed: false, improved: false, reason: verdict.reason };
  const current = await readCurrentSkillRow(opts.query, opts.skillsTable, parts.name, parts.author);
  if (!current)
    return { judged: true, failed: true, improved: false, reason: "skill not in org table" };
  const priorEdits = opts.prior?.(parts.name, parts.author) ?? [];
  const p = await proposeSkillEdit(current.body, [verdict.reason], { model: opts.proposerModel, priorEdits });
  if (!p.changed)
    return { judged: true, failed: true, improved: false, reason: "proposer made no change" };
  if (opts.alreadyProposed?.(parts.name, parts.author, p.edits)) {
    return { judged: true, failed: true, improved: false, reason: "edit already proposed (dedup)" };
  }
  const { version } = await publishImprovedSkill({
    query: opts.query,
    tableName: opts.skillsTable,
    workspaceId: opts.workspaceId,
    current,
    newBody: p.editedBody,
    collaborator: opts.collaborator,
    now: opts.now
  });
  try {
    opts.recordEdit?.(parts.name, parts.author, p.edits);
  } catch {
  }
  return { judged: true, failed: true, improved: true, version, reason: verdict.reason };
}

// dist/src/skillify/skillopt-meta.js
import fs from "node:fs";
import path from "node:path";
var skillRef = (name, author) => `${name}--${author}`;
function summarizeEdit(e) {
  const anchor = e.target ? ` @"${e.target.slice(0, 40)}"` : "";
  const preview = e.content ? `: ${e.content.slice(0, 60).replace(/\s+/g, " ")}` : "";
  return `${e.op}${anchor}${preview}`;
}
function fingerprintEdits(edits) {
  return edits.map((e) => `${e.op}|${e.target ?? ""}|${e.content ?? ""}`).sort().join("\n");
}
function loadMeta(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t)
      continue;
    try {
      const e = JSON.parse(t);
      if (e && typeof e.skill === "string" && typeof e.fingerprint === "string")
        out.push(e);
    } catch {
    }
  }
  return out;
}
function appendMeta(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}
function alreadyProposed(meta, name, author, edits) {
  const ref = skillRef(name, author);
  const fp = fingerprintEdits(edits);
  return meta.some((m) => m.skill === ref && m.fingerprint === fp);
}
function priorEditSummaries(meta, name, author) {
  const ref = skillRef(name, author);
  return meta.filter((m) => m.skill === ref).flatMap((m) => m.ops);
}
function metaEntryFor(name, author, edits, now) {
  return {
    skill: skillRef(name, author),
    ops: edits.map(summarizeEdit),
    fingerprint: fingerprintEdits(edits),
    proposedAt: now,
    status: "proposed"
  };
}

// dist/src/skillify/state.js
import { readFileSync as readFileSync6, writeFileSync as writeFileSync4, writeSync, mkdirSync as mkdirSync5, renameSync as renameSync3, rmdirSync, existsSync as existsSync5, lstatSync, unlinkSync as unlinkSync3, openSync as openSync2, closeSync as closeSync2 } from "node:fs";
import { join as join10 } from "node:path";

// dist/src/utils/repo-identity.js
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, resolve as resolve4 } from "node:path";

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync4, renameSync as renameSync2 } from "node:fs";
import { dirname as dirname3, join as join9 } from "node:path";
var dlog = (msg) => log("skillify-migrate", msg);
var attempted = false;
function migrateLegacyStateDir() {
  if (process.env.HIVEMIND_STATE_DIR?.trim())
    return;
  if (attempted)
    return;
  attempted = true;
  const current = getStateDir();
  const legacy = join9(dirname3(current), "skilify");
  if (!existsSync4(legacy))
    return;
  if (existsSync4(current))
    return;
  try {
    renameSync2(legacy, current);
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

// dist/src/skillify/state.js
var dlog2 = (msg) => log("skillify-state", msg);
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
var TRIGGER_THRESHOLD = (() => {
  const n = Number(process.env.HIVEMIND_SKILLIFY_EVERY_N_TURNS ?? "");
  return Number.isInteger(n) && n > 0 ? n : 20;
})();
function lockPath2(projectKey) {
  return join10(getStateDir(), `${projectKey}.lock`);
}
function tryAcquireWorkerLock(projectKey, maxAgeMs = 10 * 60 * 1e3) {
  migrateLegacyStateDir();
  mkdirSync5(getStateDir(), { recursive: true });
  const p = lockPath2(projectKey);
  if (existsSync5(p)) {
    try {
      const ageMs = Date.now() - parseInt(readFileSync6(p, "utf-8"), 10);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMs)
        return false;
    } catch (readErr) {
      dlog2(`worker lock unreadable for ${projectKey}, treating as stale: ${readErr.message}`);
    }
    try {
      unlinkSync3(p);
    } catch (unlinkErr) {
      if (unlinkErr?.code !== "EISDIR" && unlinkErr?.code !== "EPERM" && unlinkErr?.code !== "ENOENT") {
        dlog2(`could not unlink stale worker lock for ${projectKey}: ${unlinkErr.message}`);
        return false;
      }
      let isDir = false;
      try {
        isDir = lstatSync(p).isDirectory();
      } catch {
      }
      if (isDir) {
        try {
          rmdirSync(p);
        } catch (rmErr) {
          dlog2(`rmdir stale lock skipped for ${projectKey}: ${rmErr.message}`);
        }
      }
    }
  }
  try {
    const fd = openSync2(p, "wx");
    try {
      writeSync(fd, String(Date.now()));
    } finally {
      closeSync2(fd);
    }
    return true;
  } catch {
    return false;
  }
}
function releaseWorkerLock(projectKey) {
  const p = lockPath2(projectKey);
  try {
    unlinkSync3(p);
  } catch {
  }
}

// dist/src/skillify/skillopt-worker.js
var log4 = (m) => log("skillopt-worker", m);
var AGENT_CMD = { claude_code: "claude", codex: "codex", cursor: "cursor-agent", hermes: "hermes", pi: "pi" };
function resolveAgentBin(agent) {
  const cmd = AGENT_CMD[agent];
  if (!cmd)
    return void 0;
  for (const dir of (process.env.PATH ?? "").split(path2.delimiter)) {
    if (!dir)
      continue;
    const full = path2.join(dir, cmd);
    try {
      accessSync(full, fsConstants.X_OK);
      return full;
    } catch {
    }
  }
  return void 0;
}
async function main() {
  const sessionId = process.env[SKILLOPT_ENV.SESSION] ?? "";
  const skillRef2 = process.env[SKILLOPT_ENV.SKILL] ?? "";
  const reaction = process.env[SKILLOPT_ENV.REACTION] ?? "";
  const toolUseId = process.env[SKILLOPT_ENV.TOOL_USE_ID] || void 0;
  if (!sessionId || !skillRef2) {
    log4("no session/skill in env \u2014 nothing to do");
    return;
  }
  const config = loadRoutedConfig();
  if (!config?.token) {
    log4("no config/credentials \u2014 exiting");
    return;
  }
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  const query = (sql) => api.query(sql);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const agent = detectScorerAgent();
  const agentBin = resolveAgentBin(agent);
  const metaFile = path2.join(getStateDir(), "skillopt", "meta.jsonl");
  const metaCache = loadMeta(metaFile);
  const lockKey = `skillopt-improve-${skillRef2.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  if (!tryAcquireWorkerLock(lockKey)) {
    log4(`another worker is improving ${skillRef2} \u2014 skipping`);
    return;
  }
  try {
    log4(`judging ${skillRef2} in ${sessionId} (agent=${agent})`);
    const r = await improveSkillIfFailed({
      query,
      sessionsTable: config.sessionsTableName,
      skillsTable: config.skillsTableName,
      workspaceId: config.workspaceId,
      sessionId,
      skillRef: skillRef2,
      toolUseId,
      reaction,
      judge: agentModel({ agent, role: "judge", bin: agentBin }),
      proposerModel: agentModel({ agent, role: "proposer", bin: agentBin }),
      collaborator: config.userName,
      now,
      prior: (n, a) => priorEditSummaries(metaCache, n, a),
      alreadyProposed: (n, a, edits) => alreadyProposed(metaCache, n, a, edits),
      recordEdit: (n, a, edits) => {
        const e = metaEntryFor(n, a, edits, now);
        appendMeta(metaFile, e);
        metaCache.push(e);
      }
    });
    if (r.improved)
      log4(`improved ${skillRef2} \u2192 v${r.version} (${r.reason})`);
    else if (r.failed)
      log4(`${skillRef2} failed but not improved: ${r.reason}`);
    else if (r.judged)
      log4(`${skillRef2} ok \u2014 no change (${r.reason})`);
    else
      log4(`${skillRef2} not judged: ${r.reason}`);
  } finally {
    releaseWorkerLock(lockKey);
  }
}
main().catch((e) => {
  log4(`fatal (swallowed): ${e?.message ?? e}`);
  process.exit(0);
});
