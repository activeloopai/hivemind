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

// dist/src/utils/stdin.js
function readStdin() {
  return new Promise((resolve4, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => {
      try {
        resolve4(JSON.parse(data));
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
import { dirname, join as join2, resolve } from "node:path";
var DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"];
function findDirConfig(startDir, stopAt) {
  let dir = resolve(startDir);
  const boundary = stopAt ? resolve(stopAt) : null;
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

// dist/src/hooks/shared/dir-gate.js
function resolveCaptureConfig(cwd, log8) {
  const base = loadConfig();
  if (!base) {
    log8("no config");
    return null;
  }
  const effCwd = cwd || process.cwd();
  const resolved = resolveDirConfig(base, effCwd);
  if (!resolved.collect) {
    log8(`capture disabled for cwd=${effCwd} via ${resolved.found?.path}`);
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
  {
    re: new RegExp(`((?:${SECRET_KEY_WORDS})(?![A-Za-z0-9])["']?\\s*[:=]\\s*["']?)([^\\s"',;{}()\\[\\]]{1,})`, "gi"),
    replace: (match, keep, value) => NON_SECRET_VALUE.test(value) ? match : `${keep}${MASK}`
  },
  // CLI-flag form: `--password VALUE` / `-p=VALUE`.
  {
    re: /(--?(?:password|passwd|pwd|token|secret|api[_-]?key)[\s=]+)(["']?)([^\s"']{1,})/gi,
    replace: (match, keep, quote, value) => NON_SECRET_VALUE.test(value) ? match : `${keep}${quote}${MASK}`
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
function redactSecrets(text) {
  if (!text)
    return text;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, rule.replace);
  }
  return out;
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
function utcTimestamp(d = /* @__PURE__ */ new Date()) {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
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
import { join as join4, resolve as resolve3 } from "node:path";
import { homedir as homedir3 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve as resolve2, relative, isAbsolute } from "node:path";
function isPathInsideHome(path2, home) {
  const r = resolve2(path2);
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
function _isQueuePathInsideHome(path2, home) {
  return isPathInsideHome(path2, home);
}
function writeQueue(q) {
  const path2 = queuePath();
  const home = resolve3(homedir3());
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

// dist/src/utils/project-name.js
import { basename } from "node:path";
function projectNameFromCwd(cwd) {
  return basename(cwd ?? "") || "unknown";
}

// dist/src/utils/session-path.js
function buildSessionPath(config, sessionId) {
  const workspace = config.workspaceId ?? "default";
  return `/sessions/${config.userName}/${config.userName}_${config.orgName}_${workspace}_${sessionId}.jsonl`;
}

// dist/src/notifications/model-usage.js
import { closeSync as closeSync2, fstatSync, openSync as openSync2, readFileSync as readFileSync6, readSync } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join7 } from "node:path";
var log4 = (msg) => log("model-usage", msg);
function toNum(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : void 0;
}
function toFloat(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0;
}
function assign(target, key, v) {
  const n = toNum(v);
  if (n !== void 0)
    target[key] = n;
}
function readWindowLines(fd, size, maxBytes) {
  if (size <= maxBytes) {
    const buf2 = Buffer.alloc(size);
    const n2 = size > 0 ? readSync(fd, buf2, 0, size, 0) : 0;
    return buf2.toString("utf-8", 0, n2).split("\n");
  }
  const start = size - maxBytes - 1;
  const buf = Buffer.alloc(maxBytes + 1);
  const n = readSync(fd, buf, 0, maxBytes + 1, start);
  const text = buf.toString("utf-8", 0, n);
  const nl = text.indexOf("\n");
  return (nl >= 0 ? text.slice(nl + 1) : "").split("\n");
}
function openTranscript(path2, window = 1048576) {
  if (!path2)
    return null;
  let fd;
  try {
    fd = openSync2(path2, "r");
  } catch (e) {
    log4(`open failed (${path2}): ${e?.message ?? String(e)}`);
    return null;
  }
  let size;
  try {
    size = fstatSync(fd).size;
  } catch (e) {
    try {
      closeSync2(fd);
    } catch {
    }
    log4(`stat failed: ${e?.message ?? String(e)}`);
    return null;
  }
  const read = (maxBytes) => {
    try {
      return readWindowLines(fd, size, maxBytes);
    } catch (e) {
      log4(`read failed: ${e?.message ?? String(e)}`);
      return [];
    }
  };
  let wholeCache;
  return {
    lines: read(window),
    readWhole: () => wholeCache ??= read(Number.MAX_SAFE_INTEGER),
    close: () => {
      try {
        closeSync2(fd);
      } catch {
      }
    }
  };
}
function codexUsageExtra(info, rateLimits) {
  const extra = {};
  const win = toNum(info?.model_context_window);
  if (win !== void 0)
    extra.model_context_window = win;
  const pickWin = (w) => {
    if (!w || typeof w !== "object")
      return void 0;
    const o = {};
    const up = toFloat(w.used_percent);
    if (up !== void 0)
      o.used_percent = up;
    const wm = toNum(w.window_minutes);
    if (wm !== void 0)
      o.window_minutes = wm;
    const ra = toNum(w.resets_at);
    if (ra !== void 0)
      o.resets_at = ra;
    return Object.keys(o).length ? o : void 0;
  };
  const primary = pickWin(rateLimits?.primary);
  const secondary = pickWin(rateLimits?.secondary);
  if (primary || secondary) {
    const rl = {};
    if (primary)
      rl.primary = primary;
    if (secondary)
      rl.secondary = secondary;
    extra.rate_limits = rl;
  }
  return Object.keys(extra).length > 0 ? extra : void 0;
}
function normalizeCodexUsage(u) {
  const out = {};
  assign(out, "input_tokens", u.input_tokens);
  assign(out, "output_tokens", u.output_tokens);
  assign(out, "cache_read_tokens", u.cached_input_tokens);
  assign(out, "reasoning_output_tokens", u.reasoning_output_tokens);
  assign(out, "total_tokens", u.total_tokens);
  return out;
}
function scanCodexLines(lines, fallbackModel) {
  let model = fallbackModel;
  let reasoningEffort;
  let last;
  let total;
  let extra;
  let sawTurnContext = false;
  let sawTokenCount = false;
  if (lines) {
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed)
        continue;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!entry || typeof entry !== "object")
        continue;
      const p = entry.payload;
      if (!p)
        continue;
      if (entry.type === "turn_context") {
        sawTurnContext = true;
        model = typeof p.model === "string" ? p.model : fallbackModel;
        reasoningEffort = typeof p.effort === "string" ? p.effort : void 0;
        last = void 0;
        extra = void 0;
      } else if (p.type === "token_count" && p.info) {
        sawTokenCount = true;
        if (p.info.last_token_usage)
          last = normalizeCodexUsage(p.info.last_token_usage);
        if (p.info.total_token_usage)
          total = normalizeCodexUsage(p.info.total_token_usage);
        extra = codexUsageExtra(p.info, p.rate_limits);
      }
    }
  }
  const empty = model === void 0 && reasoningEffort === void 0 && !last && !total && !extra;
  if (empty)
    return { meta: null, sawTurnContext, sawTokenCount };
  const meta = {};
  if (model !== void 0)
    meta.model = model;
  if (reasoningEffort !== void 0)
    meta.reasoning_effort = reasoningEffort;
  if (last)
    meta.token_usage = last;
  if (total)
    meta.token_usage_total = total;
  if (extra)
    meta.usage_extra = extra;
  return { meta, sawTurnContext, sawTokenCount };
}
function parseCodexTurnMeta(transcriptPath, fallbackModel) {
  if (!transcriptPath)
    return scanCodexLines(null, fallbackModel).meta;
  const r = openTranscript(transcriptPath);
  if (!r)
    return scanCodexLines(null, fallbackModel).meta;
  try {
    const tail = scanCodexLines(r.lines, fallbackModel);
    if (tail.sawTurnContext && tail.sawTokenCount && tail.meta?.token_usage_total !== void 0) {
      return tail.meta;
    }
    const whole = scanCodexLines(r.readWhole(), fallbackModel);
    if (!whole.sawTurnContext && !whole.sawTokenCount)
      return tail.meta;
    return whole.meta ?? tail.meta;
  } finally {
    r.close();
  }
}

// dist/src/embeddings/client.js
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { openSync as openSync3, closeSync as closeSync3, writeSync, unlinkSync as unlinkSync3, existsSync as existsSync3, readFileSync as readFileSync7 } from "node:fs";
import { homedir as homedir6 } from "node:os";
import { join as join8 } from "node:path";

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
var SHARED_DAEMON_PATH = join8(homedir6(), ".hivemind", "embed-deps", "embed-daemon.js");
var log5 = (m) => log("embed-client", m);
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
        log5(`embed err: ${err}`);
        if (isTransformersMissingError(err)) {
          this.handleTransformersMissing(err);
        }
        return null;
      }
      return resp.embedding;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log5(`embed failed: ${err}`);
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
      log5(`hello probe failed (inconclusive, will retry next connect): ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    const hello = resp;
    if (_recycledStuckDaemon) {
      return false;
    }
    if (!hello.daemonPath) {
      _recycledStuckDaemon = true;
      log5(`daemon does not implement hello (older protocol); recycling`);
      this.recycleDaemon(hello.pid);
      return true;
    }
    if (hello.daemonPath !== this.daemonEntry && !existsSync3(hello.daemonPath)) {
      _recycledStuckDaemon = true;
      log5(`daemon path no longer on disk \u2014 running=${hello.daemonPath} (gone) expected=${this.daemonEntry}; recycling`);
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
        pid = Number.parseInt(readFileSync7(this.pidPath, "utf-8").trim(), 10);
      } catch {
      }
    }
    if (Number.isFinite(pid) && pid !== null && pid > 0 && existsSync3(this.socketPath)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    } else if (pid !== null) {
      log5(`recycle: socket gone, skipping SIGTERM on possibly-stale pid ${pid}`);
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
    return new Promise((resolve4, reject) => {
      const sock = connect(this.socketPath);
      const to = setTimeout(() => {
        sock.destroy();
        reject(new Error("connect timeout"));
      }, this.timeoutMs);
      sock.once("connect", () => {
        clearTimeout(to);
        resolve4(sock);
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
      fd = openSync3(this.pidPath, "wx", 384);
      writeSync(fd, String(process.pid));
    } catch (e) {
      if (this.isPidFileStale()) {
        try {
          unlinkSync3(this.pidPath);
        } catch {
        }
        try {
          fd = openSync3(this.pidPath, "wx", 384);
          writeSync(fd, String(process.pid));
        } catch {
          return;
        }
      } else {
        return;
      }
    }
    if (!this.daemonEntry || !existsSync3(this.daemonEntry)) {
      log5(`daemonEntry not configured or missing: ${this.daemonEntry}`);
      try {
        closeSync3(fd);
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
      log5(`spawned daemon pid=${child.pid}`);
    } finally {
      closeSync3(fd);
    }
  }
  isPidFileStale() {
    try {
      const raw = readFileSync7(this.pidPath, "utf-8").trim();
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
    return new Promise((resolve4, reject) => {
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
          resolve4(JSON.parse(line));
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

// dist/src/embeddings/sql.js
function embeddingSqlLiteral(vec) {
  if (!vec || vec.length === 0)
    return "NULL";
  const parts = [];
  for (const v of vec) {
    if (!Number.isFinite(v))
      return "NULL";
    parts.push(String(v));
  }
  return `ARRAY[${parts.join(",")}]::float4[]`;
}

// dist/src/embeddings/disable.js
import { createRequire } from "node:module";
import { homedir as homedir8 } from "node:os";
import { join as join10 } from "node:path";
import { pathToFileURL } from "node:url";

// dist/src/user-config.js
import { existsSync as existsSync4, mkdirSync as mkdirSync5, readFileSync as readFileSync8, renameSync as renameSync2, writeFileSync as writeFileSync4 } from "node:fs";
import { homedir as homedir7 } from "node:os";
import { dirname as dirname3, join as join9 } from "node:path";
var _configPath = () => process.env.HIVEMIND_CONFIG_PATH ?? join9(homedir7(), ".deeplake", "config.json");
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
    const raw = readFileSync8(path2, "utf-8");
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
  const sharedDir = join10(homedir8(), ".hivemind", "embed-deps");
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

// dist/src/hooks/shared/session-insert-sql.js
function buildDirectSessionInsertSql(sessionsTable, p) {
  const table = sqlIdent(sessionsTable);
  const id = sqlStr(p.id);
  return `INSERT INTO "${table}" (id, path, filename, message, message_embedding, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) SELECT '${id}', '${sqlStr(p.sessionPath)}', '${sqlStr(p.filename)}', '${p.jsonForSql}'::jsonb, ${p.embeddingSql}, '${sqlStr(p.userName)}', ${p.sizeBytes}, '${sqlStr(p.projectName)}', '${sqlStr(p.description)}', '${sqlStr(p.agent)}', '${sqlStr(p.pluginVersion)}', '${sqlStr(p.timestamp)}', '${sqlStr(p.timestamp)}' WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE id = '${id}')`;
}

// dist/src/embeddings/self-heal.js
import { existsSync as existsSync5, lstatSync, mkdirSync as mkdirSync6, readlinkSync, renameSync as renameSync3, rmSync, symlinkSync, statSync as statSync2 } from "node:fs";
import { homedir as homedir9 } from "node:os";
import { basename as basename2, dirname as dirname4, join as join11 } from "node:path";
function ensurePluginNodeModulesLink(opts) {
  if (basename2(opts.bundleDir) !== "bundle") {
    return { kind: "not-bundle-layout", bundleDir: opts.bundleDir };
  }
  const target = opts.sharedNodeModules ?? join11(homedir9(), ".hivemind", "embed-deps", "node_modules");
  const pluginDir = dirname4(opts.bundleDir);
  const link = join11(pluginDir, "node_modules");
  if (!existsSync5(target)) {
    return { kind: "shared-deps-missing", target };
  }
  let linkStat;
  try {
    linkStat = lstatSync(link);
  } catch {
    return createSymlinkAtomic(target, link);
  }
  if (linkStat.isSymbolicLink()) {
    let existingTarget;
    try {
      existingTarget = readlinkSync(link);
    } catch (e) {
      return { kind: "error", detail: `readlink failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (existingTarget === target) {
      return { kind: "already-linked", target, link };
    }
    try {
      statSync2(link);
      return { kind: "linked-elsewhere", link, existingTarget };
    } catch {
      try {
        rmSync(link);
      } catch {
      }
      const recreated = createSymlinkAtomic(target, link);
      if (recreated.kind === "linked") {
        return { kind: "stale-link-removed", link, danglingTarget: existingTarget };
      }
      return recreated;
    }
  }
  return { kind: "plugin-owns-node-modules", link };
}
function createSymlinkAtomic(target, link) {
  try {
    const parent = dirname4(link);
    if (!existsSync5(parent))
      mkdirSync6(parent, { recursive: true });
    const tmp = `${link}.tmp.${process.pid}`;
    try {
      rmSync(tmp, { force: true });
    } catch {
    }
    symlinkSync(target, tmp);
    renameSync3(tmp, link);
    return { kind: "linked", target, link };
  } catch (e) {
    return { kind: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

// dist/src/hooks/codex/capture.js
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { dirname as dirname9, join as join21 } from "node:path";

// dist/src/hooks/summary-state.js
import { readFileSync as readFileSync9, writeFileSync as writeFileSync5, writeSync as writeSync2, mkdirSync as mkdirSync7, existsSync as existsSync6, unlinkSync as unlinkSync4, openSync as openSync4, closeSync as closeSync4, statSync as statSync3 } from "node:fs";
import { homedir as homedir10 } from "node:os";
import { join as join12 } from "node:path";
var dlog = (msg) => log("summary-state", msg);
var STATE_DIR = join12(homedir10(), ".claude", "hooks", "summary-state");
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
function statePath(sessionId) {
  return join12(STATE_DIR, `${sessionId}.json`);
}
function lockPath2(sessionId) {
  return join12(STATE_DIR, `${sessionId}.lock`);
}
function readState(sessionId) {
  const p = statePath(sessionId);
  if (!existsSync6(p))
    return null;
  try {
    return JSON.parse(readFileSync9(p, "utf-8"));
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
      fd = openSync4(rmwLock, "wx");
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      if (Date.now() > deadline) {
        dlog(`rmw lock deadline exceeded for ${sessionId}, reclaiming stale lock`);
        try {
          unlinkSync4(rmwLock);
        } catch (unlinkErr) {
          dlog(`stale rmw lock unlink failed for ${sessionId}: ${unlinkErr.message}`);
        }
        continue;
      }
      Atomics.wait(YIELD_BUF, 0, 0, 10);
    }
  }
  try {
    return fn();
  } finally {
    closeSync4(fd);
    try {
      unlinkSync4(rmwLock);
    } catch (unlinkErr) {
      dlog(`rmw lock cleanup failed for ${sessionId}: ${unlinkErr.message}`);
    }
  }
}
function bumpTotalCount(sessionId) {
  return withRmwLock(sessionId, () => {
    const now = Date.now();
    const existing = readState(sessionId);
    const next = existing ? { ...existing, totalCount: existing.totalCount + 1 } : { lastSummaryAt: now, lastSummaryCount: 0, totalCount: 1 };
    writeState(sessionId, next);
    return next;
  });
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
function retryBackoffMs(attemptsSinceSuccess) {
  if (attemptsSinceSuccess <= 0)
    return 0;
  const minutes = Math.min(2 ** (attemptsSinceSuccess - 1), 30);
  return minutes * 60 * 1e3;
}
function loadTriggerConfig() {
  const n = Number(process.env.HIVEMIND_SUMMARY_EVERY_N_MSGS ?? "");
  const h = Number(process.env.HIVEMIND_SUMMARY_EVERY_HOURS ?? "");
  return {
    everyNMessages: Number.isInteger(n) && n > 0 ? n : 50,
    everyHours: Number.isFinite(h) && h > 0 ? h : 2
  };
}
var FIRST_SUMMARY_AT = 10;
function shouldTrigger(state, cfg, now = Date.now()) {
  const msgsSince = state.totalCount - state.lastSummaryCount;
  const attempts = state.attemptsSinceSuccess ?? 0;
  if (attempts > 0 && now - (state.lastAttemptAt ?? 0) < retryBackoffMs(attempts))
    return false;
  if (state.lastSummaryCount === 0 && state.totalCount >= FIRST_SUMMARY_AT)
    return true;
  if (msgsSince >= cfg.everyNMessages)
    return true;
  if (msgsSince > 0 && now - state.lastSummaryAt >= cfg.everyHours * 3600 * 1e3)
    return true;
  return false;
}
function tryAcquireLock(sessionId, maxAgeMs = 10 * 60 * 1e3) {
  mkdirSync7(STATE_DIR, { recursive: true });
  const p = lockPath2(sessionId);
  if (existsSync6(p)) {
    try {
      const ageMs = Date.now() - parseInt(readFileSync9(p, "utf-8"), 10);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMs)
        return false;
    } catch (readErr) {
      dlog(`lock file unreadable for ${sessionId}, treating as stale: ${readErr.message}`);
    }
    try {
      unlinkSync4(p);
    } catch (unlinkErr) {
      dlog(`could not unlink stale lock for ${sessionId}: ${unlinkErr.message}`);
      return false;
    }
  }
  try {
    const fd = openSync4(p, "wx");
    try {
      writeSync2(fd, String(Date.now()));
    } finally {
      closeSync4(fd);
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
      dlog(`releaseLock unlink failed for ${sessionId}: ${e.message}`);
    }
  }
}

// dist/src/hooks/codex/spawn-wiki-worker.js
import { fileURLToPath } from "node:url";
import { dirname as dirname6, join as join16 } from "node:path";
import { writeFileSync as writeFileSync6, mkdirSync as mkdirSync9 } from "node:fs";
import { homedir as homedir12, tmpdir as tmpdir2 } from "node:os";

// dist/src/utils/wiki-log.js
import { mkdirSync as mkdirSync8, appendFileSync as appendFileSync2 } from "node:fs";
import { join as join13 } from "node:path";
function makeWikiLogger(hooksDir, filename = "deeplake-wiki.log") {
  const path2 = join13(hooksDir, filename);
  return {
    path: path2,
    log(msg) {
      try {
        mkdirSync8(hooksDir, { recursive: true });
        appendFileSync2(path2, `[${utcTimestamp()}] ${msg}
`);
      } catch {
      }
    }
  };
}

// dist/src/utils/version-check.js
import { readFileSync as readFileSync10 } from "node:fs";
import { dirname as dirname5, join as join14 } from "node:path";
function getInstalledVersion(bundleDir, pluginManifestDir) {
  try {
    const pluginJson = join14(bundleDir, "..", pluginManifestDir, "plugin.json");
    const plugin = JSON.parse(readFileSync10(pluginJson, "utf-8"));
    if (plugin.version)
      return plugin.version;
  } catch {
  }
  try {
    const stamp = readFileSync10(join14(bundleDir, "..", ".hivemind_version"), "utf-8").trim();
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
    const candidate = join14(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync10(candidate, "utf-8"));
      if (HIVEMIND_PKG_NAMES.has(pkg.name) && pkg.version)
        return pkg.version;
    } catch {
    }
    const parent = dirname5(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}

// dist/src/utils/spawn-detached.js
import { spawn as nodeSpawn } from "node:child_process";
function spawnDetachedNodeWorker(workerPath, args = [], deps = {}) {
  const spawn3 = deps.spawn ?? nodeSpawn;
  const execPath = deps.execPath ?? process.execPath;
  try {
    const child = spawn3(execPath, [workerPath, ...args], {
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
import { homedir as homedir11 } from "node:os";
import { join as join15 } from "node:path";
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
  const local = join15(homedir11(), ".claude", "local", cli);
  return isWin ? `${local}.cmd` : local;
}

// dist/src/hooks/codex/spawn-wiki-worker.js
var HOME = homedir12();
var wikiLogger = makeWikiLogger(join16(HOME, ".codex", "hooks"));
var WIKI_LOG = wikiLogger.path;
var WIKI_PROMPT_TEMPLATE = `You are building a personal wiki from a coding session. Your goal is to extract every piece of knowledge \u2014 entities, decisions, relationships, and facts \u2014 into a structured, searchable wiki entry.

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

2. Write the summary file at the path above with this EXACT format:

# Session __SESSION_ID__
- **Source**: __JSONL_SERVER_PATH__
- **Started**: <extract from JSONL>
- **Ended**: <now>
- **Project**: __PROJECT__
- **JSONL offset**: __JSONL_LINES__

## What Happened
<2-3 dense sentences. What was the goal, what was accomplished, what's left.>

## People
<For each person mentioned: name, role, what they did/said. Format: **Name** \u2014 role \u2014 action>

## Entities
<Every named thing: repos, branches, files, APIs, tools, services, tables, features, bugs.
Format: **entity** (type) \u2014 what was done with it, its current state>

## Decisions & Reasoning
<Every decision made and WHY.>

## Key Facts
<Bullet list of atomic facts that could answer future questions.>

## Files Modified
<bullet list: path (new/modified/deleted) \u2014 what changed>

## Open Questions / TODO
<Anything unresolved, blocked, or explicitly deferred>

## Next Steps
<Decide in two steps. STEP 1 \u2014 is the work this session set out to do actually finished? If it ended mid-task \u2014 a feature only half-implemented, a build or test still failing, a fix written but not yet verified, a plan agreed but not executed, a blocker hit and unresolved, or an explicit "still need to.../next I'll..." left hanging \u2014 then it is NOT finished and you MUST write a single concrete imperative line naming the unfinished work (e.g. "Finish wiring the uint32 class_label scan binding and run its test"). The session's LAST messages are the strongest signal: if they describe or show work still in progress or something left to do, that IS the next step \u2014 never suppress a genuinely unfinished task, and do not demand "substantial consequences" for it. STEP 2 \u2014 if the core work IS finished, default to exactly: none and do not invent a follow-up to fill the section. Write none when the work reached a natural stopping point, only trivial/obvious/optional polish or cleanup remains, the "next step" would just be open-ended exploration, or the only thing left is administrative wrap-up (committing, pushing, opening/merging a PR, deploying, monitoring CI \u2014 treat ALL such wrap-up as ALREADY DONE). The sole exception that still warrants a next step on otherwise-finished work is a separate, important, non-obvious item a returning engineer would NOT realize on their own and would be materially harmed by missing.>

IMPORTANT: Be exhaustive. Extract EVERY entity, decision, and fact.
PRIVACY: Never include absolute filesystem paths in the summary.
LENGTH LIMIT: Keep the total summary under 4000 characters.`;
var wikiLog = wikiLogger.log;
function findCodexBin() {
  return resolveCliBin("codex", "codex");
}
function spawnCodexWikiWorker(opts) {
  const { config, sessionId, cwd, bundleDir, reason } = opts;
  const projectName = projectNameFromCwd(cwd);
  const tmpDir = join16(tmpdir2(), `deeplake-wiki-${sessionId}-${Date.now()}`);
  mkdirSync9(tmpDir, { recursive: true });
  const pluginVersion = getInstalledVersion(bundleDir, ".codex-plugin") ?? "";
  const configFile = join16(tmpDir, "config.json");
  writeFileSync6(configFile, JSON.stringify({
    apiUrl: config.apiUrl,
    token: config.token,
    orgId: config.orgId,
    workspaceId: config.workspaceId,
    memoryTable: config.tableName,
    sessionsTable: config.sessionsTableName,
    sessionId,
    userName: config.userName,
    project: projectName,
    pluginVersion,
    tmpDir,
    codexBin: findCodexBin(),
    wikiLog: WIKI_LOG,
    hooksDir: join16(HOME, ".codex", "hooks"),
    promptTemplate: WIKI_PROMPT_TEMPLATE
  }));
  wikiLog(`${reason}: spawning summary worker for ${sessionId}`);
  const workerPath = join16(bundleDir, "wiki-worker.js");
  spawnDetachedNodeWorker(workerPath, [configFile]);
  wikiLog(`${reason}: spawned summary worker for ${sessionId}`);
}
function bundleDirFromImportMeta(importMetaUrl) {
  return dirname6(fileURLToPath(importMetaUrl));
}

// dist/src/utils/plugin-state.js
import { readFileSync as readFileSync11 } from "node:fs";
import { join as join17 } from "node:path";
import { homedir as homedir13 } from "node:os";
var PLUGIN_ID = "hivemind@hivemind";
function isHivemindPluginEnabled() {
  try {
    const settingsPath = join17(homedir13(), ".claude", "settings.json");
    const settings = JSON.parse(readFileSync11(settingsPath, "utf-8"));
    const enabledPlugins = settings?.enabledPlugins;
    if (enabledPlugins && typeof enabledPlugins === "object" && PLUGIN_ID in enabledPlugins) {
      return enabledPlugins[PLUGIN_ID] !== false;
    }
    return true;
  } catch {
    return true;
  }
}

// dist/src/skillify/skillopt-trigger.js
import { spawn as spawn2 } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// dist/src/skillify/state-dir.js
import { homedir as homedir14 } from "node:os";
import { join as join18 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join18(homedir14(), ".deeplake", "state", "skillify");
}

// dist/src/skillify/manifest.js
import { existsSync as existsSync8, lstatSync as lstatSync2, mkdirSync as mkdirSync10, readFileSync as readFileSync12, renameSync as renameSync5, unlinkSync as unlinkSync5, writeFileSync as writeFileSync7 } from "node:fs";
import { dirname as dirname8, join as join20 } from "node:path";

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync7, renameSync as renameSync4 } from "node:fs";
import { dirname as dirname7, join as join19 } from "node:path";

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
var log6 = (m) => log("skillopt-trigger", m);
function defaultHasCreds() {
  try {
    return Boolean(loadConfig()?.token);
  } catch {
    return false;
  }
}
var MAX_REACTION = 8e3;
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
function runEventTrigger(sessionId, reaction, opts = {}) {
  const deps = opts.deps ?? {};
  const env = deps.env ?? process.env;
  if (env[SKILLOPT_ENV.DISABLED] === "1")
    return { fired: false, reason: "disabled" };
  if (env[SKILLOPT_ENV.WORKER] === "1")
    return { fired: false, reason: "in-worker" };
  if (!sessionId)
    return { fired: false, reason: "no-skill" };
  const store = deps.store ?? fileStore;
  const p = store.load(sessionId);
  if (!p)
    return { fired: false, reason: "no-skill" };
  if (!(deps.canFire ?? defaultHasCreds)())
    return { fired: false, reason: "no-creds" };
  store.save(sessionId, p.budget - 1 <= 0 ? null : { ...p, budget: p.budget - 1 });
  (deps.spawnWorker ?? spawnWorker)(sessionId, p.skill, reaction ?? "", p.toolUseId, opts.agent);
  return { fired: true, reason: "spawned" };
}
function spawnWorker(sessionId, skill, reaction, toolUseId, agent) {
  try {
    const here = path.dirname(fileURLToPath2(import.meta.url));
    const entry = path.join(here, "skillopt-worker.js");
    const child = spawn2(process.execPath, [entry], {
      detached: true,
      stdio: "ignore",
      // SW_HIDE: libuv applies it alongside detached. No-op on POSIX.
      windowsHide: true,
      env: {
        ...process.env,
        [SKILLOPT_ENV.WORKER]: "1",
        [SKILLOPT_ENV.SESSION]: sessionId,
        [SKILLOPT_ENV.SKILL]: skill,
        [SKILLOPT_ENV.REACTION]: (reaction ?? "").slice(0, MAX_REACTION),
        ...toolUseId ? { [SKILLOPT_ENV.TOOL_USE_ID]: toolUseId } : {},
        ...agent ? { [SKILLOPT_ENV.AGENT]: agent } : {}
      }
    });
    child.unref();
    log6(`spawned skillopt worker for ${skill} in ${sessionId}${agent ? ` (agent=${agent})` : ""}`);
  } catch (e) {
    log6(`spawn failed (swallowed): ${e?.message ?? e}`);
  }
}

// dist/src/hooks/shared/skillopt-hook.js
function reactSkillOpt(sessionId, prompt, agent) {
  try {
    if (prompt === void 0 || prompt.trim() === "" || process.env.HIVEMIND_WIKI_WORKER === "1")
      return;
    runEventTrigger(sessionId, prompt, { agent });
  } catch {
  }
}

// dist/src/hooks/codex/capture.js
var log7 = (msg) => log("codex-capture", msg);
function resolveEmbedDaemonPath() {
  return join21(dirname9(fileURLToPath3(import.meta.url)), "embeddings", "embed-daemon.js");
}
var __bundleDir = dirname9(fileURLToPath3(import.meta.url));
var PLUGIN_VERSION = getInstalledVersion(__bundleDir, ".codex-plugin") ?? "";
if (!embeddingsDisabled()) {
  try {
    ensurePluginNodeModulesLink({ bundleDir: __bundleDir });
  } catch {
  }
}
var CAPTURE = process.env.HIVEMIND_CAPTURE !== "false";
async function main() {
  if (!CAPTURE)
    return;
  if (!isHivemindPluginEnabled()) {
    log7("plugin disabled, skipping capture");
    return;
  }
  const input = await readStdin();
  const config = resolveCaptureConfig(input.cwd ?? process.cwd(), log7);
  if (!config)
    return;
  const sessionsTable = config.sessionsTableName;
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, sessionsTable);
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const modelMeta = parseCodexTurnMeta(input.transcript_path, input.model);
  const meta = {
    session_id: input.session_id,
    transcript_path: input.transcript_path,
    cwd: input.cwd,
    hook_event_name: input.hook_event_name,
    model: input.model,
    turn_id: input.turn_id,
    timestamp: ts,
    ...modelMeta ?? {}
  };
  let entry;
  if (input.hook_event_name === "UserPromptSubmit" && input.prompt !== void 0) {
    log7(`user session=${input.session_id}`);
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "user_message",
      content: input.prompt
    };
  } else if (input.hook_event_name === "PostToolUse" && input.tool_name !== void 0) {
    log7(`tool=${input.tool_name} session=${input.session_id}`);
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "tool_call",
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
      tool_input: JSON.stringify(input.tool_input),
      tool_response: JSON.stringify(input.tool_response)
    };
  } else {
    log7(`unknown event: ${input.hook_event_name}, skipping`);
    return;
  }
  const sessionPath = buildSessionPath(config, input.session_id);
  const line = redactSecrets(JSON.stringify(entry));
  log7(`writing to ${sessionPath}`);
  const projectName = projectNameFromCwd(input.cwd);
  const filename = sessionPath.split("/").pop() ?? "";
  const jsonForSql = line.replace(/'/g, "''");
  const embedding = embeddingsDisabled() ? null : await new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() }).embed(line, "document");
  const embeddingSql = embeddingSqlLiteral(embedding);
  const insertSql = buildDirectSessionInsertSql(sessionsTable, {
    // Reuse the event id already embedded in the message JSON so the row PK
    // matches the payload's id (and keeps the dedup key = the logical event).
    id: entry.id,
    sessionPath,
    filename,
    jsonForSql,
    embeddingSql,
    userName: config.userName,
    sizeBytes: Buffer.byteLength(line, "utf-8"),
    projectName,
    description: input.hook_event_name ?? "",
    agent: "codex",
    pluginVersion: PLUGIN_VERSION,
    timestamp: ts
  });
  try {
    await api.query(insertSql);
  } catch (e) {
    if (e.message?.includes("permission denied") || e.message?.includes("does not exist")) {
      log7("table missing, creating and retrying");
      await api.ensureSessionsTable(sessionsTable);
      await api.query(insertSql);
    } else {
      throw e;
    }
  }
  log7("capture ok");
  reactSkillOpt(input.session_id, input.prompt, "codex");
  maybeTriggerPeriodicSummary(input.session_id, input.cwd ?? "", config);
}
function maybeTriggerPeriodicSummary(sessionId, cwd, config) {
  if (process.env.HIVEMIND_WIKI_WORKER === "1")
    return;
  try {
    const state = bumpTotalCount(sessionId);
    const cfg = loadTriggerConfig();
    if (!shouldTrigger(state, cfg))
      return;
    if (!tryAcquireLock(sessionId)) {
      log7(`periodic trigger suppressed (lock held) session=${sessionId}`);
      return;
    }
    wikiLog(`Periodic: threshold hit (total=${state.totalCount}, since=${state.totalCount - state.lastSummaryCount}, N=${cfg.everyNMessages}, hours=${cfg.everyHours})`);
    try {
      markSummaryAttempt(sessionId);
      spawnCodexWikiWorker({
        config,
        sessionId,
        cwd,
        bundleDir: bundleDirFromImportMeta(import.meta.url),
        reason: "Periodic"
      });
    } catch (e) {
      log7(`periodic spawn failed: ${e.message}`);
      try {
        releaseLock(sessionId);
      } catch (releaseErr) {
        log7(`releaseLock after periodic spawn failure also failed: ${releaseErr.message}`);
      }
      throw e;
    }
  } catch (e) {
    log7(`periodic trigger error: ${e.message}`);
  }
}
main().catch((e) => {
  log7(`fatal: ${e.message}`);
  process.exit(0);
});
