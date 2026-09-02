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
import { existsSync as existsSync2, mkdirSync as mkdirSync6, readFileSync as readFileSync7, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join9 } from "node:path";
import { tmpdir } from "node:os";
function getIndexMarkerDir() {
  return process.env.HIVEMIND_INDEX_MARKER_DIR ?? join9(tmpdir(), "hivemind-deeplake-indexes");
}
function buildIndexMarkerPath(workspaceId, orgId, table, suffix) {
  const markerKey = [workspaceId, orgId, table, suffix].join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join9(getIndexMarkerDir(), `${markerKey}.json`);
}
function hasFreshIndexMarker(markerPath) {
  if (!existsSync2(markerPath))
    return false;
  try {
    const raw = JSON.parse(readFileSync7(markerPath, "utf-8"));
    const updatedAt = raw.updatedAt ? new Date(raw.updatedAt).getTime() : NaN;
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > INDEX_MARKER_TTL_MS)
      return false;
    return true;
  } catch {
    return false;
  }
}
function writeIndexMarker(markerPath) {
  mkdirSync6(getIndexMarkerDir(), { recursive: true });
  writeFileSync5(markerPath, JSON.stringify({ updatedAt: (/* @__PURE__ */ new Date()).toISOString() }), "utf-8");
}
var INDEX_MARKER_TTL_MS;
var init_index_marker_store = __esm({
  "dist/src/index-marker-store.js"() {
    "use strict";
    INDEX_MARKER_TTL_MS = Number(process.env.HIVEMIND_INDEX_MARKER_TTL_MS ?? 6 * 60 * 6e4);
  }
});

// dist/src/hooks/session-start.js
import { fileURLToPath as fileURLToPath2 } from "node:url";

// dist/src/utils/spawn-detached.js
import { spawn as nodeSpawn } from "node:child_process";
function spawnDetachedNodeWorker(workerPath, args = [], deps = {}) {
  const spawn5 = deps.spawn ?? nodeSpawn;
  const execPath = deps.execPath ?? process.execPath;
  try {
    const child = spawn5(execPath, [workerPath, ...args], {
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

// dist/src/docs/auto-registry.js
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function registryPath() {
  return process.env.HIVEMIND_DOCS_AUTO_FILE ?? join(homedir(), ".deeplake", "docs-auto.json");
}
function readAutoRegistry(file = registryPath()) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    if (!Array.isArray(raw.entries))
      return { entries: [] };
    const entries = raw.entries.filter((e) => !!e && typeof e === "object" && typeof e.orgId === "string" && typeof e.project === "string" && typeof e.path === "string" && typeof e.auto === "boolean");
    return { entries };
  } catch {
    return { entries: [] };
  }
}
function isAutoEnabled(orgId, project, file = registryPath()) {
  return readAutoRegistry(file).entries.some((e) => e.orgId === orgId && e.project === project && e.auto);
}

// dist/src/docs/auto-refresh-trigger.js
function maybeSpawnDocsRefresh(cwd, ctx, deps = {}) {
  const enabled = (deps.isAutoEnabledFn ?? isAutoEnabled)(ctx.orgId, ctx.project);
  if (!enabled)
    return false;
  const cliEntry = deps.cliEntry ?? process.argv[1];
  if (!cliEntry)
    return false;
  const spawn5 = deps.spawn ?? spawnDetachedNodeWorker;
  spawn5(cliEntry, ["docs", "refresh", ...ctx.full ? ["--full"] : [], "--cwd", cwd]);
  spawn5(cliEntry, ["docs", "wiki-refresh", "--cwd", cwd]);
  return true;
}

// dist/src/docs/docs-context.js
var NOTE = `

DOCS WIKI (auto-synced for this repo): narrative wiki pages (one per subsystem) and per-file docs live under ~/.deeplake/memory/docs/, kept in sync with the code on every commit.
- Browse: \`ls ~/.deeplake/memory/docs/\` \u2014 wiki pages under \`docs/wiki/\`, per-file docs mirror source paths.
- Search: \`cat ~/.deeplake/memory/docs/find/<query words>\` (hybrid keyword+semantic).
Use them to ORIENT \u2014 which subsystem or files own a behavior. Confirm every claim about code behavior against the source files before citing it; do not answer from the wiki alone.
Note: the wiki may occasionally be incomplete or lag behind the code (first generation still running, or a refresh cycle pending). If a page is missing or contradicts the source, trust the source.`;
function docsWikiContextNote(orgId, project, isAutoEnabledFn = isAutoEnabled) {
  try {
    return isAutoEnabledFn(orgId, project) ? NOTE : "";
  } catch {
    return "";
  }
}

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

// dist/src/hooks/session-start.js
import { dirname as dirname13, join as join28 } from "node:path";
import { homedir as homedir15 } from "node:os";

// dist/src/utils/client-header.js
var DEEPLAKE_CLIENT_HEADER = "X-Deeplake-Client";
function deeplakeClientValue() {
  return "hivemind";
}
function deeplakeClientHeader() {
  return { [DEEPLAKE_CLIENT_HEADER]: deeplakeClientValue() };
}

// dist/src/commands/install-id.js
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { randomUUID } from "node:crypto";

// dist/src/utils/client-os.js
var HIVEMIND_OS_HEADER = "X-Hivemind-OS";
var OS_NAMES = {
  darwin: "macos",
  win32: "windows",
  linux: "linux"
};
function hivemindOsValue() {
  return OS_NAMES[process.platform] ?? "";
}
function hivemindOsHeader() {
  const os = hivemindOsValue();
  if (!os)
    return {};
  return { [HIVEMIND_OS_HEADER]: os };
}

// dist/src/dashboard/open.js
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { platform as nodePlatform } from "node:os";
import { delimiter, join as join3 } from "node:path";

// dist/src/commands/auth-creds.js
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3, unlinkSync, renameSync as renameSync2 } from "node:fs";
import { join as join4 } from "node:path";
import { homedir as homedir3 } from "node:os";
function configDir() {
  return join4(homedir3(), ".deeplake");
}
function credsPath() {
  return join4(configDir(), "credentials.json");
}
function loadCredentials(readFile = (p) => readFileSync3(p, "utf-8")) {
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
function saveCredentials(creds) {
  mkdirSync3(configDir(), { recursive: true, mode: 448 });
  const target = credsPath();
  const tmp = `${target}.${process.pid}.${process.hrtime.bigint()}.tmp`;
  const body = JSON.stringify({ ...creds, savedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2);
  try {
    writeFileSync3(tmp, body, { mode: 384 });
    renameSync2(tmp, target);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
}

// dist/src/commands/auth.js
var DEFAULT_API_URL = "https://api.deeplake.ai";
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3)
      return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4)
      payload += "=";
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
async function apiGet(path, token, apiUrl, orgId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader(),
    ...hivemindOsHeader()
  };
  if (orgId)
    headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { headers });
  if (!resp.ok)
    throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json();
}
async function apiPost(path, body, token, apiUrl, orgId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader(),
    ...hivemindOsHeader()
  };
  if (orgId)
    headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok)
    throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json();
}
async function listOrgs(token, apiUrl = DEFAULT_API_URL) {
  const data = await apiGet("/organizations", token, apiUrl);
  return Array.isArray(data) ? data : [];
}
async function healDriftedOrgToken(creds, log8 = () => {
}) {
  if (!creds.token || !creds.orgId)
    return creds;
  const payload = decodeJwtPayload(creds.token);
  const claimOrg = payload && typeof payload.org_id === "string" ? payload.org_id : void 0;
  if (!claimOrg || claimOrg === creds.orgId)
    return creds;
  log8(`token org drift detected: jwt.org_id=${claimOrg} creds.orgId=${creds.orgId} \u2014 re-minting`);
  try {
    const apiUrl = creds.apiUrl ?? DEFAULT_API_URL;
    const tokenName = `deeplake-plugin-heal-${Date.now()}`;
    const tokenData = await apiPost("/users/me/tokens", {
      name: tokenName,
      duration: 365 * 24 * 3600,
      organization_id: creds.orgId
    }, creds.token, apiUrl);
    const healed = { ...creds, token: tokenData.token.token };
    try {
      const orgs = await listOrgs(healed.token, apiUrl);
      const matchedOrg = orgs.find((o) => o.id === creds.orgId);
      if (matchedOrg && matchedOrg.name !== creds.orgName) {
        log8(`orgName realigned: ${creds.orgName ?? "(unset)"} -> ${matchedOrg.name}`);
        healed.orgName = matchedOrg.name;
      }
    } catch (e) {
      log8(`orgName realign skipped: ${e.message}`);
    }
    const currentWs = creds.workspaceId ?? "default";
    if (currentWs !== "default") {
      try {
        const wsList = await listWorkspaces(healed.token, apiUrl, creds.orgId);
        const lcWs = currentWs.toLowerCase();
        const wsMatch = wsList.find((w) => w.id === currentWs || w.name && w.name.toLowerCase() === lcWs);
        if (!wsMatch) {
          log8(`workspace '${currentWs}' not in org ${creds.orgId} \u2014 reset to default`);
          healed.workspaceId = "default";
        } else if (wsMatch.id !== currentWs) {
          log8(`workspace '${currentWs}' resolved to id '${wsMatch.id}'`);
          healed.workspaceId = wsMatch.id;
        }
      } catch (e) {
        log8(`workspace realign skipped: ${e.message}`);
      }
    }
    saveCredentials(healed);
    log8(`token re-minted for org=${creds.orgId}`);
    return healed;
  } catch (err) {
    log8(`token re-mint failed (continuing with stale token): ${err.message}`);
    return creds;
  }
}
async function listWorkspaces(token, apiUrl = DEFAULT_API_URL, orgId) {
  const raw = await apiGet("/workspaces", token, apiUrl, orgId);
  const data = raw.data ?? raw;
  return Array.isArray(data) ? data : [];
}

// dist/src/config.js
import { readFileSync as readFileSync4, existsSync } from "node:fs";
import { join as join5 } from "node:path";
import { homedir as homedir4, userInfo } from "node:os";
function loadConfig() {
  const home = homedir4();
  const credPath = join5(home, ".deeplake", "credentials.json");
  let creds = null;
  if (existsSync(credPath)) {
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
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join5(home, ".deeplake", "memory")
  };
}

// dist/src/dir-config.js
import { readFileSync as readFileSync5 } from "node:fs";
import { dirname as dirname2, join as join6, resolve as resolve2 } from "node:path";
var DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"];
function findDirConfig(startDir, stopAt) {
  let dir = resolve2(startDir);
  const boundary = stopAt ? resolve2(stopAt) : null;
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
import { randomUUID as randomUUID2 } from "node:crypto";

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync as mkdirSync4 } from "node:fs";
import { dirname as dirname3, join as join7 } from "node:path";
import { homedir as homedir5 } from "node:os";
var LOG = join7(homedir5(), ".deeplake", "hook-debug.log");
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
    mkdirSync4(dirname3(LOG), { recursive: true });
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
import { readFileSync as readFileSync6, writeFileSync as writeFileSync4, mkdirSync as mkdirSync5, openSync, closeSync, unlinkSync as unlinkSync2, statSync as statSync2 } from "node:fs";
import { join as join8, resolve as resolve4 } from "node:path";
import { homedir as homedir6 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve as resolve3, relative, isAbsolute } from "node:path";
function isPathInsideHome(path, home) {
  const r = resolve3(path);
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
  return join8(homedir6(), ".deeplake", "notifications-queue.json");
}
function lockPath() {
  return `${queuePath()}.lock`;
}
function readQueue() {
  try {
    const raw = readFileSync6(queuePath(), "utf-8");
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
  const home = resolve4(homedir6());
  if (!_isQueuePathInsideHome(path, home)) {
    throw new Error(`notifications-queue write blocked: ${path} is outside ${home}`);
  }
  mkdirSync5(join8(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync4(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameAtomic(tmp, path);
}
async function withQueueLock(fn) {
  const path = lockPath();
  mkdirSync5(join8(homedir6(), ".deeplake"), { recursive: true, mode: 448 });
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
        const age = Date.now() - statSync2(path).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync2(path);
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
      unlinkSync2(path);
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
      const id = randomUUID2();
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

// dist/src/utils/stdin.js
function readStdin() {
  return new Promise((resolve5, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => {
      try {
        resolve5(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Failed to parse hook input: ${err}`));
      }
    });
    process.stdin.on("error", reject);
  });
}

// dist/src/utils/version-check.js
import { readFileSync as readFileSync8 } from "node:fs";
import { dirname as dirname4, join as join10 } from "node:path";
function getInstalledVersion(bundleDir, pluginManifestDir) {
  try {
    const pluginJson = join10(bundleDir, "..", pluginManifestDir, "plugin.json");
    const plugin = JSON.parse(readFileSync8(pluginJson, "utf-8"));
    if (plugin.version)
      return plugin.version;
  } catch {
  }
  try {
    const stamp = readFileSync8(join10(bundleDir, "..", ".hivemind_version"), "utf-8").trim();
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
    const candidate = join10(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync8(candidate, "utf-8"));
      if (HIVEMIND_PKG_NAMES.has(pkg.name) && pkg.version)
        return pkg.version;
    } catch {
    }
    const parent = dirname4(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}

// dist/src/utils/wiki-log.js
import { mkdirSync as mkdirSync7, appendFileSync as appendFileSync2 } from "node:fs";
import { join as join11 } from "node:path";
function makeWikiLogger(hooksDir, filename = "deeplake-wiki.log") {
  const path = join11(hooksDir, filename);
  return {
    path,
    log(msg) {
      try {
        mkdirSync7(hooksDir, { recursive: true });
        appendFileSync2(path, `[${utcTimestamp()}] ${msg}
`);
      } catch {
      }
    }
  };
}

// dist/src/hooks/shared/autoupdate.js
import { spawn as spawn2 } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import { delimiter as delimiter2, join as join12 } from "node:path";
var log4 = (msg) => log("autoupdate", msg);
function isCodexManagedInstall(bundleDir, env = process.env) {
  if (!bundleDir)
    return false;
  const norm = bundleDir.replace(/\\/g, "/");
  if (norm.includes("/.codex/plugins/cache/"))
    return true;
  const codexHome = env.CODEX_HOME;
  if (codexHome && codexHome.trim() !== "") {
    const h = codexHome.replace(/\\/g, "/").replace(/\/+$/, "");
    if (norm.includes(`${h}/plugins/cache/`))
      return true;
  }
  return false;
}
var defaultSpawn = (cmd, args) => {
  const child = spawn2(cmd, args, {
    detached: true,
    stdio: "ignore",
    // SW_HIDE: libuv applies it alongside detached. No-op on POSIX.
    windowsHide: true
  });
  child.unref();
  child.on("error", () => {
  });
  return { pid: child.pid };
};
function findHivemindOnPath() {
  const PATH = process.env.PATH ?? "";
  const dirs = PATH.split(delimiter2).filter(Boolean);
  const candidates = process.platform === "win32" ? ["hivemind.cmd", "hivemind.exe", "hivemind.bat", "hivemind"] : ["hivemind"];
  for (const dir of dirs) {
    for (const name of candidates) {
      const candidate = join12(dir, name);
      if (existsSync3(candidate))
        return candidate;
    }
  }
  return null;
}
async function autoUpdate(creds, opts) {
  const t0 = Date.now();
  log4(`agent=${opts.agent} entered`);
  if (isCodexManagedInstall(opts.bundleDir)) {
    log4(`agent=${opts.agent} skip: Codex-managed install (${opts.bundleDir}); updates come via marketplace snapshots (${Date.now() - t0}ms)`);
    return;
  }
  if (!creds?.token) {
    log4(`agent=${opts.agent} skip: no creds.token (${Date.now() - t0}ms)`);
    return;
  }
  if (creds.autoupdate === false) {
    log4(`agent=${opts.agent} skip: autoupdate=false (${Date.now() - t0}ms)`);
    return;
  }
  const binaryPath = opts.hivemindBinaryPath !== void 0 ? opts.hivemindBinaryPath : findHivemindOnPath();
  if (!binaryPath) {
    log4(`agent=${opts.agent} skip: hivemind binary not on PATH (${Date.now() - t0}ms)`);
    return;
  }
  log4(`agent=${opts.agent} binary=${binaryPath} \u2192 dispatching detached update`);
  const spawnFn = opts.spawn ?? defaultSpawn;
  let pid;
  try {
    pid = spawnFn(binaryPath, ["update"]).pid;
  } catch (e) {
    log4(`agent=${opts.agent} dispatch threw: ${e?.message ?? e} (${Date.now() - t0}ms)`);
    return;
  }
  log4(`agent=${opts.agent} dispatched (pid=${pid ?? "?"}) (${Date.now() - t0}ms total)`);
}

// dist/src/skillify/pull.js
import { existsSync as existsSync8, readFileSync as readFileSync11, writeFileSync as writeFileSync8, mkdirSync as mkdirSync10, renameSync as renameSync5, rmSync, lstatSync as lstatSync2, readlinkSync, symlinkSync, unlinkSync as unlinkSync4 } from "node:fs";
import { homedir as homedir10 } from "node:os";
import { dirname as dirname7, join as join18 } from "node:path";

// dist/src/skillify/skill-writer.js
import { existsSync as existsSync4, mkdirSync as mkdirSync8, readFileSync as readFileSync9, readdirSync, statSync as statSync3, writeFileSync as writeFileSync6 } from "node:fs";
import { homedir as homedir7 } from "node:os";
import { join as join13 } from "node:path";
var MAX_SKILL_NAME_LEN = 64;
var CAP_HASH_LEN = 5;
var CAP_HASH_MOD = 36 ** CAP_HASH_LEN;
function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++)
    h = (h << 5) + h + s.charCodeAt(i) >>> 0;
  return (h % CAP_HASH_MOD).toString(36).padStart(CAP_HASH_LEN, "0");
}
function capSkillName(name) {
  if (name.length <= MAX_SKILL_NAME_LEN)
    return name;
  const suffix = `-${shortHash(name)}`;
  const budget = MAX_SKILL_NAME_LEN - suffix.length;
  let cut = name.slice(0, budget);
  const lastHyphen = cut.lastIndexOf("-");
  if (lastHyphen > 0)
    cut = cut.slice(0, lastHyphen);
  cut = cut.replace(/-+$/, "");
  if (cut.length === 0)
    cut = name.slice(0, budget).replace(/-+$/, "");
  return `${cut}${suffix}`;
}
function assertValidSkillName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`invalid skill name: empty or non-string`);
  }
  if (name.length > 100) {
    throw new Error(`invalid skill name: too long (${name.length} chars)`);
  }
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`invalid skill name: contains path separator or '..': ${name}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`invalid skill name: must be kebab-case (lowercase a-z, 0-9, hyphen): ${name}`);
  }
}
function composeDescription(description, trigger) {
  const desc = (description ?? "").trim();
  const trig = (trigger ?? "").trim();
  if (!trig)
    return desc;
  if (desc.includes(trig) || /use this skill when/i.test(desc))
    return desc;
  const condition = trig.replace(/^(use this skill when|use when|when)\s+/i, "");
  const tail = `Use this skill when ${condition}`;
  if (!desc)
    return tail;
  const lead = /[.!?]$/.test(desc) ? desc : `${desc}.`;
  return `${lead} ${tail}`;
}
function parseFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n"))
    return null;
  const end = text.indexOf("\n---", 4);
  if (end < 0)
    return null;
  const head = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const fm = { source_sessions: [] };
  let arrayKey = null;
  for (const raw of head.split(/\r?\n/)) {
    if (arrayKey) {
      const m2 = raw.match(/^\s+-\s+(.+)$/);
      if (m2) {
        const arr = fm[arrayKey] ?? [];
        arr.push(m2[1].trim());
        fm[arrayKey] = arr;
        continue;
      }
      arrayKey = null;
    }
    if (raw.startsWith("source_sessions:")) {
      arrayKey = "source_sessions";
      continue;
    }
    if (raw.startsWith("contributors:")) {
      arrayKey = "contributors";
      fm.contributors = [];
      continue;
    }
    const m = raw.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m)
      continue;
    const [, k, v] = m;
    let val = v;
    if (v.startsWith('"') && v.endsWith('"')) {
      try {
        val = JSON.parse(v);
      } catch {
      }
    } else if (k === "version") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n))
        val = n;
    }
    fm[k] = val;
  }
  return { fm, body };
}

// dist/src/skillify/manifest.js
import { existsSync as existsSync6, lstatSync, mkdirSync as mkdirSync9, readFileSync as readFileSync10, renameSync as renameSync4, unlinkSync as unlinkSync3, writeFileSync as writeFileSync7 } from "node:fs";
import { dirname as dirname6, join as join16 } from "node:path";

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync5, renameSync as renameSync3 } from "node:fs";
import { dirname as dirname5, join as join15 } from "node:path";

// dist/src/skillify/state-dir.js
import { homedir as homedir8 } from "node:os";
import { join as join14 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join14(homedir8(), ".deeplake", "state", "skillify");
}

// dist/src/skillify/legacy-migration.js
var dlog = (msg) => log("skillify-migrate", msg);
var attempted = false;
function migrateLegacyStateDir() {
  if (process.env.HIVEMIND_STATE_DIR?.trim())
    return;
  if (attempted)
    return;
  attempted = true;
  const current = getStateDir();
  const legacy = join15(dirname5(current), "skilify");
  if (!existsSync5(legacy))
    return;
  if (existsSync5(current))
    return;
  try {
    renameSync3(legacy, current);
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
  return join16(getStateDir(), "pulled.json");
}
function loadManifest(path = manifestPath()) {
  migrateLegacyStateDir();
  if (!existsSync6(path))
    return emptyManifest();
  let raw;
  try {
    raw = readFileSync10(path, "utf-8");
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
function saveManifest(m, path = manifestPath()) {
  migrateLegacyStateDir();
  mkdirSync9(dirname6(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync7(tmp, JSON.stringify(m, null, 2) + "\n", { mode: 384 });
  renameSync4(tmp, path);
}
function recordPull(entry, path = manifestPath()) {
  const m = loadManifest(path);
  const idx = m.entries.findIndex((e) => e.install === entry.install && e.installRoot === entry.installRoot && e.dirName === entry.dirName);
  if (idx >= 0)
    m.entries[idx] = entry;
  else
    m.entries.push(entry);
  saveManifest(m, path);
}
function removePullEntry(install, installRoot, dirName, path = manifestPath()) {
  const m = loadManifest(path);
  const before = m.entries.length;
  m.entries = m.entries.filter((e) => !(e.install === install && e.installRoot === installRoot && e.dirName === dirName));
  if (m.entries.length !== before)
    saveManifest(m, path);
}
function entriesForRoot(m, install, installRoot) {
  return m.entries.filter((e) => e.install === install && e.installRoot === installRoot);
}
function unlinkSymlinks(paths) {
  for (const path of paths) {
    let st;
    try {
      st = lstatSync(path);
    } catch {
      continue;
    }
    if (!st.isSymbolicLink())
      continue;
    try {
      unlinkSync3(path);
    } catch {
    }
  }
}
function pruneOrphanedEntries(path = manifestPath()) {
  const m = loadManifest(path);
  const live = [];
  let pruned = 0;
  for (const e of m.entries) {
    if (existsSync6(join16(e.installRoot, e.dirName))) {
      live.push(e);
      continue;
    }
    unlinkSymlinks(e.symlinks);
    pruned++;
  }
  if (pruned > 0)
    saveManifest({ version: 1, entries: live }, path);
  return pruned;
}

// dist/src/skillify/agent-roots.js
import { existsSync as existsSync7 } from "node:fs";
import { homedir as homedir9 } from "node:os";
import { join as join17 } from "node:path";
function resolveDetected(home) {
  const out = [];
  const codexInstalled = existsSync7(join17(home, ".codex"));
  const piInstalled = existsSync7(join17(home, ".pi", "agent"));
  const hermesInstalled = existsSync7(join17(home, ".hermes"));
  if (codexInstalled || piInstalled) {
    out.push(join17(home, ".agents", "skills"));
  }
  if (hermesInstalled) {
    out.push(join17(home, ".hermes", "skills"));
  }
  if (piInstalled) {
    out.push(join17(home, ".pi", "agent", "skills"));
  }
  return out;
}
function detectAgentSkillsRoots(canonicalRoot, home = homedir9()) {
  return resolveDetected(home).filter((p) => p !== canonicalRoot);
}

// dist/src/skillify/pull.js
function assertValidAuthor(author) {
  if (!author)
    throw new Error("author is empty");
  if (author.length > 64)
    throw new Error(`author too long (${author.length}): ${author.slice(0, 32)}\u2026`);
  if (!/^[A-Za-z0-9_.\-@]+$/.test(author)) {
    throw new Error(`author contains invalid characters: ${author}`);
  }
}
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
function buildPullSql(args) {
  const where = [];
  if (args.users.length > 0) {
    const list = args.users.map((u) => `'${esc(u)}'`).join(", ");
    where.push(`author IN (${list})`);
  }
  if (args.skillName) {
    where.push(`name = '${esc(args.skillName)}'`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const contributorsCol = args.includeContributors === false ? "" : "contributors, ";
  return `SELECT name, project, project_key, body, version, source_agent, scope, author, ${contributorsCol}description, trigger_text, source_sessions, install, created_at, updated_at FROM "${args.tableName}"${whereClause} ORDER BY project_key ASC, name ASC, version DESC`;
}
function isMissingContributorsColumnError(message) {
  if (!message)
    return false;
  return /contributors.*(?:does not exist|not found|unknown)/i.test(message) || /(?:does not exist|unknown column).*contributors/i.test(message);
}
function isMissingTableError(message) {
  if (!message)
    return false;
  if (/\bcolumn\b/i.test(message))
    return false;
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}
function resolvePullDestination(install, cwd) {
  if (install === "global")
    return join18(homedir10(), ".claude", "skills");
  if (!cwd)
    throw new Error("install=project requires a cwd");
  return join18(cwd, ".claude", "skills");
}
function fanOutSymlinks(canonicalDir, dirName, agentRoots) {
  const out = [];
  for (const root of agentRoots) {
    const link = join18(root, dirName);
    let existing;
    try {
      existing = lstatSync2(link);
    } catch {
      existing = null;
    }
    if (existing) {
      if (!existing.isSymbolicLink()) {
        continue;
      }
      let current;
      try {
        current = readlinkSync(link);
      } catch {
        current = null;
      }
      if (current === canonicalDir) {
        out.push(link);
        continue;
      }
      try {
        unlinkSync4(link);
      } catch {
        continue;
      }
    }
    try {
      mkdirSync10(dirname7(link), { recursive: true });
      symlinkSync(canonicalDir, link, "dir");
      out.push(link);
    } catch {
    }
  }
  return out;
}
function backfillSymlinks(installRoot) {
  const manifest = loadManifest();
  const entries = entriesForRoot(manifest, "global", installRoot);
  if (entries.length === 0)
    return;
  const detected = detectAgentSkillsRoots(installRoot);
  for (const entry of entries) {
    const canonical = join18(entry.installRoot, entry.dirName);
    if (!existsSync8(canonical))
      continue;
    const fresh = fanOutSymlinks(canonical, entry.dirName, detected);
    if (sameSorted(fresh, entry.symlinks))
      continue;
    try {
      recordPull({ ...entry, symlinks: fresh });
    } catch {
    }
  }
}
function sameSorted(a, b) {
  if (a.length !== b.length)
    return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++)
    if (sa[i] !== sb[i])
      return false;
  return true;
}
function selectLatestPerName(rows) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of rows) {
    const name = String(r.name ?? "");
    const projectKey = String(r.project_key ?? "");
    if (!name)
      continue;
    const key = `${projectKey}\0${name}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
function renderSkillFile(row, nameOverride) {
  const sources = parseSourceSessions(row.source_sessions);
  const author = typeof row.author === "string" && row.author.length > 0 ? row.author : void 0;
  const contributors = parseContributors(row.contributors);
  const renderedContributors = contributors.length > 0 ? contributors : author ? [author] : [];
  const fm = {
    name: nameOverride ?? String(row.name ?? ""),
    description: String(row.description ?? ""),
    trigger: typeof row.trigger_text === "string" && row.trigger_text.length > 0 ? String(row.trigger_text) : void 0,
    author,
    source_sessions: sources,
    contributors: renderedContributors,
    version: Number(row.version ?? 1),
    created_by_agent: String(row.source_agent ?? "unknown"),
    created_at: String(row.created_at ?? (/* @__PURE__ */ new Date()).toISOString()),
    updated_at: String(row.updated_at ?? (/* @__PURE__ */ new Date()).toISOString())
  };
  const body = String(row.body ?? "").trim();
  return `${renderFrontmatter(fm)}

${body}
`;
}
function parseSourceSessions(v) {
  if (Array.isArray(v))
    return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed))
        return parsed.map(String);
    } catch {
    }
  }
  return [];
}
function parseContributors(v) {
  if (Array.isArray(v))
    return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed))
        return parsed.map(String);
    } catch {
    }
  }
  return [];
}
function renderFrontmatter(fm) {
  const lines = ["---"];
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${JSON.stringify(composeDescription(fm.description, fm.trigger))}`);
  if (fm.trigger)
    lines.push(`trigger: ${JSON.stringify(fm.trigger)}`);
  if (fm.author)
    lines.push(`author: ${fm.author}`);
  lines.push(`source_sessions:`);
  for (const s of fm.source_sessions)
    lines.push(`  - ${s}`);
  if (fm.contributors && fm.contributors.length > 0) {
    lines.push(`contributors:`);
    for (const c of fm.contributors)
      lines.push(`  - ${c}`);
  }
  lines.push(`version: ${fm.version}`);
  lines.push(`created_by_agent: ${fm.created_by_agent}`);
  lines.push(`created_at: ${fm.created_at}`);
  lines.push(`updated_at: ${fm.updated_at}`);
  lines.push("---");
  return lines.join("\n");
}
function readLocalVersion(path) {
  if (!existsSync8(path))
    return null;
  try {
    const text = readFileSync11(path, "utf-8");
    const parsed = parseFrontmatter(text);
    if (!parsed)
      return null;
    const v = parsed.fm.version;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}
function decideAction(args) {
  const shouldWrite = args.localVersion === null || args.remoteVersion > args.localVersion || args.force;
  if (!shouldWrite)
    return "skipped";
  return args.dryRun ? "dryrun" : "wrote";
}
async function runPull(opts) {
  if (!opts.dryRun)
    pruneOrphanedEntries();
  const sql = buildPullSql({
    tableName: opts.tableName,
    users: opts.users,
    skillName: opts.skillName
  });
  let rows = [];
  if (opts.tableExists && !opts.tableExists(opts.tableName)) {
    rows = [];
  } else {
    try {
      rows = await opts.query(sql);
    } catch (e) {
      if (isMissingTableError(e?.message)) {
        rows = [];
      } else if (isMissingContributorsColumnError(e?.message)) {
        const legacySql = buildPullSql({
          tableName: opts.tableName,
          users: opts.users,
          skillName: opts.skillName,
          includeContributors: false
        });
        rows = await opts.query(legacySql);
      } else {
        throw e;
      }
    }
  }
  const latest = selectLatestPerName(rows);
  const root = resolvePullDestination(opts.install, opts.cwd);
  const summary = { scanned: latest.length, wrote: 0, skipped: 0, dryrun: 0, entries: [] };
  const claimedDirs = /* @__PURE__ */ new Map();
  for (const row of latest) {
    const rawName = String(row.name ?? "");
    if (!rawName)
      continue;
    const author = String(row.author ?? "");
    if (!author) {
      summary.entries.push({
        name: rawName,
        remoteVersion: Number(row.version ?? 1),
        localVersion: null,
        action: "skipped",
        destination: "(empty author \u2014 skipped)",
        author: "",
        sourceAgent: String(row.source_agent ?? "")
      });
      summary.skipped++;
      continue;
    }
    try {
      assertValidAuthor(author);
    } catch (e) {
      summary.entries.push({
        name: rawName,
        remoteVersion: Number(row.version ?? 1),
        localVersion: null,
        action: "skipped",
        destination: `(invalid author '${author}' \u2014 skipped)`,
        author,
        sourceAgent: String(row.source_agent ?? "")
      });
      summary.skipped++;
      continue;
    }
    try {
      assertValidSkillName(rawName);
    } catch (e) {
      summary.entries.push({
        name: rawName,
        remoteVersion: Number(row.version ?? 1),
        localVersion: null,
        action: "skipped",
        destination: "(invalid name \u2014 skipped)",
        author,
        sourceAgent: String(row.source_agent ?? "")
      });
      summary.skipped++;
      continue;
    }
    const name = capSkillName(rawName);
    const dirName = `${name}--${author}`;
    const persistedEntry = entriesForRoot(loadManifest(), opts.install, root).find((e) => e.dirName === dirName);
    const owner = claimedDirs.get(dirName) ?? persistedEntry?.rawName ?? persistedEntry?.name;
    if (owner !== void 0 && owner !== rawName) {
      summary.entries.push({
        name: rawName,
        remoteVersion: Number(row.version ?? 1),
        localVersion: null,
        action: "skipped",
        destination: `(name collision with '${owner}' \u2014 skipped)`,
        author,
        sourceAgent: String(row.source_agent ?? "")
      });
      summary.skipped++;
      continue;
    }
    claimedDirs.set(dirName, rawName);
    const skillDir = join18(root, dirName);
    const skillFile = join18(skillDir, "SKILL.md");
    const staleDir = name !== rawName ? `${rawName}--${author}` : null;
    const staleOwned = !!staleDir && staleDir !== dirName && entriesForRoot(loadManifest(), opts.install, root).some((e) => e.dirName === staleDir);
    const staleFile = staleOwned ? join18(root, staleDir, "SKILL.md") : null;
    const staleVersion = staleFile && existsSync8(staleFile) ? readLocalVersion(staleFile) : null;
    const remoteVersion = Number(row.version ?? 1);
    const localVersion = readLocalVersion(skillFile);
    const action = decideAction({
      remoteVersion,
      localVersion,
      force: opts.force ?? false,
      dryRun: opts.dryRun ?? false
    });
    let manifestError;
    if (action === "wrote") {
      mkdirSync10(skillDir, { recursive: true });
      if (existsSync8(skillFile)) {
        try {
          renameSync5(skillFile, `${skillFile}.bak`);
        } catch {
        }
      }
      if (staleFile && staleVersion !== null && staleVersion >= remoteVersion && !(opts.force ?? false)) {
        try {
          const migrated = readFileSync11(staleFile, "utf-8").replace(/^name:.*$/m, `name: ${name}`);
          writeFileSync8(skillFile, migrated);
        } catch {
          writeFileSync8(skillFile, renderSkillFile(row, name));
        }
      } else {
        writeFileSync8(skillFile, renderSkillFile(row, name));
      }
      const symlinks = opts.install === "global" ? fanOutSymlinks(skillDir, dirName, detectAgentSkillsRoots(root)) : [];
      try {
        recordPull({
          dirName,
          name,
          rawName,
          author,
          projectKey: String(row.project_key ?? ""),
          remoteVersion,
          install: opts.install,
          installRoot: root,
          pulledAt: (/* @__PURE__ */ new Date()).toISOString(),
          symlinks
        });
      } catch (e) {
        manifestError = e?.message ?? String(e);
      }
    }
    if (staleDir && staleDir !== dirName && !(opts.dryRun ?? false) && existsSync8(skillFile) && existsSync8(join18(root, staleDir))) {
      try {
        const entries = entriesForRoot(loadManifest(), opts.install, root);
        let canonicalRecorded = entries.some((e) => e.dirName === dirName);
        const staleEntry = entries.find((e) => e.dirName === staleDir);
        if (!canonicalRecorded && staleEntry && !manifestError) {
          try {
            const symlinks = opts.install === "global" ? fanOutSymlinks(skillDir, dirName, detectAgentSkillsRoots(root)) : [];
            recordPull({
              dirName,
              name,
              rawName,
              author,
              projectKey: String(row.project_key ?? ""),
              remoteVersion,
              install: opts.install,
              installRoot: root,
              pulledAt: (/* @__PURE__ */ new Date()).toISOString(),
              symlinks
            });
            canonicalRecorded = true;
          } catch (e) {
            manifestError = manifestError ?? (e?.message ?? String(e));
          }
        }
        if (canonicalRecorded && staleEntry) {
          rmSync(join18(root, staleDir), { recursive: true, force: true });
          unlinkSymlinks(staleEntry.symlinks);
          removePullEntry(opts.install, staleEntry.installRoot, staleDir);
        }
      } catch (e) {
        manifestError = manifestError ?? (e?.message ?? String(e));
      }
    }
    summary.entries.push({
      name,
      remoteVersion,
      localVersion,
      action,
      destination: skillFile,
      author: String(row.author ?? ""),
      sourceAgent: String(row.source_agent ?? ""),
      manifestError
    });
    if (action === "wrote")
      summary.wrote++;
    else if (action === "dryrun")
      summary.dryrun++;
    else
      summary.skipped++;
  }
  if (!opts.dryRun && opts.install === "global") {
    backfillSymlinks(root);
  }
  return summary;
}

// dist/src/skillify/legacy-cap-migration.js
import { cpSync, existsSync as existsSync9, readFileSync as readFileSync12, rmSync as rmSync2, writeFileSync as writeFileSync9 } from "node:fs";
import { join as join19 } from "node:path";
var log5 = (msg) => log("skillify-legacy-cap", msg);
function readInstalledName(skillFile) {
  if (!existsSync9(skillFile))
    return null;
  let text;
  try {
    text = readFileSync12(skillFile, "utf-8");
  } catch {
    return null;
  }
  const parsed = parseFrontmatter(text);
  const name = parsed?.fm.name;
  return typeof name === "string" && name.length > 0 ? name : null;
}
function retireEntry(entry) {
  unlinkSymlinks(entry.symlinks);
  rmSync2(join19(entry.installRoot, entry.dirName), { recursive: true, force: true });
  removePullEntry(entry.install, entry.installRoot, entry.dirName);
}
function migrateEntry(entry) {
  if (entry.install !== "global")
    return false;
  const staleDir = join19(entry.installRoot, entry.dirName);
  const staleFile = join19(staleDir, "SKILL.md");
  const installedName = readInstalledName(staleFile);
  if (installedName === null || installedName.length <= MAX_SKILL_NAME_LEN)
    return false;
  let capped;
  try {
    assertValidSkillName(installedName);
    capped = capSkillName(installedName);
    assertValidSkillName(capped);
    assertValidAuthor(entry.author);
  } catch (e) {
    log5(`skip ${entry.dirName}: invalid name/author (${e?.message ?? e})`);
    return false;
  }
  if (capped === installedName)
    return false;
  const rawName = entry.rawName ?? entry.name;
  const cappedDir = `${capped}--${entry.author}`;
  const cappedDirPath = join19(entry.installRoot, cappedDir);
  const cappedFile = join19(cappedDirPath, "SKILL.md");
  if (cappedDir === entry.dirName)
    return false;
  try {
    const managed = entriesForRoot(loadManifest(), entry.install, entry.installRoot);
    const collidingEntry = managed.find((e) => e.dirName === cappedDir && e.dirName !== entry.dirName);
    if (collidingEntry) {
      if ((collidingEntry.rawName ?? collidingEntry.name) === rawName) {
        const canonName = readInstalledName(cappedFile);
        if (canonName === null || canonName.length > MAX_SKILL_NAME_LEN) {
          rmSync2(cappedDirPath, { recursive: true, force: true });
          unlinkSymlinks(collidingEntry.symlinks);
          removePullEntry(collidingEntry.install, collidingEntry.installRoot, collidingEntry.dirName);
          log5(`repair: dropped half-migrated ${cappedDir}, re-migrating from ${entry.dirName}`);
        } else {
          retireEntry(entry);
          log5(`reconciled leftover ${entry.dirName} (canonical ${cappedDir} already present)`);
          return true;
        }
      } else {
        log5(`skip ${entry.dirName}: capped dir ${cappedDir} claimed by ${collidingEntry.rawName ?? collidingEntry.name}`);
        return false;
      }
    }
    if (existsSync9(cappedDirPath)) {
      log5(`skip ${entry.dirName}: ${cappedDir} already exists on disk`);
      return false;
    }
    cpSync(staleDir, cappedDirPath, { recursive: true });
    recordPull({
      dirName: cappedDir,
      name: capped,
      rawName,
      author: entry.author,
      projectKey: entry.projectKey,
      remoteVersion: entry.remoteVersion,
      install: entry.install,
      installRoot: entry.installRoot,
      pulledAt: (/* @__PURE__ */ new Date()).toISOString(),
      symlinks: []
    });
    const migrated = readFileSync12(cappedFile, "utf-8").replace(/^name:.*$/m, `name: ${capped}`);
    writeFileSync9(cappedFile, migrated);
    const symlinks = fanOutSymlinks(cappedDirPath, cappedDir, detectAgentSkillsRoots(entry.installRoot));
    if (symlinks.length > 0) {
      recordPull({
        dirName: cappedDir,
        name: capped,
        rawName,
        author: entry.author,
        projectKey: entry.projectKey,
        remoteVersion: entry.remoteVersion,
        install: entry.install,
        installRoot: entry.installRoot,
        pulledAt: (/* @__PURE__ */ new Date()).toISOString(),
        symlinks
      });
    }
    retireEntry(entry);
    log5(`migrated ${entry.dirName} \u2192 ${cappedDir}`);
    return true;
  } catch (e) {
    log5(`error migrating ${entry.dirName} (swallowed): ${e?.message ?? e}`);
    return false;
  }
}
function migrateLegacyCappedInstalls() {
  let migrated = 0;
  let skipped = 0;
  const entries = loadManifest().entries.slice();
  for (const entry of entries) {
    if (migrateEntry(entry))
      migrated++;
    else
      skipped++;
  }
  if (migrated > 0)
    log5(`migrated=${migrated} skipped=${skipped}`);
  return { migrated, skipped };
}

// dist/src/skillify/auto-pull.js
var log6 = (msg) => log("skillify-autopull", msg);
var DEFAULT_TIMEOUT_MS = 5e3;
function withTimeout(p, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`autopull timeout after ${ms}ms`)), ms);
    if (typeof timer.unref === "function")
      timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer)
      clearTimeout(timer);
  });
}
async function autoPullSkills(deps = {}) {
  if (process.env.HIVEMIND_AUTOPULL_DISABLED === "1") {
    log6("disabled via HIVEMIND_AUTOPULL_DISABLED=1");
    return { pulled: 0, skipped: true, reason: "disabled" };
  }
  try {
    migrateLegacyCappedInstalls();
  } catch (e) {
    log6(`legacy-cap migration failed (swallowed): ${e?.message ?? e}`);
  }
  const config = deps.loadConfigFn ? deps.loadConfigFn() : loadRoutedConfig(deps.cwd ?? process.cwd());
  if (!config) {
    log6("skipped: not logged in");
    return { pulled: 0, skipped: true, reason: "not-logged-in" };
  }
  let query;
  let discoverTableExists = async () => void 0;
  if (deps.queryFn) {
    query = deps.queryFn;
  } else {
    const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.skillsTableName);
    query = (sql) => api.query(sql);
    discoverTableExists = async () => {
      const known = await api.knownTablesOrNull();
      return known ? (name) => known.includes(name) : void 0;
    };
  }
  const install = deps.install ?? "global";
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const summary = await withTimeout(
      // Table discovery + pull share one budget: if `GET /tables` hangs the
      // whole thing times out and we degrade, instead of blocking startup.
      (async () => {
        const tableExists = await discoverTableExists();
        return runPull({
          query,
          tableName: config.skillsTableName,
          install,
          cwd: install === "project" ? deps.cwd ?? process.cwd() : void 0,
          users: [],
          dryRun: false,
          force: false,
          tableExists
        });
      })(),
      timeoutMs
    );
    log6(`pulled scanned=${summary.scanned} wrote=${summary.wrote} skipped=${summary.skipped}`);
    return { pulled: summary.wrote, skipped: false };
  } catch (e) {
    log6(`pull failed (swallowed): ${e?.message ?? e}`);
    return { pulled: 0, skipped: true, reason: "error" };
  }
}

// dist/src/cli/skillify-spec.js
var SKILLIFY_COMMANDS = [
  { cmd: "hivemind skillify", desc: "show scope, team, install, per-project state" },
  { cmd: "hivemind skillify pull", desc: "sync project skills from the org table to local FS" },
  { cmd: "hivemind skillify pull --user <email>", desc: "only skills authored by that user" },
  { cmd: "hivemind skillify pull --users <a,b,c>", desc: "only skills from those authors" },
  { cmd: "hivemind skillify pull --all-users", desc: 'explicit "no author filter" (default)' },
  { cmd: "hivemind skillify pull --to <project|global>", desc: "install location (project=cwd/.claude/skills, global=~/.claude/skills)" },
  { cmd: "hivemind skillify pull --dry-run", desc: "preview without touching disk" },
  { cmd: "hivemind skillify pull --force", desc: "overwrite local files even if up-to-date (creates .bak)" },
  { cmd: "hivemind skillify pull <skill-name>", desc: "pull only that one skill (combines with --user)" },
  { cmd: "hivemind skillify push <skill-name>", desc: "upload a local skill to the org table (inverse of pull)" },
  { cmd: "hivemind skillify push --from <project|global>", desc: "which local skills dir to read (default: project)" },
  { cmd: "hivemind skillify push --dry-run", desc: "preview without writing to the org table" },
  { cmd: "hivemind skillify unpull", desc: "remove every skill previously installed by pull" },
  { cmd: "hivemind skillify unpull --user <email>", desc: "remove only that author's pulls" },
  { cmd: "hivemind skillify unpull --not-mine", desc: "remove all pulls except your own" },
  { cmd: "hivemind skillify unpull --dry-run", desc: "preview without touching disk" },
  { cmd: "hivemind skillify scope <me|team|org>", desc: "sharing scope for newly mined skills" },
  { cmd: "hivemind skillify install <project|global>", desc: "default install location for new skills" },
  { cmd: "hivemind skillify promote <skill-name>", desc: "move a project skill to the global location" },
  { cmd: "hivemind skillify team add|remove|list <name>", desc: "manage team member list" },
  { cmd: "hivemind skillify mine-local", desc: "one-shot: mine skills from local sessions (no auth needed)" },
  { cmd: "hivemind skillify mine-local --n <num|all>", desc: "how many sessions to mine (default: 8)" },
  { cmd: "hivemind skillify mine-local --force", desc: "re-run even if the manifest sentinel exists" },
  { cmd: "hivemind skillify mine-local --dry-run", desc: "stop before calling the LLM gate" }
];
function renderSkillifyCommands() {
  const maxLen = Math.max(...SKILLIFY_COMMANDS.map((c) => c.cmd.length));
  return SKILLIFY_COMMANDS.map((c) => `- ${c.cmd.padEnd(maxLen + 2)} \u2014 ${c.desc}`).join("\n");
}

// dist/src/rules/write.js
import { randomUUID as randomUUID3 } from "node:crypto";

// dist/src/rules/read.js
var SELECT_COLS = "id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version";
async function listRules(query, tableName, opts = {}) {
  const safe = sqlIdent(tableName);
  const rows = await query(`SELECT ${SELECT_COLS} FROM "${safe}" ORDER BY version DESC, created_at DESC, id DESC`);
  const latest = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const row = normalize(r);
    if (!row)
      continue;
    if (!latest.has(row.rule_id))
      latest.set(row.rule_id, row);
  }
  const statusFilter = opts.status ?? "active";
  const filtered = [...latest.values()].filter((r) => statusFilter === "all" ? true : r.status === statusFilter);
  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return filtered.slice(0, opts.limit ?? 10);
}
function normalize(row) {
  const vRaw = row.version;
  const version = typeof vRaw === "number" ? vRaw : typeof vRaw === "string" ? Number(vRaw) : NaN;
  if (!Number.isFinite(version))
    return null;
  return {
    id: String(row.id ?? ""),
    rule_id: String(row.rule_id ?? ""),
    text: String(row.text ?? ""),
    scope: String(row.scope ?? ""),
    status: String(row.status ?? ""),
    assigned_by: String(row.assigned_by ?? ""),
    version,
    created_at: String(row.created_at ?? ""),
    agent: String(row.agent ?? ""),
    plugin_version: String(row.plugin_version ?? "")
  };
}

// dist/src/hooks/shared/context-renderer.js
async function renderContextBlock(query, input, opts = {}) {
  const maxRules = opts.maxRules ?? 10;
  const maxGoals = opts.maxGoals ?? 10;
  const log8 = opts.log ?? (() => {
  });
  try {
    const tableExists = opts.tableExists;
    let rules = [];
    if (tableExists && !tableExists(input.rulesTable)) {
      log8(`render-context-block: rules table "${input.rulesTable}" not present \u2014 skipping read`);
    } else {
      try {
        rules = await listRules(query, input.rulesTable, {
          status: "active",
          limit: Math.max(maxRules * 4, maxRules + 1)
        });
      } catch (rulesErr) {
        const rmsg = rulesErr instanceof Error ? rulesErr.message : String(rulesErr);
        log8(`render-context-block: rules unavailable (continuing): ${rmsg}`);
      }
    }
    let goals = [];
    if (tableExists && !tableExists(input.goalsTable)) {
      log8(`render-context-block: goals table "${input.goalsTable}" not present \u2014 skipping read`);
    } else {
      try {
        goals = await listOpenGoals(query, input.goalsTable, input.currentUser, {
          limit: Math.max(maxGoals * 4, maxGoals + 1)
        });
      } catch (goalsErr) {
        const gmsg = goalsErr instanceof Error ? goalsErr.message : String(goalsErr);
        log8(`render-context-block: goals unavailable (continuing): ${gmsg}`);
      }
    }
    const rulesShown = rules.slice(0, maxRules);
    const rulesHidden = Math.max(0, rules.length - maxRules);
    const goalsShown = goals.slice(0, maxGoals);
    const goalsHidden = Math.max(0, goals.length - maxGoals);
    return formatBlock({ rules: rulesShown, rulesHidden, goals: goalsShown, goalsHidden });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log8(`render-context-block: ${msg}`);
    return "";
  }
}
async function listOpenGoals(query, goalsTable, currentUser, opts = {}) {
  const limit = opts.limit ?? 40;
  const safe = sqlIdent(goalsTable);
  const fullUser = currentUser.trim();
  const shortUser = fullUser.split("@")[0] ?? fullUser;
  const fullEq = sqlStr(fullUser);
  const shortEq = sqlStr(shortUser);
  const shortLike = sqlLike(shortUser);
  const sql = `SELECT goal_id, owner, status, content FROM "${safe}" g1 WHERE (owner = '${fullEq}' OR owner = '${shortEq}' OR owner LIKE '${shortLike}@%') AND status IN ('opened', 'in_progress') AND version = (SELECT MAX(version) FROM "${safe}" g2 WHERE g2.goal_id = g1.goal_id) ORDER BY status ASC, created_at DESC LIMIT ${limit}`;
  const rows = await query(sql);
  const out = [];
  for (const r of rows) {
    const ownerNorm = String(r["owner"] ?? "").trim();
    const ownerShort = ownerNorm.split("@")[0] ?? ownerNorm;
    if (ownerNorm !== fullUser && ownerNorm !== shortUser && ownerShort !== shortUser) {
      continue;
    }
    out.push({
      goal_id: String(r["goal_id"] ?? ""),
      status: String(r["status"] ?? ""),
      content: String(r["content"] ?? "")
    });
  }
  return out;
}
function formatBlock(input) {
  if (input.rules.length === 0 && input.goals.length === 0)
    return "";
  const lines = [];
  if (input.rules.length > 0) {
    lines.push(`=== HIVEMIND RULES (${input.rules.length} active) ===`);
    for (const r of input.rules) {
      lines.push(`- ${r.rule_id}: ${sanitizeForInject(r.text)}`);
    }
    if (input.rulesHidden > 0) {
      lines.push(`(${input.rulesHidden} more \u2014 run 'hivemind rules list' to see all)`);
    }
    lines.push("");
  }
  if (input.goals.length > 0) {
    const inProgress = input.goals.filter((g) => g.status === "in_progress").length;
    const opened = input.goals.filter((g) => g.status === "opened").length;
    lines.push(`=== HIVEMIND GOALS (${inProgress} in_progress, ${opened} opened) ===`);
    for (const g of input.goals) {
      const firstLine = sanitizeForInject(firstNonEmptyLine(g.content));
      const tag = g.status === "in_progress" ? "[in_progress]" : "[opened]     ";
      lines.push(`${tag} ${g.goal_id}: ${firstLine}`);
    }
    if (input.goalsHidden > 0) {
      lines.push(`(${input.goalsHidden} more \u2014 run 'hivemind goal list --mine' to see all)`);
    }
    lines.push("");
  }
  lines.push("=== HIVEMIND HOW-TO ===");
  if (input.rules.length > 0) {
    lines.push("- Rules above are team principles. Treat any action that would violate one as a critical error and surface it to the user before proceeding.");
  }
  if (input.goals.length > 0) {
    lines.push("- Goals above are your current open work items. Move a goal forward by `mv`-ing its file between memory/goal/<user>/{opened,in_progress,closed}/ (claude-code/codex) or `hivemind goal progress <goal_id> <status>` (cursor/hermes/pi).");
  }
  lines.push("- Run 'hivemind rules list' / 'hivemind goal list --mine' for the full inventories beyond what's shown here.");
  return lines.join("\n");
}
function firstNonEmptyLine(content) {
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.length > 0)
      return trimmed;
  }
  return "(empty)";
}
function sanitizeForInject(text) {
  return text.replace(LINE_TERMINATOR_RE, "\\n");
}
var LINE_TERMINATOR_RE = /\r\n?|[\n\u2028\u2029\u0085]/g;

// dist/src/skillify/local-manifest.js
import { existsSync as existsSync10, mkdirSync as mkdirSync11, readFileSync as readFileSync13, writeFileSync as writeFileSync10 } from "node:fs";
import { homedir as homedir11 } from "node:os";
import { dirname as dirname8, join as join20 } from "node:path";
var LOCAL_MANIFEST_PATH = join20(homedir11(), ".claude", "hivemind", "local-mined.json");
var LOCAL_MINE_LOCK_PATH = join20(homedir11(), ".claude", "hivemind", "local-mined.lock");
function readLocalManifest(path = LOCAL_MANIFEST_PATH) {
  if (!existsSync10(path))
    return null;
  try {
    return JSON.parse(readFileSync13(path, "utf-8"));
  } catch {
    return null;
  }
}
function countLocalManifestEntries(path = LOCAL_MANIFEST_PATH) {
  const m = readLocalManifest(path);
  return Array.isArray(m?.entries) ? m.entries.length : 0;
}
var LATEST_RUN_WINDOW_MS = 5 * 60 * 1e3;

// dist/src/skillify/local-mined-banner.js
function renderLocalMinedNote(input) {
  const { totalCount } = input;
  if (totalCount <= 0)
    return "";
  const plural = totalCount === 1 ? "" : "s";
  return `

${totalCount} local skill${plural} from past 'hivemind skillify mine-local' run(s) live in ~/.claude/skills/. Run 'hivemind login' to start sharing new mining results with your team.`;
}

// dist/src/skillify/spawn-mine-local-worker.js
import { execFileSync, spawn as spawn3 } from "node:child_process";
import { closeSync as closeSync2, existsSync as existsSync11, mkdirSync as mkdirSync12, openSync as openSync2, readdirSync as readdirSync2, statSync as statSync4, unlinkSync as unlinkSync5 } from "node:fs";
import { homedir as homedir12 } from "node:os";
import { dirname as dirname9, join as join21 } from "node:path";
import { fileURLToPath } from "node:url";
var HOME = homedir12();
var HIVEMIND_DIR = join21(HOME, ".claude", "hivemind");
var LOG_PATH = join21(HOME, ".claude", "hooks", "mine-local.log");
var CLAUDE_PROJECTS_DIR = join21(HOME, ".claude", "projects");
var LOCK_STALE_MS2 = 15 * 60 * 1e3;
function findBundledCliPath() {
  try {
    const thisDir = dirname9(fileURLToPath(import.meta.url));
    const cliPath = join21(thisDir, "..", "..", "bundle", "cli.js");
    return existsSync11(cliPath) ? cliPath : null;
  } catch {
    return null;
  }
}
function findHivemindLauncher() {
  const bundled = findBundledCliPath();
  if (bundled)
    return { kind: "node-script", path: bundled };
  try {
    const lookup = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(lookup, ["hivemind"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      // CREATE_NO_WINDOW: same reason as resolveCliBin — this runs from a
      // detached worker with no console to inherit. No-op on POSIX.
      windowsHide: true
    });
    const bin = out.trim();
    return bin ? { kind: "bin", path: bin } : null;
  } catch {
    return null;
  }
}
function hasLocalClaudeSessions() {
  if (!existsSync11(CLAUDE_PROJECTS_DIR))
    return false;
  let subdirs;
  try {
    subdirs = readdirSync2(CLAUDE_PROJECTS_DIR);
  } catch {
    return false;
  }
  for (const sub of subdirs) {
    let files;
    try {
      files = readdirSync2(join21(CLAUDE_PROJECTS_DIR, sub));
    } catch {
      continue;
    }
    if (files.some((f) => f.endsWith(".jsonl")))
      return true;
  }
  return false;
}
function maybeAutoMineLocal(opts = {}) {
  if (existsSync11(LOCAL_MANIFEST_PATH))
    return { triggered: false, reason: "manifest-exists" };
  if (existsSync11(LOCAL_MINE_LOCK_PATH)) {
    let stale = false;
    try {
      const stats = statSync4(LOCAL_MINE_LOCK_PATH);
      stale = Date.now() - stats.mtimeMs > LOCK_STALE_MS2;
    } catch {
    }
    if (!stale)
      return { triggered: false, reason: "lock-exists" };
    try {
      unlinkSync5(LOCAL_MINE_LOCK_PATH);
    } catch {
      return { triggered: false, reason: "lock-exists" };
    }
  }
  if (!hasLocalClaudeSessions())
    return { triggered: false, reason: "no-claude-sessions" };
  const launcher = findHivemindLauncher();
  if (!launcher)
    return { triggered: false, reason: "no-hivemind-bin" };
  try {
    mkdirSync12(HIVEMIND_DIR, { recursive: true });
    const fd = openSync2(LOCAL_MINE_LOCK_PATH, "wx");
    closeSync2(fd);
  } catch {
    return { triggered: false, reason: "lock-acquire-failed" };
  }
  try {
    mkdirSync12(join21(HOME, ".claude", "hooks"), { recursive: true });
    const out = openSync2(LOG_PATH, "a");
    const mineArgs = ["skillify", "mine-local"];
    if (opts.sessionCount != null)
      mineArgs.push("--n", String(opts.sessionCount));
    if (opts.onlyAgent)
      mineArgs.push("--only", opts.onlyAgent);
    if (opts.advise)
      mineArgs.push("--advise");
    const [cmd, args] = launcher.kind === "node-script" ? [process.execPath, [launcher.path, ...mineArgs]] : [launcher.path, mineArgs];
    const child = spawn3(cmd, args, {
      detached: true,
      stdio: ["ignore", out, out],
      // SW_HIDE: libuv still applies it alongside detached, so the mining
      // worker never flashes a console. No-op on POSIX.
      windowsHide: true,
      env: process.env
    });
    closeSync2(out);
    child.unref();
    return { triggered: true };
  } catch {
    try {
      unlinkSync5(LOCAL_MINE_LOCK_PATH);
    } catch {
    }
    return { triggered: false, reason: "spawn-failed" };
  }
}

// dist/src/graph/session-context.js
import { createHash as createHash3 } from "node:crypto";
import { existsSync as existsSync14 } from "node:fs";
import { join as join25 } from "node:path";

// dist/src/graph/last-build.js
import { existsSync as existsSync12, mkdirSync as mkdirSync13, readFileSync as readFileSync14, renameSync as renameSync6, writeFileSync as writeFileSync11 } from "node:fs";
import { dirname as dirname10, join as join22 } from "node:path";
function lastBuildPath(baseDir, worktreeId) {
  if (worktreeId !== void 0) {
    return join22(baseDir, "worktrees", worktreeId, ".last-build.json");
  }
  return join22(baseDir, ".last-build.json");
}
function readLastBuild(baseDir, worktreeId) {
  let path = lastBuildPath(baseDir, worktreeId);
  if (!existsSync12(path)) {
    if (worktreeId === void 0)
      return null;
    const legacy = lastBuildPath(baseDir, void 0);
    if (!existsSync12(legacy))
      return null;
    path = legacy;
  }
  let raw;
  try {
    raw = readFileSync14(path, "utf8");
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
import { mkdirSync as mkdirSync15, renameSync as renameSync7, writeFileSync as writeFileSync12 } from "node:fs";
import { homedir as homedir13 } from "node:os";
import { dirname as dirname12, join as join24 } from "node:path";

// dist/src/graph/history.js
import { appendFileSync as appendFileSync3, existsSync as existsSync13, mkdirSync as mkdirSync14, readFileSync as readFileSync15 } from "node:fs";
import { dirname as dirname11, join as join23 } from "node:path";

// dist/src/graph/resolve/cross-file.js
import { posix } from "node:path";

// dist/src/graph/snapshot.js
function graphsRoot() {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join24(homedir13(), ".hivemind", "graphs");
}
function repoDir(repoKey) {
  return join24(graphsRoot(), repoKey);
}

// dist/src/graph/session-context.js
function workTreeIdFor(cwd) {
  return createHash3("sha256").update(cwd).digest("hex").slice(0, 16);
}
function graphContextLine(cwd, deps = {}) {
  let key;
  let snapshotsDir;
  let baseDir;
  try {
    key = deriveProjectKey(cwd).key;
    baseDir = repoDir(key);
    snapshotsDir = join25(baseDir, "snapshots");
  } catch {
    return null;
  }
  if (!existsSync14(snapshotsDir))
    return null;
  const last = readLastBuild(baseDir, workTreeIdFor(cwd));
  if (last === null)
    return null;
  if (last.commit_sha !== null && !/^[0-9a-f]{4,64}$/.test(last.commit_sha))
    return null;
  if (!/^[0-9a-f]{64}$/.test(last.snapshot_sha256))
    return null;
  const now = (deps.now ?? Date.now)();
  const ageMs = Math.max(0, now - last.ts);
  const nodesStr = last.node_count !== void 0 ? String(last.node_count) : "?";
  const edgesStr = last.edge_count !== void 0 ? String(last.edge_count) : "?";
  const commitStr = last.commit_sha !== null ? last.commit_sha.slice(0, 7) : "no-commit";
  const ageStr = formatAge(ageMs);
  const snapshotFile = last.commit_sha ?? last.snapshot_sha256;
  const snapshotPath = join25(snapshotsDir, `${snapshotFile}.json`);
  const STALE_WARN_MS = 60 * 60 * 1e3;
  const STALE_HARD_MS = 24 * 60 * 60 * 1e3;
  let staleness;
  if (ageMs >= STALE_HARD_MS) {
    staleness = "  \u26A0\uFE0F STALE: this snapshot is over a day old; the auto-rebuild may have stopped.\n     Prefer reading current source for any file you suspect has changed.";
  } else if (ageMs >= STALE_WARN_MS) {
    staleness = "  \u26A0\uFE0F Possibly out of date (> 1h since last build). For any file you've edited\n     in this session, fall back to reading the live source instead of the graph.";
  } else {
    staleness = "  Freshness: auto-rebuilds run on Stop/SessionEnd; if a file's mtime is newer\n  than the build timestamp above, prefer reading the live source for that file.";
  }
  return [
    "",
    "LOCAL CODE GRAPH (TypeScript / JavaScript / Python, AST-based):",
    `  ${nodesStr} nodes, ${edgesStr} edges (commit ${commitStr}, built ${ageStr} ago)`,
    "",
    "  Use it as a fast INDEX to locate the few files/symbols that matter, then",
    "  open them with Read to answer. It is NOT a substitute for the source: it",
    "  omits instance-method calls (obj.method()), nested/inner functions, and",
    "  dynamic dispatch \u2014 so confirm every claim against the file before stating it.",
    "",
    "  Query via the Deeplake mount (intercepted \u2014 use `cat`, not `ls`):",
    "    cat ~/.deeplake/memory/graph/query/<pattern>   \u2190 start here",
    "        search + 1-hop expand (callers, callees, imports). AND: query/<a>+<b>.",
    "    cat ~/.deeplake/memory/graph/find/<pattern>     substring search \u2192 handles",
    "    cat ~/.deeplake/memory/graph/show/<handle-or-pattern>   node + 1-hop neighbors",
    "    cat ~/.deeplake/memory/graph/neighborhood/<file>        symbols + cross-file links",
    "    Also: index.md \xB7 layers \xB7 tour \xB7 path/<from>/<to>",
    "",
    "  PER-FILE DOCS (natural-language, kept fresh on commits \u2014 if generated):",
    "    cat ~/.deeplake/memory/docs/find/<query>   semantic + keyword search over the",
    '        docs \u2014 use for "where is X handled / how does Y work"; returns ranked files.',
    "    cat ~/.deeplake/memory/docs/<path>.md       the doc for one source file.",
    "    Empty result just means no docs match (or none generated yet) \u2014 fall back to graph.",
    "",
    "  Then READ the files the graph points you to \u2014 don't answer from the graph",
    "  alone. Cross-file calls/imports resolved for named imports across TS/JS/Python;",
    "  bare (npm)/aliased/barrel/dynamic + instance-method dispatch stay unresolved.",
    `  Raw snapshot (fallback): ${snapshotPath}`,
    staleness
  ].join("\n");
}
function formatAge(ms) {
  const s = Math.floor(ms / 1e3);
  if (s < 60)
    return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)
    return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)
    return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// dist/src/graph/spawn-pull-worker.js
import { spawn as spawn4 } from "node:child_process";
import { join as join26 } from "node:path";
function spawnGraphPullWorker(cwd, bundleDir, deps = {}) {
  if (process.env.HIVEMIND_GRAPH_PULL === "0")
    return;
  const workerPath = join26(bundleDir, "graph-pull-worker.js");
  const opts = {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"]
  };
  try {
    const sp = deps.spawn ?? spawn4;
    const child = sp("nohup", ["node", workerPath, "--cwd", cwd], opts);
    child.on("error", () => {
    });
    child.unref();
  } catch {
  }
}

// dist/src/hooks/shared/capture-gate.js
function entrypointPassesOnlyCliGate(env = process.env) {
  const onlyCli = env.HIVEMIND_CAPTURE_ONLY_CLI === "true";
  if (!onlyCli)
    return true;
  const entrypoint = env.CLAUDE_CODE_ENTRYPOINT ?? "";
  return entrypoint === "cli";
}

// dist/src/hooks/summary-state.js
import { readFileSync as readFileSync16, writeFileSync as writeFileSync13, writeSync, mkdirSync as mkdirSync16, existsSync as existsSync15, unlinkSync as unlinkSync6, openSync as openSync3, closeSync as closeSync3, statSync as statSync5 } from "node:fs";
import { homedir as homedir14 } from "node:os";
import { join as join27 } from "node:path";
var dlog2 = (msg) => log("summary-state", msg);
var STATE_DIR = join27(homedir14(), ".claude", "hooks", "summary-state");
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
function statePath(sessionId) {
  return join27(STATE_DIR, `${sessionId}.json`);
}
function endedMarkerPath(sessionId) {
  return join27(STATE_DIR, `${sessionId}.ended`);
}
function ownerPath(sessionId) {
  return join27(STATE_DIR, `${sessionId}.owner`);
}
function procInfo(pid) {
  try {
    const s = readFileSync16(`/proc/${pid}/stat`, "utf-8");
    const open = s.indexOf("(");
    const close = s.lastIndexOf(")");
    if (open < 0 || close < 0)
      return null;
    const comm = s.slice(open + 1, close);
    const rest = s.slice(close + 2).split(" ");
    return { comm, ppid: Number(rest[1]), starttime: rest[19] ?? "" };
  } catch {
    return null;
  }
}
function findSessionOwner(agentComms = ["claude"], startPid = process.pid) {
  let pid = startPid;
  let depth = 0;
  while (pid > 1 && depth++ < 40) {
    const st = procInfo(pid);
    if (!st)
      return null;
    if (agentComms.includes(st.comm))
      return { pid, comm: st.comm, starttime: st.starttime };
    pid = st.ppid;
  }
  return null;
}
function recordSessionOwner(sessionId, agentComms = ["claude"], startPid = process.pid) {
  try {
    const owner = findSessionOwner(agentComms, startPid);
    if (!owner)
      return;
    mkdirSync16(STATE_DIR, { recursive: true });
    const p = ownerPath(sessionId);
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync13(tmp, JSON.stringify(owner));
    renameAtomic(tmp, p);
  } catch (e) {
    dlog2(`recordSessionOwner failed for ${sessionId}: ${e.message}`);
  }
}
function clearSessionEnded(sessionId) {
  try {
    unlinkSync6(endedMarkerPath(sessionId));
  } catch (e) {
    if (e?.code !== "ENOENT")
      dlog2(`clearSessionEnded failed for ${sessionId}: ${e.message}`);
  }
}
function readState(sessionId) {
  const p = statePath(sessionId);
  if (!existsSync15(p))
    return null;
  try {
    return JSON.parse(readFileSync16(p, "utf-8"));
  } catch {
    return null;
  }
}
function writeState(sessionId, state) {
  mkdirSync16(STATE_DIR, { recursive: true });
  const p = statePath(sessionId);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync13(tmp, JSON.stringify(state));
  renameAtomic(tmp, p);
}
function withRmwLock(sessionId, fn) {
  mkdirSync16(STATE_DIR, { recursive: true });
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
          unlinkSync6(rmwLock);
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
      unlinkSync6(rmwLock);
    } catch (unlinkErr) {
      dlog2(`rmw lock cleanup failed for ${sessionId}: ${unlinkErr.message}`);
    }
  }
}
function touchSessionActivity(sessionId) {
  try {
    withRmwLock(sessionId, () => {
      const existing = readState(sessionId);
      writeState(sessionId, existing ?? { lastSummaryAt: Date.now(), lastSummaryCount: 0, totalCount: 0 });
    });
  } catch (e) {
    dlog2(`touchSessionActivity failed for ${sessionId}: ${e.message}`);
  }
}

// dist/src/utils/project-name.js
import { basename as basename2 } from "node:path";
function projectNameFromCwd(cwd) {
  return basename2(cwd ?? "") || "unknown";
}

// dist/src/hooks/shared/placeholder-summary.js
var PLACEHOLDER_DESCRIPTION = "in progress";
function buildPlaceholderInsertSql(params) {
  const { table, sessionId, cwd, userName, orgName, workspaceId, agent, pluginVersion } = params;
  const now = params.ts ?? (/* @__PURE__ */ new Date()).toISOString();
  const uuid = params.uuid ? params.uuid() : crypto.randomUUID();
  const summaryPath = `/summaries/${userName}/${sessionId}.md`;
  const projectName = projectNameFromCwd(cwd);
  const sessionSource = `/sessions/${userName}/${userName}_${orgName}_${workspaceId}_${sessionId}.jsonl`;
  const content = [
    `# Session ${sessionId}`,
    `- **Source**: ${sessionSource}`,
    `- **Started**: ${now}`,
    `- **Project**: ${projectName}`,
    `- **Status**: in-progress`,
    ""
  ].join("\n");
  const filename = `${sessionId}.md`;
  const sizeBytes = Buffer.byteLength(content, "utf-8");
  const sql = `INSERT INTO "${table}" (id, path, filename, summary, author, mime_type, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) SELECT '${uuid}', '${sqlStr(summaryPath)}', '${sqlStr(filename)}', E'${sqlStr(content)}', '${sqlStr(userName)}', 'text/markdown', ${sizeBytes}, '${sqlStr(projectName)}', '${PLACEHOLDER_DESCRIPTION}', '${sqlStr(agent)}', '${sqlStr(pluginVersion)}', '${now}', '${now}' WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE path = '${sqlStr(summaryPath)}')`;
  return { sql, summaryPath };
}
async function createPlaceholderSummary(query, params, onLog) {
  const { sql, summaryPath } = buildPlaceholderInsertSql(params);
  try {
    const existing = await query(`SELECT path FROM "${params.table}" WHERE path = '${sqlStr(summaryPath)}' LIMIT 1`);
    if (existing.length > 0) {
      onLog?.(`SessionStart: summary exists for ${params.sessionId} (resumed)`);
      return { path: "skip", sql, summaryPath };
    }
  } catch {
  }
  await query(sql);
  onLog?.(`SessionStart: created placeholder for ${params.sessionId} (${params.cwd})`);
  return { path: "insert", sql, summaryPath };
}

// dist/src/hooks/session-start.js
var log7 = (msg) => log("session-start", msg);
var __bundleDir = dirname13(fileURLToPath2(import.meta.url));
var context = `DEEPLAKE MEMORY: You have TWO memory sources. ALWAYS check BOTH when the user asks you to recall, remember, or look up ANY information:

1. Your built-in memory (~/.claude/) \u2014 personal per-project notes
2. Deeplake global memory (~/.deeplake/memory/) \u2014 global memory shared across all sessions, users, and agents in the org

Deeplake memory has THREE tiers \u2014 pick the right one for the question:
1. ~/.deeplake/memory/index.md   \u2014 auto-generated index, top 50 most-recently-updated entries with \`Created\` + \`Last Updated\` + \`Project\` + \`Description\` columns. ~5 KB. **For "what's recent / who did X this week / since <date>" queries, START HERE** and trust the \`Last Updated\` column over any \`Started:\` line in summary bodies.
2. ~/.deeplake/memory/summaries/ \u2014 condensed wiki summaries per session (~3 KB each). For keyword/topic recall, search these.
3. ~/.deeplake/memory/sessions/  \u2014 raw full-dialogue JSONL (~5 KB each). FALLBACK only \u2014 use when summaries don't contain the exact quote/turn you need.

Search workflow:
  - Time-based ("last week", "today", "since X"): \`cat ~/.deeplake/memory/index.md\` and read the most-recent rows.
  - Keyword/topic recall: use the **Bash tool** with \`grep -r "keyword" ~/.deeplake/memory/summaries/\`. The Bash hook routes this through hybrid lexical+semantic search \u2014 synonyms / paraphrases match too. Then \`cat\` the top-matching summary to pull the answer.
  - Raw transcript fallback only: \`grep -r "keyword" ~/.deeplake/memory/sessions/\` (use sparingly \u2014 JSONL is verbose).

Tool choice on this mount:
  \u2705 Bash tool with \`grep -r\` / \`cat\` / \`ls\` / \`head\` / \`tail\` \u2014 supported, fast.
  \u274C Built-in Grep tool \u2014 not supported on this path; use Bash grep instead.
  \u274C \`grep\` without a \`summaries/\` or \`sessions/\` suffix \u2014 too noisy, drowns the answer.

Resuming work (user says "pick up where I left off" / "load that from hivemind" / "continue where we stopped"):
  The resume target is the most recent session summary for the CURRENT project. Find and load it from the VFS \u2014 do not wait for or expect it to be pre-loaded:
  1. \`cat ~/.deeplake/memory/index.md\` and take the newest rows whose \`Project\` matches this repo (or \`ls -t ~/.deeplake/memory/summaries/<your-username>/\` for the latest files).
  2. \`cat\` the newest matching summary. If its \`## Next Steps\` (or older \`## Open Questions / TODO\`) is empty or says "none", move to the next-newest until you find one with real open work.
  3. Load THAT summary as context, then RECONCILE with the current git state (branch, uncommitted changes) before acting \u2014 the summary can be stale. Tell the user where they left off and confirm before continuing; don't silently execute the next step.
  4. Don't bulk-read \`sessions/\` \u2014 drill into the raw jsonl only for a specific detail the summary is missing.

Organization management \u2014 each argument is SEPARATE (do NOT quote subcommands together):
- hivemind login                              \u2014 SSO login
- hivemind whoami                             \u2014 show current user/org
- hivemind org list                           \u2014 list organizations
- hivemind org switch <name-or-id>            \u2014 switch organization
- hivemind workspaces                         \u2014 list workspaces
- hivemind workspace <id>                     \u2014 switch workspace
- hivemind invite <email> <ADMIN|WRITE|READ>  \u2014 invite member (ALWAYS ask user which role before inviting)
- hivemind members                            \u2014 list members
- hivemind remove <user-id>                   \u2014 remove member

Skill management (mine + share reusable Claude skills across the org):
${renderSkillifyCommands()}

Embeddings (semantic memory search) \u2014 opt-in, persisted in ~/.deeplake/config.json:
- hivemind embeddings install                        \u2014 download deps (~600MB), symlink agents, set enabled:true
- hivemind embeddings enable                         \u2014 flip enabled:true (run install first if deps missing)
- hivemind embeddings disable                        \u2014 flip enabled:false + SIGTERM daemon (deps stay on disk)
- hivemind embeddings uninstall [--prune]            \u2014 remove agent symlinks + disable; --prune wipes deps too
- hivemind embeddings status                         \u2014 show config + deps + per-agent link state

IMPORTANT: Only use bash commands (cat, ls, grep, echo, jq, head, tail, etc.) to interact with ~/.deeplake/memory/. Do NOT use python, python3, node, curl, or other interpreters \u2014 they are not available in the memory filesystem. Avoid bash brace expansions like \`{1..10}\` (not fully supported); spell out paths explicitly. Bash output is capped at 10MB total \u2014 avoid \`for f in *.json; do cat $f\` style loops on the whole sessions dir.

LIMITS: Do NOT spawn subagents to read deeplake memory. If a file returns empty after 2 attempts, skip it and move on. Report what you found rather than exhaustively retrying.

Debugging: Set HIVEMIND_DEBUG=1 to enable verbose logging to ~/.deeplake/hook-debug.log`;
var HOME2 = homedir15();
var { log: wikiLog } = makeWikiLogger(join28(HOME2, ".claude", "hooks"));
async function createPlaceholder(api, table, sessionId, cwd, userName, orgName, workspaceId, pluginVersion) {
  await createPlaceholderSummary((sql) => api.query(sql), { table, sessionId, cwd, userName, orgName, workspaceId, agent: "claude_code", pluginVersion }, wikiLog);
}
async function main() {
  if (process.env.HIVEMIND_WIKI_WORKER === "1")
    return;
  const __hookT0 = Date.now();
  log7(`hook entered (pid=${process.pid})`);
  const input = await readStdin();
  if (input.session_id) {
    clearSessionEnded(input.session_id);
    recordSessionOwner(input.session_id);
    touchSessionActivity(input.session_id);
  }
  let creds = loadCredentials();
  if (!creds?.token) {
    log7("no credentials found \u2014 run /hivemind:login to authenticate");
    const auto = maybeAutoMineLocal();
    log7(`auto-mine: ${auto.triggered ? "triggered (background)" : `skipped (${auto.reason})`}`);
  } else {
    log7(`credentials loaded: org=${creds.orgName ?? creds.orgId}`);
    creds = await healDriftedOrgToken(creds, log7);
    if (creds.token && !creds.userName) {
      try {
        const { userInfo: userInfo2 } = await import("node:os");
        creds.userName = userInfo2().username ?? "unknown";
        saveCredentials(creds);
        log7(`backfilled and persisted userName: ${creds.userName}`);
      } catch {
      }
    }
  }
  await autoUpdate(creds, { agent: "claude" });
  const current = getInstalledVersion(__bundleDir, ".claude-plugin");
  const pluginVersion = current ?? "";
  const captureEnabled = process.env.HIVEMIND_CAPTURE !== "false" && entrypointPassesOnlyCliGate();
  const sessionCwd = input.cwd ?? process.cwd();
  const baseConfig = loadConfig();
  const dirRes = baseConfig ? resolveDirConfig(baseConfig, sessionCwd) : null;
  const collectHere = captureEnabled && (dirRes?.collect ?? true);
  const pullResult = await autoPullSkills();
  log7(`autopull: pulled=${pullResult.pulled} skipped=${pullResult.skipped}`);
  let rulesBlock = "";
  if (input.session_id && creds?.token) {
    try {
      const config = dirRes?.config;
      if (config) {
        const table = config.tableName;
        const sessionsTable = config.sessionsTableName;
        const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, table);
        if (collectHere) {
          await api.ensureTable();
          await api.ensureSessionsTable(sessionsTable);
          await createPlaceholder(api, table, input.session_id, sessionCwd, config.userName, config.orgName, config.workspaceId, pluginVersion);
          log7("placeholder created");
        } else {
          const reason = dirRes && !dirRes.collect ? `.hivemind collect:false (${dirRes.found?.path})` : process.env.HIVEMIND_CAPTURE === "false" ? "HIVEMIND_CAPTURE=false" : "HIVEMIND_CAPTURE_ONLY_CLI gate";
          log7(`placeholder + schema ensure skipped (${reason})`);
        }
        try {
          const cwd = input.cwd ?? process.cwd();
          if (maybeSpawnDocsRefresh(cwd, { orgId: config.orgId, project: deriveProjectKey(cwd).key, full: true })) {
            log7("docs auto sync spawned (session-start tick)");
          }
        } catch {
        }
        const known = await api.knownTablesOrNull();
        const tableExists = known ? (name) => known.includes(name) : void 0;
        rulesBlock = await renderContextBlock((sql) => api.query(sql), {
          rulesTable: config.rulesTableName,
          goalsTable: config.goalsTableName,
          currentUser: config.userName
        }, { log: log7, tableExists });
      }
    } catch (e) {
      log7(`placeholder failed: ${e.message}`);
      wikiLog(`SessionStart: placeholder failed for ${input.session_id}: ${e.message}`);
    }
  }
  const updateNotice = current ? `

\u2705 Hivemind v${current}` : "";
  const resolvedContext = context;
  const localMined = countLocalManifestEntries();
  const localMinedNote = renderLocalMinedNote({ totalCount: localMined });
  if (creds?.token)
    spawnGraphPullWorker(input.cwd ?? process.cwd(), __bundleDir);
  const graphLine = graphContextLine(input.cwd ?? process.cwd());
  const graphNote = graphLine ?? "";
  const docsNote = creds?.token ? docsWikiContextNote(creds.orgId ?? "", deriveProjectKey(input.cwd ?? process.cwd()).key) : "";
  const effConfig = dirRes?.config ?? baseConfig;
  const routed = !!(dirRes?.found && baseConfig && (dirRes.config.orgId !== baseConfig.orgId || dirRes.config.workspaceId !== baseConfig.workspaceId));
  const effOrg = effConfig ? effConfig.orgName ?? effConfig.orgId : creds?.orgName ?? creds?.orgId;
  const effWs = effConfig ? effConfig.workspaceId : creds?.workspaceId ?? "default";
  const routedNote = routed ? ` \xB7 routed by ${dirRes?.found?.path}` : "";
  const identityLine = dirRes && !dirRes.collect ? `Deeplake capture is disabled for this directory (${dirRes.found?.path}); memory search uses org: ${effOrg} (workspace: ${effWs})${routedNote}` : `Logged in to Deeplake as org: ${effOrg} (workspace: ${effWs})${routedNote}`;
  const baseContext = creds?.token ? `${resolvedContext}

${identityLine}${updateNotice}` : `${resolvedContext}

Not logged in to Deeplake; memory search is unavailable this session.${localMinedNote}${updateNotice}`;
  const withRules = rulesBlock ? `${baseContext}

${rulesBlock}` : baseContext;
  const additionalContext = `${withRules}${graphNote}${docsNote}`;
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext
    }
  }));
  log7(`hook done (${Date.now() - __hookT0}ms total)`);
}
main().catch((e) => {
  log7(`fatal: ${e.message}`);
  process.exit(0);
});
