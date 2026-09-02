import {
  setAuto
} from "./chunk-P6DQCJZO.js";

// dist/src/docs/onboarding.js
import { createInterface } from "node:readline";

// dist/src/docs/wiki-generate.js
import { readFileSync as readFileSync2, statSync } from "node:fs";
import { join as join2 } from "node:path";

// dist/src/docs/anchors.js
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
function parseSourceLocation(loc) {
  const m = loc.match(/^L(\d+)(?:-L?(\d+))?$/);
  if (!m)
    return null;
  const startLine = Number(m[1]);
  const endLine = m[2] ? Number(m[2]) : startLine;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine))
    return null;
  if (startLine < 1 || endLine < startLine)
    return null;
  return { startLine, endLine };
}
function readSymbolSource(node, repoRoot) {
  const loc = parseSourceLocation(node.source_location);
  if (!loc)
    return null;
  let text;
  try {
    text = readFileSync(join(repoRoot, node.source_file), "utf-8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  if (loc.endLine > lines.length)
    return null;
  return lines.slice(loc.startLine - 1, loc.endLine).join("\n");
}
function normalizeForHash(src, language) {
  let s = src;
  if (language === "python" || language === "ruby") {
    s = s.replace(/(^|\s)#.*$/gm, "$1");
  } else {
    s = s.replace(/\/\*[\s\S]*?\*\//g, "");
    s = s.replace(/(^|\s)\/\/.*$/gm, "$1");
  }
  return s.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "").join("\n");
}
function hashSource(src, language) {
  return createHash("sha256").update(normalizeForHash(src, language)).digest("hex");
}
function computeSymbolHash(node, repoRoot) {
  const src = readSymbolSource(node, repoRoot);
  return src === null ? null : hashSource(src, node.language);
}
function buildAnchor(node, repoRoot) {
  const hash = computeSymbolHash(node, repoRoot);
  return hash === null ? null : { symbol_id: node.id, content_hash: hash };
}

// dist/src/docs/pool.js
async function runPool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}
function isRateLimitError(err) {
  return err instanceof Error && /rate.?limit|429|overloaded|too many requests|quota/i.test(err.message);
}
async function withRateLimitRetry(fn, opts = {}) {
  const retries = opts.retries ?? 3;
  const backoff = opts.backoffMs ?? [1e3, 4e3, 1e4];
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err))
        throw err;
      lastErr = err;
      if (attempt === retries)
        break;
      await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
    }
  }
  throw lastErr ?? new Error("withRateLimitRetry: exhausted retries");
}

// dist/src/docs/write.js
import { randomUUID } from "node:crypto";

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

// dist/src/docs/stable-read.js
var defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function stableUnionRows(query, sql, opts = {}) {
  const idKey = opts.idKey ?? "id";
  const stableReads = Math.max(1, opts.stableReads ?? 3);
  const maxReads = Math.max(stableReads, opts.maxReads ?? 10);
  const delayMs = opts.delayMs ?? 0;
  const sleep = opts.sleep ?? defaultSleep;
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
      await sleep(delayMs);
  }
  opts.log?.(`stable-read: ${union.size} rows after ${reads} reads (streak ${stableStreak})`);
  return [...union.values()];
}

// dist/src/docs/branch-scope.js
var MAIN_SCOPE = "main";
var BRANCH_PREFIX = "b:";
function branchScope(branch) {
  return `${BRANCH_PREFIX}${branch}`;
}
function parseScope(scope) {
  if (scope && scope.startsWith(BRANCH_PREFIX)) {
    return { kind: "branch", branch: scope.slice(BRANCH_PREFIX.length) };
  }
  return { kind: "main" };
}
function currentBranch(git) {
  const out = git(["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
  if (!out || out === "HEAD")
    return null;
  return out;
}
function trunkBranch(git) {
  const ref = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])?.trim();
  if (ref) {
    const slash = ref.lastIndexOf("/");
    const name = slash >= 0 ? ref.slice(slash + 1) : ref;
    if (name)
      return name;
  }
  return "main";
}
function currentScope(git, trunk) {
  const branch = currentBranch(git);
  if (branch === null)
    return MAIN_SCOPE;
  const trunkName = trunk ?? trunkBranch(git);
  return branch === trunkName ? MAIN_SCOPE : branchScope(branch);
}
function pickByScopePrecedence(rows, readerScope) {
  let best = null;
  let bestRank = -1;
  for (const r of rows) {
    const s = r.scope || MAIN_SCOPE;
    const rank = s === readerScope ? 2 : s === MAIN_SCOPE ? 1 : 0;
    if (rank === 0)
      continue;
    if (best === null || rank > bestRank || rank === bestRank && r.version > best.version) {
      best = r;
      bestRank = rank;
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
async function listDocs(query, tableName, opts = {}) {
  const safe = sqlIdent(tableName);
  const scoped = opts.readerScope !== void 0;
  const orderBy = "ORDER BY version DESC, updated_at DESC, id DESC";
  const rows = scoped ? await scopedUnion(query, (cols) => `SELECT ${cols} FROM "${safe}" ${orderBy}`) : await stableUnionRows(query, `SELECT ${SELECT_COLS} FROM "${safe}" ${orderBy}`);
  const candidates = /* @__PURE__ */ new Map();
  const latest = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const row = normalize(r);
    if (!row)
      continue;
    if (row.doc_id === "_meta")
      continue;
    if (opts.project !== void 0 && row.project !== opts.project)
      continue;
    if (opts.projectOrLegacy !== void 0 && row.project !== opts.projectOrLegacy && row.project !== "")
      continue;
    const key = `${row.project}\0${row.doc_id}`;
    if (scoped) {
      const list = candidates.get(key);
      if (list)
        list.push(row);
      else
        candidates.set(key, [row]);
      continue;
    }
    const prev = latest.get(key);
    if (!prev || row.version > prev.version || row.version === prev.version && (row.updated_at.localeCompare(prev.updated_at) > 0 || row.updated_at === prev.updated_at && row.id.localeCompare(prev.id) > 0)) {
      latest.set(key, row);
    }
  }
  if (scoped) {
    for (const [, list] of candidates) {
      const winner = pickByScopePrecedence(list, opts.readerScope);
      if (winner)
        latest.set(`${winner.project}\0${winner.doc_id}`, winner);
    }
  }
  const statusFilter = opts.status ?? "active";
  const filtered = [...latest.values()].filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter)
      return false;
    return true;
  });
  filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
  return filtered.slice(0, opts.limit ?? 200);
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

// dist/src/docs/write.js
function docRowId(project, scope, docId) {
  return `${project ?? ""}|${scope ?? "main"}|${docId}`;
}
var MAX_CONTENT_LENGTH = 5e4;
function assertValidContent(content) {
  if (content.length === 0)
    throw new Error("Doc content must not be empty");
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Doc content exceeds ${MAX_CONTENT_LENGTH} chars (got ${content.length})`);
  }
}
function serializeAnchors(anchors) {
  return JSON.stringify(anchors.map((a) => ({ symbol_id: a.symbol_id, content_hash: a.content_hash })));
}
async function insertDoc(query, tableName, input) {
  assertValidContent(input.content);
  if (input.doc_id.length === 0)
    throw new Error("Doc doc_id must not be empty");
  const safe = sqlIdent(tableName);
  const rowId = randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const anchors = serializeAnchors(input.anchors ?? []);
  const tier = input.tier ?? "fast";
  const sql = `INSERT INTO "${safe}" (id, doc_id, path, content, anchors, tier, status, project, scope, source_fp, version, created_at, updated_at, agent, plugin_version, content_embedding) VALUES ('${sqlStr(rowId)}', '${sqlStr(input.doc_id)}', '${sqlStr(input.path)}', E'${sqlStr(input.content)}', E'${sqlStr(anchors)}', '${sqlStr(tier)}', 'active', '${sqlStr(input.project ?? "")}', '${sqlStr(input.scope ?? "main")}', E'${sqlStr(input.source_fp ?? "{}")}', 1, '${sqlStr(now)}', '${sqlStr(now)}', '${sqlStr(input.agent ?? "manual")}', '${sqlStr(input.plugin_version ?? "")}', ${embeddingSqlLiteral(input.content_embedding)})`;
  await query(sql);
  return { doc_id: input.doc_id, version: 1 };
}
var WRITE_RETRIES = 3;
var WRITE_BACKOFF_MS = [500, 1500, 4e3];
function isTimeoutError(err) {
  return err instanceof Error && /timeout/i.test(err.message);
}
async function upsertDoc(query, tableName, input, opts = {}) {
  assertValidContent(input.content);
  if (input.doc_id.length === 0)
    throw new Error("Doc doc_id must not be empty");
  const safe = sqlIdent(tableName);
  const scope = input.scope ?? "main";
  const id = docRowId(input.project, scope, input.doc_id);
  const anchors = serializeAnchors(input.anchors ?? []);
  const tier = input.tier ?? "fast";
  const retries = opts.retries ?? WRITE_RETRIES;
  const backoff = opts.backoffMs ?? WRITE_BACKOFF_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await query(`DELETE FROM "${safe}" WHERE id = '${sqlStr(id)}' OR (doc_id = '${sqlStr(input.doc_id)}' AND project = '${sqlStr(input.project ?? "")}' AND scope = '${sqlStr(scope)}')`);
      const sql = `INSERT INTO "${safe}" (id, doc_id, path, content, anchors, tier, status, project, scope, source_fp, version, created_at, updated_at, agent, plugin_version, content_embedding) VALUES ('${sqlStr(id)}', '${sqlStr(input.doc_id)}', '${sqlStr(input.path)}', E'${sqlStr(input.content)}', E'${sqlStr(anchors)}', '${sqlStr(tier)}', 'active', '${sqlStr(input.project ?? "")}', '${sqlStr(scope)}', E'${sqlStr(input.source_fp ?? "{}")}', 1, '${sqlStr(now)}', '${sqlStr(now)}', '${sqlStr(input.agent ?? "manual")}', '${sqlStr(input.plugin_version ?? "")}', ${embeddingSqlLiteral(input.content_embedding)})`;
      await query(sql);
      return { doc_id: input.doc_id, version: 1 };
    } catch (err) {
      if (!isTimeoutError(err))
        throw err;
      lastErr = err;
      if (attempt === retries)
        break;
      await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
    }
  }
  throw lastErr ?? new Error("upsertDoc: exhausted retries");
}
async function editDoc(query, tableName, input, opts = {}) {
  const previous = await getDocLatest(query, tableName, input.doc_id, { project: opts.project, scope: opts.scope });
  if (!previous) {
    throw new Error(`Doc not found: ${input.doc_id}`);
  }
  return updateInPlace(query, tableName, previous, input);
}
async function setDoc(query, tableName, input, opts = {}) {
  const previous = await getDocLatest(query, tableName, input.doc_id, { project: opts.project, scope: opts.scope });
  if (!previous) {
    return insertDoc(query, tableName, {
      doc_id: input.doc_id,
      path: input.path,
      content: input.content,
      anchors: input.anchors,
      tier: input.tier,
      project: input.project,
      agent: input.agent,
      plugin_version: input.plugin_version,
      content_embedding: input.content_embedding
    });
  }
  return updateInPlace(query, tableName, previous, {
    doc_id: input.doc_id,
    content: input.content,
    anchors: input.anchors,
    tier: input.tier,
    status: input.status,
    path: input.path,
    project: input.project,
    agent: input.agent,
    plugin_version: input.plugin_version,
    content_embedding: input.content_embedding
  });
}
async function archiveDoc(query, tableName, input, opts = {}) {
  return editDoc(query, tableName, {
    doc_id: input.doc_id,
    status: "archived",
    agent: input.agent,
    plugin_version: input.plugin_version
  }, opts);
}
async function updateInPlace(query, tableName, previous, next) {
  const content = next.content ?? previous.content;
  assertValidContent(content);
  const safe = sqlIdent(tableName);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const nextVersion = previous.version + 1;
  const anchors = serializeAnchors(next.anchors ?? previous.anchors);
  const tier = next.tier ?? previous.tier;
  const status = next.status ?? previous.status;
  const path = next.path ?? previous.path;
  const project = next.project ?? previous.project;
  const sql = `UPDATE "${safe}" SET path = '${sqlStr(path)}', content = E'${sqlStr(content)}', anchors = E'${sqlStr(anchors)}', tier = '${sqlStr(tier)}', status = '${sqlStr(status)}', project = '${sqlStr(project)}', ${next.content_embedding !== void 0 ? `content_embedding = ${embeddingSqlLiteral(next.content_embedding)}, ` : next.content !== void 0 && next.content !== previous.content ? `content_embedding = NULL, ` : ""}${next.source_fp !== void 0 ? `source_fp = E'${sqlStr(next.source_fp)}', ` : ""}version = ${nextVersion}, updated_at = '${sqlStr(now)}', agent = '${sqlStr(next.agent ?? "manual")}', plugin_version = '${sqlStr(next.plugin_version ?? "")}' WHERE id = '${sqlStr(previous.id)}'`;
  await query(sql);
  return { doc_id: previous.doc_id, version: nextVersion };
}

// dist/src/docs/generate.js
var DOCUMENTABLE_KINDS = /* @__PURE__ */ new Set(["function", "class", "method", "interface", "type_alias", "enum"]);
var DEFAULT_EXCLUDE_GLOBS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.d.ts",
  "**/*.config.*",
  "**/index.ts",
  "**/index.js"
];
var BATCH_MARKER_RE = /<<<DOC file=(.+?)>>>[ \t]*\n?/;
function globToRegExp(glob) {
  if (glob.length > 512)
    throw new Error(`glob pattern too long (${glob.length} > 512 chars)`);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/")
          i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}
function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}
function selectTargets(snap, opts = {}) {
  const scope = opts.scope ?? "file";
  const excludes = [...DEFAULT_EXCLUDE_GLOBS, ...opts.exclude ?? []];
  const includes = opts.include ?? [];
  const docNodes = snap.nodes.filter((n) => DOCUMENTABLE_KINDS.has(n.kind));
  const keep = (file) => {
    if (includes.length > 0 && !matchesAny(file, includes))
      return false;
    if (matchesAny(file, excludes))
      return false;
    return true;
  };
  if (scope === "symbol") {
    return docNodes.filter((n) => keep(n.source_file)).map((n) => ({ doc_id: n.id, file: n.source_file, symbols: [n] }));
  }
  const byFile = /* @__PURE__ */ new Map();
  for (const n of docNodes) {
    if (!keep(n.source_file))
      continue;
    const list = byFile.get(n.source_file);
    if (list)
      list.push(n);
    else
      byFile.set(n.source_file, [n]);
  }
  return [...byFile.entries()].map(([file, symbols]) => ({ doc_id: file, file, symbols })).sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}
function buildGeneratePrompt(input) {
  const syms = input.symbols.map((s) => `### ${s.id}
${s.signature ? s.signature + "\n" : ""}
\`\`\`
${s.source}
\`\`\``).join("\n\n");
  return [
    "You are writing concise internal documentation for ONE source file.",
    "Describe what the file is for and what its key symbols do \u2014 one short line per symbol.",
    "Be precise and grounded in the code below. Output ONLY markdown, no preamble, no outer code fence. Keep it under ~1500 characters.",
    "",
    `## File: ${input.file}`,
    "",
    "## Symbols",
    syms || "(none)"
  ].join("\n");
}
function renderSymbols(input) {
  return input.symbols.map((s) => `### ${s.id}
${s.signature ? s.signature + "\n" : ""}
\`\`\`
${s.source}
\`\`\``).join("\n\n") || "(none)";
}
function buildBatchGeneratePrompt(inputs) {
  const blocks = inputs.map((input) => [`<<<DOC file=${input.file}>>>`, `## File: ${input.file}`, "", "## Symbols", renderSymbols(input)].join("\n"));
  return [
    "You are writing concise internal documentation for MULTIPLE source files.",
    "For EACH file below, output its doc PREFIXED by a line EXACTLY of the form:",
    "<<<DOC file=RELATIVE/PATH.ts>>>",
    "using the exact path shown for that file, then the markdown doc (what the file",
    "is for + one short line per key symbol, under ~1200 characters).",
    "Output ONLY these marker+doc sections, in order. No preamble, no outer code fence.",
    "",
    "=== FILES ===",
    "",
    blocks.join("\n\n----------\n\n")
  ].join("\n");
}
function parseBatchDocs(response, inputs) {
  const wanted = new Map(inputs.map((i) => [i.file, i.doc_id]));
  const out = /* @__PURE__ */ new Map();
  const marker = new RegExp(BATCH_MARKER_RE.source, "g");
  const matches = [...response.matchAll(marker)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const file = m[1].trim();
    const docId = wanted.get(file);
    if (!docId)
      continue;
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : response.length;
    const body = response.slice(start, end).trim();
    if (body)
      out.set(docId, body);
  }
  return out;
}
function defaultVfsPath(project, docId) {
  return `/docs/${project || "default"}/${docId}.md`;
}
async function generateDocs(args) {
  const project = args.project ?? "";
  let targets = selectTargets(args.snap, { scope: args.scope, include: args.include, exclude: args.exclude });
  if (!args.force)
    targets = targets.filter((t) => !args.existing.has(t.doc_id));
  if (args.limit !== void 0)
    targets = targets.slice(0, args.limit);
  const outcomes = [];
  const prep = (t) => {
    const symInput = [];
    const anchors = [];
    for (const n of t.symbols) {
      const source = readSymbolSource(n, args.repoRoot);
      const anchor = buildAnchor(n, args.repoRoot);
      if (source !== null)
        symInput.push({ id: n.id, signature: n.signature, source });
      if (anchor)
        anchors.push(anchor);
    }
    if (anchors.length === 0) {
      outcomes.push({ doc_id: t.doc_id, status: "skipped", reason: "no readable symbols to anchor" });
      return null;
    }
    return { input: { doc_id: t.doc_id, file: t.file, symbols: symInput }, anchors };
  };
  const writeDoc = async (docId, content, anchors) => {
    if (content.trim() === "") {
      outcomes.push({ doc_id: docId, status: "failed", reason: "empty content" });
      return;
    }
    try {
      const content_embedding = args.embed ? await args.embed(content) ?? void 0 : void 0;
      await upsertDoc(args.query, args.tableName, {
        doc_id: docId,
        path: defaultVfsPath(project, docId),
        content,
        anchors,
        tier: "fast",
        project,
        agent: args.agent ?? "docs-generate",
        plugin_version: args.pluginVersion,
        content_embedding
      });
      outcomes.push({ doc_id: docId, status: "created" });
    } catch (err) {
      outcomes.push({ doc_id: docId, status: "failed", reason: `write failed: ${err.message}` });
    }
  };
  const genSingle = async (input, anchors) => {
    let content;
    try {
      content = await args.generate(input);
    } catch (err) {
      outcomes.push({ doc_id: input.doc_id, status: "failed", reason: `generate failed: ${err.message}` });
      return;
    }
    await writeDoc(input.doc_id, content, anchors);
  };
  const concurrency = args.concurrency ?? 4;
  const batchSize = args.batchSize ?? 1;
  if (batchSize > 1 && args.batchGenerate) {
    const prepped = targets.map(prep).filter((p) => p !== null);
    const batches = [];
    for (let i = 0; i < prepped.length; i += batchSize)
      batches.push(prepped.slice(i, i + batchSize));
    const batchGen = args.batchGenerate;
    await runPool(batches, concurrency, async (batch) => {
      let map;
      try {
        map = await batchGen(batch.map((b) => b.input));
      } catch {
        map = /* @__PURE__ */ new Map();
      }
      for (const b of batch) {
        const content = map.get(b.input.doc_id);
        if (content && content.trim() !== "")
          await writeDoc(b.input.doc_id, content, b.anchors);
        else
          await genSingle(b.input, b.anchors);
      }
    });
  } else {
    await runPool(targets, concurrency, async (t) => {
      const p = prep(t);
      if (p)
        await genSingle(p.input, p.anchors);
    });
  }
  return {
    outcomes,
    targets: targets.length,
    created: outcomes.filter((o) => o.status === "created").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length
  };
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
    const path = line.slice(tab + 1);
    if (meta.length >= 3 && meta[1] === "blob" && path)
      fp[path] = meta[2];
  }
  return fp;
}
function computeFingerprint(git, files) {
  return computeFingerprintAt(git, "HEAD", files);
}
function workingTreeClean(git, files) {
  if (files.length === 0)
    return true;
  const out = git(["status", "--porcelain", "--", ...files]);
  if (out === null)
    return true;
  return out.trim() === "";
}
function sourcePushed(git, files, branch) {
  if (files.length === 0)
    return true;
  const head = computeFingerprint(git, files);
  const origin = computeFingerprintAt(git, `origin/${branch}`, files);
  return isFresh(head, origin);
}
function serializeFingerprint(fp) {
  const sorted = {};
  for (const k of Object.keys(fp).sort())
    sorted[k] = fp[k];
  return JSON.stringify(sorted);
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
function isFresh(stored, current) {
  return changedFiles(stored, current).length === 0;
}

// dist/src/docs/candidates.js
import { execFileSync } from "node:child_process";

// dist/src/graph/render/impact.js
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
function impactedNodes(snap, seeds, opts) {
  return new Set(reverseBfs(snap, seeds, opts?.maxDepth).depthOf.keys());
}

// dist/src/docs/candidates.js
function defaultGit(cwd) {
  return (args) => {
    try {
      return execFileSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      return null;
    }
  };
}
function collect(out, into) {
  if (out === null)
    return;
  for (const line of out.split("\n")) {
    const f = line.trim();
    if (f)
      into.add(f);
  }
}
function changedFilesFromGit(cwd, git = defaultGit(cwd)) {
  const workingTree = git(["diff", "--name-only", "HEAD"]);
  if (workingTree === null)
    return null;
  const files = /* @__PURE__ */ new Set();
  collect(workingTree, files);
  collect(git(["ls-files", "--others", "--exclude-standard"]), files);
  collect(git(["diff", "--name-only", "HEAD~1", "HEAD"]), files);
  return [...files];
}
function expandToCandidateFiles(snap, changedFiles2) {
  const changed = new Set(changedFiles2);
  const out = new Set(changed);
  const seedIds = snap.nodes.filter((n) => changed.has(n.source_file)).map((n) => n.id);
  if (seedIds.length > 0) {
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    for (const id of impactedNodes(snap, seedIds)) {
      const node = byId.get(id);
      if (node)
        out.add(node.source_file);
    }
  }
  return [...out];
}

// dist/src/docs/wiki-groups.js
var DEFAULT_MAX_FILES = 40;
function keyFor(file, depth) {
  const parts = file.split("/");
  if (parts.length <= depth)
    return parts.slice(0, -1).join("/") || parts[0];
  return parts.slice(0, depth).join("/");
}
function baseDepth(file) {
  return file.split("/")[0] === "src" ? 3 : 2;
}
function groupFilesBySubsystem(files, opts = {}) {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const groups = /* @__PURE__ */ new Map();
  for (const f of files) {
    const key = keyFor(f, baseDepth(f));
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [key, members] of groups) {
    if (members.length <= maxFiles) {
      out.set(key, members);
      continue;
    }
    const depth = key.split("/").length + 1;
    for (const f of members) {
      const deeper = keyFor(f, depth);
      const target = deeper === f ? key : deeper;
      const list = out.get(target) ?? [];
      list.push(f);
      out.set(target, list);
    }
  }
  return [...out.entries()].map(([key, members]) => ({ key, files: [...members].sort() })).sort((a, b) => a.key.localeCompare(b.key));
}

// dist/src/docs/wiki-generate.js
var WIKI_DOC_PREFIX = "wiki/";
function wikiDocId(key) {
  return `${WIKI_DOC_PREFIX}${key}`;
}
var DEFAULT_CHUNK_CHARS = 12e4;
var MIN_GROUP_FILES = 3;
var MIN_GROUP_CHARS = 8e3;
function splitOversizedFile(s, maxChars) {
  if (s.content.length <= maxChars)
    return [s];
  const parts = [];
  const total = Math.ceil(s.content.length / maxChars);
  for (let i = 0; i < total; i++) {
    parts.push({
      file: `${s.file} [part ${i + 1}/${total}]`,
      content: s.content.slice(i * maxChars, (i + 1) * maxChars)
    });
  }
  return parts;
}
function chunkFiles(sources, chunkChars = DEFAULT_CHUNK_CHARS) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const raw of sources) {
    for (const s of splitOversizedFile(raw, chunkChars)) {
      const len = s.content.length + s.file.length + 32;
      if (current.length > 0 && size + len > chunkChars) {
        chunks.push(current);
        current = [];
        size = 0;
      }
      current.push(s);
      size += len;
    }
  }
  if (current.length > 0)
    chunks.push(current);
  return chunks;
}
function renderSources(sources) {
  return sources.map((s) => `### ${s.file}
\`\`\`
${s.content}
\`\`\``).join("\n\n");
}
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
function buildWikiPagePrompt(key, sources) {
  return [
    `You are writing an internal wiki page for the subsystem \`${key}\`.`,
    PAGE_STYLE,
    "",
    "=== SOURCE ===",
    "",
    renderSources(sources)
  ].join("\n");
}
function buildWikiNotesPrompt(key, sources, chunkIdx, chunkTotal) {
  return [
    `You are reading part ${chunkIdx + 1} of ${chunkTotal} of the subsystem \`${key}\` to prepare notes for a wiki page.`,
    "For each file: 1-3 bullet points on its responsibility and how it connects to the",
    "rest (imports/exports/calls). Note cross-file flows you can SEE in this code.",
    "Every bullet must name the file and symbol it comes from \u2014 the synthesis step",
    "can only trust attributed notes. Do not generalize beyond this chunk.",
    "Never record line numbers (they rot and mislead the synthesis); file + symbol only.",
    "Be terse and factual \u2014 these notes feed a synthesis step, not humans.",
    "Output ONLY markdown bullets grouped under `### <file>` headings.",
    "",
    "=== SOURCE ===",
    "",
    renderSources(sources)
  ].join("\n");
}
function buildWikiSynthesisPrompt(key, notes) {
  return [
    `You are writing an internal wiki page for the subsystem \`${key}\`,`,
    "synthesized from the reading notes below (taken across the whole subsystem).",
    "The notes are your ONLY source: keep every claim attributed to the file the",
    "note attributes it to \u2014 never move behavior to a different file, and never",
    "merge two notes into a broader rule neither of them states.",
    PAGE_STYLE,
    "",
    "=== NOTES ===",
    "",
    notes.map((n, i) => `--- notes part ${i + 1} ---
${n}`).join("\n\n")
  ].join("\n");
}
var REFUSAL_RE = /\b(I can only|I cannot|I can't|I'm unable|I am unable|I don't have|I do not have|could you (provide|share)|please (provide|share)|as an AI)\b/i;
function validateWikiNarrative(narrative) {
  if (narrative.trim() === "")
    return { ok: false, reason: "empty content" };
  if (REFUSAL_RE.test(narrative))
    return { ok: false, reason: "model refused instead of writing the page" };
  if (!/^##? /m.test(narrative))
    return { ok: false, reason: "no markdown section headings \u2014 not a page" };
  return { ok: true };
}
var FILES_INDEX_HEADER = "## Files";
function stripFilesIndex(content) {
  return content.replace(/^## Files\s*$[\s\S]*?(?=^## |\n*$(?![\s\S]))/gm, "").trimEnd();
}
function appendFilesIndex(narrative, files) {
  const index = [FILES_INDEX_HEADER, "", ...files.map((f) => `- \`${f}\``)].join("\n");
  return `${stripFilesIndex(narrative)}

${index}
`;
}
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
function collectWikiAnchors(snap, files, repoRoot) {
  const wanted = new Set(files);
  const anchors = [];
  for (const t of selectTargets(snap, { scope: "file", include: [...wanted] })) {
    if (!wanted.has(t.file))
      continue;
    for (const node of t.symbols) {
      const a = buildAnchor(node, repoRoot);
      if (a)
        anchors.push(a);
    }
  }
  return anchors;
}
function selectWikiGroups(snap, opts = {}) {
  const targets = selectTargets(snap, { scope: "file", include: opts.include, exclude: opts.exclude });
  return groupFilesBySubsystem(targets.map((t) => t.file), { maxFiles: opts.maxFiles });
}
function defaultWikiVfsPath(project, key) {
  return `/docs/${project || "default"}/wiki/${key}.md`;
}
function wikiGroupEligible(files, repoRoot, minFiles = MIN_GROUP_FILES, minChars = MIN_GROUP_CHARS) {
  let total = 0;
  let present = 0;
  for (const f of files) {
    try {
      total += statSync(join2(repoRoot, f)).size;
      present++;
    } catch {
    }
  }
  return !(present < minFiles && total < minChars);
}
async function generateWikiPages(args) {
  const project = args.project ?? "";
  const scope = args.scope ?? "main";
  let groups = selectWikiGroups(args.snap, {
    include: args.include,
    exclude: args.exclude,
    maxFiles: args.maxFilesPerGroup
  });
  if (!args.force)
    groups = groups.filter((g) => !args.existing.has(wikiDocId(g.key)));
  if (args.limit !== void 0)
    groups = groups.slice(0, args.limit);
  const outcomes = [];
  await runPool(groups, args.concurrency ?? 2, async (group) => {
    const docId = wikiDocId(group.key);
    const sources = [];
    for (const file of group.files) {
      try {
        sources.push({ file, content: readFileSync2(join2(args.repoRoot, file), "utf-8") });
      } catch {
      }
    }
    if (sources.length === 0) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: 0, status: "skipped", reason: "no readable member sources" });
      return;
    }
    const totalChars = sources.reduce((n, s) => n + s.content.length, 0);
    if (sources.length < (args.minGroupFiles ?? MIN_GROUP_FILES) && totalChars < (args.minGroupChars ?? MIN_GROUP_CHARS)) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: 0, status: "skipped", reason: `below min size (${sources.length} file(s), ${totalChars} chars)` });
      return;
    }
    const chunks = chunkFiles(sources, args.chunkChars ?? DEFAULT_CHUNK_CHARS);
    const runPage = args.runPage ?? args.run;
    let narrative;
    try {
      if (chunks.length === 1) {
        narrative = await runPage(buildWikiPagePrompt(group.key, chunks[0]));
      } else {
        const notes = [];
        for (let i = 0; i < chunks.length; i++) {
          notes.push(await args.run(buildWikiNotesPrompt(group.key, chunks[i], i, chunks.length)));
        }
        narrative = await runPage(buildWikiSynthesisPrompt(group.key, notes));
      }
    } catch (err) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "failed", reason: `generate failed: ${err.message}` });
      return;
    }
    const valid = validateWikiNarrative(narrative);
    if (!valid.ok) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "failed", reason: valid.reason });
      return;
    }
    const content = appendFilesIndex(narrative, group.files);
    const anchors = collectWikiAnchors(args.snap, group.files, args.repoRoot);
    try {
      const content_embedding = args.embed ? await args.embed(content) ?? void 0 : void 0;
      const source_fp = serializeFingerprint(computeFingerprint(defaultGit(args.repoRoot), group.files));
      await upsertDoc(args.query, args.tableName, {
        doc_id: docId,
        path: defaultWikiVfsPath(project, group.key),
        content,
        anchors,
        tier: "slow",
        project,
        scope,
        source_fp,
        agent: args.agent ?? "docs-wiki",
        plugin_version: args.pluginVersion,
        content_embedding
      });
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "created" });
    } catch (err) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "failed", reason: `write failed: ${err.message}` });
    }
  });
  return {
    outcomes,
    groups: groups.length,
    created: outcomes.filter((o) => o.status === "created").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length
  };
}

// dist/src/docs/refresh-llm.js
import { execFileSync as execFileSync3 } from "node:child_process";

// dist/src/utils/resolve-cli-bin.js
import { execFileSync as execFileSync2 } from "node:child_process";
import { homedir } from "node:os";
import { join as join3 } from "node:path";
function resolveCliBin(cli, fallback) {
  const isWin = process.platform === "win32";
  try {
    const out = execFileSync2(isWin ? "where" : "which", [cli], {
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
  const local = join3(homedir(), ".claude", "local", cli);
  return isWin ? `${local}.cmd` : local;
}
function binNeedsShell(bin) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
}
function shellFile(bin) {
  return binNeedsShell(bin) ? `"${bin}"` : bin;
}

// dist/src/hooks/wiki-worker-spawn.js
var CLAUDE_FLAGS = [
  "--no-session-persistence",
  "--model",
  "haiku",
  "--permission-mode",
  "bypassPermissions"
];
function buildClaudeInvocation(claudeBin, prompt) {
  if (binNeedsShell(claudeBin)) {
    return {
      file: shellFile(claudeBin),
      args: ["-p", ...CLAUDE_FLAGS],
      // windowsHide: the wiki worker is a detached, console-less process, so
      // without CREATE_NO_WINDOW Windows allocates a visible console window
      // (titled after the CLI exe) for the child. No-op on POSIX.
      options: { input: prompt, stdio: ["pipe", "pipe", "pipe"], shell: true, windowsHide: true }
    };
  }
  return {
    file: claudeBin,
    args: ["-p", prompt, ...CLAUDE_FLAGS],
    options: { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  };
}
function buildTrailingPromptInvocation(bin, flags, prompt) {
  if (binNeedsShell(bin)) {
    return {
      file: shellFile(bin),
      args: [...flags],
      // windowsHide: see buildClaudeInvocation — suppress the visible console
      // window Windows would pop for a child of the console-less worker.
      options: { input: prompt, stdio: ["pipe", "pipe", "pipe"], shell: true, windowsHide: true }
    };
  }
  return {
    file: bin,
    args: [...flags, prompt],
    options: { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  };
}
function buildStdinPromptInvocation(bin, flags, prompt) {
  return {
    file: shellFile(bin),
    args: [...flags],
    options: {
      input: prompt,
      stdio: ["pipe", "pipe", "pipe"],
      // windowsHide: see buildClaudeInvocation — the doc/wiki worker is a
      // detached, console-less process, so without CREATE_NO_WINDOW Windows
      // pops a visible console window for the summarizer CLI. No-op on POSIX.
      windowsHide: true,
      ...binNeedsShell(bin) ? { shell: true } : {}
    }
  };
}
function buildClaudeStdinInvocation(claudeBin, prompt) {
  return buildStdinPromptInvocation(claudeBin, ["-p", ...CLAUDE_FLAGS], prompt);
}

// dist/src/user-config.js
import { existsSync, mkdirSync, readFileSync as readFileSync3, renameSync, writeFileSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname, join as join4 } from "node:path";
var _configPath = () => process.env.HIVEMIND_CONFIG_PATH ?? join4(homedir2(), ".deeplake", "config.json");
var _cache = null;
var _migrated = false;
function readUserConfig() {
  if (_cache !== null)
    return _cache;
  const path = _configPath();
  if (!existsSync(path)) {
    _cache = {};
    return _cache;
  }
  try {
    const raw = readFileSync3(path, "utf-8");
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
  const dir = dirname(path);
  if (!existsSync(dir))
    mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  renameSync(tmp, path);
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
function setEmbeddingsEnabled(enabled) {
  writeUserConfig({ embeddings: { enabled } });
}
function getDocsLlmAgent() {
  const v = readUserConfig().docs?.llmAgent;
  return typeof v === "string" && v.trim() !== "" ? v : void 0;
}
function setDocsLlmAgent(agent) {
  writeUserConfig({ docs: { llmAgent: agent } });
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

// dist/src/docs/gate.js
var DEFAULT_MAX_CHANGED_LINES = 40;
var GATE_MAX_CONTENT_LENGTH = 5e4;
function countChangedLines(prev, next) {
  const a = prev === "" ? [] : prev.split("\n");
  const b = next === "" ? [] : next.split("\n");
  const n = a.length;
  const m = b.length;
  if (n === 0)
    return m;
  if (m === 0)
    return n;
  let prevRow = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const curRow = new Array(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      curRow[j] = a[i - 1] === b[j - 1] ? prevRow[j - 1] + 1 : Math.max(prevRow[j], curRow[j - 1]);
    }
    prevRow = curRow;
  }
  const lcs = prevRow[m];
  return n - lcs + (m - lcs);
}
function gateDocEdit(input) {
  const reasons = [];
  const tooLong = input.newContent.length > GATE_MAX_CONTENT_LENGTH;
  if (input.newContent.length === 0) {
    reasons.push("proposed content is empty");
  }
  if (tooLong) {
    reasons.push(`proposed content exceeds ${GATE_MAX_CONTENT_LENGTH} chars (got ${input.newContent.length})`);
  }
  if (input.tier === "slow" && !input.allowSlow) {
    reasons.push("slow-tier docs are human-curated; automatic refresh is not allowed");
  }
  const nodeIds = new Set(input.snap.nodes.map((n) => n.id));
  for (const a of input.newAnchors) {
    if (!nodeIds.has(a.symbol_id)) {
      reasons.push(`anchor references a symbol absent from the graph: ${a.symbol_id}`);
    }
  }
  let changedLines = 0;
  if (!tooLong) {
    changedLines = countChangedLines(input.prevContent, input.newContent);
    const budget = input.maxChangedLines ?? DEFAULT_MAX_CHANGED_LINES;
    if (changedLines > budget) {
      reasons.push(`edit exceeds the bounded-change budget: ${changedLines} > ${budget} lines`);
    }
  }
  return { ok: reasons.length === 0, reasons, changedLines };
}

// dist/src/docs/refresh.js
function buildRefreshPrompt(ctx) {
  const changed = ctx.changedSymbols.map((s) => `### ${s.symbol_id}
${s.signature ? s.signature + "\n" : ""}
\`\`\`
${s.source}
\`\`\``).join("\n\n");
  return [
    "You are updating ONE internal documentation file so it matches the code again.",
    "The code below changed; the current doc may now be inaccurate.",
    "",
    "RULES:",
    "- Make the SMALLEST edit that restores accuracy. Do NOT rewrite the whole doc.",
    "- Preserve the existing structure, headings, and any sections unrelated to the change.",
    "- Output ONLY the full updated markdown body. No preamble, no code fences around the whole thing.",
    "",
    `## Current doc (${ctx.doc.doc_id})`,
    ctx.doc.content,
    "",
    "## Code that changed (current source)",
    changed || "(no symbol source available)"
  ].join("\n");
}
function reanchor(doc, nodeById, repoRoot) {
  const out = [];
  for (const a of doc.anchors) {
    const node = nodeById.get(a.symbol_id);
    if (!node)
      continue;
    const fresh = buildAnchor(node, repoRoot);
    if (fresh)
      out.push(fresh);
  }
  return out;
}
function gatherChangedSymbols(reasons, nodeById, repoRoot) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of reasons) {
    if (seen.has(r.symbol_id))
      continue;
    seen.add(r.symbol_id);
    const node = nodeById.get(r.symbol_id);
    if (!node)
      continue;
    const source = readSymbolSource(node, repoRoot);
    if (source === null)
      continue;
    out.push({ symbol_id: r.symbol_id, signature: node.signature, source });
  }
  return out;
}
async function refreshDocs(args) {
  const nodeById = new Map(args.snap.nodes.map((n) => [n.id, n]));
  const outcomes = [];
  await runPool(args.impacted, args.concurrency ?? 4, async (imp) => {
    const doc = args.docsById.get(imp.doc_id);
    if (!doc) {
      outcomes.push({ doc_id: imp.doc_id, status: "skipped", reasons: ["no current doc row"] });
      return;
    }
    if (doc.tier === "slow") {
      outcomes.push({
        doc_id: imp.doc_id,
        status: "rejected",
        reasons: ["slow-tier docs are human-curated; automatic refresh is not allowed"]
      });
      return;
    }
    const newAnchors = reanchor(doc, nodeById, args.repoRoot);
    if (doc.anchors.length > 0 && newAnchors.length === 0) {
      const res2 = await archiveDoc(args.query, args.tableName, {
        doc_id: doc.doc_id,
        agent: args.agent ?? "docs-refresh",
        plugin_version: args.pluginVersion
      }, { project: doc.project });
      outcomes.push({
        doc_id: imp.doc_id,
        status: "archived",
        version: res2.version,
        reasons: ["all anchored symbols gone (file deleted/renamed)"]
      });
      return;
    }
    const changedSymbols = gatherChangedSymbols(imp.reasons, nodeById, args.repoRoot);
    let newContent;
    try {
      newContent = await withRateLimitRetry(() => args.generate({ doc, reasons: imp.reasons, changedSymbols }));
    } catch (err) {
      outcomes.push({ doc_id: imp.doc_id, status: "skipped", reasons: [`generate failed: ${err.message}`] });
      return;
    }
    const gate = gateDocEdit({
      tier: doc.tier,
      prevContent: doc.content,
      newContent,
      newAnchors,
      snap: args.snap,
      maxChangedLines: args.maxChangedLines
    });
    if (!gate.ok) {
      outcomes.push({ doc_id: imp.doc_id, status: "rejected", reasons: gate.reasons });
      return;
    }
    const content_embedding = args.embed ? await args.embed(newContent).catch(() => null) ?? void 0 : void 0;
    const res = await setDoc(args.query, args.tableName, {
      doc_id: doc.doc_id,
      path: doc.path,
      content: newContent,
      anchors: newAnchors,
      tier: doc.tier,
      project: doc.project,
      agent: args.agent ?? "docs-refresh",
      plugin_version: args.pluginVersion,
      content_embedding
    }, { project: doc.project });
    outcomes.push({ doc_id: imp.doc_id, status: "refreshed", version: res.version });
  });
  return {
    outcomes,
    refreshed: outcomes.filter((o) => o.status === "refreshed").length,
    rejected: outcomes.filter((o) => o.status === "rejected").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    archived: outcomes.filter((o) => o.status === "archived").length
  };
}

// dist/src/docs/refresh-llm.js
function unwrapModelOutput(raw) {
  const text = raw.trim();
  const fence = /^```[^\n]*\n([\s\S]*?)\n```$/.exec(text);
  return fence ? fence[1].trim() : text;
}
function codexSpec(env) {
  const model = env.HIVEMIND_DOCS_CODEX_MODEL;
  const flags = [
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    ...model && model.trim() !== "" ? ["-m", model] : [],
    "-c",
    'model_reasoning_effort="low"',
    "-"
  ];
  return { label: "codex", bin: "codex", build: (b, p) => buildStdinPromptInvocation(b, flags, p) };
}
var REGISTRY = {
  claude: () => ({ label: "claude", bin: "claude", build: (b, p) => buildClaudeStdinInvocation(b, p) }),
  codex: codexSpec,
  pi: (env) => ({
    label: "pi",
    bin: "pi",
    // No provider/model defaults: pi uses whatever the user logged into
    // (forcing e.g. google would break an anthropic-OAuth login — verified
    // live). Env overrides remain for explicit pinning.
    build: (b, p) => buildTrailingPromptInvocation(b, [
      "--print",
      ...env.HIVEMIND_PI_PROVIDER ? ["--provider", env.HIVEMIND_PI_PROVIDER] : [],
      ...env.HIVEMIND_PI_MODEL ? ["--model", env.HIVEMIND_PI_MODEL] : []
    ], p)
  }),
  cursor: (env) => ({
    label: "cursor",
    bin: "cursor-agent",
    build: (b, p) => buildTrailingPromptInvocation(b, [
      "--print",
      "--model",
      env.HIVEMIND_CURSOR_MODEL ?? "auto",
      "--force",
      "--output-format",
      "text"
    ], p)
  })
};
function detectHostAgent(resolve = tryResolveCliBin) {
  for (const name of ["claude", "codex", "pi", "cursor"]) {
    const spec = REGISTRY[name]({});
    if (resolve(spec.bin) !== null)
      return name;
  }
  throw new Error("No host agent CLI found for doc generation (looked for: claude, codex, pi, cursor-agent). Install one, or set HIVEMIND_DOCS_LLM_AGENT / HIVEMIND_DOCS_LLM_BIN explicitly.");
}
function tryResolveCliBin(bin) {
  try {
    return resolveCliBin(bin);
  } catch {
    return null;
  }
}
function knownDocsAgents() {
  return ["claude", "codex", "pi", "cursor"];
}
function detectAvailableAgents(resolve = tryResolveCliBin) {
  return knownDocsAgents().filter((name) => resolve(REGISTRY[name]({}).bin) !== null);
}
function resolvePageLlmSpec(env = process.env) {
  const base = resolveDocLlmSpec(env);
  if (base.label === "claude") {
    const model = env.HIVEMIND_DOCS_PAGE_MODEL ?? "sonnet";
    const flags = ["-p", "--no-session-persistence", "--model", model, "--permission-mode", "bypassPermissions"];
    return { label: `claude:${model}`, bin: base.bin, build: (b, p) => buildStdinPromptInvocation(b, flags, p) };
  }
  if (base.label === "codex") {
    const model = env.HIVEMIND_DOCS_CODEX_MODEL;
    const flags = [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      ...model && model.trim() !== "" ? ["-m", model] : [],
      "-c",
      'model_reasoning_effort="medium"',
      "-"
    ];
    return { label: "codex:medium", bin: base.bin, build: (b, p) => buildStdinPromptInvocation(b, flags, p) };
  }
  return base;
}
function makeHostPageRunPrompt(timeoutMs = 3e5, env = process.env) {
  const spec = resolvePageLlmSpec(env);
  const bin = resolveCliBin(spec.bin);
  return async (prompt) => runHostPrompt(spec, bin, prompt, timeoutMs);
}
function resolveDocLlmSpec(env = process.env) {
  const customBin = env.HIVEMIND_DOCS_LLM_BIN;
  if (customBin && customBin.trim() !== "") {
    const flags = (env.HIVEMIND_DOCS_LLM_FLAGS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const viaStdin = env.HIVEMIND_DOCS_LLM_STDIN === "1";
    return {
      label: `custom:${customBin}`,
      bin: customBin,
      build: (b, p) => viaStdin ? buildStdinPromptInvocation(b, flags, p) : buildTrailingPromptInvocation(b, flags, p)
    };
  }
  const agent = (env.HIVEMIND_DOCS_LLM_AGENT ?? getDocsLlmAgent() ?? detectHostAgent()).toLowerCase();
  const spec = REGISTRY[agent]?.(env);
  if (!spec) {
    throw new Error(`Unknown HIVEMIND_DOCS_LLM_AGENT="${agent}". Known: ${Object.keys(REGISTRY).join(", ")}. For any other CLI set HIVEMIND_DOCS_LLM_BIN (and HIVEMIND_DOCS_LLM_FLAGS).`);
  }
  return spec;
}
function runHostPrompt(spec, bin, prompt, timeoutMs = 12e4) {
  const inv = spec.build(bin, prompt);
  const out = execFileSync3(inv.file, inv.args, {
    ...inv.options,
    encoding: "utf-8",
    timeout: timeoutMs,
    env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" }
  });
  return unwrapModelOutput((out ?? "").toString());
}
function makeHostGenerate(timeoutMs = 12e4, env = process.env) {
  const spec = resolveDocLlmSpec(env);
  const bin = resolveCliBin(spec.bin);
  return async (ctx) => runHostPrompt(spec, bin, buildRefreshPrompt(ctx), timeoutMs);
}
function makeHostGenerateDoc(timeoutMs = 12e4, env = process.env) {
  const spec = resolveDocLlmSpec(env);
  const bin = resolveCliBin(spec.bin);
  return async (input) => runHostPrompt(spec, bin, buildGeneratePrompt(input), timeoutMs);
}
function makeHostBatchGenerateDoc(timeoutMs = 24e4, env = process.env) {
  const spec = resolveDocLlmSpec(env);
  const bin = resolveCliBin(spec.bin);
  return async (inputs) => {
    const raw = runHostPrompt(spec, bin, buildBatchGeneratePrompt(inputs), timeoutMs);
    return parseBatchDocs(raw, inputs);
  };
}
function makeHostRunPrompt(timeoutMs = 3e5, env = process.env) {
  const spec = resolveDocLlmSpec(env);
  const bin = resolveCliBin(spec.bin);
  return async (prompt) => runHostPrompt(spec, bin, prompt, timeoutMs);
}

// dist/src/docs/onboarding.js
function defaultIo() {
  return {
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    say: (line) => console.log(line),
    ask: (question) => new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    })
  };
}
var YES = /^y(es)?$/i;
var STATUS_HINT = "See sync status anytime with: hivemind docs list";
async function runDocsOnboarding(args) {
  const io = args.io ?? defaultIo();
  const rootLine = `project root: ${args.root} (${args.isGitRepo ? "git repository" : "no git \u2014 current folder"}${args.orgName ? `, org: ${args.orgName}` : ""})`;
  if (!args.isGitRepo) {
    io.say(rootLine);
    io.say("Auto doc sync requires a git repository (it reacts to commits).");
    io.say("Docs can still be generated manually with: hivemind docs wiki");
    return { generate: false, auto: false, asked: false };
  }
  if (!io.interactive) {
    return { generate: false, auto: false, asked: false };
  }
  io.say(rootLine);
  const pages = args.snap ? selectWikiGroups(args.snap).length : null;
  const estimate = pages !== null ? `~${pages} pages, one-time LLM cost` : "one-time LLM cost";
  const genAnswer = await io.ask(`Generate wiki docs for this repo now? (${estimate}) [y/N] `);
  if (!YES.test(genAnswer.trim())) {
    io.say("Skipped. Generate later with: hivemind docs wiki");
    io.say(STATUS_HINT);
    return { generate: false, auto: false, asked: true };
  }
  const getAgent = args.getAgent ?? getDocsLlmAgent;
  const setAgent = args.setAgent ?? setDocsLlmAgent;
  const detectAgents = args.detectAgents ?? detectAvailableAgents;
  if (!getAgent()) {
    const available = detectAgents();
    if (available.length > 1) {
      const raw = (await io.ask(`Which agent should write the docs? [${available.join("/")}] (default: ${available[0]}) `)).trim().toLowerCase();
      const chosen = available.includes(raw) ? raw : available[0];
      setAgent(chosen);
      io.say(`Docs will be authored by: ${chosen}. Change with: hivemind docs agent <name>`);
    }
  }
  const autoAnswer = await io.ask("Keep them automatically in sync on every commit? Docs stay fresh but this consumes more LLM tokens over time. [y/N] ");
  const auto = YES.test(autoAnswer.trim());
  if (auto) {
    setAuto({ orgId: args.orgId, orgName: args.orgName, project: args.project, path: args.root, auto: true });
    io.say(`Auto sync ON for this repo on org ${args.orgName ?? args.orgId}. Turn off with: hivemind docs auto off`);
  } else {
    io.say("Manual mode: sync when you want with: hivemind docs sync");
  }
  io.say(STATUS_HINT);
  return { generate: true, auto, asked: true };
}

export {
  getEmbeddingsEnabled,
  setEmbeddingsEnabled,
  getDocsLlmAgent,
  setDocsLlmAgent,
  sqlStr,
  sqlLike,
  sqlIdent,
  embeddingSqlLiteral,
  stableUnionRows,
  MAIN_SCOPE,
  parseScope,
  currentBranch,
  trunkBranch,
  currentScope,
  listDocs,
  listDocMeta,
  listDocsByIds,
  getDocLatest,
  docRowId,
  upsertDoc,
  editDoc,
  setDoc,
  archiveDoc,
  impactedNodes,
  defaultGit,
  changedFilesFromGit,
  expandToCandidateFiles,
  computeSymbolHash,
  buildAnchor,
  gateDocEdit,
  runPool,
  selectTargets,
  generateDocs,
  computeFingerprint,
  workingTreeClean,
  sourcePushed,
  serializeFingerprint,
  parseFingerprint,
  isFresh,
  WIKI_DOC_PREFIX,
  wikiDocId,
  stripFilesIndex,
  appendFilesIndex,
  parseFilesIndex,
  collectWikiAnchors,
  selectWikiGroups,
  wikiGroupEligible,
  generateWikiPages,
  resolveCliBin,
  buildClaudeInvocation,
  refreshDocs,
  unwrapModelOutput,
  knownDocsAgents,
  detectAvailableAgents,
  makeHostPageRunPrompt,
  makeHostGenerate,
  makeHostGenerateDoc,
  makeHostBatchGenerateDoc,
  makeHostRunPrompt,
  defaultIo,
  STATUS_HINT,
  runDocsOnboarding
};
