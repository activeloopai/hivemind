#!/usr/bin/env node

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
import { readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname2, join as join3, resolve } from "node:path";
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

// dist/src/hooks/summary-state.js
import { readFileSync as readFileSync3, writeFileSync, writeSync, mkdirSync as mkdirSync2, existsSync as existsSync2, unlinkSync, openSync, closeSync, statSync } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join4 } from "node:path";

// dist/src/utils/atomic-write.js
import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve as resolve2, relative, isAbsolute } from "node:path";

// dist/src/hooks/summary-state.js
var dlog = (msg) => log("summary-state", msg);
var STATE_DIR = join4(homedir3(), ".claude", "hooks", "summary-state");
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
function lockPath(sessionId) {
  return join4(STATE_DIR, `${sessionId}.lock`);
}
function tryAcquireLock(sessionId, maxAgeMs = 10 * 60 * 1e3) {
  mkdirSync2(STATE_DIR, { recursive: true });
  const p = lockPath(sessionId);
  if (existsSync2(p)) {
    try {
      const ageMs = Date.now() - parseInt(readFileSync3(p, "utf-8"), 10);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMs)
        return false;
    } catch (readErr) {
      dlog(`lock file unreadable for ${sessionId}, treating as stale: ${readErr.message}`);
    }
    try {
      unlinkSync(p);
    } catch (unlinkErr) {
      dlog(`could not unlink stale lock for ${sessionId}: ${unlinkErr.message}`);
      return false;
    }
  }
  try {
    const fd = openSync(p, "wx");
    try {
      writeSync(fd, String(Date.now()));
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (e) {
    if (e.code === "EEXIST")
      return false;
    throw e;
  }
}

// dist/src/hooks/cursor/spawn-wiki-worker.js
import { fileURLToPath } from "node:url";
import { dirname as dirname4, join as join8 } from "node:path";
import { writeFileSync as writeFileSync2, mkdirSync as mkdirSync4 } from "node:fs";
import { homedir as homedir5, tmpdir } from "node:os";

// dist/src/utils/wiki-log.js
import { mkdirSync as mkdirSync3, appendFileSync as appendFileSync2 } from "node:fs";
import { join as join5 } from "node:path";
function makeWikiLogger(hooksDir, filename = "deeplake-wiki.log") {
  const path = join5(hooksDir, filename);
  return {
    path,
    log(msg) {
      try {
        mkdirSync3(hooksDir, { recursive: true });
        appendFileSync2(path, `[${utcTimestamp()}] ${msg}
`);
      } catch {
      }
    }
  };
}

// dist/src/utils/version-check.js
import { readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname3, join as join6 } from "node:path";
function getInstalledVersion(bundleDir, pluginManifestDir) {
  try {
    const pluginJson = join6(bundleDir, "..", pluginManifestDir, "plugin.json");
    const plugin = JSON.parse(readFileSync4(pluginJson, "utf-8"));
    if (plugin.version)
      return plugin.version;
  } catch {
  }
  try {
    const stamp = readFileSync4(join6(bundleDir, "..", ".hivemind_version"), "utf-8").trim();
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
    const candidate = join6(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync4(candidate, "utf-8"));
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

// dist/src/utils/project-name.js
import { basename } from "node:path";
function projectNameFromCwd(cwd) {
  return basename(cwd ?? "") || "unknown";
}

// dist/src/utils/resolve-cli-bin.js
import { execFileSync } from "node:child_process";
import { homedir as homedir4 } from "node:os";
import { join as join7 } from "node:path";
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
  const local = join7(homedir4(), ".claude", "local", cli);
  return isWin ? `${local}.cmd` : local;
}

// dist/src/hooks/cursor/spawn-wiki-worker.js
var HOME = homedir5();
var wikiLogger = makeWikiLogger(join8(HOME, ".cursor", "hooks"));
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
function findCursorBin() {
  return resolveCliBin("cursor-agent", "cursor-agent");
}
function spawnCursorWikiWorker(opts) {
  const { config, sessionId, cwd, bundleDir, reason } = opts;
  const projectName = projectNameFromCwd(cwd);
  const tmpDir = join8(tmpdir(), `deeplake-wiki-${sessionId}-${Date.now()}`);
  mkdirSync4(tmpDir, { recursive: true });
  const pluginVersion = getInstalledVersion(bundleDir, ".claude-plugin") ?? "";
  const configFile = join8(tmpDir, "config.json");
  writeFileSync2(configFile, JSON.stringify({
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
    pluginVersion,
    tmpDir,
    cursorBin: findCursorBin(),
    cursorModel: process.env.HIVEMIND_CURSOR_MODEL ?? "auto",
    wikiLog: WIKI_LOG,
    hooksDir: join8(HOME, ".cursor", "hooks"),
    promptTemplate: WIKI_PROMPT_TEMPLATE
  }));
  wikiLog(`${reason}: spawning summary worker for ${sessionId}`);
  const workerPath = join8(bundleDir, "wiki-worker.js");
  spawnDetachedNodeWorker(workerPath, [configFile]);
  wikiLog(`${reason}: spawned summary worker for ${sessionId}`);
}
function bundleDirFromImportMeta(importMetaUrl) {
  return dirname4(fileURLToPath(importMetaUrl));
}

// dist/src/skillify/spawn-skillify-worker.js
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname5, join as join10 } from "node:path";
import { writeFileSync as writeFileSync3, mkdirSync as mkdirSync5, appendFileSync as appendFileSync3, chmodSync } from "node:fs";
import { homedir as homedir7, tmpdir as tmpdir2 } from "node:os";

// dist/src/skillify/gate-runner.js
import { existsSync as existsSync3 } from "node:fs";
import { createRequire } from "node:module";
import { homedir as homedir6 } from "node:os";
import { join as join9 } from "node:path";
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
        join9(home, ".claude", "local", "claude"),
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        join9(home, ".npm-global", "bin", "claude"),
        join9(home, ".local", "bin", "claude"),
        "/opt/homebrew/bin/claude"
      ]) ?? join9(home, ".claude", "local", "claude");
    case "codex":
      return firstExistingPath([
        "/usr/local/bin/codex",
        "/usr/bin/codex",
        join9(home, ".npm-global", "bin", "codex"),
        join9(home, ".local", "bin", "codex"),
        "/opt/homebrew/bin/codex"
      ]) ?? "/usr/local/bin/codex";
    case "cursor":
      return firstExistingPath([
        "/usr/local/bin/cursor-agent",
        "/usr/bin/cursor-agent",
        join9(home, ".npm-global", "bin", "cursor-agent"),
        join9(home, ".local", "bin", "cursor-agent"),
        "/opt/homebrew/bin/cursor-agent"
      ]) ?? "/usr/local/bin/cursor-agent";
    case "hermes":
      return firstExistingPath([
        join9(home, ".local", "bin", "hermes"),
        "/usr/local/bin/hermes",
        "/usr/bin/hermes",
        join9(home, ".npm-global", "bin", "hermes"),
        "/opt/homebrew/bin/hermes"
      ]) ?? join9(home, ".local", "bin", "hermes");
    case "pi":
      return firstExistingPath([
        join9(home, ".local", "bin", "pi"),
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        join9(home, ".npm-global", "bin", "pi"),
        "/opt/homebrew/bin/pi"
      ]) ?? join9(home, ".local", "bin", "pi");
  }
}

// dist/src/skillify/spawn-skillify-worker.js
var HOME2 = homedir7();
var SKILLIFY_LOG = join10(HOME2, ".claude", "hooks", "skillify.log");
function skillifyLog(msg) {
  try {
    mkdirSync5(dirname5(SKILLIFY_LOG), { recursive: true });
    appendFileSync3(SKILLIFY_LOG, `[${utcTimestamp()}] ${msg}
`);
  } catch {
  }
}
function spawnSkillifyWorker(opts) {
  const { config, cwd, projectKey, project, bundleDir, agent, scopeConfig, currentSessionId, reason } = opts;
  const tmpDir = join10(tmpdir2(), `deeplake-skillify-${projectKey}-${Date.now()}`);
  mkdirSync5(tmpDir, { recursive: true, mode: 448 });
  const gateBin = findAgentBin(agent);
  const configFile = join10(tmpDir, "config.json");
  writeFileSync3(configFile, JSON.stringify({
    apiUrl: config.apiUrl,
    token: config.token,
    orgId: config.orgId,
    workspaceId: config.workspaceId,
    sessionsTable: config.sessionsTableName,
    skillsTable: config.skillsTableName,
    userName: config.userName,
    cwd,
    projectKey,
    project,
    agent,
    scope: scopeConfig.scope,
    team: scopeConfig.team,
    install: scopeConfig.install,
    tmpDir,
    gateBin,
    cursorModel: process.env.HIVEMIND_CURSOR_MODEL,
    hermesProvider: process.env.HIVEMIND_HERMES_PROVIDER,
    hermesModel: process.env.HIVEMIND_HERMES_MODEL,
    piProvider: process.env.HIVEMIND_PI_PROVIDER,
    piModel: process.env.HIVEMIND_PI_MODEL,
    skillifyLog: SKILLIFY_LOG,
    currentSessionId
  }), { mode: 384 });
  try {
    chmodSync(configFile, 384);
  } catch {
  }
  skillifyLog(`${reason}: spawning skillify worker for project=${project} key=${projectKey}`);
  const workerPath = join10(bundleDir, "skillify-worker.js");
  spawnDetachedNodeWorker(workerPath, [configFile]);
  skillifyLog(`${reason}: spawned skillify worker for ${projectKey}`);
}

// dist/src/skillify/state.js
import { readFileSync as readFileSync5, writeFileSync as writeFileSync4, writeSync as writeSync2, mkdirSync as mkdirSync6, renameSync as renameSync2, rmdirSync, existsSync as existsSync5, lstatSync, unlinkSync as unlinkSync2, openSync as openSync2, closeSync as closeSync2 } from "node:fs";
import { join as join13 } from "node:path";

// dist/src/utils/repo-identity.js
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename as basename2, resolve as resolve3 } from "node:path";
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
  const absCwd = resolve3(cwd);
  const project = basename2(absCwd) || "unknown";
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

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync4, renameSync } from "node:fs";
import { dirname as dirname6, join as join12 } from "node:path";

// dist/src/skillify/state-dir.js
import { homedir as homedir8 } from "node:os";
import { join as join11 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join11(homedir8(), ".deeplake", "state", "skillify");
}

// dist/src/skillify/legacy-migration.js
var dlog2 = (msg) => log("skillify-migrate", msg);
var attempted = false;
function migrateLegacyStateDir() {
  if (process.env.HIVEMIND_STATE_DIR?.trim())
    return;
  if (attempted)
    return;
  attempted = true;
  const current = getStateDir();
  const legacy = join12(dirname6(current), "skilify");
  if (!existsSync4(legacy))
    return;
  if (existsSync4(current))
    return;
  try {
    renameSync(legacy, current);
    dlog2(`migrated ${legacy} -> ${current}`);
  } catch (err) {
    const code = err.code;
    if (code === "EXDEV" || code === "EPERM" || code === "ENOENT" || code === "EEXIST" || code === "ENOTEMPTY") {
      dlog2(`migration skipped (${code}); legacy dir left as-is or another process handled it`);
      return;
    }
    throw err;
  }
}

// dist/src/skillify/state.js
var dlog3 = (msg) => log("skillify-state", msg);
var YIELD_BUF2 = new Int32Array(new SharedArrayBuffer(4));
var TRIGGER_THRESHOLD = (() => {
  const n = Number(process.env.HIVEMIND_SKILLIFY_EVERY_N_TURNS ?? "");
  return Number.isInteger(n) && n > 0 ? n : 20;
})();
function statePath(projectKey) {
  return join13(getStateDir(), `${projectKey}.json`);
}
function lockPath2(projectKey) {
  return join13(getStateDir(), `${projectKey}.lock`);
}
function readState(projectKey) {
  migrateLegacyStateDir();
  const p = statePath(projectKey);
  if (!existsSync5(p))
    return null;
  try {
    return JSON.parse(readFileSync5(p, "utf-8"));
  } catch {
    return null;
  }
}
function writeState(projectKey, state) {
  migrateLegacyStateDir();
  mkdirSync6(getStateDir(), { recursive: true });
  const p = statePath(projectKey);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync4(tmp, JSON.stringify(state, null, 2));
  renameSync2(tmp, p);
}
function withRmwLock(projectKey, fn) {
  migrateLegacyStateDir();
  mkdirSync6(getStateDir(), { recursive: true });
  const rmw = lockPath2(projectKey) + ".rmw";
  const deadline = Date.now() + 2e3;
  let fd = null;
  while (fd === null) {
    try {
      fd = openSync2(rmw, "wx");
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      if (Date.now() > deadline) {
        dlog3(`rmw lock deadline exceeded for ${projectKey}, reclaiming stale lock`);
        try {
          unlinkSync2(rmw);
        } catch (unlinkErr) {
          dlog3(`stale rmw lock unlink failed for ${projectKey}: ${unlinkErr.message}`);
        }
        continue;
      }
      Atomics.wait(YIELD_BUF2, 0, 0, 10);
    }
  }
  try {
    return fn();
  } finally {
    closeSync2(fd);
    try {
      unlinkSync2(rmw);
    } catch (unlinkErr) {
      dlog3(`rmw lock cleanup failed for ${projectKey}: ${unlinkErr.message}`);
    }
  }
}
function resetCounter(projectKey) {
  withRmwLock(projectKey, () => {
    const s = readState(projectKey);
    if (!s)
      return;
    writeState(projectKey, { ...s, counter: 0, updatedAt: Date.now() });
  });
}
function tryAcquireWorkerLock(projectKey, maxAgeMs = 10 * 60 * 1e3) {
  migrateLegacyStateDir();
  mkdirSync6(getStateDir(), { recursive: true });
  const p = lockPath2(projectKey);
  if (existsSync5(p)) {
    try {
      const ageMs = Date.now() - parseInt(readFileSync5(p, "utf-8"), 10);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMs)
        return false;
    } catch (readErr) {
      dlog3(`worker lock unreadable for ${projectKey}, treating as stale: ${readErr.message}`);
    }
    try {
      unlinkSync2(p);
    } catch (unlinkErr) {
      if (unlinkErr?.code !== "EISDIR" && unlinkErr?.code !== "EPERM" && unlinkErr?.code !== "ENOENT") {
        dlog3(`could not unlink stale worker lock for ${projectKey}: ${unlinkErr.message}`);
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
          dlog3(`rmdir stale lock skipped for ${projectKey}: ${rmErr.message}`);
        }
      }
    }
  }
  try {
    const fd = openSync2(p, "wx");
    try {
      writeSync2(fd, String(Date.now()));
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
    unlinkSync2(p);
  } catch {
  }
}

// dist/src/skillify/scope-config.js
import { existsSync as existsSync6, mkdirSync as mkdirSync7, readFileSync as readFileSync6, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join14 } from "node:path";
function configPath() {
  return join14(getStateDir(), "config.json");
}
var DEFAULT = { scope: "me", team: [], install: "project" };
function loadScopeConfig() {
  migrateLegacyStateDir();
  const CONFIG_PATH = configPath();
  if (!existsSync6(CONFIG_PATH))
    return DEFAULT;
  try {
    const raw = JSON.parse(readFileSync6(CONFIG_PATH, "utf-8"));
    const scope = raw.scope === "team" ? "team" : raw.scope === "org" ? "team" : "me";
    const team = Array.isArray(raw.team) ? raw.team.filter((s) => typeof s === "string") : [];
    const install = raw.install === "global" ? "global" : "project";
    return { scope, team, install };
  } catch {
    return DEFAULT;
  }
}

// dist/src/skillify/triggers.js
function forceSessionEndTrigger(opts) {
  if (process.env.HIVEMIND_SKILLIFY_WORKER === "1")
    return;
  if (!opts.cwd)
    return;
  try {
    const { key: projectKey, project } = deriveProjectKey(opts.cwd);
    if (!tryAcquireWorkerLock(projectKey)) {
      skillifyLog(`SessionEnd: skillify worker already running for ${projectKey}, skipping`);
      return;
    }
    if (readState(projectKey)) {
      resetCounter(projectKey);
    }
    skillifyLog(`SessionEnd: spawning skillify worker for project=${project} agent=${opts.agent}`);
    try {
      spawnSkillifyWorker({
        config: opts.config,
        cwd: opts.cwd,
        projectKey,
        project,
        bundleDir: opts.bundleDir,
        agent: opts.agent,
        scopeConfig: loadScopeConfig(),
        currentSessionId: opts.sessionId,
        reason: "SessionEnd"
      });
    } catch (e) {
      skillifyLog(`SessionEnd spawn failed: ${e?.message ?? e}`);
      try {
        releaseWorkerLock(projectKey);
      } catch {
      }
    }
  } catch (e) {
    skillifyLog(`SessionEnd trigger error: ${e?.message ?? e}`);
  }
}

// dist/src/hooks/cursor/session-end.js
var log2 = (msg) => log("cursor-session-end", msg);
async function main() {
  if (process.env.HIVEMIND_WIKI_WORKER === "1")
    return;
  const input = await readStdin();
  const sessionId = input.conversation_id ?? input.session_id ?? "";
  log2(`session=${sessionId || "?"} reason=${input.reason ?? "?"} status=${input.final_status ?? "?"}`);
  if (!sessionId)
    return;
  const base = loadConfig();
  if (!base) {
    wikiLog(`SessionEnd: no config, skipping summary`);
    return;
  }
  const dirRes = resolveDirConfig(base, process.cwd());
  if (!dirRes.collect) {
    wikiLog(`SessionEnd: capture disabled for this directory (${dirRes.found?.path})`);
    return;
  }
  const config = dirRes.config;
  try {
    forceSessionEndTrigger({
      config,
      cwd: process.cwd(),
      bundleDir: bundleDirFromImportMeta(import.meta.url),
      agent: "cursor",
      sessionId
    });
  } catch (e) {
    wikiLog(`SessionEnd: skillify trigger failed: ${e?.message ?? e}`);
  }
  if (!tryAcquireLock(sessionId)) {
    wikiLog(`SessionEnd: periodic worker already running for ${sessionId}, skipping final`);
    return;
  }
  try {
    spawnCursorWikiWorker({
      config,
      sessionId,
      cwd: process.cwd(),
      bundleDir: bundleDirFromImportMeta(import.meta.url),
      reason: "SessionEnd"
    });
  } catch (e) {
    wikiLog(`SessionEnd: wiki spawn failed: ${e?.message ?? e}`);
  }
}
main().catch((e) => {
  log2(`fatal: ${e.message}`);
  process.exit(0);
});
