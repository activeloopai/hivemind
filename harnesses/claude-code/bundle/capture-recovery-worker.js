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
import { existsSync, mkdirSync as mkdirSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join4 } from "node:path";
import { tmpdir } from "node:os";
function getIndexMarkerDir() {
  return process.env.HIVEMIND_INDEX_MARKER_DIR ?? join4(tmpdir(), "hivemind-deeplake-indexes");
}
function buildIndexMarkerPath(workspaceId, orgId, table, suffix) {
  const markerKey = [workspaceId, orgId, table, suffix].join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join4(getIndexMarkerDir(), `${markerKey}.json`);
}
function hasFreshIndexMarker(markerPath) {
  if (!existsSync(markerPath))
    return false;
  try {
    const raw = JSON.parse(readFileSync3(markerPath, "utf-8"));
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

// dist/src/hooks/capture-recovery-worker.js
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname5, join as join17 } from "node:path";
import { readFileSync as readFileSync11, writeFileSync as writeFileSync8, mkdirSync as mkdirSync11 } from "node:fs";

// dist/src/deeplake-api.js
import { randomUUID } from "node:crypto";

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
var LOG = join(homedir(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function utcTimestamp(d = /* @__PURE__ */ new Date()) {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
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
import { readFileSync, writeFileSync, mkdirSync as mkdirSync2, openSync, closeSync, unlinkSync, statSync } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
function isPathInsideHome(path, home) {
  const r = resolve(path);
  const h = resolve(home);
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
  return join2(homedir2(), ".deeplake", "notifications-queue.json");
}
function lockPath() {
  return `${queuePath()}.lock`;
}
function readQueue() {
  try {
    const raw = readFileSync(queuePath(), "utf-8");
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
function _isQueuePathInsideHome(path, home) {
  return isPathInsideHome(path, home);
}
function writeQueue(q) {
  const path = queuePath();
  const home = resolve2(homedir2());
  if (!_isQueuePathInsideHome(path, home)) {
    throw new Error(`notifications-queue write blocked: ${path} is outside ${home}`);
  }
  mkdirSync2(join2(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameAtomic(tmp, path);
}
async function withQueueLock(fn) {
  const path = lockPath();
  mkdirSync2(join2(homedir2(), ".deeplake"), { recursive: true, mode: 448 });
  let fd = null;
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      fd = openSync(path, "wx", 384);
      break;
    } catch (e) {
      const code = e.code;
      if (code !== "EEXIST")
        throw e;
      try {
        const age = Date.now() - statSync(path).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync(path);
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
      unlinkSync(path);
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
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync3, unlinkSync as unlinkSync2, renameSync } from "node:fs";
import { join as join3 } from "node:path";
import { homedir as homedir3 } from "node:os";
function configDir() {
  return join3(homedir3(), ".deeplake");
}
function credsPath() {
  return join3(configDir(), "credentials.json");
}
function lookupWorkspaceAlias(aliases, orgId, ref) {
  const org = aliases && Object.prototype.hasOwnProperty.call(aliases, orgId) ? aliases[orgId] : void 0;
  const key = ref.toLowerCase();
  const id = org && Object.prototype.hasOwnProperty.call(org, key) ? org[key] : void 0;
  return typeof id === "string" ? id : void 0;
}
function resolveWorkspaceRef(aliases, orgId, ref) {
  if (ref === "default")
    return ref;
  return lookupWorkspaceAlias(aliases, orgId, ref) ?? ref;
}
function loadCredentials(readFile = (p) => readFileSync2(p, "utf-8")) {
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
  return new Promise((resolve4, reject) => {
    const t = setTimeout(resolve4, ms);
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
    await new Promise((resolve4) => this.waiting.push(resolve4));
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
  async updateColumns(path, columns) {
    const setClauses = Object.entries(columns).map(([col, val]) => typeof val === "number" ? `${col} = ${val}` : `${col} = '${sqlStr(String(val))}'`).join(", ");
    await this.query(`UPDATE "${this.tableName}" SET ${setClauses} WHERE path = '${sqlStr(path)}'`);
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

// dist/src/config.js
import { readFileSync as readFileSync4, existsSync as existsSync2 } from "node:fs";
import { join as join5 } from "node:path";
import { homedir as homedir4, userInfo } from "node:os";
function loadConfig() {
  const home = homedir4();
  const credPath = join5(home, ".deeplake", "credentials.json");
  let creds = null;
  if (existsSync2(credPath)) {
    try {
      creds = JSON.parse(readFileSync4(credPath, "utf-8"));
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
    // The API only accepts workspace IDS in its URLs, but the env var is
    // documented (and typed by users) as a name. Map through the aliases
    // SessionStart learned so a name never reaches the wire.
    workspaceId: resolveWorkspaceRef(creds?.workspaceAliases, orgId, process.env.HIVEMIND_WORKSPACE_ID ?? creds?.workspaceId ?? "default"),
    apiUrl: process.env.HIVEMIND_API_URL ?? creds?.apiUrl ?? "https://api.deeplake.ai",
    tableName: process.env.HIVEMIND_TABLE ?? "memory",
    sessionsTableName: process.env.HIVEMIND_SESSIONS_TABLE ?? "sessions",
    skillsTableName: process.env.HIVEMIND_SKILLS_TABLE ?? "skills",
    // Defaults match the table name written into the SQL — keep aligned
    // with RULES_COLUMNS in deeplake-schema.ts and with the e2e test-org
    // override convention (memory_test / sessions_test → goals_test, etc.)
    // documented in CLAUDE.md.
    rulesTableName: process.env.HIVEMIND_RULES_TABLE ?? "hivemind_rules",
    // Goals (VFS path classifier maps
    //   memory/goal/<user>/<status>/<uuid>.md → hivemind_goals row
    // See src/shell/deeplake-fs.ts for the translation logic and
    // GOALS_COLUMNS in deeplake-schema.ts for the table shape).
    goalsTableName: process.env.HIVEMIND_GOALS_TABLE ?? "hivemind_goals",
    // Per-file documentation kept fresh on code deltas. INSERT-only
    // version-bumped table (see DOCS_COLUMNS in deeplake-schema.ts).
    // Phase 1: written/read through the `hivemind docs` CLI + worker via the
    // src/docs store. NOT yet routed through the VFS path classifier — when
    // VFS routing lands it MUST use the INSERT-only store, never the goals
    // UPDATE-or-INSERT path (which is vulnerable to UPDATE-coalescing).
    docsTableName: process.env.HIVEMIND_DOCS_TABLE ?? "hivemind_docs",
    codebaseTableName: process.env.HIVEMIND_CODEBASE_TABLE ?? "codebase",
    workspaceAliases: creds?.workspaceAliases,
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join5(home, ".deeplake", "memory")
  };
}

// dist/src/dir-config.js
import { readFileSync as readFileSync5 } from "node:fs";
import { dirname as dirname2, join as join6, resolve as resolve3 } from "node:path";
var DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"];
function findDirConfig(startDir, stopAt) {
  let dir = resolve3(startDir);
  const boundary = stopAt ? resolve3(stopAt) : null;
  for (; ; ) {
    for (const name of DIR_CONFIG_FILENAMES) {
      const candidate = join6(dir, name);
      try {
        const raw = parseDirConfig(readFileSync5(candidate, "utf-8"));
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
  const envWs = envOverride ? envOverride.HIVEMIND_WORKSPACE_ID : process.env.HIVEMIND_WORKSPACE_ID;
  const orgId = orgLocked ? base.orgId : found.raw.orgId ?? base.orgId;
  const wsRef = envWs || found.raw.workspaceId || base.workspaceId;
  const config = {
    ...base,
    orgId,
    orgName: orgLocked ? base.orgName : found.raw.orgName ?? found.raw.orgId ?? base.orgName,
    workspaceId: resolveWorkspaceRef(base.workspaceAliases, orgId, wsRef)
  };
  return { config, collect: found.raw.collect !== false, found };
}

// dist/src/hooks/shared/dir-gate.js
function resolveCaptureConfig(cwd, log5) {
  const base = loadConfig();
  if (!base) {
    log5("no config");
    return null;
  }
  const effCwd = cwd || process.cwd();
  const resolved = resolveDirConfig(base, effCwd);
  if (!resolved.collect) {
    log5(`capture disabled for cwd=${effCwd} via ${resolved.found?.path}`);
    return null;
  }
  return resolved.config;
}

// dist/src/hooks/shared/redact.js
var MASK = "********";
function shannonEntropy(s) {
  const freq = /* @__PURE__ */ new Map();
  for (const ch of s)
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}
function looksLikeSecret(tok) {
  if (tok.length < 24)
    return false;
  if (/^\d+$/.test(tok))
    return false;
  if (/^[0-9a-f]+$/i.test(tok))
    return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tok))
    return false;
  if (/^(?:(?:us|eu|apac|anthropic|amazon|bedrock|cohere|meta|mistral|google)\.)*(?:claude|gpt|o[1-9]|gemini|gemma|codex|text-embedding|dall-e|whisper|grok|deepseek|kimi|llama|mixtral|qwen|phi)[0-9]?(?:[._-][a-z0-9]{1,12})*$/.test(tok))
    return false;
  const classes = (/[a-z]/.test(tok) ? 1 : 0) + (/[A-Z]/.test(tok) ? 1 : 0) + (/[0-9]/.test(tok) ? 1 : 0);
  if (classes < 2)
    return false;
  return shannonEntropy(tok) >= 3.5;
}
var SECRET_KEY_WORDS = [
  "aws[_-]?secret[_-]?access[_-]?key",
  "secret[_-]?access[_-]?key",
  "client[_-]?secret",
  "access[_-]?key[_-]?id",
  "encryption[_-]?key",
  "connection[_-]?string",
  "private[_-]?key",
  "secret[_-]?key",
  "access[_-]?key",
  "auth[_-]?token",
  "refresh[_-]?token",
  "access[_-]?token",
  "session[_-]?key",
  "account[_-]?key",
  "id[_-]?token",
  "api[_-]?key",
  "app[_-]?key",
  "pgpassword",
  "passphrase",
  "password",
  "passwd",
  "credentials?",
  "signature",
  "secret",
  "token",
  "apikey"
].join("|");
var NON_SECRET_VALUE = /^(true|false|null|none|undefined|nil|""|''|\{\}|\[\])$/i;
var RULES = [
  // ── 1. Private key blocks ────────────────────────────────────────────────
  {
    re: /(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY-----)/g,
    replace: `$1${MASK}$2`
  },
  // ── 2. Known provider token schemes — keep the scheme prefix ─────────────
  // GitHub (classic / oauth / user / server / refresh, fine-grained PAT).
  { re: /(github_pat_)[A-Za-z0-9_]{20,}/g, replace: `$1${MASK}` },
  { re: /(gh[pousr]_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  // OpenAI / Anthropic (sk-, sk-ant-, sk-proj-).
  { re: /(sk-(?:ant-|proj-)?)[A-Za-z0-9_-]{16,}/g, replace: `$1${MASK}` },
  // Stripe secret / restricted / webhook.
  { re: /((?:sk|rk)_(?:live|test)_)[A-Za-z0-9]{16,}/g, replace: `$1${MASK}` },
  { re: /(whsec_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  // Slack (bot/user/app tokens).
  { re: /(xox[baprse]-)[A-Za-z0-9-]{8,}/g, replace: `$1${MASK}` },
  { re: /(xapp-)[A-Za-z0-9-]{8,}/g, replace: `$1${MASK}` },
  // AWS access key ids (the secret access key is caught by the entropy layer).
  { re: /((?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16})/g, replace: (_m, p1) => `${p1.slice(0, 4)}${MASK}` },
  // Google API key + OAuth access token.
  { re: /(AIza)[A-Za-z0-9_-]{30,}/g, replace: `$1${MASK}` },
  { re: /(ya29\.)[A-Za-z0-9_-]{20,}/g, replace: `$1${MASK}` },
  // HuggingFace, GitLab, npm, PyPI.
  { re: /(hf_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /(glpat-)[A-Za-z0-9_-]{18,}/g, replace: `$1${MASK}` },
  { re: /(npm_)[A-Za-z0-9]{30,}/g, replace: `$1${MASK}` },
  { re: /(pypi-)[A-Za-z0-9_-]{40,}/g, replace: `$1${MASK}` },
  // Shopify, DigitalOcean, Doppler, Databricks, Linear, Postman.
  { re: /(shp(?:at|ss|ca|pa)_)[a-fA-F0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /((?:dop|doo|dor)_v1_)[a-f0-9]{40,}/g, replace: `$1${MASK}` },
  { re: /(dp\.pt\.)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /(dapi)[a-f0-9]{28,}/g, replace: `$1${MASK}` },
  { re: /(lin_api_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /(PMAK-)[a-f0-9]{20,}-[a-f0-9]{20,}/g, replace: `$1${MASK}` },
  // SendGrid, Atlassian, Notion, Groq, xAI, Replicate, Mailgun, Telegram bot.
  { re: /(SG\.)[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, replace: `$1${MASK}` },
  { re: /(ATATT)[A-Za-z0-9_\-=]{20,}/g, replace: `$1${MASK}` },
  { re: /((?:secret_|ntn_))[A-Za-z0-9]{40,}/g, replace: `$1${MASK}` },
  { re: /(gsk_)[A-Za-z0-9]{40,}/g, replace: `$1${MASK}` },
  { re: /(xai-)[A-Za-z0-9]{60,}/g, replace: `$1${MASK}` },
  { re: /(r8_)[A-Za-z0-9]{30,}/g, replace: `$1${MASK}` },
  { re: /(key-)[a-f0-9]{32}/g, replace: `$1${MASK}` },
  { re: /\b(\d{8,10}:AA)[A-Za-z0-9_-]{30,}/g, replace: `$1${MASK}` },
  // JWTs — three base64url segments; mask entirely.
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g, replace: MASK },
  // ── 3. Structured secrets ────────────────────────────────────────────────
  // DSN-style credential — a long hex key sitting in the userinfo of a URL
  // (`https://<hexkey>@host/…`, e.g. a Sentry DSN). Matched structurally (no
  // hostname literal) so it stays host-agnostic and doesn't trip URL linters.
  { re: /(https?:\/\/)[a-f0-9]{32,}(@)/gi, replace: `$1${MASK}$2` },
  // Slack incoming webhook — match the distinctive `/services/T…/B…/<token>`
  // path (the secret) rather than the hostname literal, so it's host-agnostic
  // and doesn't trip URL-anchoring linters.
  { re: /(\/services\/)T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  // Authorization / Proxy-Authorization headers.
  {
    re: /((?:proxy-)?authorization["']?\s*[:=]\s*["']?(?:bearer|basic|token|digest)\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
    replace: `$1${MASK}`
  },
  // Bare `Bearer <token>`.
  { re: /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/g, replace: `$1${MASK}` },
  // Credentials embedded in a URL: `scheme://user:password@host`.
  { re: /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s:/@]+)(@)/gi, replace: `$1${MASK}$3` },
  // ── 4. Generic labeled assignments ───────────────────────────────────────
  // A trailing run of backslashes stays outside the mask when a quote follows:
  // every capturer redacts the JSON-serialized entry, where a value followed
  // by an escaped quote reads `...VALUE\\"`. Masking that backslash left
  // `********""` behind, invalid JSON that the queue then stored as an opaque
  // raw_message. Backslashes anywhere else are part of the value and masked.
  {
    re: new RegExp(`((?:${SECRET_KEY_WORDS})(?![A-Za-z0-9])["']?\\s*[:=]\\s*["']?)([^\\s"',;{}()\\[\\]]{1,})(?=(["']?))`, "gi"),
    replace: (match, keep, value, quote) => maskBeforeQuote(match, keep, "", value, quote)
  },
  // CLI-flag form: `--password VALUE` / `-p=VALUE`.
  {
    re: /(--?(?:password|passwd|pwd|token|secret|api[_-]?key)[\s=]+)(["']?)([^\s"']{1,})(?=(["']?))/gi,
    replace: (match, keep, open, value, quote) => maskBeforeQuote(match, keep, open, value, quote)
  },
  // ── 5. High-entropy backstop for bare, unlabeled secrets ─────────────────
  // A random-looking token with no known prefix and no labeling key (e.g. an
  // AWS secret access key, a raw key echoed in JSON). `/`, `=` and `+` are
  // excluded from the candidate charset so file paths, base64 data blobs and
  // `key=value` assignments break into short segments — keeping the value
  // (a UUID, a decimal, a hash) separate from its label instead of gluing them
  // into one high-entropy blob.
  {
    re: /[A-Za-z0-9_.-]{24,}/g,
    replace: (m) => looksLikeSecret(m) ? MASK : m
  }
];
function maskBeforeQuote(match, keep, open, value, quote) {
  const run = quote ? value.match(/\\+$/)?.[0].length ?? 0 : 0;
  const escape = run % 2 === 1 && run < value.length ? "\\" : "";
  const secret = value.slice(0, value.length - escape.length);
  if (NON_SECRET_VALUE.test(secret))
    return match;
  return `${keep}${open}${MASK}${escape}`;
}
function redactSecrets(text) {
  if (!text)
    return text;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, rule.replace);
  }
  return out;
}

// dist/src/hooks/shared/session-insert-sql.js
function buildDirectSessionInsertSql(sessionsTable, p) {
  const table = sqlIdent(sessionsTable);
  const id = sqlStr(p.id);
  return `INSERT INTO "${table}" (id, path, filename, message, message_embedding, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) SELECT '${id}', '${sqlStr(p.sessionPath)}', '${sqlStr(p.filename)}', '${p.jsonForSql}'::jsonb, ${p.embeddingSql}, '${sqlStr(p.userName)}', ${p.sizeBytes}, '${sqlStr(p.projectName)}', '${sqlStr(p.description)}', '${sqlStr(p.agent)}', '${sqlStr(p.pluginVersion)}', '${sqlStr(p.timestamp)}', '${sqlStr(p.timestamp)}' WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE id = '${id}')`;
}

// dist/src/hooks/session-event-cache.js
import { appendFileSync as appendFileSync2, mkdirSync as mkdirSync5, readFileSync as readFileSync6, readdirSync, statSync as statSync2, unlinkSync as unlinkSync3 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join7 } from "node:path";
var dlog = (msg) => log("session-event-cache", msg);
var CACHE_DIR = join7(homedir5(), ".claude", "hooks", "session-cache");
function sessionEventCacheDisabled() {
  const v = process.env.HIVEMIND_SESSION_EVENT_CACHE;
  return v === "0" || v === "false";
}
function sessionEventCachePath(sessionId) {
  return join7(CACHE_DIR, `${sessionId}.jsonl`);
}
function appendSessionEvent(sessionId, line) {
  if (!sessionId || sessionEventCacheDisabled())
    return;
  try {
    mkdirSync5(CACHE_DIR, { recursive: true });
    appendFileSync2(sessionEventCachePath(sessionId), line + "\n");
  } catch (e) {
    dlog(`append failed for ${sessionId}: ${e?.message ?? e}`);
  }
}

// dist/src/utils/session-path.js
function buildSessionPath(config, sessionId) {
  const workspace = config.workspaceId ?? "default";
  return `/sessions/${config.userName}/${config.userName}_${config.orgName}_${workspace}_${sessionId}.jsonl`;
}

// dist/src/utils/project-name.js
import { basename } from "node:path";
function projectNameFromCwd(cwd) {
  return basename(cwd ?? "") || "unknown";
}

// dist/src/utils/version-check.js
import { readFileSync as readFileSync7 } from "node:fs";
import { dirname as dirname3, join as join8 } from "node:path";
function getInstalledVersion(bundleDir, pluginManifestDir) {
  try {
    const pluginJson = join8(bundleDir, "..", pluginManifestDir, "plugin.json");
    const plugin = JSON.parse(readFileSync7(pluginJson, "utf-8"));
    if (plugin.version)
      return plugin.version;
  } catch {
  }
  try {
    const stamp = readFileSync7(join8(bundleDir, "..", ".hivemind_version"), "utf-8").trim();
    if (stamp)
      return stamp;
  } catch {
  }
  const HIVEMIND_PKG_NAMES = /* @__PURE__ */ new Set([
    "hivemind",
    "hivemind-codex",
    "@deeplake/hivemind",
    "@deeplake/hivemind-codex",
    "@activeloop/hivemind",
    "@activeloop/hivemind-codex"
  ]);
  let dir = bundleDir;
  for (let i = 0; i < 5; i++) {
    const candidate = join8(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync7(candidate, "utf-8"));
      if (HIVEMIND_PKG_NAMES.has(pkg.name) && pkg.version)
        return pkg.version;
    } catch {
    }
    const parent = dirname3(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}

// dist/src/utils/plugin-state.js
import { readFileSync as readFileSync8 } from "node:fs";
import { join as join9 } from "node:path";
import { homedir as homedir6 } from "node:os";
var PLUGIN_ID = "hivemind@hivemind";
function isHivemindPluginEnabled() {
  try {
    const settingsPath = join9(homedir6(), ".claude", "settings.json");
    const settings = JSON.parse(readFileSync8(settingsPath, "utf-8"));
    const enabledPlugins = settings?.enabledPlugins;
    if (enabledPlugins && typeof enabledPlugins === "object" && PLUGIN_ID in enabledPlugins) {
      return enabledPlugins[PLUGIN_ID] !== false;
    }
    return true;
  } catch {
    return true;
  }
}

// dist/src/recall/cache.js
import { mkdirSync as mkdirSync6, readFileSync as readFileSync9, renameSync as renameSync2, rmSync, statSync as statSync3, writeFileSync as writeFileSync4, openSync as openSync2, closeSync as closeSync2, fstatSync, linkSync } from "node:fs";
import { homedir as homedir7 } from "node:os";
import { join as join10 } from "node:path";
function ensureDir(dir) {
  mkdirSync6(dir, { recursive: true, mode: 448 });
}
var LOCK_STALE_MS2 = 10 * 6e4;
function createLock(lock) {
  let fd;
  try {
    fd = openSync2(lock, "wx", 384);
  } catch (e) {
    if (e.code === "EEXIST")
      return false;
    throw e;
  }
  try {
    writeFileSync4(fd, String(process.pid));
  } finally {
    closeSync2(fd);
  }
  return true;
}
function evictStaleLock(lock, now) {
  let fd;
  try {
    fd = openSync2(lock, "r");
  } catch {
    return true;
  }
  let ino;
  try {
    const st = fstatSync(fd);
    if (now - st.mtimeMs < LOCK_STALE_MS2)
      return false;
    ino = st.ino;
  } finally {
    closeSync2(fd);
  }
  const moved = `${lock}.stale.${process.pid}`;
  try {
    renameSync2(lock, moved);
  } catch {
    return true;
  }
  try {
    if (fstatInode(moved) !== ino) {
      try {
        linkSync(moved, lock);
      } catch {
      }
      return false;
    }
    return true;
  } finally {
    rmSync(moved, { force: true });
  }
}
function fstatInode(path) {
  const fd = openSync2(path, "r");
  try {
    return fstatSync(fd).ino;
  } finally {
    closeSync2(fd);
  }
}
function acquireSyncLock(dir, now = Date.now()) {
  try {
    ensureDir(dir);
    const lock = join10(dir, "sync.lock");
    if (!createLock(lock) && !(evictStaleLock(lock, now) && createLock(lock)))
      return null;
    return () => {
      try {
        rmSync(lock, { force: true });
      } catch {
      }
    };
  } catch {
    return null;
  }
}

// dist/src/hooks/summary-state.js
import { readFileSync as readFileSync10, writeFileSync as writeFileSync5, writeSync, mkdirSync as mkdirSync7, existsSync as existsSync3, unlinkSync as unlinkSync4, openSync as openSync3, closeSync as closeSync3, statSync as statSync4 } from "node:fs";
import { homedir as homedir8 } from "node:os";
import { join as join11 } from "node:path";
var dlog2 = (msg) => log("summary-state", msg);
var STATE_DIR = join11(homedir8(), ".claude", "hooks", "summary-state");
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
function statePath(sessionId) {
  return join11(STATE_DIR, `${sessionId}.json`);
}
function lockPath2(sessionId) {
  return join11(STATE_DIR, `${sessionId}.lock`);
}
function readState(sessionId) {
  const p = statePath(sessionId);
  if (!existsSync3(p))
    return null;
  try {
    return JSON.parse(readFileSync10(p, "utf-8"));
  } catch {
    return null;
  }
}
function writeState(sessionId, state) {
  mkdirSync7(STATE_DIR, { recursive: true });
  const p = statePath(sessionId);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync5(tmp, JSON.stringify(state));
  renameAtomic(tmp, p);
}
function withRmwLock(sessionId, fn) {
  mkdirSync7(STATE_DIR, { recursive: true });
  const rmwLock = statePath(sessionId) + ".rmw";
  const deadline = Date.now() + 2e3;
  let fd = null;
  while (fd === null) {
    try {
      fd = openSync3(rmwLock, "wx");
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      if (Date.now() > deadline) {
        dlog2(`rmw lock deadline exceeded for ${sessionId}, reclaiming stale lock`);
        try {
          unlinkSync4(rmwLock);
        } catch (unlinkErr) {
          dlog2(`stale rmw lock unlink failed for ${sessionId}: ${unlinkErr.message}`);
        }
        continue;
      }
      Atomics.wait(YIELD_BUF, 0, 0, 10);
    }
  }
  try {
    return fn();
  } finally {
    closeSync3(fd);
    try {
      unlinkSync4(rmwLock);
    } catch (unlinkErr) {
      dlog2(`rmw lock cleanup failed for ${sessionId}: ${unlinkErr.message}`);
    }
  }
}
function markSummaryAttempt(sessionId) {
  withRmwLock(sessionId, () => {
    const prev = readState(sessionId);
    writeState(sessionId, {
      lastSummaryAt: prev?.lastSummaryAt ?? Date.now(),
      lastSummaryCount: prev?.lastSummaryCount ?? 0,
      totalCount: prev?.totalCount ?? 0,
      lastAttemptAt: Date.now(),
      attemptsSinceSuccess: (prev?.attemptsSinceSuccess ?? 0) + 1
    });
  });
}
function tryAcquireLock(sessionId, maxAgeMs = 10 * 60 * 1e3) {
  mkdirSync7(STATE_DIR, { recursive: true });
  const p = lockPath2(sessionId);
  if (existsSync3(p)) {
    try {
      const ageMs = Date.now() - parseInt(readFileSync10(p, "utf-8"), 10);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMs)
        return false;
    } catch (readErr) {
      dlog2(`lock file unreadable for ${sessionId}, treating as stale: ${readErr.message}`);
    }
    try {
      unlinkSync4(p);
    } catch (unlinkErr) {
      dlog2(`could not unlink stale lock for ${sessionId}: ${unlinkErr.message}`);
      return false;
    }
  }
  try {
    const fd = openSync3(p, "wx");
    try {
      writeSync(fd, String(Date.now()));
    } finally {
      closeSync3(fd);
    }
    return true;
  } catch (e) {
    if (e.code === "EEXIST")
      return false;
    throw e;
  }
}
function releaseLock(sessionId) {
  try {
    unlinkSync4(lockPath2(sessionId));
  } catch (e) {
    if (e?.code !== "ENOENT") {
      dlog2(`releaseLock unlink failed for ${sessionId}: ${e.message}`);
    }
  }
}

// dist/src/hooks/spawn-wiki-worker.js
import { fileURLToPath } from "node:url";
import { dirname as dirname4, join as join14 } from "node:path";
import { writeFileSync as writeFileSync6, mkdirSync as mkdirSync9 } from "node:fs";
import { homedir as homedir10, tmpdir as tmpdir2 } from "node:os";

// dist/src/utils/wiki-log.js
import { mkdirSync as mkdirSync8, appendFileSync as appendFileSync3 } from "node:fs";
import { join as join12 } from "node:path";
function makeWikiLogger(hooksDir, filename = "deeplake-wiki.log") {
  const path = join12(hooksDir, filename);
  return {
    path,
    log(msg) {
      try {
        mkdirSync8(hooksDir, { recursive: true });
        appendFileSync3(path, `[${utcTimestamp()}] ${msg}
`);
      } catch {
      }
    }
  };
}

// dist/src/utils/spawn-detached.js
import { spawn as nodeSpawn } from "node:child_process";
function spawnDetachedNodeWorker(workerPath, args = [], deps = {}) {
  const spawn = deps.spawn ?? nodeSpawn;
  const execPath = deps.execPath ?? process.execPath;
  try {
    const child = spawn(execPath, [workerPath, ...args], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      // Suppress the transient console window Windows would otherwise pop for
      // the detached worker. No-op on POSIX.
      windowsHide: true
    });
    child.on("error", () => {
    });
    child.unref();
  } catch {
  }
}

// dist/src/utils/resolve-cli-bin.js
import { execFileSync } from "node:child_process";
import { homedir as homedir9 } from "node:os";
import { join as join13 } from "node:path";
function resolveCliBin(cli, fallback) {
  const isWin = process.platform === "win32";
  try {
    const out = execFileSync(isWin ? "where" : "which", [cli], {
      encoding: "utf-8",
      // CREATE_NO_WINDOW. Reached from detached background workers, which
      // have no console to inherit, so where.exe would otherwise allocate a
      // visible one. No-op on POSIX.
      windowsHide: true
    });
    const matches = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (matches.length > 0) {
      if (!isWin)
        return matches[0];
      return matches.find((m) => m.toLowerCase().endsWith(".exe")) ?? matches.find((m) => /\.(cmd|bat)$/i.test(m)) ?? matches[0];
    }
  } catch {
  }
  if (fallback !== void 0)
    return fallback;
  const local = join13(homedir9(), ".claude", "local", cli);
  return isWin ? `${local}.cmd` : local;
}

// dist/src/hooks/spawn-wiki-worker.js
var HOME = homedir10();
var wikiLogger = makeWikiLogger(join14(HOME, ".claude", "hooks"));
var WIKI_LOG = wikiLogger.path;
var WIKI_PROMPT_TEMPLATE = `You are building a personal wiki from a coding session. Your goal is to extract every piece of knowledge \u2014 entities, decisions, relationships, and facts \u2014 into a structured, searchable wiki entry. Think of this as building a knowledge graph, not writing a summary.

SESSION JSONL path: __JSONL__
SUMMARY FILE to write: __SUMMARY__
SESSION ID: __SESSION_ID__
PROJECT: __PROJECT__
PREVIOUS JSONL OFFSET (lines already processed): __PREV_OFFSET__
CURRENT JSONL LINES: __JSONL_LINES__

Steps:
1. Read the session JSONL at the path above.
   - If PREVIOUS JSONL OFFSET > 0, this is a resumed session. Read the existing summary file first,
     then focus on lines AFTER the offset for new content. Merge new facts into the existing summary.
   - If offset is 0, generate from scratch.

2. Write the summary file at the path above with this EXACT format. The header fields (Source, Project) are pre-filled \u2014 copy them VERBATIM, do NOT replace them with paths from the JSONL content:

# Session __SESSION_ID__
- **Source**: __JSONL_SERVER_PATH__
- **Started**: <extract from JSONL>
- **Ended**: <now>
- **Project**: __PROJECT__
- **JSONL offset**: __JSONL_LINES__

## What Happened
<2-3 dense sentences. What was the goal, what was accomplished, what's left. Preserve VERBATIM any precise, non-derivable identifier that defines the work \u2014 exact token/key/secret-name values, version numbers, error codes/sqlstates, table/branch/file names, commit SHAs, config keys and their chosen values. If the session established a specific value (e.g. a token "QX7341-ZULU-STAGING", a flag set to 0, a threshold of 0.5), write that EXACT value here, not a paraphrase of it. A future reader must be able to answer "what was the value?" from this section alone.>

## People
<For each person mentioned: name, role, what they did/said. Format: **Name** \u2014 role \u2014 action>

## Entities
<Every named thing: repos, branches, files, APIs, tools, services, tables, features, bugs.
Format: **entity** (type) \u2014 what was done with it, its current state>

## Decisions & Reasoning
<Every decision made and WHY. Not just "did X" but "did X because Y, considered Z but rejected it because W">

## Key Facts
<Bullet list of atomic facts that could answer future questions. Each fact should stand alone and include the EXACT, VERBATIM value where one exists \u2014 never replace a concrete identifier/value with a vague gist. Quote literal values inline.
Examples:
"- The memory table uses DELETE+INSERT, not UPDATE (WASM doesn't support upsert)"
"- The staging verification token is QX7341-ZULU-STAGING (set in config key auth.staging_token)"
"- DEEPLAKE_SNAPSHOT_RESTORE_ON_CLAIM was flipped from 1 to 0 to stop the eviction race">

## Errors & Fixes
<For each error the session hit AND resolved: one bullet with the error line quoted VERBATIM as the tool printed it (no paths, no secrets), then its root cause, then the fix. Format: "- '<exact error line>' \u2014 cause: <why> \u2014 fix: <what resolved it>". Only errors that were actually fixed; if none, write: none>

## Files Modified
<bullet list: path (new/modified/deleted) \u2014 what changed>

## Open Questions / TODO
<Anything unresolved, blocked, or explicitly deferred>

## Next Steps
<Decide in two steps. STEP 1 \u2014 is the work this session set out to do actually finished? If it ended mid-task \u2014 a feature only half-implemented, a build or test still failing, a fix written but not yet verified, a plan agreed but not executed, a blocker hit and unresolved, or an explicit "still need to.../next I'll..." left hanging \u2014 then it is NOT finished and you MUST write a single concrete imperative line naming the unfinished work (e.g. "Finish wiring the uint32 class_label scan binding and run its test"). The session's LAST messages are the strongest signal: if they describe or show work still in progress or something left to do, that IS the next step \u2014 never suppress a genuinely unfinished task, and do not demand "substantial consequences" for it. STEP 2 \u2014 if the core work IS finished, default to exactly: none and do not invent a follow-up to fill the section. Write none when the work reached a natural stopping point, only trivial/obvious/optional polish or cleanup remains, the "next step" would just be open-ended exploration, or the only thing left is administrative wrap-up (committing, pushing, opening/merging a PR, deploying, monitoring CI \u2014 treat ALL such wrap-up as ALREADY DONE). The sole exception that still warrants a next step on otherwise-finished work is a separate, important, non-obvious item a returning engineer would NOT realize on their own and would be materially harmed by missing.>

IMPORTANT: Be exhaustive. Extract EVERY entity, decision, and fact. Future you will search this wiki to answer questions like "who worked on X", "why did we choose Y", "what's the status of Z". If a detail exists in the session, it should be in the wiki.

PRIVACY: Never include absolute filesystem paths (e.g. /home/user/..., /Users/..., C:\\\\...) in the summary. Use only project-relative paths or the project name. The Source and Project fields above are already correct \u2014 do not change them.

LENGTH LIMIT: Keep the total summary under 4000 characters. Be dense and concise \u2014 prioritize facts over prose. If a session is short, the summary should be short too.`;
var wikiLog = wikiLogger.log;
function findClaudeBin() {
  return resolveCliBin("claude");
}
function spawnWikiWorker(opts) {
  const { config, sessionId, cwd, bundleDir, reason } = opts;
  const projectName = projectNameFromCwd(cwd);
  const tmpDir = join14(tmpdir2(), `deeplake-wiki-${sessionId}-${Date.now()}`);
  mkdirSync9(tmpDir, { recursive: true });
  const pluginVersion = getInstalledVersion(bundleDir, ".claude-plugin") ?? "";
  const configFile = join14(tmpDir, "config.json");
  writeFileSync6(configFile, JSON.stringify({
    apiUrl: config.apiUrl,
    token: config.token,
    orgId: config.orgId,
    workspaceId: config.workspaceId,
    memoryTable: config.tableName,
    sessionsTable: config.sessionsTableName,
    sessionId,
    userName: config.userName,
    orgName: config.orgName,
    project: projectName,
    agent: opts.agent ?? "claude_code",
    pluginVersion,
    tmpDir,
    claudeBin: findClaudeBin(),
    wikiLog: WIKI_LOG,
    hooksDir: join14(HOME, ".claude", "hooks"),
    promptTemplate: WIKI_PROMPT_TEMPLATE
  }));
  wikiLog(`${reason}: spawning summary worker for ${sessionId}`);
  const workerPath = join14(bundleDir, "wiki-worker.js");
  spawnDetachedNodeWorker(workerPath, [configFile]);
  wikiLog(`${reason}: spawned summary worker for ${sessionId}`);
}

// dist/src/capture-recovery/recover.js
import { createReadStream, readdirSync as readdirSync2, statSync as statSync5, openSync as openSync4, readSync, closeSync as closeSync4, existsSync as existsSync4 } from "node:fs";
import { createInterface } from "node:readline";
import { join as join15 } from "node:path";
import { homedir as homedir11 } from "node:os";

// dist/src/capture-recovery/transcript.js
import { createHash } from "node:crypto";
function recoveredEventId(sessionId, key) {
  const h = createHash("sha256").update(`hivemind-recovery:${sessionId}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
var blocks = (c) => Array.isArray(c) ? c : [];
function blockText(c) {
  if (typeof c === "string")
    return c;
  return blocks(c).filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
}
function promptText(r) {
  if (r.isMeta || r.isCompactSummary || r.isSidechain)
    return null;
  const c = r.message?.content;
  if (Array.isArray(c) && blocks(c).some((b) => b?.type === "tool_result"))
    return null;
  const text = blockText(c).trim();
  if (!text)
    return null;
  if (/^<(local-command-|command-name>|command-message>|bash-(input|stdout|stderr)>)/.test(text))
    return null;
  return text;
}
function toolResponse(r, b) {
  const failed = b.is_error === true;
  const tur = r.toolUseResult;
  if (tur && typeof tur === "object")
    return { failed, response: tur };
  const text = typeof tur === "string" ? tur : blockText(b.content) || (typeof b.content === "string" ? b.content : "");
  return { failed, response: failed ? { error: text } : { content: text } };
}
var isCaptureHookFailure = (r) => r.type === "attachment" && /hook.*error/i.test(r.attachment?.type ?? "") && /bundle[\\/]capture\.js/.test(r.attachment?.command ?? "");
function transcriptEvents(lines, sessionId, sinceMs) {
  let captureHookFailed = false;
  const out = [];
  const pending = /* @__PURE__ */ new Map();
  const replies = /* @__PURE__ */ new Map();
  const after = (ts) => {
    const t = ts ? Date.parse(ts) : NaN;
    return Number.isFinite(t) && t > sinceMs;
  };
  for (const line of lines) {
    if (!line || line.charCodeAt(0) !== 123)
      continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.isSidechain)
      continue;
    if (isCaptureHookFailure(r) && after(r.timestamp)) {
      captureHookFailed = true;
      continue;
    }
    if (r.type === "assistant") {
      const m = r.message;
      for (const b of blocks(m?.content)) {
        if (b?.type === "tool_use" && b.id && b.name) {
          pending.set(b.id, { name: b.name, input: b.input, ts: r.timestamp ?? "", cwd: r.cwd });
        }
      }
      const mid = m?.id ?? r.uuid;
      if (!mid)
        continue;
      const text = blockText(m?.content);
      const cur = replies.get(mid) ?? { text: [], ts: r.timestamp ?? "", model: m?.model, cwd: r.cwd, ended: false };
      if (text)
        cur.text.push(text);
      if (r.timestamp)
        cur.ts = r.timestamp;
      if (m?.stop_reason === "end_turn")
        cur.ended = true;
      replies.set(mid, cur);
      if (cur.ended && cur.text.length && after(cur.ts)) {
        out.push({
          id: recoveredEventId(sessionId, `reply:${mid}`),
          ts: cur.ts,
          hookEvent: "Stop",
          cwd: cur.cwd,
          body: { type: "assistant_message", content: cur.text.join("\n"), ...cur.model ? { model: cur.model } : {} }
        });
      }
      continue;
    }
    if (r.type !== "user")
      continue;
    const c = r.message?.content;
    for (const b of blocks(c)) {
      if (b?.type !== "tool_result" || !b.tool_use_id)
        continue;
      const call = pending.get(b.tool_use_id);
      pending.delete(b.tool_use_id);
      if (!call || !after(r.timestamp))
        continue;
      const { failed, response } = toolResponse(r, b);
      out.push({
        id: recoveredEventId(sessionId, `tool:${b.tool_use_id}`),
        ts: r.timestamp,
        hookEvent: failed ? "PostToolUseFailure" : "PostToolUse",
        cwd: r.cwd ?? call.cwd,
        body: {
          type: "tool_call",
          tool_name: call.name,
          tool_use_id: b.tool_use_id,
          tool_input: JSON.stringify(call.input),
          tool_response: JSON.stringify(response)
        }
      });
    }
    const prompt = promptText(r);
    if (prompt !== null && after(r.timestamp)) {
      out.push({
        id: recoveredEventId(sessionId, `prompt:${r.uuid ?? r.timestamp}`),
        ts: r.timestamp,
        hookEvent: "UserPromptSubmit",
        cwd: r.cwd,
        body: { type: "user_message", content: prompt }
      });
    }
  }
  const byId = /* @__PURE__ */ new Map();
  for (const e of out)
    byId.set(e.id, e);
  return { events: [...byId.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)), captureHookFailed };
}

// dist/src/capture-recovery/recover.js
var CLAUDE_EVENTS = /* @__PURE__ */ new Set(["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop", "SubagentStop"]);
var DEFAULT_MIN_IDLE_MS = 20 * 6e4;
var DEFAULT_MAX_AGE_MS = 14 * 864e5;
var DEFAULT_MAX_EVENTS = 3e3;
function readLastLine(path, chunk = 64 * 1024) {
  let fd;
  try {
    fd = openSync4(path, "r");
  } catch {
    return null;
  }
  try {
    const size = statSyncSafe(path)?.size ?? 0;
    let pos = size;
    let tail = "";
    while (pos > 0) {
      const len = Math.min(chunk, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, pos);
      tail = buf.toString("utf-8") + tail;
      const trimmed = tail.replace(/\n+$/, "");
      const nl = trimmed.lastIndexOf("\n");
      if (nl >= 0)
        return trimmed.slice(nl + 1);
      if (pos === 0)
        return trimmed || null;
    }
    return null;
  } finally {
    closeSync4(fd);
  }
}
function statSyncSafe(path) {
  try {
    return statSync5(path);
  } catch {
    return null;
  }
}
function claudeConfigRoots(env = process.env) {
  const roots = [env.CLAUDE_CONFIG_DIR, join15(homedir11(), ".claude")].filter((r) => !!r);
  return [...new Set(roots)];
}
function indexTranscripts(roots) {
  const out = /* @__PURE__ */ new Map();
  for (const root of roots) {
    const projects = join15(root, "projects");
    let dirs;
    try {
      dirs = readdirSync2(projects);
    } catch {
      continue;
    }
    for (const d of dirs) {
      let files;
      try {
        files = readdirSync2(join15(projects, d));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl"))
          continue;
        const id = f.slice(0, -".jsonl".length);
        if (!out.has(id))
          out.set(id, join15(projects, d, f));
      }
    }
  }
  return out;
}
function findCaptureGaps(opts) {
  const now = opts.now ?? Date.now();
  const minIdle = opts.minIdleMs ?? DEFAULT_MIN_IDLE_MS;
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  let names;
  try {
    names = readdirSync2(opts.cacheDir);
  } catch {
    return [];
  }
  const gaps = [];
  let transcripts = opts.transcripts;
  for (const name of names) {
    if (!name.endsWith(".jsonl"))
      continue;
    const sessionId = name.slice(0, -".jsonl".length);
    if (sessionId === opts.skipSessionId)
      continue;
    const cachePath = join15(opts.cacheDir, name);
    const st = statSyncSafe(cachePath);
    if (!st)
      continue;
    const idle = now - st.mtimeMs;
    if (idle < minIdle || idle > maxAge)
      continue;
    const last = readLastLine(cachePath);
    if (!last)
      continue;
    let e;
    try {
      e = JSON.parse(last);
    } catch {
      continue;
    }
    if (!CLAUDE_EVENTS.has(String(e.hook_event_name ?? "")))
      continue;
    const capturedMs = Date.parse(String(e.timestamp ?? ""));
    if (!Number.isFinite(capturedMs))
      continue;
    const lastCapturedMs = Math.max(capturedMs, opts.floors?.[sessionId] ?? 0);
    transcripts ??= indexTranscripts(claudeConfigRoots());
    const hinted = typeof e.transcript_path === "string" && !e.transcript_path.includes("*") ? e.transcript_path : "";
    const transcriptPath = transcripts.get(sessionId) ?? hinted;
    if (!transcriptPath)
      continue;
    const tst = statSyncSafe(transcriptPath);
    if (!tst || tst.mtimeMs <= lastCapturedMs + 1e3)
      continue;
    const cwd = typeof e.cwd === "string" && !e.cwd.includes("*") ? e.cwd : "";
    gaps.push({ sessionId, transcriptPath, cwd, lastCapturedMs });
  }
  return gaps;
}
function recoveredEntry(sessionId, gap, ev) {
  return {
    id: ev.id,
    session_id: sessionId,
    transcript_path: gap.transcriptPath,
    cwd: ev.cwd ?? gap.cwd,
    hook_event_name: ev.hookEvent,
    timestamp: ev.ts,
    ...ev.body,
    recovered: true
  };
}
async function readGapEvents(gap) {
  if (!existsSync4(gap.transcriptPath))
    return { events: [], captureHookFailed: false };
  const rl = createInterface({ input: createReadStream(gap.transcriptPath, { encoding: "utf-8" }), crlfDelay: Infinity });
  const lines = [];
  for await (const line of rl)
    lines.push(line);
  return transcriptEvents(lines, gap.sessionId, gap.lastCapturedMs);
}
async function recoverCaptureGaps(gaps, deps) {
  const log5 = deps.log ?? (() => {
  });
  const max = deps.maxEvents ?? DEFAULT_MAX_EVENTS;
  const res = { sessions: 0, events: 0, failed: 0, bySession: [] };
  for (const gap of gaps) {
    let found;
    try {
      found = await readGapEvents(gap);
    } catch (e) {
      log5(`read failed session=${gap.sessionId}: ${e?.message ?? e}`);
      res.failed++;
      continue;
    }
    const { events } = found;
    if (events.length === 0)
      continue;
    if (!found.captureHookFailed) {
      log5(`skipped session=${gap.sessionId}: ${events.length} uncaptured events but no failed capture hook (left as is)`);
      continue;
    }
    if (deps.accept && !deps.accept(gap, events)) {
      log5(`skipped session=${gap.sessionId} (capture not allowed for its directory)`);
      deps.onSkipped?.(gap, Date.parse(events[events.length - 1].ts));
      continue;
    }
    let written = 0;
    for (const ev of events.slice(0, max)) {
      try {
        await deps.writeEvent(gap, ev);
        written++;
      } catch (e) {
        log5(`write failed session=${gap.sessionId} after ${written}: ${e?.message ?? e}`);
        res.failed++;
        break;
      }
    }
    if (written > 0) {
      res.sessions++;
      res.events += written;
      res.bySession.push({ sessionId: gap.sessionId, events: written });
      deps.onRecovered?.(gap, written);
    }
    log5(`session=${gap.sessionId} gap_since=${new Date(gap.lastCapturedMs).toISOString()} found=${events.length} written=${written}`);
  }
  return res;
}

// dist/src/capture-recovery/trigger.js
import { mkdirSync as mkdirSync10, statSync as statSync6, writeFileSync as writeFileSync7 } from "node:fs";
import { homedir as homedir12 } from "node:os";
import { join as join16 } from "node:path";
var RECOVERY_INTERVAL_MS = 30 * 6e4;
function recoveryStateDir() {
  return process.env.HIVEMIND_CAPTURE_RECOVERY_STATE_DIR ?? join16(homedir12(), ".deeplake", "state", "capture-recovery");
}
function captureRecoveryDisabled(env = process.env) {
  return env.HIVEMIND_CAPTURE_RECOVERY === "false" || env.HIVEMIND_CAPTURE === "false";
}

// dist/src/hooks/capture-recovery-worker.js
var log4 = (msg) => log("capture-recovery", msg);
var __bundleDir = dirname5(fileURLToPath2(import.meta.url));
var PLUGIN_VERSION = getInstalledVersion(__bundleDir, ".claude-plugin") ?? "";
async function main() {
  if (captureRecoveryDisabled() || !isHivemindPluginEnabled())
    return;
  const currentSession = process.argv[2] ?? "";
  const cacheDir = dirname5(sessionEventCachePath("x"));
  const floorsPath = join17(recoveryStateDir(), "skipped.json");
  let floors = {};
  try {
    floors = JSON.parse(readFileSync11(floorsPath, "utf-8"));
  } catch {
  }
  const gaps = findCaptureGaps({ cacheDir, skipSessionId: currentSession, floors });
  if (gaps.length === 0)
    return;
  const release = acquireSyncLock(recoveryStateDir());
  if (!release) {
    log4("another recovery is running");
    return;
  }
  try {
    const configs = /* @__PURE__ */ new Map();
    const configFor = (cwd) => {
      if (!configs.has(cwd))
        configs.set(cwd, resolveCaptureConfig(cwd, log4));
      return configs.get(cwd) ?? null;
    };
    const apis = /* @__PURE__ */ new Map();
    const apiFor = (c) => {
      const k = `${c.orgId}/${c.workspaceId}/${c.sessionsTableName}`;
      if (!apis.has(k))
        apis.set(k, new DeeplakeApi(c.token, c.apiUrl, c.orgId, c.workspaceId, c.sessionsTableName));
      return apis.get(k);
    };
    const r = await recoverCaptureGaps(gaps, {
      log: log4,
      // The session's directory comes from its transcript (the cached cwd may
      // be redacted); the per-directory opt-out and routing apply as in capture.
      accept: (gap, events) => {
        gap.cwd = [...events].reverse().find((e) => e.cwd)?.cwd ?? gap.cwd;
        return configFor(gap.cwd) !== null;
      },
      writeEvent: async (gap, ev) => {
        const config = configFor(gap.cwd);
        const line = redactSecrets(JSON.stringify(recoveredEntry(gap.sessionId, gap, ev)));
        const sessionPath = buildSessionPath(config, gap.sessionId);
        await apiFor(config).query(buildDirectSessionInsertSql(config.sessionsTableName, {
          id: ev.id,
          sessionPath,
          filename: sessionPath.split("/").pop() ?? "",
          jsonForSql: line.replace(/'/g, "''"),
          embeddingSql: "NULL",
          userName: config.userName,
          sizeBytes: Buffer.byteLength(line, "utf-8"),
          projectName: projectNameFromCwd(ev.cwd ?? gap.cwd),
          description: ev.hookEvent,
          agent: "claude_code",
          pluginVersion: PLUGIN_VERSION,
          timestamp: ev.ts
        }));
        appendSessionEvent(gap.sessionId, line);
      },
      onSkipped: (gap, uptoMs) => {
        floors[gap.sessionId] = uptoMs;
        try {
          mkdirSync11(recoveryStateDir(), { recursive: true });
          writeFileSync8(floorsPath, JSON.stringify(floors));
        } catch (e) {
          log4(`could not record skip: ${e?.message ?? e}`);
        }
      },
      onRecovered: (gap) => refreshSummary(gap, configFor(gap.cwd))
    });
    log4(`done sessions=${r.sessions} events=${r.events} failed=${r.failed}`);
    if (r.events > 0) {
      await enqueueNotification({
        id: "capture-recovered",
        severity: "info",
        title: `Hivemind recovered ${r.events} uncaptured event${r.events === 1 ? "" : "s"}`,
        body: `${r.sessions} session${r.sessions === 1 ? "" : "s"} kept running after Claude Code removed the plugin version ${r.sessions === 1 ? "it was" : "they were"} started with, so ${r.sessions === 1 ? "its" : "their"} capture had stopped. The missing prompts, tool calls and replies were uploaded from the local transcript. Restart long-running sessions after a Hivemind update to keep live capture.`,
        dedupKey: { sessions: r.bySession.map((s) => s.sessionId).sort(), events: r.events, at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 13) },
        userVisibleOnly: true
      }).catch(() => void 0);
    }
  } finally {
    release();
  }
}
function refreshSummary(gap, config) {
  if (!tryAcquireLock(gap.sessionId))
    return;
  try {
    markSummaryAttempt(gap.sessionId);
    spawnWikiWorker({ config, sessionId: gap.sessionId, cwd: gap.cwd, bundleDir: __bundleDir, reason: "Recovered" });
  } catch (e) {
    log4(`summary spawn failed: ${e?.message ?? e}`);
    try {
      releaseLock(gap.sessionId);
    } catch {
    }
  }
}
main().catch((e) => {
  log4(`fatal: ${e?.message ?? e}`);
  process.exit(0);
});
