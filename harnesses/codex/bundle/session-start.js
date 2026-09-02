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
import { existsSync as existsSync4, mkdirSync as mkdirSync7, readFileSync as readFileSync8, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join11 } from "node:path";
import { tmpdir } from "node:os";
function getIndexMarkerDir() {
  return process.env.HIVEMIND_INDEX_MARKER_DIR ?? join11(tmpdir(), "hivemind-deeplake-indexes");
}
function buildIndexMarkerPath(workspaceId, orgId, table, suffix) {
  const markerKey = [workspaceId, orgId, table, suffix].join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join11(getIndexMarkerDir(), `${markerKey}.json`);
}
function hasFreshIndexMarker(markerPath) {
  if (!existsSync4(markerPath))
    return false;
  try {
    const raw = JSON.parse(readFileSync8(markerPath, "utf-8"));
    const updatedAt = raw.updatedAt ? new Date(raw.updatedAt).getTime() : NaN;
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > INDEX_MARKER_TTL_MS)
      return false;
    return true;
  } catch {
    return false;
  }
}
function writeIndexMarker(markerPath) {
  mkdirSync7(getIndexMarkerDir(), { recursive: true });
  writeFileSync5(markerPath, JSON.stringify({ updatedAt: (/* @__PURE__ */ new Date()).toISOString() }), "utf-8");
}
var INDEX_MARKER_TTL_MS;
var init_index_marker_store = __esm({
  "dist/src/index-marker-store.js"() {
    "use strict";
    INDEX_MARKER_TTL_MS = Number(process.env.HIVEMIND_INDEX_MARKER_TTL_MS ?? 6 * 60 * 6e4);
  }
});

// dist/src/hooks/codex/session-start.js
import { spawn as spawn4 } from "node:child_process";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname11, join as join25 } from "node:path";

// dist/src/utils/client-header.js
var DEEPLAKE_CLIENT_HEADER = "X-Deeplake-Client";
function deeplakeClientValue() {
  return "hivemind";
}
function deeplakeClientHeader() {
  return { [DEEPLAKE_CLIENT_HEADER]: deeplakeClientValue() };
}

// dist/src/commands/install-id.js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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
import { delimiter, join as join2 } from "node:path";

// dist/src/commands/auth-creds.js
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, unlinkSync, renameSync } from "node:fs";
import { join as join3 } from "node:path";
import { homedir as homedir2 } from "node:os";
function configDir() {
  return join3(homedir2(), ".deeplake");
}
function credsPath() {
  return join3(configDir(), "credentials.json");
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
function saveCredentials(creds) {
  mkdirSync2(configDir(), { recursive: true, mode: 448 });
  const target = credsPath();
  const tmp = `${target}.${process.pid}.${process.hrtime.bigint()}.tmp`;
  const body = JSON.stringify({ ...creds, savedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2);
  try {
    writeFileSync2(tmp, body, { mode: 384 });
    renameSync(tmp, target);
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
async function healDriftedOrgToken(creds, log18 = () => {
}) {
  if (!creds.token || !creds.orgId)
    return creds;
  const payload = decodeJwtPayload(creds.token);
  const claimOrg = payload && typeof payload.org_id === "string" ? payload.org_id : void 0;
  if (!claimOrg || claimOrg === creds.orgId)
    return creds;
  log18(`token org drift detected: jwt.org_id=${claimOrg} creds.orgId=${creds.orgId} \u2014 re-minting`);
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
        log18(`orgName realigned: ${creds.orgName ?? "(unset)"} -> ${matchedOrg.name}`);
        healed.orgName = matchedOrg.name;
      }
    } catch (e) {
      log18(`orgName realign skipped: ${e.message}`);
    }
    const currentWs = creds.workspaceId ?? "default";
    if (currentWs !== "default") {
      try {
        const wsList = await listWorkspaces(healed.token, apiUrl, creds.orgId);
        const lcWs = currentWs.toLowerCase();
        const wsMatch = wsList.find((w) => w.id === currentWs || w.name && w.name.toLowerCase() === lcWs);
        if (!wsMatch) {
          log18(`workspace '${currentWs}' not in org ${creds.orgId} \u2014 reset to default`);
          healed.workspaceId = "default";
        } else if (wsMatch.id !== currentWs) {
          log18(`workspace '${currentWs}' resolved to id '${wsMatch.id}'`);
          healed.workspaceId = wsMatch.id;
        }
      } catch (e) {
        log18(`workspace realign skipped: ${e.message}`);
      }
    }
    saveCredentials(healed);
    log18(`token re-minted for org=${creds.orgId}`);
    return healed;
  } catch (err) {
    log18(`token re-mint failed (continuing with stale token): ${err.message}`);
    return creds;
  }
}
async function listWorkspaces(token, apiUrl = DEFAULT_API_URL, orgId) {
  const raw = await apiGet("/workspaces", token, apiUrl, orgId);
  const data = raw.data ?? raw;
  return Array.isArray(data) ? data : [];
}

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

// dist/src/skillify/local-manifest.js
import { existsSync, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname, join as join4 } from "node:path";
var LOCAL_MANIFEST_PATH = join4(homedir3(), ".claude", "hivemind", "local-mined.json");
var LOCAL_MINE_LOCK_PATH = join4(homedir3(), ".claude", "hivemind", "local-mined.lock");
function readLocalManifest(path = LOCAL_MANIFEST_PATH) {
  if (!existsSync(path))
    return null;
  try {
    return JSON.parse(readFileSync3(path, "utf-8"));
  } catch {
    return null;
  }
}
function countLocalManifestEntries(path = LOCAL_MANIFEST_PATH) {
  const m = readLocalManifest(path);
  return Array.isArray(m?.entries) ? m.entries.length : 0;
}
var LATEST_RUN_WINDOW_MS = 5 * 60 * 1e3;

// dist/src/skillify/spawn-mine-local-worker.js
import { execFileSync, spawn as spawn2 } from "node:child_process";
import { closeSync, existsSync as existsSync2, mkdirSync as mkdirSync4, openSync, readdirSync, statSync as statSync2, unlinkSync as unlinkSync2 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { dirname as dirname2, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";
var HOME = homedir4();
var HIVEMIND_DIR = join5(HOME, ".claude", "hivemind");
var LOG_PATH = join5(HOME, ".claude", "hooks", "mine-local.log");
var CLAUDE_PROJECTS_DIR = join5(HOME, ".claude", "projects");
var LOCK_STALE_MS = 15 * 60 * 1e3;
function findBundledCliPath() {
  try {
    const thisDir = dirname2(fileURLToPath(import.meta.url));
    const cliPath = join5(thisDir, "..", "..", "bundle", "cli.js");
    return existsSync2(cliPath) ? cliPath : null;
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
  if (!existsSync2(CLAUDE_PROJECTS_DIR))
    return false;
  let subdirs;
  try {
    subdirs = readdirSync(CLAUDE_PROJECTS_DIR);
  } catch {
    return false;
  }
  for (const sub of subdirs) {
    let files;
    try {
      files = readdirSync(join5(CLAUDE_PROJECTS_DIR, sub));
    } catch {
      continue;
    }
    if (files.some((f) => f.endsWith(".jsonl")))
      return true;
  }
  return false;
}
function maybeAutoMineLocal(opts = {}) {
  if (existsSync2(LOCAL_MANIFEST_PATH))
    return { triggered: false, reason: "manifest-exists" };
  if (existsSync2(LOCAL_MINE_LOCK_PATH)) {
    let stale = false;
    try {
      const stats = statSync2(LOCAL_MINE_LOCK_PATH);
      stale = Date.now() - stats.mtimeMs > LOCK_STALE_MS;
    } catch {
    }
    if (!stale)
      return { triggered: false, reason: "lock-exists" };
    try {
      unlinkSync2(LOCAL_MINE_LOCK_PATH);
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
    mkdirSync4(HIVEMIND_DIR, { recursive: true });
    const fd = openSync(LOCAL_MINE_LOCK_PATH, "wx");
    closeSync(fd);
  } catch {
    return { triggered: false, reason: "lock-acquire-failed" };
  }
  try {
    mkdirSync4(join5(HOME, ".claude", "hooks"), { recursive: true });
    const out = openSync(LOG_PATH, "a");
    const mineArgs = ["skillify", "mine-local"];
    if (opts.sessionCount != null)
      mineArgs.push("--n", String(opts.sessionCount));
    if (opts.onlyAgent)
      mineArgs.push("--only", opts.onlyAgent);
    if (opts.advise)
      mineArgs.push("--advise");
    const [cmd, args] = launcher.kind === "node-script" ? [process.execPath, [launcher.path, ...mineArgs]] : [launcher.path, mineArgs];
    const child = spawn2(cmd, args, {
      detached: true,
      stdio: ["ignore", out, out],
      // SW_HIDE: libuv still applies it alongside detached, so the mining
      // worker never flashes a console. No-op on POSIX.
      windowsHide: true,
      env: process.env
    });
    closeSync(out);
    child.unref();
    return { triggered: true };
  } catch {
    try {
      unlinkSync2(LOCAL_MINE_LOCK_PATH);
    } catch {
    }
    return { triggered: false, reason: "spawn-failed" };
  }
}

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync as mkdirSync5 } from "node:fs";
import { dirname as dirname3, join as join6 } from "node:path";
import { homedir as homedir5 } from "node:os";
var LOG = join6(homedir5(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function log(tag, msg) {
  if (!isDebug())
    return;
  try {
    mkdirSync5(dirname3(LOG), { recursive: true });
    appendFileSync(LOG, `${(/* @__PURE__ */ new Date()).toISOString()} [${tag}] ${msg}
`);
  } catch {
  }
}

// dist/src/utils/version-check.js
import { readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname4, join as join7 } from "node:path";
function getInstalledVersion(bundleDir, pluginManifestDir) {
  try {
    const pluginJson = join7(bundleDir, "..", pluginManifestDir, "plugin.json");
    const plugin = JSON.parse(readFileSync4(pluginJson, "utf-8"));
    if (plugin.version)
      return plugin.version;
  } catch {
  }
  try {
    const stamp = readFileSync4(join7(bundleDir, "..", ".hivemind_version"), "utf-8").trim();
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
    const candidate = join7(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync4(candidate, "utf-8"));
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

// dist/src/dir-config.js
import { readFileSync as readFileSync6 } from "node:fs";
import { dirname as dirname5, join as join9, resolve } from "node:path";

// dist/src/config.js
import { readFileSync as readFileSync5, existsSync as existsSync3 } from "node:fs";
import { join as join8 } from "node:path";
import { homedir as homedir6, userInfo } from "node:os";
function loadConfig() {
  const home = homedir6();
  const credPath = join8(home, ".deeplake", "credentials.json");
  let creds = null;
  if (existsSync3(credPath)) {
    try {
      creds = JSON.parse(readFileSync5(credPath, "utf-8"));
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
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join8(home, ".deeplake", "memory")
  };
}

// dist/src/dir-config.js
var DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"];
function findDirConfig(startDir, stopAt) {
  let dir = resolve(startDir);
  const boundary = stopAt ? resolve(stopAt) : null;
  for (; ; ) {
    for (const name of DIR_CONFIG_FILENAMES) {
      const candidate = join9(dir, name);
      try {
        const raw = parseDirConfig(readFileSync6(candidate, "utf-8"));
        if (raw)
          return { path: candidate, raw };
      } catch {
      }
    }
    if (boundary && dir === boundary)
      break;
    const parent = dirname5(dir);
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
import { readFileSync as readFileSync7, writeFileSync as writeFileSync4, mkdirSync as mkdirSync6, openSync as openSync2, closeSync as closeSync2, unlinkSync as unlinkSync3, statSync as statSync3 } from "node:fs";
import { join as join10, resolve as resolve3 } from "node:path";
import { homedir as homedir7 } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve as resolve2, relative, isAbsolute } from "node:path";
function isPathInsideHome(path, home) {
  const r = resolve2(path);
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
var LOCK_STALE_MS2 = 5e3;
function queuePath() {
  return join10(homedir7(), ".deeplake", "notifications-queue.json");
}
function lockPath() {
  return `${queuePath()}.lock`;
}
function readQueue() {
  try {
    const raw = readFileSync7(queuePath(), "utf-8");
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
  const home = resolve3(homedir7());
  if (!_isQueuePathInsideHome(path, home)) {
    throw new Error(`notifications-queue write blocked: ${path} is outside ${home}`);
  }
  mkdirSync6(join10(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync4(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameAtomic(tmp, path);
}
async function withQueueLock(fn) {
  const path = lockPath();
  mkdirSync6(join10(homedir7(), ".deeplake"), { recursive: true, mode: 448 });
  let fd = null;
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      fd = openSync2(path, "wx", 384);
      break;
    } catch (e) {
      const code = e.code;
      if (code !== "EEXIST")
        throw e;
      try {
        const age = Date.now() - statSync3(path).mtimeMs;
        if (age > LOCK_STALE_MS2) {
          unlinkSync3(path);
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
      closeSync2(fd);
    } catch {
    }
    try {
      unlinkSync3(path);
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

// dist/src/skillify/pull.js
import { existsSync as existsSync9, readFileSync as readFileSync11, writeFileSync as writeFileSync8, mkdirSync as mkdirSync10, renameSync as renameSync4, rmSync, lstatSync as lstatSync2, readlinkSync, symlinkSync, unlinkSync as unlinkSync5 } from "node:fs";
import { homedir as homedir11 } from "node:os";
import { dirname as dirname8, join as join17 } from "node:path";

// dist/src/skillify/skill-writer.js
import { existsSync as existsSync5, mkdirSync as mkdirSync8, readFileSync as readFileSync9, readdirSync as readdirSync2, statSync as statSync4, writeFileSync as writeFileSync6 } from "node:fs";
import { homedir as homedir8 } from "node:os";
import { join as join12 } from "node:path";
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
  const budget2 = MAX_SKILL_NAME_LEN - suffix.length;
  let cut = name.slice(0, budget2);
  const lastHyphen = cut.lastIndexOf("-");
  if (lastHyphen > 0)
    cut = cut.slice(0, lastHyphen);
  cut = cut.replace(/-+$/, "");
  if (cut.length === 0)
    cut = name.slice(0, budget2).replace(/-+$/, "");
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
import { existsSync as existsSync7, lstatSync, mkdirSync as mkdirSync9, readFileSync as readFileSync10, renameSync as renameSync3, unlinkSync as unlinkSync4, writeFileSync as writeFileSync7 } from "node:fs";
import { dirname as dirname7, join as join15 } from "node:path";

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync6, renameSync as renameSync2 } from "node:fs";
import { dirname as dirname6, join as join14 } from "node:path";

// dist/src/skillify/state-dir.js
import { homedir as homedir9 } from "node:os";
import { join as join13 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join13(homedir9(), ".deeplake", "state", "skillify");
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
  const legacy = join14(dirname6(current), "skilify");
  if (!existsSync6(legacy))
    return;
  if (existsSync6(current))
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

// dist/src/skillify/manifest.js
function emptyManifest() {
  return { version: 1, entries: [] };
}
function manifestPath() {
  return join15(getStateDir(), "pulled.json");
}
function loadManifest(path = manifestPath()) {
  migrateLegacyStateDir();
  if (!existsSync7(path))
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
  mkdirSync9(dirname7(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync7(tmp, JSON.stringify(m, null, 2) + "\n", { mode: 384 });
  renameSync3(tmp, path);
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
      unlinkSync4(path);
    } catch {
    }
  }
}
function pruneOrphanedEntries(path = manifestPath()) {
  const m = loadManifest(path);
  const live = [];
  let pruned = 0;
  for (const e of m.entries) {
    if (existsSync7(join15(e.installRoot, e.dirName))) {
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
import { existsSync as existsSync8 } from "node:fs";
import { homedir as homedir10 } from "node:os";
import { join as join16 } from "node:path";
function resolveDetected(home) {
  const out = [];
  const codexInstalled = existsSync8(join16(home, ".codex"));
  const piInstalled = existsSync8(join16(home, ".pi", "agent"));
  const hermesInstalled = existsSync8(join16(home, ".hermes"));
  if (codexInstalled || piInstalled) {
    out.push(join16(home, ".agents", "skills"));
  }
  if (hermesInstalled) {
    out.push(join16(home, ".hermes", "skills"));
  }
  if (piInstalled) {
    out.push(join16(home, ".pi", "agent", "skills"));
  }
  return out;
}
function detectAgentSkillsRoots(canonicalRoot, home = homedir10()) {
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
    return join17(homedir11(), ".claude", "skills");
  if (!cwd)
    throw new Error("install=project requires a cwd");
  return join17(cwd, ".claude", "skills");
}
function fanOutSymlinks(canonicalDir, dirName, agentRoots) {
  const out = [];
  for (const root of agentRoots) {
    const link = join17(root, dirName);
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
        unlinkSync5(link);
      } catch {
        continue;
      }
    }
    try {
      mkdirSync10(dirname8(link), { recursive: true });
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
    const canonical = join17(entry.installRoot, entry.dirName);
    if (!existsSync9(canonical))
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
  if (!existsSync9(path))
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
    const skillDir = join17(root, dirName);
    const skillFile = join17(skillDir, "SKILL.md");
    const staleDir = name !== rawName ? `${rawName}--${author}` : null;
    const staleOwned = !!staleDir && staleDir !== dirName && entriesForRoot(loadManifest(), opts.install, root).some((e) => e.dirName === staleDir);
    const staleFile = staleOwned ? join17(root, staleDir, "SKILL.md") : null;
    const staleVersion = staleFile && existsSync9(staleFile) ? readLocalVersion(staleFile) : null;
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
      if (existsSync9(skillFile)) {
        try {
          renameSync4(skillFile, `${skillFile}.bak`);
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
    if (staleDir && staleDir !== dirName && !(opts.dryRun ?? false) && existsSync9(skillFile) && existsSync9(join17(root, staleDir))) {
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
          rmSync(join17(root, staleDir), { recursive: true, force: true });
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
import { cpSync, existsSync as existsSync10, readFileSync as readFileSync12, rmSync as rmSync2, writeFileSync as writeFileSync9 } from "node:fs";
import { join as join18 } from "node:path";
var log4 = (msg) => log("skillify-legacy-cap", msg);
function readInstalledName(skillFile) {
  if (!existsSync10(skillFile))
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
  rmSync2(join18(entry.installRoot, entry.dirName), { recursive: true, force: true });
  removePullEntry(entry.install, entry.installRoot, entry.dirName);
}
function migrateEntry(entry) {
  if (entry.install !== "global")
    return false;
  const staleDir = join18(entry.installRoot, entry.dirName);
  const staleFile = join18(staleDir, "SKILL.md");
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
    log4(`skip ${entry.dirName}: invalid name/author (${e?.message ?? e})`);
    return false;
  }
  if (capped === installedName)
    return false;
  const rawName = entry.rawName ?? entry.name;
  const cappedDir = `${capped}--${entry.author}`;
  const cappedDirPath = join18(entry.installRoot, cappedDir);
  const cappedFile = join18(cappedDirPath, "SKILL.md");
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
          log4(`repair: dropped half-migrated ${cappedDir}, re-migrating from ${entry.dirName}`);
        } else {
          retireEntry(entry);
          log4(`reconciled leftover ${entry.dirName} (canonical ${cappedDir} already present)`);
          return true;
        }
      } else {
        log4(`skip ${entry.dirName}: capped dir ${cappedDir} claimed by ${collidingEntry.rawName ?? collidingEntry.name}`);
        return false;
      }
    }
    if (existsSync10(cappedDirPath)) {
      log4(`skip ${entry.dirName}: ${cappedDir} already exists on disk`);
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
    log4(`migrated ${entry.dirName} \u2192 ${cappedDir}`);
    return true;
  } catch (e) {
    log4(`error migrating ${entry.dirName} (swallowed): ${e?.message ?? e}`);
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
    log4(`migrated=${migrated} skipped=${skipped}`);
  return { migrated, skipped };
}

// dist/src/skillify/auto-pull.js
var log5 = (msg) => log("skillify-autopull", msg);
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
    log5("disabled via HIVEMIND_AUTOPULL_DISABLED=1");
    return { pulled: 0, skipped: true, reason: "disabled" };
  }
  try {
    migrateLegacyCappedInstalls();
  } catch (e) {
    log5(`legacy-cap migration failed (swallowed): ${e?.message ?? e}`);
  }
  const config = deps.loadConfigFn ? deps.loadConfigFn() : loadRoutedConfig(deps.cwd ?? process.cwd());
  if (!config) {
    log5("skipped: not logged in");
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
    log5(`pulled scanned=${summary.scanned} wrote=${summary.wrote} skipped=${summary.skipped}`);
    return { pulled: summary.wrote, skipped: false };
  } catch (e) {
    log5(`pull failed (swallowed): ${e?.message ?? e}`);
    return { pulled: 0, skipped: true, reason: "error" };
  }
}

// dist/src/graph/spawn-pull-worker.js
import { spawn as spawn3 } from "node:child_process";
import { join as join19 } from "node:path";
function spawnGraphPullWorker(cwd, bundleDir, deps = {}) {
  if (process.env.HIVEMIND_GRAPH_PULL === "0")
    return;
  const workerPath = join19(bundleDir, "graph-pull-worker.js");
  const opts = {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"]
  };
  try {
    const sp = deps.spawn ?? spawn3;
    const child = sp("nohup", ["node", workerPath, "--cwd", cwd], opts);
    child.on("error", () => {
    });
    child.unref();
  } catch {
  }
}

// dist/src/notifications/rules/registry.js
var RULES = [];
function registerRule(rule) {
  if (RULES.find((r) => r.id === rule.id)) {
    throw new Error(`duplicate rule id: ${rule.id}`);
  }
  RULES.push(rule);
}
function evaluateRules(trigger, ctx) {
  const out = [];
  for (const r of RULES) {
    if (r.trigger !== trigger)
      continue;
    const result = r.evaluate(ctx);
    if (result)
      out.push(result);
  }
  return out;
}

// dist/src/notifications/state.js
import { closeSync as closeSync3, mkdirSync as mkdirSync11, openSync as openSync3, readFileSync as readFileSync13, unlinkSync as unlinkSync6, writeFileSync as writeFileSync10 } from "node:fs";
import { createHash } from "node:crypto";
import { join as join20, resolve as resolve4 } from "node:path";
import { homedir as homedir12 } from "node:os";
var log6 = (msg) => log("notifications-state", msg);
function statePath() {
  return join20(homedir12(), ".deeplake", "notifications-state.json");
}
function readState() {
  try {
    const raw = readFileSync13(statePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.shown !== "object") {
      log6(`state malformed \u2192 treating as empty`);
      return { shown: {} };
    }
    return {
      shown: { ...parsed.shown },
      sessionCount: typeof parsed.sessionCount === "number" ? parsed.sessionCount : void 0,
      lastCountedSessionId: typeof parsed.lastCountedSessionId === "string" ? parsed.lastCountedSessionId : void 0
    };
  } catch {
    return { shown: {} };
  }
}
function bumpSessionCount(sessionId) {
  const state = readState();
  const current = state.sessionCount ?? 0;
  if (!sessionId || state.lastCountedSessionId === sessionId) {
    return current;
  }
  const next = current + 1;
  writeState({ ...state, sessionCount: next, lastCountedSessionId: sessionId });
  return next;
}
function writeState(state) {
  const path = statePath();
  const home = resolve4(homedir12());
  if (!isPathInsideHome(path, home)) {
    throw new Error(`notifications-state write blocked: ${path} is outside ${home}`);
  }
  mkdirSync11(join20(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync10(tmp, JSON.stringify(state, null, 2), { mode: 384 });
  renameAtomic(tmp, path);
}
function markShown(state, n, now = /* @__PURE__ */ new Date()) {
  return {
    ...state,
    shown: {
      ...state.shown,
      [n.id]: { dedupKey: JSON.stringify(n.dedupKey), shownAt: now.toISOString() }
    }
  };
}
function alreadyShown(state, n) {
  const prev = state.shown[n.id];
  if (!prev)
    return false;
  return prev.dedupKey === JSON.stringify(n.dedupKey);
}
function tryClaim(n) {
  const home = resolve4(homedir12());
  const claimsDir = join20(home, ".deeplake", "notifications-claims");
  try {
    mkdirSync11(claimsDir, { recursive: true, mode: 448 });
  } catch (e) {
    log6(`tryClaim mkdir failed: ${e?.message ?? String(e)}`);
    return true;
  }
  const claimPath = claimPathFor(claimsDir, n);
  try {
    const fd = openSync3(claimPath, "wx", 384);
    closeSync3(fd);
    return true;
  } catch (e) {
    if (e?.code === "EEXIST")
      return false;
    log6(`tryClaim open failed: ${e?.message ?? String(e)}`);
    return true;
  }
}
function releaseClaim(n) {
  const home = resolve4(homedir12());
  const claimsDir = join20(home, ".deeplake", "notifications-claims");
  const claimPath = claimPathFor(claimsDir, n);
  try {
    unlinkSync6(claimPath);
  } catch (e) {
    if (e?.code !== "ENOENT") {
      log6(`releaseClaim unlink failed: ${e?.message ?? String(e)}`);
    }
  }
}
function claimPathFor(claimsDir, n) {
  const keyHash = createHash("sha256").update(JSON.stringify(n.dedupKey)).digest("hex").slice(0, 12);
  const safeId = n.id.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join20(claimsDir, `${safeId}-${keyHash}`);
}

// dist/src/notifications/format.js
var SEVERITY_PREFIX = {
  info: "\u{1F41D}",
  warn: "\u26A0\uFE0F",
  error: "\u{1F6A8}"
};
function renderOne(n) {
  const prefix = SEVERITY_PREFIX[n.severity ?? "info"] ?? SEVERITY_PREFIX.info;
  return `${prefix} ${n.title}
${n.body}`;
}
function renderNotifications(items) {
  if (items.length === 0)
    return "";
  return items.map(renderOne).join("\n\n");
}

// dist/src/notifications/delivery/claude-code.js
function emitClaudeCode(notifications) {
  const modelSafe = notifications.filter((n) => !n.userVisibleOnly);
  const modelRendered = renderNotifications(modelSafe);
  const userRendered = renderNotifications(notifications);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      ...modelRendered ? { additionalContext: modelRendered } : {}
    },
    systemMessage: userRendered
  }));
}

// dist/src/notifications/delivery/codex.js
function renderCodexChannels(notifications) {
  if (notifications.length === 0)
    return {};
  const modelSafe = notifications.filter((n) => !n.userVisibleOnly);
  const modelRendered = renderNotifications(modelSafe);
  const userRendered = renderNotifications(notifications);
  return {
    ...userRendered ? { systemMessage: userRendered } : {},
    ...modelRendered ? { additionalContext: modelRendered } : {}
  };
}
function emitCodex(notifications) {
  const { systemMessage, additionalContext } = renderCodexChannels(notifications);
  if (!systemMessage && !additionalContext)
    return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      ...additionalContext ? { additionalContext } : {}
    },
    ...systemMessage ? { systemMessage } : {}
  }));
}

// dist/src/notifications/delivery/model-channel.js
var STATUS_SAFE_IDS = /* @__PURE__ */ new Set(["balance-exhausted", "balance-low"]);
function asStatusLine(n) {
  if (!STATUS_SAFE_IDS.has(n.id))
    return null;
  const url = /https?:\/\/\S+/.exec(n.body)?.[0]?.replace(/[.,]$/, "");
  const what = n.id === "balance-exhausted" ? "the organization's Deeplake credits are exhausted; session capture and memory recall are disabled" : "the organization's Deeplake balance is nearly empty; session capture and memory recall will stop working shortly";
  return `Hivemind status: ${what}${url ? ` (billing: ${url})` : ""}.`;
}
function renderModelChannelContext(notifications) {
  if (notifications.length === 0)
    return "";
  const modelSafe = notifications.filter((n) => !n.userVisibleOnly);
  const statusLines = notifications.filter((n) => n.userVisibleOnly).map(asStatusLine).filter((l) => l !== null);
  return [renderNotifications(modelSafe), ...statusLines].filter(Boolean).join("\n\n");
}

// dist/src/notifications/delivery/index.js
var ADAPTERS = {
  "claude-code": emitClaudeCode,
  // Codex's SessionStart hook already owns its stdout, so production passes
  // a `deliver` override (see DrainOptions) and merges the rendered channels
  // into its own JSON object. This adapter is the standalone-process path.
  codex: emitCodex,
  // Cursor's session-start hook owns its single JSON object and appends the
  // rendered context itself (see src/hooks/cursor/session-start.ts), so
  // production always passes a `deliver` override. This adapter is the
  // standalone-process path.
  // Hermes delivers from its pre_llm_call capture hook (no user-visible
  // session-start channel exists), always via a `deliver` override.
  hermes: (notifications) => {
    const context = renderModelChannelContext(notifications);
    if (context)
      process.stdout.write(JSON.stringify({ context }));
  },
  // Pi is the one non-Claude-Code harness with a real user-visible channel
  // (ctx.ui.notify). Its extension spawns src/hooks/pi/notifications-worker.ts
  // and calls notify() per item, so delivery always goes through a `deliver`
  // override; this adapter is the standalone-process path.
  pi: (notifications) => {
    const text = renderNotifications(notifications);
    process.stdout.write(JSON.stringify({ notifications: [{ text, severity: "warning" }] }));
  },
  cursor: (notifications) => {
    const context = renderModelChannelContext(notifications);
    if (!context)
      return;
    process.stdout.write(JSON.stringify({ additional_context: context }));
  }
};
function emit(agent, notifications) {
  if (notifications.length === 0)
    return;
  ADAPTERS[agent](notifications);
}

// dist/src/notifications/sources/backend.js
var log7 = (msg) => log("notifications-backend", msg);
var FETCH_TIMEOUT_MS = 1500;
var DEFAULT_API_URL2 = "https://api.deeplake.ai";
var ALLOWED_SEVERITIES = /* @__PURE__ */ new Set(["info", "warn", "error"]);
function normalizeSeverity(s) {
  return typeof s === "string" && ALLOWED_SEVERITIES.has(s) ? s : "info";
}
function toClient(n) {
  if (!n.id || typeof n.id !== "string")
    return null;
  if (!n.title || typeof n.title !== "string")
    return null;
  if (!n.body || typeof n.body !== "string")
    return null;
  return {
    // Prefix with `backend:` so a future local-only rule can never collide
    // with a server-issued id, even if both happen to use the same string.
    id: `backend:${n.id}`,
    severity: normalizeSeverity(n.severity),
    title: n.title,
    body: n.body,
    // dedupKey wraps server fields the client cares about. The server's
    // dedup_key is hashed in here so a server that reuses the same UUID
    // with a fresh dedup_key (rare but supported) re-fires for the user.
    dedupKey: { id: n.id, dedup_key: n.dedup_key ?? "" },
    // The body is server-controlled free text shown to the user as a banner
    // (e.g. the deeplake-api low-balance "top up to avoid service
    // interruption" push). Like every user-facing notification, it must NOT
    // reach the model's additionalContext — an imperative/billing string in
    // the agent prompt is the prompt-injection shape we're closing. User
    // channel only.
    userVisibleOnly: true
  };
}
async function fetchBackendNotifications(creds) {
  if (!creds?.token)
    return [];
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL2;
  const url = `${apiUrl}/me/notifications`;
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...creds.orgId ? { "X-Activeloop-Org-Id": creds.orgId } : {}
      },
      signal: ctrl.signal
    });
    if (!resp.ok) {
      log7(`fetch ${url} returned ${resp.status}`);
      return [];
    }
    const body = await resp.json();
    if (!body || !Array.isArray(body.notifications)) {
      log7(`fetch ${url} returned malformed body`);
      return [];
    }
    const out = [];
    for (const sn of body.notifications) {
      const c = toClient(sn);
      if (c)
        out.push(c);
    }
    log7(`fetched ${out.length} backend notification(s) from ${apiUrl}`);
    return out;
  } catch (e) {
    log7(`fetch ${url} failed: ${e?.message ?? String(e)}`);
    return [];
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// dist/src/notifications/sources/org-stats.js
import { existsSync as existsSync11, mkdirSync as mkdirSync12, readFileSync as readFileSync14, writeFileSync as writeFileSync11 } from "node:fs";
import { homedir as homedir13 } from "node:os";
import { dirname as dirname9, join as join21 } from "node:path";
var log8 = (msg) => log("notifications-org-stats", msg);
var FETCH_TIMEOUT_MS2 = 1500;
var DEFAULT_API_URL3 = "https://api.deeplake.ai";
var CACHE_TTL_MS = 60 * 60 * 1e3;
function cacheFilePath() {
  return join21(homedir13(), ".deeplake", "hivemind-stats-cache.json");
}
var BALANCE_HEADER = "X-Activeloop-Balance-Cents";
function parseBalanceHeader(resp) {
  const raw = resp.headers?.get?.(BALANCE_HEADER);
  if (!raw || !/^-?\d+$/.test(raw.trim()))
    return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}
function cacheScopeKey(creds) {
  return JSON.stringify({
    apiUrl: creds.apiUrl ?? DEFAULT_API_URL3,
    orgId: creds.orgId ?? "",
    userName: creds.userName ?? ""
  });
}
function scopeFromServer(s) {
  const n = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  return {
    sessionsCount: n(s?.sessions_count),
    memoryRecallCount: n(s?.memory_recall_count),
    memorySearchBytes: n(s?.memory_search_bytes)
  };
}
function readCache(scopeKey) {
  if (!existsSync11(cacheFilePath()))
    return {};
  try {
    const parsed = JSON.parse(readFileSync14(cacheFilePath(), "utf-8"));
    if (!parsed || typeof parsed !== "object")
      return {};
    if (parsed.scopeKey !== scopeKey)
      return {};
    if (typeof parsed.fetchedAt !== "number")
      return {};
    const age = Date.now() - parsed.fetchedAt;
    const data = parsed.data;
    if (!data || typeof data !== "object" || !data.org || !data.user)
      return {};
    if (age >= 0 && age < CACHE_TTL_MS)
      return { fresh: data };
    return { stale: data };
  } catch (e) {
    log8(`cache read failed: ${e?.message ?? String(e)}`);
    return {};
  }
}
function writeCache(scopeKey, data) {
  try {
    mkdirSync12(dirname9(cacheFilePath()), { recursive: true });
    const body = { fetchedAt: Date.now(), scopeKey, data };
    writeFileSync11(cacheFilePath(), JSON.stringify(body), "utf-8");
  } catch (e) {
    log8(`cache write failed: ${e?.message ?? String(e)}`);
  }
}
async function fetchOrgStats(creds) {
  if (!creds?.token)
    return null;
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL3;
  const scopeKey = cacheScopeKey(creds);
  const { fresh, stale } = readCache(scopeKey);
  if (fresh) {
    log8("cache hit \u2014 returning fresh org stats");
    return fresh;
  }
  const url = `${apiUrl}/me/hivemind-stats`;
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS2);
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...creds.orgId ? { "X-Activeloop-Org-Id": creds.orgId } : {}
      },
      signal: ctrl.signal
    });
    if (!resp.ok) {
      log8(`fetch ${url} returned ${resp.status}`);
      return stale ?? null;
    }
    const body = await resp.json();
    if (!body || typeof body !== "object") {
      log8(`fetch ${url} returned malformed body`);
      return stale ?? null;
    }
    const data = {
      org: scopeFromServer(body.org),
      user: scopeFromServer(body.user),
      balanceCents: parseBalanceHeader(resp)
    };
    writeCache(scopeKey, data);
    log8(`fetched org stats from ${apiUrl}`);
    return data;
  } catch (e) {
    log8(`fetch ${url} failed: ${e?.message ?? String(e)}`);
    return stale ?? null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// dist/src/rules/write.js
import { randomUUID as randomUUID3 } from "node:crypto";

// dist/src/hooks/shared/context-renderer.js
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

// dist/src/notifications/sources/open-goals.js
var log9 = (msg) => log("notifications-open-goals", msg);
async function fetchOpenGoals(creds, goalsTableName) {
  if (!creds.token || !creds.userName || !creds.orgId)
    return null;
  try {
    const api = new DeeplakeApi(creds.token, creds.apiUrl ?? "https://api.deeplake.ai", creds.orgId, creds.workspaceId ?? "default", goalsTableName);
    const known = await api.knownTablesOrNull();
    if (known && !known.includes(goalsTableName)) {
      log9(`fetchOpenGoals: table "${goalsTableName}" not present \u2014 skipping read`);
      return null;
    }
    const rows = await listOpenGoals((sql) => api.query(sql), goalsTableName, creds.userName, { limit: 25 });
    if (rows.length === 0)
      return null;
    const goals = [];
    for (const r of rows) {
      if (!r.content)
        continue;
      goals.push({ label: firstLine(r.content) });
    }
    if (goals.length === 0)
      return null;
    return {
      count: goals.length,
      // Match the resume brief's line width (MAX_LINE_CHARS = 120) so the
      // two 📌 blocks in the SessionStart banner truncate consistently
      // instead of goals cutting off at 60 while "picking up" runs long.
      sample: goals.slice(0, 3).map((g) => truncate(g.label, 120))
    };
  } catch (e) {
    log9(`fetchOpenGoals: ${e.message}`);
    return null;
  }
}
function firstLine(content) {
  for (const ln of content.split(/\r?\n/)) {
    const trimmed = ln.trim();
    if (trimmed.length > 0)
      return trimmed;
  }
  return content.trim();
}
function truncate(s, max) {
  if (s.length <= max)
    return s;
  return s.slice(0, max - 1) + "\u2026";
}
function formatOpenGoalsLine(summary) {
  if (!summary || summary.count === 0)
    return "";
  const head = summary.count === 1 ? "1 goal open:" : `${summary.count} goals open:`;
  if (summary.sample.length === 0)
    return head;
  const bullets = summary.sample.map((g) => `   \u2022 ${g}`).join("\n");
  return `${head}
${bullets}`;
}

// dist/src/notifications/sources/cold-start-brief.js
import { existsSync as existsSync12, readdirSync as readdirSync3, statSync as statSync5, writeFileSync as writeFileSync12, readFileSync as readFileSync15, openSync as openSync4, readSync, closeSync as closeSync4 } from "node:fs";
import { join as join22 } from "node:path";
import { homedir as homedir14 } from "node:os";
var log10 = (m) => log("notifications-cold-start-brief", m);
var WINDOW_DAYS_CAP = 60;
var HARD_TIMEOUT_MS = 3500;
var HEAD_TAIL_BYTES = 32 * 1024;
var RECALL_MIN_HITS = 3;
var ABANDONED_MIN_HITS = 1;
var PROJECTS_DIR = () => join22(homedir14(), ".claude", "projects");
var STATE_FILE = () => join22(homedir14(), ".claude", ".hivemind_brief_state.json");
var RECALL_RE = new RegExp("\\b(what (was|were) (i|we) (doing|working)|where (did|was) (i|we) (leave|left|stop)|continue from|pick.{0,20}(up|back|where)|remind me|what'?s (my|the) (todo|status|state|progress)|what'?s (open|pending|left|next)|recap|summari[sz]e (my|the|last|recent)|todo list|catch me up|where (am|are) (i|we)|what (have|did) (i|we) (done|been doing)|read (my|the) last \\d+ sessions)\\b", "i");
var ABANDON_RE = /(next time|next session|todo[: ]|still need|left off|come back to|pick this up|finish.*later|continue.*tomorrow)/i;
var RENUDGE_MS = 24 * 60 * 60 * 1e3;
function hasState() {
  return existsSync12(STATE_FILE());
}
function lastBriefMs() {
  try {
    if (!existsSync12(STATE_FILE()))
      return null;
    const raw = JSON.parse(readFileSync15(STATE_FILE(), "utf-8"));
    const t = typeof raw?.lastBriefTs === "string" ? Date.parse(raw.lastBriefTs) : NaN;
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}
function writeState2(sessionsScanned, isFirstRun) {
  try {
    writeFileSync12(STATE_FILE(), JSON.stringify({
      lastBriefTs: (/* @__PURE__ */ new Date()).toISOString(),
      fireReason: isFirstRun ? "first_run" : "renudge",
      sessionsScanned
    }));
  } catch (e) {
    log10(`writeState failed: ${e.message}`);
  }
}
function parseTs(s) {
  if (!s)
    return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function cleanSnippet(raw, maxLen = 150) {
  let s = raw.replace(/[`*_#>]/g, "").replace(/\s+/g, " ").replace(/^["'\s]+/, "").trim();
  s = s.replace(/"/g, "'");
  if (s.length <= maxLen)
    return stripDanglingOpener(s);
  const window = s.slice(0, maxLen);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd >= maxLen * 0.5)
    return stripDanglingOpener(window.slice(0, sentenceEnd + 1).trim());
  const clauseEnd = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "));
  if (clauseEnd >= maxLen * 0.5)
    return stripDanglingOpener(window.slice(0, clauseEnd).trim() + "\u2026");
  const lastSpace = window.lastIndexOf(" ");
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window;
  return stripDanglingOpener(cut.trim() + "\u2026");
}
function stripDanglingOpener(s) {
  let out = s;
  const opens = (out.match(/\(/g) || []).length;
  const closes = (out.match(/\)/g) || []).length;
  if (opens > closes)
    out = out.replace(/\s*\([^)]*$/, "");
  return out.replace(/[\s,;:(]+$/, "").trim();
}
function deriveProjectLabel(projDirName, cwdSeen) {
  if (cwdSeen) {
    const seg = cwdSeen.split(/[/\\]/).filter(Boolean);
    return seg[seg.length - 1] || projDirName;
  }
  const parts = projDirName.split("-");
  return parts[parts.length - 1] || projDirName;
}
function readHeadTail(path, bytes) {
  let fd = null;
  try {
    fd = openSync4(path, "r");
    const size = statSync5(path).size;
    const headLen = Math.min(bytes, size);
    const headBuf = Buffer.allocUnsafe(headLen);
    readSync(fd, headBuf, 0, headLen, 0);
    let tail = "";
    if (size > bytes) {
      const tailLen = Math.min(bytes, size);
      const tailBuf = Buffer.allocUnsafe(tailLen);
      readSync(fd, tailBuf, 0, tailLen, size - tailLen);
      tail = tailBuf.toString("utf-8");
    }
    return { head: headBuf.toString("utf-8"), tail };
  } catch {
    return null;
  } finally {
    if (fd !== null)
      try {
        closeSync4(fd);
      } catch {
      }
  }
}
function parseUserRows(chunk) {
  const rows = [];
  for (const line of chunk.split("\n")) {
    if (!line)
      continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type !== "user" || row.isSidechain)
      continue;
    const c = row.message?.content;
    if (typeof c !== "string")
      continue;
    const ts = parseTs(row.timestamp);
    if (!ts)
      continue;
    rows.push({ ts, content: c, cwd: row.cwd });
  }
  return rows;
}
function loadLocalSession(path, cutoff) {
  let mtime;
  try {
    mtime = statSync5(path).mtime;
  } catch {
    return null;
  }
  if (mtime < cutoff)
    return null;
  const ht = readHeadTail(path, HEAD_TAIL_BYTES);
  if (!ht)
    return null;
  const headRows = parseUserRows(ht.head);
  const tailRows = ht.tail ? parseUserRows(ht.tail) : headRows;
  if (headRows.length === 0)
    return null;
  const first = headRows[0];
  const last = tailRows.length > 0 ? tailRows[tailRows.length - 1] : headRows[headRows.length - 1];
  const projectCwd = first.cwd ?? last.cwd;
  if (last.ts < cutoff)
    return null;
  const projDirName = path.split(/[/\\]/).slice(-2, -1)[0] ?? "unknown";
  return {
    firstTs: first.ts,
    lastTs: last.ts,
    project: deriveProjectLabel(projDirName, projectCwd),
    firstMessage: first.content,
    lastMessage: last.content
  };
}
function mineLocal(cutoff) {
  const out = [];
  const deadline2 = Date.now() + HARD_TIMEOUT_MS;
  const base = PROJECTS_DIR();
  if (!existsSync12(base))
    return out;
  let projDirs;
  try {
    projDirs = readdirSync3(base);
  } catch {
    return out;
  }
  for (const d of projDirs) {
    if (Date.now() > deadline2)
      break;
    let files;
    try {
      files = readdirSync3(join22(base, d));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl"))
        continue;
      if (Date.now() > deadline2)
        break;
      const s = loadLocalSession(join22(base, d, f), cutoff);
      if (s)
        out.push(s);
    }
  }
  return out;
}
function pickSignal(sessions) {
  if (sessions.length === 0)
    return { kind: "quiet", description: "nothing in window" };
  const sorted = [...sessions].sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime());
  const projCount = /* @__PURE__ */ new Map();
  for (const s of sorted) {
    const arr = projCount.get(s.project) ?? [];
    arr.push(s);
    projCount.set(s.project, arr);
  }
  const topProj = [...projCount.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const recallHits = sorted.filter((s) => s.firstMessage && RECALL_RE.test(s.firstMessage.slice(0, 800)));
  if (recallHits.length >= RECALL_MIN_HITS) {
    const distinctDays = new Set(recallHits.map((s) => s.firstTs.toISOString().slice(0, 10))).size;
    const oneDay = distinctDays < 3 ? recallHits[0].firstTs.toISOString().slice(0, 10) : void 0;
    return {
      kind: "recall",
      description: oneDay ? `on ${oneDay} you spent the day trying to build your own todo/continuity layer on ${recallHits[0].project} \u2014 it didn't quite land` : `${recallHits.length} of your sessions on ${recallHits[0].project} opened with you asking the agent to recall what you were doing`,
      project: recallHits[0].project,
      date: oneDay,
      count: recallHits.length
    };
  }
  const abandoned = sorted.filter((s) => s.lastMessage && ABANDON_RE.test(s.lastMessage));
  if (abandoned.length >= ABANDONED_MIN_HITS) {
    const a = abandoned[0];
    const oneLine = cleanSnippet(a.lastMessage ?? "", 130);
    if (oneLine.length >= 8) {
      return {
        kind: "abandoned",
        description: `your last session on ${a.project} ended with "${oneLine}" and no later session picked it up`,
        project: a.project,
        date: a.lastTs.toISOString().slice(0, 10),
        count: abandoned.length
      };
    }
  }
  if (topProj && topProj[1].length / sorted.length >= 0.5) {
    const pct = Math.round(topProj[1].length / sorted.length * 100);
    return {
      kind: "volume",
      description: `${pct}% of your sessions have been on ${topProj[0]}`,
      project: topProj[0],
      count: topProj[1].length
    };
  }
  return { kind: "quiet", description: `nothing worth flagging across ${sorted.length} sessions` };
}
function renderBrief(sessions, signal, authed) {
  if (sessions.length === 0 || signal.kind === "quiet")
    return null;
  return authed ? "I found context from your recent sessions \u2014 from now on I'll keep it, so your next session picks up where you left off." : "I found context from your recent sessions. Sign in to save it, so future sessions start with what you've already learned.";
}
async function pickColdStartBrief(creds) {
  try {
    const authed = !!creds?.token;
    const hadState = hasState();
    if (authed) {
      if (hadState)
        return null;
    } else {
      const last = lastBriefMs();
      if (last !== null && Date.now() - last < RENUDGE_MS)
        return null;
    }
    const cutoff = new Date(Date.now() - WINDOW_DAYS_CAP * 864e5);
    const sessions = mineLocal(cutoff);
    const signal = pickSignal(sessions);
    const brief = renderBrief(sessions, signal, authed);
    if (!brief) {
      log10(`silent (signal=${signal.kind}, sessions=${sessions.length})`);
      return null;
    }
    writeState2(sessions.length, !hadState);
    log10(`fired (authed=${authed}, first=${!hadState}, signal=${signal.kind})`);
    return { brief, firstRun: !hadState };
  } catch (e) {
    log10(`unexpected error: ${e.message}`);
    return null;
  }
}

// dist/src/utils/project-name.js
import { basename } from "node:path";
function projectNameFromCwd(cwd) {
  return basename(cwd ?? "") || "unknown";
}

// dist/src/hooks/summary-state.js
import { readFileSync as readFileSync16, writeFileSync as writeFileSync13, writeSync, mkdirSync as mkdirSync13, existsSync as existsSync13, unlinkSync as unlinkSync7, openSync as openSync5, closeSync as closeSync5, statSync as statSync6 } from "node:fs";
import { homedir as homedir15 } from "node:os";
import { join as join23 } from "node:path";
var STATE_DIR = join23(homedir15(), ".claude", "hooks", "summary-state");
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
function statePath2(sessionId) {
  return join23(STATE_DIR, `${sessionId}.json`);
}
function endedMarkerPath(sessionId) {
  return join23(STATE_DIR, `${sessionId}.ended`);
}
function ownerPath(sessionId) {
  return join23(STATE_DIR, `${sessionId}.owner`);
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
function readOwner(sessionId) {
  try {
    return JSON.parse(readFileSync16(ownerPath(sessionId), "utf-8"));
  } catch {
    return null;
  }
}
function ownerLiveness(sessionId) {
  const owner = readOwner(sessionId);
  if (!owner)
    return "unknown";
  const st = procInfo(owner.pid);
  if (!st)
    return "dead";
  if (st.comm !== owner.comm)
    return "dead";
  if (owner.starttime && st.starttime && owner.starttime !== st.starttime)
    return "dead";
  return "alive";
}
function activeWindowMs() {
  const v = Number(process.env.HIVEMIND_ACTIVE_SESSION_WINDOW_MS ?? "");
  return Number.isFinite(v) && v > 0 ? v : 10 * 60 * 1e3;
}
function isSessionLive(sessionId, withinMs = activeWindowMs()) {
  if (existsSync13(endedMarkerPath(sessionId)))
    return false;
  const owner = ownerLiveness(sessionId);
  if (owner === "alive")
    return true;
  if (owner === "dead")
    return false;
  try {
    const mtimeMs = statSync6(statePath2(sessionId)).mtimeMs;
    return Date.now() - mtimeMs < withinMs;
  } catch {
    return false;
  }
}

// dist/src/notifications/sources/resume-brief.js
var log11 = (m) => log("notifications-resume-brief", m);
var MAX_LINE_CHARS = 120;
var LOOKBACK = 5;
var MAX_BRIEF_SESSIONS = 2;
var SCAN_LIMIT = 20;
var QUERY_TIMEOUT_MS = 4e3;
function withTimeout2(p, ms, fallback) {
  return new Promise((resolve5) => {
    const t = setTimeout(() => resolve5(fallback), ms);
    if (typeof t.unref === "function")
      t.unref();
    p.then((v) => {
      clearTimeout(t);
      resolve5(v);
    }, () => {
      clearTimeout(t);
      resolve5(fallback);
    });
  });
}
function sections(summary) {
  const map = /* @__PURE__ */ new Map();
  let cur = null;
  let buf = [];
  for (const raw of summary.split(/\r?\n/)) {
    const h = raw.match(/^##\s+(.*?)\s*$/);
    if (h) {
      if (cur)
        map.set(cur.toLowerCase(), buf.join("\n").trim());
      cur = h[1];
      buf = [];
    } else if (cur !== null) {
      buf.push(raw);
    }
  }
  if (cur)
    map.set(cur.toLowerCase(), buf.join("\n").trim());
  return map;
}
var EMPTY_SECTION = /^(?:(?:none|n\/?a|n\.a\.|nothing(?: pending)?)(?:\s*(?:[—–\-.,;:].*)?)?|tbd|—|–|-)$/i;
function extractNextSteps(summary) {
  const s = sections(summary);
  const body = s.has("next steps") ? s.get("next steps") ?? "" : s.get("open questions / todo") || s.get("open questions") || "";
  if (!body)
    return "";
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^[\s>]*[-*]?\s*/, "").replace(/^#+\s*/, "").replace(/[`*_]/g, "").trim();
    if (!line)
      continue;
    if (EMPTY_SECTION.test(line))
      return "";
    return truncate2(line);
  }
  return "";
}
function isPlaceholderSummary(summary) {
  return !/^##\s+/m.test(summary);
}
function sessionIdFromSummaryPath(path) {
  const base = path.split("/").pop() ?? "";
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}
function excludeActiveSessions(rows, currentSessionId, isLive = isSessionLive) {
  return rows.filter((row) => {
    const path = typeof row.path === "string" ? row.path : "";
    if (!path)
      return true;
    const sid = sessionIdFromSummaryPath(path);
    if (!sid)
      return true;
    if (currentSessionId && sid === currentSessionId)
      return false;
    return !isLive(sid);
  });
}
function selectRealSummaries(rows, lookback = LOOKBACK) {
  const seenPath = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of rows) {
    const path = typeof row.path === "string" ? row.path : "";
    if (path && seenPath.has(path))
      continue;
    if (path)
      seenPath.add(path);
    const summary = typeof row.summary === "string" ? row.summary : "";
    if (isPlaceholderSummary(summary))
      continue;
    out.push({
      summary,
      date: typeof row.last_update_date === "string" ? row.last_update_date : void 0,
      sid: sessionIdFromSummaryPath(path)
    });
    if (out.length >= lookback)
      break;
  }
  return out;
}
function sessionBlock(next, sid, date) {
  const age = relativeAge(date);
  const meta = [sid ? `/resume ${sid}` : "", age].filter(Boolean).join(" \xB7 ");
  return `   \u2022 ${next}
` + (meta ? `     \u21B3 ${meta}
` : "");
}
function truncate2(s, max = MAX_LINE_CHARS) {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max)
    return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max / 2 ? slice.slice(0, lastSpace) : slice;
  return cut.trimEnd() + "\u2026";
}
function relativeAge(iso) {
  if (!iso)
    return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime()))
    return "";
  const days = Math.floor((Date.now() - then.getTime()) / 864e5);
  if (days <= 0)
    return "earlier today";
  if (days === 1)
    return "yesterday";
  if (days < 7)
    return `${days} days ago`;
  if (days < 14)
    return "last week";
  return `${Math.floor(days / 7)} weeks ago`;
}
async function pickResumeBrief(creds, currentSessionId) {
  if (!creds?.token || !creds.userName || !creds.orgId)
    return null;
  const project = projectNameFromCwd(process.cwd());
  if (!project)
    return null;
  try {
    const cfg = loadConfig();
    let table;
    try {
      table = sqlIdent(cfg?.tableName ?? "memory");
    } catch (e) {
      log11(`invalid table identifier "${cfg?.tableName}": ${e.message}`);
      return null;
    }
    const api = new DeeplakeApi(creds.token, creds.apiUrl ?? "https://api.deeplake.ai", creds.orgId, creds.workspaceId ?? "default", table);
    const rawRows = await withTimeout2(api.query(`SELECT summary, path, last_update_date FROM "${table}" WHERE project = '${sqlStr(project)}' AND author = '${sqlStr(creds.userName)}' AND summary <> '' AND description <> 'in progress' ORDER BY last_update_date DESC LIMIT ${SCAN_LIMIT}`), QUERY_TIMEOUT_MS, null);
    if (!rawRows || rawRows.length === 0) {
      log11(`silent (no prior summary for project=${project})`);
      return null;
    }
    const rows = excludeActiveSessions(rawRows, currentSessionId);
    const reals = selectRealSummaries(rows);
    if (reals.length === 0) {
      log11(`silent (only placeholders for project=${project})`);
      return null;
    }
    const blocks = [];
    for (const r of reals) {
      const next = extractNextSteps(r.summary);
      if (next.length >= 4) {
        blocks.push(sessionBlock(next, r.sid, r.date));
        if (blocks.length >= MAX_BRIEF_SESSIONS)
          break;
      }
    }
    if (blocks.length > 0) {
      log11(`fired (project=${project}, ${blocks.length} session(s) with open work)`);
      return {
        brief: `\u{1F4CC} Picking up on ${project} \u2014 where you left off:
` + blocks.join("")
      };
    }
    log11(`silent (project=${project}, no open work in last ${LOOKBACK})`);
    return null;
  } catch (e) {
    log11(`pickResumeBrief: ${e.message}`);
    return null;
  }
}

// dist/src/notifications/usage-tracker.js
import { appendFileSync as appendFileSync2, existsSync as existsSync14, mkdirSync as mkdirSync14, readFileSync as readFileSync17, readdirSync as readdirSync4 } from "node:fs";
import { dirname as dirname10, join as join24 } from "node:path";
import { homedir as homedir16 } from "node:os";
var log12 = (msg) => log("usage-tracker", msg);
function statsFilePath() {
  return join24(homedir16(), ".deeplake", "usage-stats.jsonl");
}
function readUsageRecords() {
  try {
    if (!existsSync14(statsFilePath()))
      return [];
    const raw = readFileSync17(statsFilePath(), "utf-8");
    const out = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed)
        continue;
      try {
        const rec = JSON.parse(trimmed);
        if (typeof rec.endedAt === "string" && typeof rec.sessionId === "string") {
          out.push({
            endedAt: rec.endedAt,
            sessionId: rec.sessionId,
            memorySearchBytes: typeof rec.memorySearchBytes === "number" ? rec.memorySearchBytes : 0,
            memorySearchCount: typeof rec.memorySearchCount === "number" ? rec.memorySearchCount : 0
          });
        }
      } catch {
      }
    }
    return out;
  } catch (e) {
    log12(`readUsageRecords failed: ${e?.message ?? String(e)}`);
    return [];
  }
}
function sumMetric(records, key) {
  let total = 0;
  for (const r of records) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v))
      total += v;
  }
  return total;
}
function countUserGeneratedSkills(userName) {
  if (!userName)
    return 0;
  const dir = join24(homedir16(), ".claude", "skills");
  if (!existsSync14(dir))
    return 0;
  const suffix = `--${userName}`;
  try {
    let count = 0;
    for (const name of readdirSync4(dir)) {
      const idx = name.lastIndexOf(suffix);
      if (idx > 0 && idx + suffix.length === name.length)
        count += 1;
    }
    return count;
  } catch (e) {
    log12(`countUserGeneratedSkills readdir failed: ${e?.message ?? String(e)}`);
    return 0;
  }
}

// dist/src/notifications/sources/primary-banner.js
var log13 = (msg) => log("notifications-primary-banner", msg);
var BYTES_PER_TOKEN = 4;
var SAVINGS_MULTIPLIER = 1.7;
var MEANINGFUL_SAVINGS_TOKENS = 1e3;
var MIN_USER_BYTES_FOR_CONTRIBUTION_LINE = 4e3;
function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0)
    return "0";
  if (n < 1e3)
    return `${Math.round(n)}`;
  if (n < 1e5)
    return `${(n / 1e3).toFixed(1)}k`;
  if (n < 1e6)
    return `${Math.round(n / 1e3)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}
function formatCount(n) {
  return Math.round(n).toLocaleString("en-US");
}
function bytesToSavedTokens(bytes) {
  const y = bytes / BYTES_PER_TOKEN;
  return (SAVINGS_MULTIPLIER - 1) * y;
}
function localSavedTokens() {
  try {
    const records = readUsageRecords();
    if (records.length === 0)
      return 0;
    const bytes = sumMetric(records, "memorySearchBytes");
    return bytesToSavedTokens(bytes);
  } catch (e) {
    log13(`localSavedTokens threw: ${e?.message ?? String(e)}`);
    return 0;
  }
}
async function pickPrimaryBanner(sessionId, creds, source) {
  if (!sessionId) {
    return null;
  }
  if (source === "resume") {
    return null;
  }
  if (!creds?.token) {
    const cold = await pickColdStartBrief(creds);
    if (!cold?.brief)
      return null;
    return {
      id: "signup-brief",
      severity: "info",
      title: "Hey \u{1F44B} I'm Hivemind",
      body: `${cold.brief}

\u2192 hivemind login`,
      dedupKey: { session: sessionId },
      userVisibleOnly: true
    };
  }
  const orgStats = await fetchOrgStats(creds ?? null);
  const tokensSaved = orgStats != null ? bytesToSavedTokens(orgStats.org.memorySearchBytes) : localSavedTokens();
  let openGoals = null;
  try {
    const cfg = loadConfig();
    if (cfg?.goalsTableName) {
      openGoals = await fetchOpenGoals(creds, cfg.goalsTableName);
    }
  } catch (e) {
    log13(`open-goals lookup failed: ${e.message}`);
  }
  let prefix = null;
  let firstRun = false;
  try {
    const cold = await pickColdStartBrief(creds);
    if (cold) {
      prefix = cold.brief;
      firstRun = cold.firstRun;
    } else {
      prefix = (await pickResumeBrief(creds, sessionId))?.brief ?? null;
    }
  } catch (e) {
    log13(`session brief threw: ${e.message}`);
  }
  if (tokensSaved > MEANINGFUL_SAVINGS_TOKENS) {
    const banner = orgStats != null ? renderOnlineSavings(sessionId, orgStats, creds.userName, openGoals, prefix) : renderOfflineSavings(sessionId, creds.userName, openGoals, prefix);
    return banner;
  }
  const welcome = renderWelcome(sessionId, creds, openGoals, firstRun, prefix);
  return welcome;
}
function composeBody(lead, brief, openGoals) {
  const parts = [lead];
  if (brief)
    parts.push(brief);
  const goals = formatOpenGoalsLine(openGoals);
  if (goals)
    parts.push(`\u{1F4CC} ${goals}`);
  return parts.map((p) => p.replace(/\n+$/, "")).join("\n\n");
}
function renderWelcome(sessionId, creds, openGoals, firstEver = false, brief = null) {
  const greeting = firstEver ? "Hey" : "Welcome back";
  const title = creds.userName ? `${greeting}, ${creds.userName}` : greeting;
  const orgPhrase = creds.orgName ? `org ${creds.orgName}` : "your organization";
  const workspace = creds.workspaceId ?? "default";
  return {
    id: "welcome",
    severity: "info",
    title,
    body: composeBody(`Connected to ${orgPhrase} (workspace ${workspace}).`, brief, openGoals),
    dedupKey: { session: sessionId },
    // User-facing only. This banner (welcome / savings / any prepended
    // cold-start or resume brief) carries mined and summary-derived prose,
    // which must never enter the model's additionalContext — that would be
    // a prompt-injection channel (codex P1). The model gets its memory
    // instructions from the sibling session-start hook; this slot is purely
    // for the human reading their terminal.
    userVisibleOnly: true
  };
}
function renderOnlineSavings(sessionId, s, userName, openGoals, brief = null) {
  const zOrg = bytesToSavedTokens(s.org.memorySearchBytes);
  const zUser = bytesToSavedTokens(s.user.memorySearchBytes);
  const title = `Hivemind has saved your team ~${formatTokens(zOrg)} tokens`;
  const segments = [
    `${formatCount(s.org.memoryRecallCount)} memory ${s.org.memoryRecallCount === 1 ? "recall" : "recalls"}`,
    `across ${formatCount(s.org.sessionsCount)} ${s.org.sessionsCount === 1 ? "session" : "sessions"}`
  ];
  if (s.user.memorySearchBytes >= MIN_USER_BYTES_FOR_CONTRIBUTION_LINE) {
    segments.push(`you contributed ~${formatTokens(zUser)}`);
  }
  const skillsGenerated = countUserGeneratedSkills(userName);
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = composeBody(`   ${segments.join(" \xB7 ")}`, brief, openGoals);
  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
    // User-facing only — see the welcome renderer's note. A resume/cold-start
    // brief rides in this body, so it must not reach the model's
    // additionalContext.
    userVisibleOnly: true
  };
}
function renderOfflineSavings(sessionId, userName, openGoals, brief = null) {
  const records = readUsageRecords();
  const memorySearchBytes = sumMetric(records, "memorySearchBytes");
  const zTokens = bytesToSavedTokens(memorySearchBytes);
  const sessionCount = records.length;
  const memorySearches = sumMetric(records, "memorySearchCount");
  const skillsGenerated = countUserGeneratedSkills(userName);
  const title = `Hivemind has saved you ~${formatTokens(zTokens)} tokens`;
  const segments = [
    `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`,
    `${memorySearches} memory ${memorySearches === 1 ? "search" : "searches"}`
  ];
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = composeBody(`   ${segments.join(" \xB7 ")}`, brief, openGoals);
  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
    // User-facing only — see the welcome renderer's note. A resume/cold-start
    // brief rides in this body, so it must not reach the model's
    // additionalContext.
    userVisibleOnly: true
  };
}

// dist/src/notifications/sources/balance.js
var log14 = (msg) => log("notifications-balance", msg);
var FETCH_TIMEOUT_MS3 = 1500;
var DEFAULT_API_URL4 = "https://api.deeplake.ai";
var PROBE_SQL = "SELECT 1";
var BALANCE_HEADER2 = "X-Activeloop-Balance-Cents";
function parseBalanceHeader2(headers) {
  const raw = headers?.get?.(BALANCE_HEADER2);
  if (!raw || !/^-?\d+$/.test(raw.trim()))
    return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}
async function fetchBalanceCents(creds) {
  if (!creds?.token)
    return null;
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL4;
  const workspaceId = creds.workspaceId ?? "default";
  const url = `${apiUrl}/workspaces/${encodeURIComponent(workspaceId)}/tables/query`;
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS3);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
        ...creds.orgId ? { "X-Activeloop-Org-Id": creds.orgId } : {}
      },
      body: JSON.stringify({ query: PROBE_SQL }),
      signal: ctrl.signal
    });
    const cents = parseBalanceHeader2(resp.headers);
    log14(`balance read from ${url}: ${cents === null ? "unknown" : `${cents}c`} (status ${resp.status})`);
    return cents;
  } catch (e) {
    log14(`balance read failed: ${e?.message ?? String(e)}`);
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// dist/src/notifications/sources/low-balance.js
var log15 = (msg) => log("notifications-low-balance", msg);
var LOW_BALANCE_THRESHOLD_CENTS = 200;
function billingUrl2(creds) {
  if (creds.orgId && creds.workspaceId) {
    return `https://deeplake.ai/${encodeURIComponent(creds.orgId)}/workspace/${encodeURIComponent(creds.workspaceId)}/billing`;
  }
  return "https://deeplake.ai";
}
async function pickLowBalanceNotice(creds) {
  if (!creds?.token)
    return null;
  const balanceCents = await fetchBalanceCents(creds);
  if (balanceCents === null) {
    log15("balance unknown \u2014 no notice");
    return null;
  }
  if (balanceCents <= 0) {
    log15(`balance exhausted (${balanceCents}c) \u2014 emitting live notice`);
    return {
      id: "balance-exhausted",
      severity: "warn",
      transient: true,
      title: "Hivemind credits exhausted \u2014 top up to keep capturing",
      body: `Sessions are not being saved and memory recall is returning empty. Top up at ${billingUrl2(creds)} to restore capture and recall.`,
      dedupKey: { reason: "balance-zero" },
      userVisibleOnly: true
    };
  }
  if (balanceCents >= LOW_BALANCE_THRESHOLD_CENTS)
    return null;
  log15(`balance low (${balanceCents}c) \u2014 emitting notice`);
  return {
    id: "balance-low",
    severity: "warn",
    // Self-clearing: the balance read IS the rate limit. Once topped up, no
    // fresh notice is produced, so recording it in state.shown would only
    // block a later, genuine re-warning.
    transient: true,
    title: "Hivemind balance low \u2014 top up to avoid interruption",
    body: `Only $${(balanceCents / 100).toFixed(2)} of prepaid credit left. Top up at ${billingUrl2(creds)} before capture and memory recall start failing.`,
    dedupKey: { balanceCents },
    // Billing copy is for the human, not the model's context.
    userVisibleOnly: true
  };
}

// dist/src/notifications/index.js
var log16 = (msg) => log("notifications", msg);
var SEVERITY_RANK = { error: 0, warn: 1, info: 2 };
function sortBySeverity(items) {
  return [...items].sort((a, b) => (SEVERITY_RANK[a.severity ?? "info"] ?? 2) - (SEVERITY_RANK[b.severity ?? "info"] ?? 2));
}
async function drainSessionStart(opts) {
  try {
    const state = readState();
    const queue = readQueue();
    const ctx = {
      agent: opts.agent,
      creds: opts.creds,
      state,
      localSkillsCount: opts.localSkillsCount ?? null,
      latestInsightEntry: opts.latestInsightEntry ?? null,
      sessionCount: opts.sessionCount
    };
    const fromRules = evaluateRules("session_start", ctx);
    const fromQueue = queue.queue;
    const [fromBackend, primary, lowBalance] = await Promise.all([
      fetchBackendNotifications(opts.creds),
      pickPrimaryBanner(opts.sessionId, opts.creds, opts.source),
      pickLowBalanceNotice(opts.creds)
    ]);
    const fromPrimary = primary != null ? [primary] : [];
    const fromLowBalance = lowBalance != null ? [lowBalance] : [];
    const liveIds = new Set(fromLowBalance.map((n) => n.id));
    const currentOrgId = opts.creds?.orgId ?? null;
    const queueMinusLive = fromQueue.filter((n) => {
      if (liveIds.has(n.id))
        return false;
      const notifOrgId = n.dedupKey?.orgId;
      if (notifOrgId != null && notifOrgId !== currentOrgId)
        return false;
      return true;
    });
    if (queueMinusLive.length !== fromQueue.length) {
      log16(`dropped ${fromQueue.length - queueMinusLive.length} queued notice(s): superseded by the live read or belonging to another org`);
    }
    const all = sortBySeverity([
      ...fromPrimary,
      ...fromLowBalance,
      ...fromRules,
      ...queueMinusLive,
      ...fromBackend
    ]);
    const fresh = all.filter((n) => !alreadyShown(state, n));
    if (fresh.length === 0) {
      if (queue.queue.length > 0)
        writeQueue({ queue: [] });
      return;
    }
    const claimed = fresh.filter((n) => tryClaim(n));
    if (claimed.length === 0) {
      if (queue.queue.length > 0)
        writeQueue({ queue: [] });
      log16(`all ${fresh.length} notification(s) claimed by another process`);
      return;
    }
    if (opts.deliver)
      opts.deliver(claimed);
    else
      emit(opts.agent, claimed);
    let nextState = state;
    for (const n of claimed) {
      if (n.transient)
        releaseClaim(n);
      else
        nextState = markShown(nextState, n);
    }
    writeState(nextState);
    if (queue.queue.length > 0)
      writeQueue({ queue: [] });
    log16(`delivered ${claimed.length} notification(s) to ${opts.agent}`);
  } catch (e) {
    log16(`drainSessionStart failed: ${e?.message ?? String(e)}`);
  }
}

// dist/src/notifications/rules/referral-invite.js
var MIN_SESSIONS = 3;
var referralInviteRule = {
  id: "referral-invite",
  trigger: "session_start",
  evaluate({ creds, sessionCount }) {
    if (!creds?.token)
      return null;
    if ((sessionCount ?? 0) < MIN_SESSIONS)
      return null;
    return {
      id: "referral-invite",
      severity: "info",
      title: "\u{1F4B8} Invite a teammate \u2014 your org earns $20",
      body: "Run `hivemind invite <email> <ADMIN|WRITE|READ>` \u2014 your org gets $20 in credit when they sign up (up to $100).",
      // Stable key → shown once, ever. Bump to {v:2} to re-nudge everyone.
      dedupKey: { v: 1 }
    };
  }
};

// dist/src/hooks/codex/session-start.js
var log17 = (msg) => log("codex-session-start", msg);
var DRAIN_DEADLINE_MS = 4e3;
var HOOK_BUDGET_MS = 7e3;
function deadline(ms) {
  return new Promise((resolve5) => {
    const t = setTimeout(resolve5, ms);
    t.unref?.();
  });
}
registerRule(referralInviteRule);
var __bundleDir = dirname11(fileURLToPath2(import.meta.url));
async function main() {
  if (process.env.HIVEMIND_WIKI_WORKER === "1")
    return;
  const input = await readStdin();
  let creds = loadCredentials();
  if (!creds?.token) {
    log17("no credentials found \u2014 run auth login to authenticate");
    const auto = maybeAutoMineLocal();
    log17(`auto-mine: ${auto.triggered ? "triggered (background)" : `skipped (${auto.reason})`}`);
  } else {
    log17(`credentials loaded: org=${creds.orgName ?? creds.orgId}`);
    creds = await healDriftedOrgToken(creds, log17);
  }
  {
    const setupScript = join25(__bundleDir, "session-start-setup.js");
    const child = spawn4("node", [setupScript], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      // SW_HIDE: libuv applies it alongside detached. No-op on POSIX.
      windowsHide: true,
      env: { ...process.env }
    });
    child.stdin?.write(JSON.stringify(input));
    child.stdin?.end();
    child.unref();
    log17("spawned async setup process");
  }
  const rawSessionId = typeof input.session_id === "string" ? input.session_id.trim() : "";
  const sessionId = rawSessionId.length > 0 ? rawSessionId : void 0;
  const sessionCount = bumpSessionCount(sessionId);
  let notified = [];
  let emitted = false;
  const drained = drainSessionStart({
    agent: "codex",
    creds,
    sessionId,
    source: input.source,
    sessionCount,
    deliver: (ns) => {
      if (!emitted) {
        notified = ns;
        return;
      }
      log17(`notifications arrived after the deadline \u2014 re-queuing ${ns.length}`);
      for (const n of ns)
        enqueueNotification(n).catch(() => void 0);
    }
  });
  const [pullResult] = await Promise.all([
    autoPullSkills(),
    Promise.race([drained, deadline(DRAIN_DEADLINE_MS)])
  ]);
  emitted = true;
  log17(`autopull: pulled=${pullResult.pulled} skipped=${pullResult.skipped}`);
  log17(`notifications: ${notified.length} claimed`);
  let versionNotice = "";
  const current = getInstalledVersion(__bundleDir, ".codex-plugin");
  if (current) {
    versionNotice = `
Hivemind v${current}`;
  }
  const localMined = countLocalManifestEntries();
  const skillNoun = localMined === 1 ? "skill" : "skills";
  if (creds?.token)
    spawnGraphPullWorker(input.cwd, __bundleDir);
  const additionalContext = creds?.token ? `Hivemind: logged in as org ${creds.orgName ?? creds.orgId} (workspace: ${creds.workspaceId ?? "default"}).${versionNotice}` : `Hivemind: not logged in. Run \`hivemind login\` to enable shared memory + skill sharing.${versionNotice}`;
  const systemMessage = !creds?.token && localMined > 0 ? `\u{1F4A1} ${localMined} ${skillNoun} mined from your local sessions live in ~/.claude/skills/. Run 'hivemind login' to share them with your team.` : void 0;
  const notifChannels = renderCodexChannels(notified);
  const mergedSystemMessage = [notifChannels.systemMessage, systemMessage].filter(Boolean).join("\n\n");
  const mergedContext = [notifChannels.additionalContext, additionalContext].filter(Boolean).join("\n\n");
  const output = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: mergedContext
    }
  };
  if (mergedSystemMessage)
    output.systemMessage = mergedSystemMessage;
  console.log(JSON.stringify(output));
}
function emitFallback() {
  const creds = loadCredentials();
  const additionalContext = creds?.token ? `Hivemind: logged in as org ${creds.orgName ?? creds.orgId} (workspace: ${creds.workspaceId ?? "default"}).` : "Hivemind: not logged in. Run `hivemind login` to enable shared memory + skill sharing.";
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext }
  }));
}
var wroteOutput = false;
var originalLog = console.log.bind(console);
console.log = (...args) => {
  wroteOutput = true;
  originalLog(...args);
};
var budget = setTimeout(() => {
  if (wroteOutput)
    return;
  log17(`hook budget of ${HOOK_BUDGET_MS}ms exceeded \u2014 emitting fallback output`);
  emitFallback();
  process.exit(0);
}, HOOK_BUDGET_MS);
budget.unref?.();
main().catch((e) => {
  log17(`fatal: ${e.message}`);
  if (!wroteOutput)
    emitFallback();
  process.exit(0);
}).finally(() => clearTimeout(budget));
