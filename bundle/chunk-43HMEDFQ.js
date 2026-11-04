// dist/src/config.js
import { readFileSync as readFileSync2, existsSync } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2, userInfo } from "node:os";

// dist/src/commands/auth-creds.js
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
function configDir() {
  return join(homedir(), ".deeplake");
}
function credsPath() {
  return join(configDir(), "credentials.json");
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
function loadCredentials(readFile = (p) => readFileSync(p, "utf-8")) {
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
  mkdirSync(configDir(), { recursive: true, mode: 448 });
  const target = credsPath();
  const tmp = `${target}.${process.pid}.${process.hrtime.bigint()}.tmp`;
  const body = JSON.stringify({ ...creds, savedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2);
  try {
    writeFileSync(tmp, body, { mode: 384 });
    renameSync(tmp, target);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
}
function deleteCredentials() {
  try {
    unlinkSync(credsPath());
    return true;
  } catch {
    return false;
  }
}

// dist/src/config.js
function loadConfig() {
  const home = homedir2();
  const credPath = join2(home, ".deeplake", "credentials.json");
  let creds = null;
  if (existsSync(credPath)) {
    try {
      creds = JSON.parse(readFileSync2(credPath, "utf-8"));
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
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join2(home, ".deeplake", "memory")
  };
}

export {
  resolveWorkspaceRef,
  loadCredentials,
  saveCredentials,
  deleteCredentials,
  loadConfig
};
