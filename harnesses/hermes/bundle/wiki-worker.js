#!/usr/bin/env node

// dist/src/hooks/hermes/wiki-worker.js
import { readFileSync as readFileSync5, writeFileSync as writeFileSync3, existsSync as existsSync4, appendFileSync as appendFileSync3, mkdirSync as mkdirSync5, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname as dirname3, join as join7 } from "node:path";
import { fileURLToPath } from "node:url";

// dist/src/hooks/summary-state.js
import { readFileSync, writeFileSync, writeSync, mkdirSync as mkdirSync2, existsSync, unlinkSync, openSync, closeSync, statSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";

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

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
function renameAtomic(tmp, dest, opts = {}) {
  const rename = opts.rename ?? fsRenameSync;
  const cleanup2 = opts.cleanup ?? defaultCleanup;
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
        cleanup2(tmp);
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

// dist/src/hooks/summary-state.js
var dlog = (msg) => log("summary-state", msg);
var STATE_DIR = join2(homedir2(), ".claude", "hooks", "summary-state");
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
function statePath(sessionId) {
  return join2(STATE_DIR, `${sessionId}.json`);
}
function lockPath(sessionId) {
  return join2(STATE_DIR, `${sessionId}.lock`);
}
function readState(sessionId) {
  const p = statePath(sessionId);
  if (!existsSync(p))
    return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}
function writeState(sessionId, state) {
  mkdirSync2(STATE_DIR, { recursive: true });
  const p = statePath(sessionId);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameAtomic(tmp, p);
}
function withRmwLock(sessionId, fn) {
  mkdirSync2(STATE_DIR, { recursive: true });
  const rmwLock = statePath(sessionId) + ".rmw";
  const deadline = Date.now() + 2e3;
  let fd = null;
  while (fd === null) {
    try {
      fd = openSync(rmwLock, "wx");
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      if (Date.now() > deadline) {
        dlog(`rmw lock deadline exceeded for ${sessionId}, reclaiming stale lock`);
        try {
          unlinkSync(rmwLock);
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
    closeSync(fd);
    try {
      unlinkSync(rmwLock);
    } catch (unlinkErr) {
      dlog(`rmw lock cleanup failed for ${sessionId}: ${unlinkErr.message}`);
    }
  }
}
function finalizeSummary(sessionId, jsonlLines) {
  withRmwLock(sessionId, () => {
    const prev = readState(sessionId);
    writeState(sessionId, {
      lastSummaryAt: Date.now(),
      lastSummaryCount: jsonlLines,
      totalCount: Math.max(prev?.totalCount ?? 0, jsonlLines),
      lastAttemptAt: prev?.lastAttemptAt,
      attemptsSinceSuccess: 0
    });
  });
}
function releaseLock(sessionId) {
  try {
    unlinkSync(lockPath(sessionId));
  } catch (e) {
    if (e?.code !== "ENOENT") {
      dlog(`releaseLock unlink failed for ${sessionId}: ${e.message}`);
    }
  }
}

// dist/src/hooks/session-event-cache.js
import { appendFileSync as appendFileSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync2, readdirSync, statSync as statSync2, unlinkSync as unlinkSync2 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join3 } from "node:path";
var CACHE_DIR = join3(homedir3(), ".claude", "hooks", "session-cache");
function sessionEventCacheDisabled() {
  const v = process.env.HIVEMIND_SESSION_EVENT_CACHE;
  return v === "0" || v === "false";
}
function sessionEventCachePath(sessionId) {
  return join3(CACHE_DIR, `${sessionId}.jsonl`);
}
function readSessionEventCache(sessionId) {
  if (!sessionId || sessionEventCacheDisabled())
    return null;
  try {
    const raw = readFileSync2(sessionEventCachePath(sessionId), "utf-8");
    return raw.split("\n").filter((l) => l.length > 0);
  } catch {
    return null;
  }
}

// dist/src/utils/session-path.js
function buildSessionPath(config, sessionId) {
  const workspace = config.workspaceId ?? "default";
  return `/sessions/${config.userName}/${config.userName}_${config.orgName}_${workspace}_${sessionId}.jsonl`;
}

// dist/src/hooks/wiki-offset.js
var WIKI_JSONL_MAX_BYTES = 4 * 1024 * 1024;
var WIKI_FALLBACK_MAX_ROWS = 2e3;
function newRowsFromWindow(window, total, prevOffset) {
  if (prevOffset <= 0)
    return window.slice();
  const newCount = Math.max(0, total - prevOffset);
  if (newCount >= window.length)
    return window.slice();
  return window.slice(window.length - newCount);
}
var OFFSET_RE = /\*\*JSONL offset\*\*:\s*(\d+)/;
function stampOffset(summary, offset) {
  const line = `**JSONL offset**: ${offset}`;
  if (OFFSET_RE.test(summary))
    return summary.replace(OFFSET_RE, line);
  const nl = summary.indexOf("\n");
  if (nl === -1)
    return `${summary}
- ${line}
`;
  return `${summary.slice(0, nl + 1)}- ${line}
${summary.slice(nl + 1)}`;
}
function capLinesByBytes(lines, maxBytes) {
  if (lines.length === 0)
    return { kept: [], dropped: 0, truncated: false };
  let start = lines.length - 1;
  let total = Buffer.byteLength(lines[start], "utf8");
  for (let i = lines.length - 2; i >= 0; i--) {
    const size = Buffer.byteLength(lines[i], "utf8") + 1;
    if (total + size > maxBytes)
      break;
    total += size;
    start = i;
  }
  const kept = lines.slice(start);
  let truncated = false;
  if (kept.length === 1 && Buffer.byteLength(kept[0], "utf8") > maxBytes) {
    kept[0] = truncateUtf8(kept[0], maxBytes);
    truncated = true;
  }
  return { kept, dropped: start, truncated };
}
function truncateUtf8(s, maxBytes) {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes)
    return s;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(buf.subarray(0, maxBytes)).replace(/�+$/, "");
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

// dist/src/hooks/upload-summary.js
import { randomUUID } from "node:crypto";

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

// dist/src/hooks/upload-summary.js
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
var WHAT_HAPPENED_RE = /## What Happened\n([\s\S]*?)(?=\n##|$)/;
function extractDescription(text) {
  const match = text.match(WHAT_HAPPENED_RE);
  return match ? match[1].trim().slice(0, 300) : "completed";
}
var PLACEHOLDER_DESCRIPTION = "in progress";
function isFinalizedDescription(desc) {
  if (typeof desc !== "string")
    return false;
  const d = desc.trim();
  return d !== "" && d !== PLACEHOLDER_DESCRIPTION;
}
function isFinalizedRow(summary, description) {
  const hasSummary = typeof summary === "string" && summary.trim() !== "";
  return hasSummary && isFinalizedDescription(description);
}
function isFinalizedSummaryText(text) {
  if (typeof text !== "string" || text.trim() === "")
    return false;
  const match = text.match(WHAT_HAPPENED_RE);
  return match ? match[1].trim() !== "" : false;
}
async function uploadSummary(query2, params) {
  const { tableName, vpath, fname, userName, project, agent } = params;
  const text = redactSecrets(params.text);
  const ts = params.ts ?? (/* @__PURE__ */ new Date()).toISOString();
  const desc = extractDescription(text);
  const sizeBytes = Buffer.byteLength(text);
  const embSql = embeddingSqlLiteral(params.embedding ?? null);
  const pluginVersion = params.pluginVersion;
  const existing = await query2(`SELECT path, summary, description FROM "${tableName}" WHERE path = '${esc(vpath)}' LIMIT 1`);
  if (existing.length > 0) {
    const incomingFinalized = isFinalizedSummaryText(text);
    const existingFinalized = isFinalizedRow(existing[0]["summary"], existing[0]["description"]);
    if (!incomingFinalized && existingFinalized) {
      return { path: "skip", sql: "", descLength: desc.length, summaryLength: text.length };
    }
    const pluginVersionSet = pluginVersion === void 0 ? "" : `plugin_version = '${esc(pluginVersion)}', `;
    const sql2 = `UPDATE "${tableName}" SET summary = E'${esc(text)}', summary_embedding = ${embSql}, size_bytes = ${sizeBytes}, description = E'${esc(desc)}', ` + pluginVersionSet + `last_update_date = '${ts}' WHERE path = '${esc(vpath)}'`;
    await query2(sql2);
    return { path: "update", sql: sql2, descLength: desc.length, summaryLength: text.length };
  }
  const pluginVersionForInsert = pluginVersion ?? "";
  const sql = `INSERT INTO "${tableName}" (id, path, filename, summary, summary_embedding, author, mime_type, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) VALUES ('${randomUUID()}', '${esc(vpath)}', '${esc(fname)}', E'${esc(text)}', ${embSql}, '${esc(userName)}', 'text/markdown', ${sizeBytes}, '${esc(project)}', E'${esc(desc)}', '${esc(agent)}', '${esc(pluginVersionForInsert)}', '${ts}', '${ts}')`;
  await query2(sql);
  return { path: "insert", sql, descLength: desc.length, summaryLength: text.length };
}

// dist/src/embeddings/client.js
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { openSync as openSync2, closeSync as closeSync2, writeSync as writeSync2, unlinkSync as unlinkSync3, existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { join as join4 } from "node:path";

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
var SHARED_DAEMON_PATH = join4(homedir4(), ".hivemind", "embed-deps", "embed-daemon.js");
var log2 = (m) => log("embed-client", m);
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
    this.daemonEntry = opts.daemonEntry ?? process.env.HIVEMIND_EMBED_DAEMON ?? (existsSync2(SHARED_DAEMON_PATH) ? SHARED_DAEMON_PATH : void 0);
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
        log2(`embed err: ${err}`);
        if (isTransformersMissingError(err)) {
          this.handleTransformersMissing(err);
        }
        return null;
      }
      return resp.embedding;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log2(`embed failed: ${err}`);
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
      if (existsSync2(this.socketPath))
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
      log2(`hello probe failed (inconclusive, will retry next connect): ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    const hello = resp;
    if (_recycledStuckDaemon) {
      return false;
    }
    if (!hello.daemonPath) {
      _recycledStuckDaemon = true;
      log2(`daemon does not implement hello (older protocol); recycling`);
      this.recycleDaemon(hello.pid);
      return true;
    }
    if (hello.daemonPath !== this.daemonEntry && !existsSync2(hello.daemonPath)) {
      _recycledStuckDaemon = true;
      log2(`daemon path no longer on disk \u2014 running=${hello.daemonPath} (gone) expected=${this.daemonEntry}; recycling`);
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
        pid = Number.parseInt(readFileSync3(this.pidPath, "utf-8").trim(), 10);
      } catch {
      }
    }
    if (Number.isFinite(pid) && pid !== null && pid > 0 && existsSync2(this.socketPath)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    } else if (pid !== null) {
      log2(`recycle: socket gone, skipping SIGTERM on possibly-stale pid ${pid}`);
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
    return new Promise((resolve2, reject) => {
      const sock = connect(this.socketPath);
      const to = setTimeout(() => {
        sock.destroy();
        reject(new Error("connect timeout"));
      }, this.timeoutMs);
      sock.once("connect", () => {
        clearTimeout(to);
        resolve2(sock);
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
      writeSync2(fd, String(process.pid));
    } catch (e) {
      if (this.isPidFileStale()) {
        try {
          unlinkSync3(this.pidPath);
        } catch {
        }
        try {
          fd = openSync2(this.pidPath, "wx", 384);
          writeSync2(fd, String(process.pid));
        } catch {
          return;
        }
      } else {
        return;
      }
    }
    if (!this.daemonEntry || !existsSync2(this.daemonEntry)) {
      log2(`daemonEntry not configured or missing: ${this.daemonEntry}`);
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
      log2(`spawned daemon pid=${child.pid}`);
    } finally {
      closeSync2(fd);
    }
  }
  isPidFileStale() {
    try {
      const raw = readFileSync3(this.pidPath, "utf-8").trim();
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
      await sleep(delay);
      delay = Math.min(delay * 1.5, 300);
      if (!existsSync2(this.socketPath))
        continue;
      try {
        return await this.connectOnce();
      } catch {
      }
    }
    throw new Error("daemon did not become ready within spawnWaitMs");
  }
  sendAndWait(sock, req) {
    return new Promise((resolve2, reject) => {
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
          resolve2(JSON.parse(line));
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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function isTransformersMissingError(err) {
  if (/hivemind embeddings install/i.test(err))
    return true;
  return /@huggingface\/transformers/i.test(err);
}

// dist/src/embeddings/disable.js
import { createRequire } from "node:module";
import { homedir as homedir6 } from "node:os";
import { join as join6 } from "node:path";
import { pathToFileURL } from "node:url";

// dist/src/user-config.js
import { existsSync as existsSync3, mkdirSync as mkdirSync4, readFileSync as readFileSync4, renameSync, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { dirname as dirname2, join as join5 } from "node:path";
var _configPath = () => process.env.HIVEMIND_CONFIG_PATH ?? join5(homedir5(), ".deeplake", "config.json");
var _cache = null;
var _migrated = false;
function readUserConfig() {
  if (_cache !== null)
    return _cache;
  const path = _configPath();
  if (!existsSync3(path)) {
    _cache = {};
    return _cache;
  }
  try {
    const raw = readFileSync4(path, "utf-8");
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
  const path = _configPath();
  const dir = dirname2(path);
  if (!existsSync3(dir))
    mkdirSync4(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync2(tmp, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  renameSync(tmp, path);
  _cache = merged;
  return merged;
}
function getEmbeddingsEnabled() {
  const cfg2 = readUserConfig();
  if (cfg2.embeddings && typeof cfg2.embeddings.enabled === "boolean") {
    return cfg2.embeddings.enabled;
  }
  if (_migrated) {
    return migrationValueFromEnv();
  }
  _migrated = true;
  const enabled = migrationValueFromEnv();
  try {
    writeUserConfig({ embeddings: { enabled } });
  } catch {
    _cache = { ...cfg2 ?? {}, embeddings: { ...cfg2?.embeddings ?? {}, enabled } };
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
  const sharedDir = join6(homedir6(), ".hivemind", "embed-deps");
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

// dist/src/utils/client-header.js
var DEEPLAKE_CLIENT_HEADER = "X-Deeplake-Client";
function deeplakeClientValue() {
  return "hivemind";
}
function deeplakeClientHeader() {
  return { [DEEPLAKE_CLIENT_HEADER]: deeplakeClientValue() };
}

// dist/src/hooks/hermes/wiki-worker.js
var dlog2 = (msg) => log("hermes-wiki-worker", msg);
var cfg = JSON.parse(readFileSync5(process.argv[2], "utf-8"));
var tmpDir = cfg.tmpDir;
var tmpJsonl = join7(tmpDir, "session.jsonl");
var tmpSummary = join7(tmpDir, "summary.md");
function wlog(msg) {
  try {
    mkdirSync5(cfg.hooksDir, { recursive: true });
    appendFileSync3(cfg.wikiLog, `[${(/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19)}] wiki-worker(${cfg.sessionId}): ${msg}
`);
  } catch {
  }
}
function esc2(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
async function query(sql, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(`${cfg.apiUrl}/workspaces/${cfg.workspaceId}/tables/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        "X-Activeloop-Org-Id": cfg.orgId,
        ...deeplakeClientHeader()
      },
      body: JSON.stringify({ query: sql })
    });
    if (r.ok) {
      const j = await r.json();
      if (!j.columns || !j.rows)
        return [];
      return j.rows.map((row) => Object.fromEntries(j.columns.map((col, i) => [col, row[i]])));
    }
    const retryable = r.status === 401 || r.status === 403 || r.status === 429 || r.status === 500 || r.status === 502 || r.status === 503;
    if (attempt < retries && retryable) {
      const base = Math.min(3e4, 2e3 * Math.pow(2, attempt));
      const delay = base + Math.floor(Math.random() * 1e3);
      wlog(`API ${r.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
      continue;
    }
    throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return [];
}
function cleanup() {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch (cleanupErr) {
    dlog2(`cleanup failed to remove ${tmpDir}: ${cleanupErr.message}`);
  }
}
async function main() {
  try {
    const dbFetch = async () => {
      const like = esc2(`/sessions/%${cfg.sessionId}%`);
      const cnt = await query(`SELECT count(*) AS n FROM "${cfg.sessionsTable}" WHERE path LIKE E'${like}'`);
      const total = Number(cnt[0]?.["n"] ?? 0);
      if (total === 0)
        return { rows: [], total: 0 };
      const r = await query(`SELECT message, creation_date FROM "${cfg.sessionsTable}" WHERE path LIKE E'${like}' ORDER BY creation_date DESC LIMIT ${WIKI_FALLBACK_MAX_ROWS}`);
      return { rows: r.reverse(), total };
    };
    let usedLocalCache = false;
    let dbTotal = 0;
    let rows;
    const cachedLines = readSessionEventCache(cfg.sessionId);
    if (cachedLines && cachedLines.length > 0) {
      rows = cachedLines.map((message) => ({ message }));
      usedLocalCache = true;
      wlog(`loaded ${rows.length} events from local cache`);
    } else {
      wlog("fetching session events");
      const f = await dbFetch();
      rows = f.rows;
      dbTotal = f.total;
    }
    if (rows.length === 0) {
      wlog("no session events found \u2014 exiting");
      return;
    }
    let jsonlLines = usedLocalCache ? rows.length : dbTotal;
    let jsonlServerPath;
    if (usedLocalCache) {
      jsonlServerPath = buildSessionPath({ userName: cfg.userName, orgName: cfg.orgName, workspaceId: cfg.workspaceId }, cfg.sessionId);
    } else {
      const pathRows = await query(`SELECT DISTINCT path FROM "${cfg.sessionsTable}" WHERE path LIKE '${esc2(`/sessions/%${cfg.sessionId}%`)}' LIMIT 1`);
      jsonlServerPath = pathRows.length > 0 ? pathRows[0].path : `/sessions/unknown/${cfg.sessionId}.jsonl`;
    }
    let prevOffset = 0;
    let hasExistingSummary = false;
    try {
      const sumRows = await query(`SELECT summary FROM "${cfg.memoryTable}" WHERE path = '${esc2(`/summaries/${cfg.userName}/${cfg.sessionId}.md`)}' LIMIT 1`);
      if (sumRows.length > 0 && sumRows[0]["summary"]) {
        const existing = sumRows[0]["summary"];
        const match = existing.match(/\*\*JSONL offset\*\*:\s*(\d+)/);
        if (match)
          prevOffset = parseInt(match[1], 10);
        writeFileSync3(tmpSummary, existing);
        hasExistingSummary = true;
      }
    } catch (e) {
      wlog(`existing summary lookup failed: ${e.message}; skipping to avoid overwriting the base summary`);
      return;
    }
    if (!hasExistingSummary) {
      prevOffset = 0;
    } else {
      const sidecarCount = readState(cfg.sessionId)?.lastSummaryCount ?? 0;
      if (sidecarCount > prevOffset)
        prevOffset = sidecarCount;
    }
    if (usedLocalCache && rows.length < prevOffset) {
      wlog(`local cache (${rows.length}) < summarized offset (${prevOffset}) \u2014 refetching from DB`);
      const f = await dbFetch();
      rows = f.rows;
      dbTotal = f.total;
      jsonlLines = dbTotal;
      usedLocalCache = false;
    }
    const newRows = usedLocalCache ? prevOffset > 0 ? rows.slice(prevOffset) : rows : newRowsFromWindow(rows, dbTotal, prevOffset);
    if (prevOffset > 0 && newRows.length === 0) {
      wlog(`no new events since last summary (offset=${prevOffset}, total=${jsonlLines}) \u2014 skipping`);
      return;
    }
    const newLines = newRows.map((r) => typeof r.message === "string" ? r.message : JSON.stringify(r.message));
    const { kept, dropped, truncated } = capLinesByBytes(newLines, WIKI_JSONL_MAX_BYTES);
    if (dropped > 0) {
      wlog(`new rows exceed ${WIKI_JSONL_MAX_BYTES}B \u2014 summarizing newest ${kept.length}, permanently skipping ${dropped} older rows`);
    }
    if (truncated) {
      wlog(`a single event exceeded ${WIKI_JSONL_MAX_BYTES}B \u2014 truncated it to stay within the buffer`);
    }
    writeFileSync3(tmpJsonl, kept.join("\n"));
    wlog(`found ${jsonlLines} events (${kept.length} new since offset ${prevOffset}) at ${jsonlServerPath}`);
    const prompt = cfg.promptTemplate.replace(/__JSONL__/g, tmpJsonl).replace(/__SUMMARY__/g, tmpSummary).replace(/__SESSION_ID__/g, cfg.sessionId).replace(/__PROJECT__/g, cfg.project).replace(/__PREV_OFFSET__/g, String(prevOffset)).replace(/__JSONL_LINES__/g, String(jsonlLines)).replace(/__JSONL_SERVER_PATH__/g, jsonlServerPath);
    wlog(`running hermes -z (provider=${cfg.hermesProvider}, model=${cfg.hermesModel})`);
    let execSucceeded = false;
    const summaryBeforeExec = existsSync4(tmpSummary) ? readFileSync5(tmpSummary, "utf-8") : null;
    try {
      execFileSync(cfg.hermesBin, [
        "-z",
        prompt,
        "--provider",
        cfg.hermesProvider,
        "-m",
        cfg.hermesModel,
        "--yolo",
        "--ignore-user-config"
      ], {
        stdio: ["ignore", "pipe", "pipe"],
        // Suppress the visible console window Windows would otherwise pop for
        // a child of this console-less detached worker. No-op on POSIX.
        windowsHide: true,
        timeout: 12e4,
        // hermes streams to stdout, which execFileSync buffers. The Node
        // default (1 MB) overflows to ENOBUFS on a verbose run, killing the
        // summary. The summary is written to a file, not read from stdout, so
        // we only need headroom to drain it.
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" }
      });
      execSucceeded = true;
      wlog("hermes -z exited (code 0)");
    } catch (e) {
      wlog(`hermes -z failed: ${e.status ?? e.message}`);
    }
    if (existsSync4(tmpSummary)) {
      const raw = readFileSync5(tmpSummary, "utf-8");
      const summaryChanged = summaryBeforeExec === null ? raw.trim().length > 0 : raw !== summaryBeforeExec;
      if (!execSucceeded) {
        wlog(summaryChanged ? "hermes -z failed after a partial summary write; skipping upload to avoid advancing the offset" : "hermes -z failed without producing a new summary; skipping upload");
        return;
      }
      if (raw.trim()) {
        const text = redactSecrets(stampOffset(raw, jsonlLines));
        const fname = `${cfg.sessionId}.md`;
        const vpath = `/summaries/${cfg.userName}/${fname}`;
        let embedding = null;
        if (!embeddingsDisabled()) {
          try {
            const daemonEntry = join7(dirname3(fileURLToPath(import.meta.url)), "embeddings", "embed-daemon.js");
            embedding = await new EmbedClient({ daemonEntry }).embed(text, "document");
          } catch (e) {
            wlog(`summary embedding failed, writing NULL: ${e.message}`);
          }
        }
        const result = await uploadSummary(query, {
          tableName: cfg.memoryTable,
          vpath,
          fname,
          userName: cfg.userName,
          project: cfg.project,
          agent: "hermes",
          sessionId: cfg.sessionId,
          text,
          embedding,
          pluginVersion: cfg.pluginVersion ?? ""
        });
        wlog(`uploaded ${vpath} (summary=${result.summaryLength}, desc=${result.descLength})`);
        try {
          finalizeSummary(cfg.sessionId, jsonlLines);
          wlog(`sidecar updated: lastSummaryCount=${jsonlLines}`);
        } catch (e) {
          wlog(`sidecar update failed: ${e.message}`);
        }
      }
    } else {
      wlog("no summary file generated");
    }
    wlog("done");
  } catch (e) {
    wlog(`fatal: ${e.message}`);
  } finally {
    cleanup();
    try {
      releaseLock(cfg.sessionId);
    } catch (releaseErr) {
      dlog2(`releaseLock failed in finally for ${cfg.sessionId}: ${releaseErr.message}`);
    }
  }
}
main();
