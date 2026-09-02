#!/usr/bin/env node
import {
  appendHistoryEntry,
  buildSnapshot,
  computeSnapshotSha256,
  countHistoryEntries,
  deriveProjectKey,
  readHistoryTail,
  readLastBuild,
  repoDir,
  writeLastBuild,
  writeSnapshot
} from "./chunk-6KPB5S3H.js";

// dist/src/commands/graph.js
import { execSync } from "node:child_process";

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

// dist/src/docs/onboarding.js
import { createInterface } from "node:readline";

// dist/src/docs/auto-registry.js
import { mkdirSync, readFileSync as readFileSync2, renameSync, writeFileSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname, join as join2 } from "node:path";
function registryPath() {
  return process.env.HIVEMIND_DOCS_AUTO_FILE ?? join2(homedir2(), ".deeplake", "docs-auto.json");
}
function readAutoRegistry(file = registryPath()) {
  try {
    const raw = JSON.parse(readFileSync2(file, "utf-8"));
    if (!Array.isArray(raw.entries))
      return { entries: [] };
    const entries = raw.entries.filter((e) => !!e && typeof e === "object" && typeof e.orgId === "string" && typeof e.project === "string" && typeof e.path === "string" && typeof e.auto === "boolean");
    return { entries };
  } catch {
    return { entries: [] };
  }
}
function writeAutoRegistry(reg, file = registryPath()) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(reg, null, 1) + "\n");
  renameSync(tmp, file);
}
function isAutoEnabled(orgId, project, file = registryPath()) {
  return readAutoRegistry(file).entries.some((e) => e.orgId === orgId && e.project === project && e.auto);
}
function setAuto(entry, file = registryPath(), now = () => /* @__PURE__ */ new Date()) {
  const reg = readAutoRegistry(file);
  const existing = reg.entries.find((e) => e.orgId === entry.orgId && e.project === entry.project);
  const next = {
    orgId: entry.orgId,
    orgName: entry.orgName ?? existing?.orgName,
    project: entry.project,
    path: entry.path,
    auto: entry.auto,
    enabledAt: entry.auto && !existing?.auto ? now().toISOString() : existing?.enabledAt ?? now().toISOString()
  };
  reg.entries = [...reg.entries.filter((e) => !(e.orgId === entry.orgId && e.project === entry.project)), next];
  writeAutoRegistry(reg, file);
  return next;
}

// dist/src/docs/wiki-generate.js
import { readFileSync as readFileSync4, statSync } from "node:fs";
import { join as join4 } from "node:path";

// dist/src/docs/anchors.js
import { createHash } from "node:crypto";
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join3 } from "node:path";

// dist/src/docs/write.js
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

// dist/src/docs/candidates.js
import { execFileSync } from "node:child_process";

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
function selectWikiGroups(snap, opts = {}) {
  const targets = selectTargets(snap, { scope: "file", include: opts.include, exclude: opts.exclude });
  return groupFilesBySubsystem(targets.map((t) => t.file), { maxFiles: opts.maxFiles });
}

// dist/src/docs/refresh-llm.js
import { execFileSync as execFileSync3 } from "node:child_process";

// dist/src/utils/resolve-cli-bin.js
import { execFileSync as execFileSync2 } from "node:child_process";
import { homedir as homedir3 } from "node:os";
import { join as join5 } from "node:path";
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
  const local = join5(homedir3(), ".claude", "local", cli);
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
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync5, renameSync as renameSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { dirname as dirname2, join as join6 } from "node:path";
var _configPath = () => process.env.HIVEMIND_CONFIG_PATH ?? join6(homedir4(), ".deeplake", "config.json");
var _cache = null;
function readUserConfig() {
  if (_cache !== null)
    return _cache;
  const path = _configPath();
  if (!existsSync2(path)) {
    _cache = {};
    return _cache;
  }
  try {
    const raw = readFileSync5(path, "utf-8");
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
  if (!existsSync2(dir))
    mkdirSync2(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync2(tmp, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  renameSync2(tmp, path);
  _cache = merged;
  return merged;
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

// dist/src/docs/refresh-llm.js
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
function detectAvailableAgents(resolve6 = tryResolveCliBin) {
  return knownDocsAgents().filter((name) => resolve6(REGISTRY[name]({}).bin) !== null);
}

// dist/src/docs/onboarding.js
function defaultIo() {
  return {
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    say: (line) => console.log(line),
    ask: (question) => new Promise((resolve6) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve6(answer);
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

// dist/src/graph/git-hook-install.js
import { chmodSync, existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync6, unlinkSync, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname3, join as join7, resolve } from "node:path";
import { execFileSync as execFileSync4 } from "node:child_process";
var HOOK_BEGIN_MARKER = "# HIVEMIND_GRAPH_HOOK_BEGIN \u2014 managed by `hivemind graph init`";
var HOOK_END_MARKER = "# HIVEMIND_GRAPH_HOOK_END";
var SHEBANG = "#!/bin/sh";
function hookBodyLines(hivemindPath) {
  return [
    "# Async-detached so commits never wait. Threshold-gate + cache make",
    "# typical re-runs ~85ms. Logs go to ~/.hivemind/post-commit.log",
    "# mkdir is robust against first-run: $HOME/.hivemind may not exist yet,",
    "# in which case the > redirect would fail and the build would never start.",
    'mkdir -p "$HOME/.hivemind" 2>/dev/null || true',
    `nohup ${quoteForShell(hivemindPath)} graph build --trigger post-commit >> "$HOME/.hivemind/post-commit.log" 2>&1 &`
  ];
}
function quoteForShell(path) {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
function gitHooksDir(cwd) {
  const configured = tryGitConfig(cwd, "core.hooksPath");
  if (configured !== null) {
    const top = tryGitTopLevel(cwd);
    return top !== null ? resolve(top, configured) : resolve(cwd, configured);
  }
  try {
    const out = execFileSync4("git", ["rev-parse", "--git-path", "hooks"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (out === "")
      return null;
    return resolve(cwd, out);
  } catch {
    return null;
  }
}
function tryGitConfig(cwd, key) {
  try {
    const out = execFileSync4("git", ["config", "--get", key], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}
function tryGitTopLevel(cwd) {
  try {
    const out = execFileSync4("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}
function postCommitHookPath(cwd) {
  const hooksDir = gitHooksDir(cwd);
  return hooksDir === null ? null : join7(hooksDir, "post-commit");
}
function installPostCommitHook(cwd, opts = {}) {
  const path = postCommitHookPath(cwd);
  if (path === null) {
    return { kind: "foreign-hook", path: "", hint: "not in a git repo (no .git directory found)" };
  }
  const existed = existsSync3(path);
  if (existed) {
    const content = readFileSync6(path, "utf8");
    if (containsOurMarkers(content)) {
      return { kind: "already-ours", path };
    }
    if (!opts.force) {
      return {
        kind: "foreign-hook",
        path,
        hint: `existing hook at ${path} is not managed by hivemind; pass --force to overwrite, or merge our block manually (between '${HOOK_BEGIN_MARKER}' and '${HOOK_END_MARKER}')`
      };
    }
  }
  const hivemindPath = resolveHivemindPath();
  if (hivemindPath === null) {
    return {
      kind: "foreign-hook",
      path,
      hint: "hivemind binary not found on PATH. Install hivemind globally (`npm install -g @deeplake/hivemind`) before running `hivemind graph init`, so the hook can find a stable absolute path to call."
    };
  }
  mkdirSync3(dirname3(path), { recursive: true });
  writeFileSync3(path, buildHookFile(hivemindPath), { mode: 493 });
  try {
    chmodSync(path, 493);
  } catch {
  }
  return { kind: "installed", path, wasNew: !existed };
}
function resolveHivemindPath() {
  try {
    const out = execFileSync4("which", ["hivemind"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (out !== "" && out.includes("hivemind"))
      return out.split("\n")[0].trim();
  } catch {
  }
  return null;
}
function uninstallPostCommitHook(cwd) {
  const path = postCommitHookPath(cwd);
  if (path === null) {
    return { kind: "no-hook", path: "" };
  }
  if (!existsSync3(path)) {
    return { kind: "no-hook", path };
  }
  const content = readFileSync6(path, "utf8");
  if (!containsOurMarkers(content)) {
    return {
      kind: "not-ours",
      path,
      hint: `existing hook at ${path} is not managed by hivemind; remove it manually if you want it gone`
    };
  }
  const stripped = stripOurBlock(content);
  const meaningful = stripped.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#!"));
  if (meaningful.length === 0) {
    unlinkSync(path);
    return { kind: "removed", path, wholeFileDeleted: true };
  }
  writeFileSync3(path, stripped);
  return { kind: "removed", path, wholeFileDeleted: false };
}
function containsOurMarkers(content) {
  return content.includes(HOOK_BEGIN_MARKER) && content.includes(HOOK_END_MARKER);
}
function stripOurBlock(content) {
  const beginIdx = content.indexOf(HOOK_BEGIN_MARKER);
  const endIdx = content.indexOf(HOOK_END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx)
    return content;
  const blockEnd = endIdx + HOOK_END_MARKER.length;
  return content.slice(0, beginIdx) + content.slice(blockEnd);
}
function buildHookFile(hivemindPath) {
  return [
    SHEBANG,
    "",
    HOOK_BEGIN_MARKER,
    ...hookBodyLines(hivemindPath),
    HOOK_END_MARKER,
    ""
  ].join("\n");
}

// dist/src/graph/load-current.js
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync4, readFileSync as readFileSync7 } from "node:fs";
import { join as join8 } from "node:path";
function workTreeIdFor(cwd) {
  return createHash2("sha256").update(cwd).digest("hex").slice(0, 16);
}
function loadCurrentSnapshot(cwd) {
  let baseDir;
  try {
    baseDir = repoDir(deriveProjectKey(cwd).key);
  } catch {
    return null;
  }
  const last = readLastBuild(baseDir, workTreeIdFor(cwd));
  if (last === null)
    return null;
  const fileBase = last.commit_sha ?? last.snapshot_sha256;
  const snapPath = join8(baseDir, "snapshots", `${fileBase}.json`);
  if (!existsSync4(snapPath))
    return null;
  try {
    const snap = JSON.parse(readFileSync7(snapPath, "utf8"));
    if (!Array.isArray(snap.nodes) || !Array.isArray(snap.links))
      return null;
    return snap;
  } catch {
    return null;
  }
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

// dist/src/commands/graph.js
import { readFileSync as readFileSync16, readdirSync } from "node:fs";
import { join as join19, relative as relative2, resolve as resolve5, sep } from "node:path";
import { createHash as createHash6 } from "node:crypto";

// dist/src/cli/version.js
import { readFileSync as readFileSync9 } from "node:fs";
import { join as join10 } from "node:path";

// dist/src/cli/util.js
import { existsSync as existsSync5, mkdirSync as mkdirSync4, readFileSync as readFileSync8, writeFileSync as writeFileSync4, cpSync, symlinkSync, unlinkSync as unlinkSync2, lstatSync } from "node:fs";
import { join as join9, dirname as dirname4 } from "node:path";
import { homedir as homedir5 } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface as createInterface2 } from "node:readline";
var HOME = homedir5();
function pkgRoot() {
  let dir = fileURLToPath(new URL(".", import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync8(join9(dir, "package.json"), "utf-8"));
      if (pkg.name === "@deeplake/hivemind" || pkg.name === "hivemind")
        return dir;
    } catch {
    }
    const parent = dirname4(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return fileURLToPath(new URL("..", import.meta.url));
}
function claudeDesktopConfigDir() {
  if (process.platform === "darwin")
    return join9(HOME, "Library", "Application Support", "Claude");
  if (process.platform === "win32")
    return join9(process.env.APPDATA ?? join9(HOME, "AppData", "Roaming"), "Claude");
  return join9(HOME, ".config", "Claude");
}
var PLATFORM_MARKERS = [
  { id: "claude", markerDir: join9(HOME, ".claude") },
  { id: "codex", markerDir: join9(HOME, ".codex") },
  { id: "claw", markerDir: join9(HOME, ".openclaw") },
  { id: "cursor", markerDir: join9(HOME, ".cursor") },
  { id: "hermes", markerDir: join9(HOME, ".hermes") },
  // pi (badlogic/pi-mono coding-agent) — config at ~/.pi/agent/. pi exposes
  // a rich extension event API (session_start / input / tool_call /
  // tool_result / message_end / session_shutdown / etc.) — Tier 1 capable.
  { id: "pi", markerDir: join9(HOME, ".pi") },
  // claude_cowork — Anthropic's agentic desktop assistant, hosted in the
  // Claude Desktop app. Registers the shared hivemind MCP server into
  // claude_desktop_config.json (recall-only; capture is the desktop app's
  // own concern). Marker is the OS-specific Claude Desktop config dir.
  { id: "claude_cowork", markerDir: claudeDesktopConfigDir() }
];

// dist/src/cli/version.js
function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync9(join10(pkgRoot(), "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// dist/src/graph/cache.js
import { createHash as createHash3 } from "node:crypto";
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readFileSync as readFileSync10, renameSync as renameSync3, writeFileSync as writeFileSync5 } from "node:fs";
import { dirname as dirname5, join as join11 } from "node:path";
var CACHE_SCHEMA_VERSION = 1;
function fileContentHash(contents) {
  return createHash3("sha256").update(contents).digest("hex");
}
function cacheDir(baseDir) {
  return join11(baseDir, ".cache");
}
function cachePath(baseDir, contentSha256) {
  return join11(cacheDir(baseDir), `${contentSha256}.json`);
}
function readCache(baseDir, contentSha256, relativePath) {
  const path = cachePath(baseDir, contentSha256);
  if (!existsSync6(path))
    return null;
  let raw;
  try {
    raw = readFileSync10(path, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || parsed.schema !== CACHE_SCHEMA_VERSION || parsed.content_sha256 !== contentSha256) {
    return null;
  }
  const cached = parsed.extraction;
  if (cached === void 0 || typeof cached !== "object" || !Array.isArray(cached.nodes) || !Array.isArray(cached.edges) || !Array.isArray(cached.parse_errors)) {
    return null;
  }
  if (!validateItems(cached)) {
    return null;
  }
  try {
    return rewriteSourceFile(cached, relativePath);
  } catch {
    return null;
  }
}
function validateItems(ex) {
  if (typeof ex.source_file !== "string")
    return false;
  if (typeof ex.language !== "string")
    return false;
  for (const n of ex.nodes) {
    if (n === null || typeof n !== "object")
      return false;
    if (typeof n.id !== "string")
      return false;
    if (typeof n.label !== "string")
      return false;
    if (typeof n.kind !== "string")
      return false;
    if (typeof n.source_file !== "string")
      return false;
    if (typeof n.source_location !== "string")
      return false;
    if (typeof n.language !== "string")
      return false;
    if (typeof n.exported !== "boolean")
      return false;
  }
  for (const e of ex.edges) {
    if (e === null || typeof e !== "object")
      return false;
    if (typeof e.source !== "string")
      return false;
    if (typeof e.target !== "string")
      return false;
    if (typeof e.relation !== "string")
      return false;
    if (typeof e.confidence !== "string")
      return false;
    if (e.ord !== void 0 && typeof e.ord !== "number")
      return false;
  }
  for (const p of ex.parse_errors) {
    if (p === null || typeof p !== "object")
      return false;
    if (typeof p.source_file !== "string")
      return false;
    if (typeof p.message !== "string")
      return false;
    if (p.location !== void 0 && typeof p.location !== "string")
      return false;
  }
  return true;
}
function writeCache(baseDir, contentSha256, extraction) {
  const entry = {
    schema: CACHE_SCHEMA_VERSION,
    content_sha256: contentSha256,
    extraction
  };
  const path = cachePath(baseDir, contentSha256);
  try {
    mkdirSync5(dirname5(path), { recursive: true });
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync5(tmp, JSON.stringify(entry));
    renameSync3(tmp, path);
  } catch {
  }
}
function rewriteSourceFile(cached, newPath) {
  const oldPath = cached.source_file;
  if (oldPath === newPath) {
    return cached;
  }
  const swap = (id) => {
    if (id.startsWith(`${oldPath}:`))
      return `${newPath}${id.slice(oldPath.length)}`;
    if (id.startsWith(`unresolved:${oldPath}:`)) {
      return `unresolved:${newPath}${id.slice(`unresolved:${oldPath}`.length)}`;
    }
    return id;
  };
  return {
    source_file: newPath,
    language: cached.language,
    // The synthetic module node uses source_file as its `label` (see
    // makeModuleNode in the extractor). On a cache hit after a rename/copy
    // we already rewrite `id` + `source_file`, but were leaving `label`
    // pointing at the OLD path — the snapshot then disagreed with a
    // fresh (non-cached) extraction. Rewrite `label` for module nodes too.
    // CodeRabbit P1.
    nodes: cached.nodes.map((n) => ({
      ...n,
      id: swap(n.id),
      label: n.kind === "module" ? newPath : n.label,
      source_file: newPath
    })),
    edges: cached.edges.map((e) => ({ ...e, source: swap(e.source), target: swap(e.target) })),
    parse_errors: cached.parse_errors.map((p) => ({ ...p, source_file: newPath }))
  };
}

// dist/src/graph/deeplake-push.js
import { createHash as createHash4 } from "node:crypto";

// dist/src/dir-config.js
import { readFileSync as readFileSync11 } from "node:fs";
import { dirname as dirname6, join as join12, resolve as resolve2 } from "node:path";
var DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"];
function findDirConfig(startDir, stopAt) {
  let dir = resolve2(startDir);
  const boundary = stopAt ? resolve2(stopAt) : null;
  for (; ; ) {
    for (const name of DIR_CONFIG_FILENAMES) {
      const candidate = join12(dir, name);
      try {
        const raw = parseDirConfig(readFileSync11(candidate, "utf-8"));
        if (raw)
          return { path: candidate, raw };
      } catch {
      }
    }
    if (boundary && dir === boundary)
      break;
    const parent = dirname6(dir);
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
import { appendFileSync, mkdirSync as mkdirSync6 } from "node:fs";
import { dirname as dirname7, join as join13 } from "node:path";
import { homedir as homedir6 } from "node:os";
var LOG = join13(homedir6(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function log(tag, msg) {
  if (!isDebug())
    return;
  try {
    mkdirSync6(dirname7(LOG), { recursive: true });
    appendFileSync(LOG, `${(/* @__PURE__ */ new Date()).toISOString()} [${tag}] ${msg}
`);
  } catch {
  }
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
import { readFileSync as readFileSync12, writeFileSync as writeFileSync6, mkdirSync as mkdirSync7, openSync, closeSync, unlinkSync as unlinkSync3, statSync as statSync2 } from "node:fs";
import { join as join14, resolve as resolve4 } from "node:path";
import { homedir as homedir7 } from "node:os";
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
  return join14(homedir7(), ".deeplake", "notifications-queue.json");
}
function lockPath() {
  return `${queuePath()}.lock`;
}
function readQueue() {
  try {
    const raw = readFileSync12(queuePath(), "utf-8");
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
  const home = resolve4(homedir7());
  if (!_isQueuePathInsideHome(path, home)) {
    throw new Error(`notifications-queue write blocked: ${path} is outside ${home}`);
  }
  mkdirSync7(join14(home, ".deeplake"), { recursive: true, mode: 448 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync6(tmp, JSON.stringify(q, null, 2), { mode: 384 });
  renameAtomic(tmp, path);
}
async function withQueueLock(fn) {
  const path = lockPath();
  mkdirSync7(join14(homedir7(), ".deeplake"), { recursive: true, mode: 448 });
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
      closeSync(fd);
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

// dist/src/commands/auth-creds.js
import { readFileSync as readFileSync13, writeFileSync as writeFileSync7, mkdirSync as mkdirSync8, unlinkSync as unlinkSync4, renameSync as renameSync4 } from "node:fs";
import { join as join15 } from "node:path";
import { homedir as homedir8 } from "node:os";
function configDir() {
  return join15(homedir8(), ".deeplake");
}
function credsPath() {
  return join15(configDir(), "credentials.json");
}
function loadCredentials(readFile = (p) => readFileSync13(p, "utf-8")) {
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
    indexMarkerStorePromise = import("./index-marker-store-MD3A4KQP.js");
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

// dist/src/graph/deeplake-push.js
async function pushSnapshot(snapshot, worktreeId, deps = {}) {
  if (process.env.HIVEMIND_GRAPH_PUSH === "0") {
    return { kind: "skipped-disabled" };
  }
  const base = (deps.loadConfig ?? loadConfig)();
  if (base === null) {
    return { kind: "skipped-no-auth" };
  }
  const dirRes = resolveDirConfig(base, deps.cwd ?? process.cwd());
  if (!dirRes.collect) {
    return { kind: "skipped-collect-disabled" };
  }
  const config = dirRes.config;
  const commitSha = snapshot.graph.commit_sha;
  if (commitSha === null) {
    return { kind: "skipped-no-commit" };
  }
  const api = (deps.makeApi ?? defaultMakeApi)(config);
  try {
    await api.ensureCodebaseTable(config.codebaseTableName);
  } catch (err) {
    return errorOutcome("ensureCodebaseTable", err);
  }
  const snapshotSha256 = computeSnapshotSha2562(snapshot);
  const tableId = sqlIdent(config.codebaseTableName);
  const repoSlug = snapshot.graph.repo_key;
  const userId = config.userName;
  const selectSql = `SELECT snapshot_sha256 FROM "${tableId}" WHERE org_id = '${sqlStr(config.orgId)}' AND workspace_id = '${sqlStr(config.workspaceId)}' AND repo_slug = '${sqlStr(repoSlug)}' AND user_id = '${sqlStr(userId)}' AND worktree_id = '${sqlStr(worktreeId)}' AND commit_sha = '${sqlStr(commitSha)}'`;
  let existing;
  try {
    existing = await api.query(selectSql);
  } catch (err) {
    return errorOutcome("SELECT existing", err);
  }
  if (existing.length > 0) {
    const cloudSha = String(existing[0].snapshot_sha256 ?? "");
    if (cloudSha === snapshotSha256) {
      return { kind: "already-current", commitSha };
    }
    return {
      kind: "drift",
      commitSha,
      localSha256: snapshotSha256,
      cloudSha256: cloudSha
    };
  }
  const canonical = canonicalJSON(snapshot);
  const observation = snapshot.observation;
  const insertSql = `INSERT INTO "${tableId}" (org_id, workspace_id, repo_slug, user_id, worktree_id, commit_sha, parent_sha, branch, ts, pushed_by, snapshot_sha256, snapshot_jsonb, node_count, edge_count, generator, generator_version, schema_version) VALUES ('${sqlStr(config.orgId)}', '${sqlStr(config.workspaceId)}', '${sqlStr(repoSlug)}', '${sqlStr(userId)}', '${sqlStr(worktreeId)}', '${sqlStr(commitSha)}', '', '${sqlStr(observation.branch ?? "")}', '${sqlStr(observation.ts)}', '${sqlStr(userId)}', '${sqlStr(snapshotSha256)}', '${sqlStr(canonical)}', ${snapshot.nodes.length}, ${snapshot.links.length}, '${sqlStr(snapshot.graph.generator)}', '${sqlStr(observation.generator_version)}', ${snapshot.graph.schema_version})`;
  try {
    await api.query(insertSql);
  } catch (err) {
    return errorOutcome("INSERT", err);
  }
  try {
    const verify = await api.query(selectSql);
    if (verify.length > 1) {
      return { kind: "inserted-with-duplicate-race", commitSha, rowCount: verify.length };
    }
  } catch {
  }
  return { kind: "inserted", commitSha };
}
function defaultMakeApi(config) {
  return new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
}
function errorOutcome(stage, err) {
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "error", message: `${stage}: ${message}` };
}
function computeSnapshotSha2562(snapshot) {
  const stable = {
    directed: snapshot.directed,
    multigraph: snapshot.multigraph,
    graph: snapshot.graph,
    nodes: snapshot.nodes,
    links: snapshot.links
  };
  return createHash4("sha256").update(canonicalJSON(stable)).digest("hex");
}
function canonicalJSON(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = v[k];
      }
      return sorted;
    }
    return v;
  });
}

// dist/src/graph/deeplake-pull.js
import { execFileSync as execFileSync5 } from "node:child_process";
import { createHash as createHash5 } from "node:crypto";
import { existsSync as existsSync7, mkdirSync as mkdirSync9, renameSync as renameSync5, writeFileSync as writeFileSync8 } from "node:fs";
import { dirname as dirname8, join as join16 } from "node:path";
function workTreeIdFor2(cwd) {
  return createHash5("sha256").update(cwd).digest("hex").slice(0, 16);
}
async function pullSnapshot(cwd, deps = {}) {
  if (process.env.HIVEMIND_GRAPH_PULL === "0") {
    return { kind: "skipped-disabled" };
  }
  const config = (deps.loadConfig ?? (() => loadRoutedConfig(cwd)))();
  if (config === null) {
    return { kind: "skipped-no-auth" };
  }
  const head = (deps.readHead ?? defaultReadHead)(cwd);
  if (head === null) {
    return { kind: "skipped-no-head" };
  }
  const api = (deps.makeApi ?? defaultMakeApi2)(config);
  try {
    await api.ensureCodebaseTable(config.codebaseTableName);
  } catch (err) {
    return errorOutcome2("ensureCodebaseTable", err);
  }
  const tableId = sqlIdent(config.codebaseTableName);
  const { key: repoKey } = deriveProjectKey(cwd);
  const selectSql = `SELECT snapshot_jsonb, snapshot_sha256, ts, node_count, edge_count, branch, generator_version, worktree_id FROM "${tableId}" WHERE org_id = '${sqlStr(config.orgId)}' AND workspace_id = '${sqlStr(config.workspaceId)}' AND repo_slug = '${sqlStr(repoKey)}' AND user_id = '${sqlStr(config.userName)}' AND commit_sha = '${sqlStr(head)}' ORDER BY ts DESC LIMIT 1`;
  let rows;
  try {
    rows = await api.query(selectSql);
  } catch (err) {
    return errorOutcome2("SELECT cloud row", err);
  }
  if (rows.length === 0) {
    return { kind: "no-cloud-row", commitSha: head };
  }
  const row = rows[0];
  const cloudSha256 = String(row.snapshot_sha256 ?? "").trim();
  const cloudPayload = coerceSnapshotPayload(row.snapshot_jsonb);
  if (cloudPayload === null) {
    return errorOutcome2("SELECT cloud row", new Error("invalid snapshot_jsonb payload"));
  }
  let parsedSnapshot;
  try {
    parsedSnapshot = JSON.parse(cloudPayload);
  } catch (err) {
    return errorOutcome2("parse cloud snapshot", err);
  }
  if (parsedSnapshot === null || typeof parsedSnapshot !== "object") {
    return errorOutcome2("parse cloud snapshot", new Error("snapshot not an object"));
  }
  if (!Array.isArray(parsedSnapshot.nodes) || !Array.isArray(parsedSnapshot.links)) {
    return errorOutcome2("parse cloud snapshot", new Error("snapshot missing nodes/links arrays"));
  }
  if (cloudSha256 !== "") {
    const computedSha = computeSnapshotSha256(parsedSnapshot);
    if (cloudSha256 !== computedSha) {
      return errorOutcome2("SELECT cloud row", new Error(`snapshot_sha256 mismatch (expected ${cloudSha256}, got ${computedSha})`));
    }
  }
  const cloudTs = parseTs(row.ts);
  const baseDir = repoDir(repoKey);
  const worktreeId = workTreeIdFor2(cwd);
  const local = readLastBuild(baseDir, worktreeId);
  if (local !== null && local.commit_sha === head) {
    if (cloudSha256 !== "" && local.snapshot_sha256 === cloudSha256) {
      return { kind: "up-to-date", commitSha: head, snapshotSha256: cloudSha256 };
    }
    if (local.ts > cloudTs) {
      return {
        kind: "local-newer",
        commitSha: head,
        localTs: local.ts,
        cloudTs
      };
    }
  }
  const snapshotsDir = join16(baseDir, "snapshots");
  const snapshotPath = join16(snapshotsDir, `${head}.json`);
  const worktreeRoot = join16(baseDir, "worktrees", worktreeId);
  try {
    writeFileAtomic(snapshotPath, cloudPayload);
    writeFileAtomic(join16(worktreeRoot, "latest-commit.txt"), `${head}
`);
    writeLastBuild(baseDir, {
      ts: cloudTs,
      commit_sha: head,
      snapshot_sha256: cloudSha256,
      node_count: numOrUndefined(row.node_count),
      edge_count: numOrUndefined(row.edge_count)
    }, worktreeId);
    appendHistoryEntry(baseDir, {
      ts: new Date(cloudTs).toISOString(),
      commit_sha: head,
      snapshot_sha256: cloudSha256,
      node_count: Number(row.node_count ?? 0),
      edge_count: Number(row.edge_count ?? 0),
      trigger: "pull"
    });
  } catch (err) {
    return errorOutcome2("write local files", err);
  }
  return {
    kind: "pulled",
    commitSha: head,
    snapshotSha256: cloudSha256,
    bytes: Buffer.byteLength(cloudPayload, "utf8"),
    cloudTs,
    sourceWorktreePath: String(row.worktree_id ?? "")
  };
}
function defaultReadHead(cwd) {
  try {
    return execFileSync5("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
function defaultMakeApi2(config) {
  return new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
}
function parseTs(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1e3 : raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
function numOrUndefined(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0)
    return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0)
      return n;
  }
  return void 0;
}
function coerceSnapshotPayload(raw) {
  if (typeof raw === "string")
    return raw;
  if (raw !== null && typeof raw === "object")
    return JSON.stringify(raw);
  return null;
}
function writeFileAtomic(filePath, contents) {
  mkdirSync9(dirname8(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync8(tmp, contents);
  renameSync5(tmp, filePath);
}
function errorOutcome2(stage, err) {
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "error", message: `${stage}: ${message}` };
}

// dist/src/graph/diff.js
import { existsSync as existsSync8, readFileSync as readFileSync14 } from "node:fs";
import { join as join17 } from "node:path";
function edgeKey(e) {
  return `${e.source}${e.target}${e.relation}${e.ord ?? 0}`;
}
function diffSnapshots(from, to) {
  const fromById = new Map(from.nodes.map((n) => [n.id, n]));
  const toNodeIds = new Set(to.nodes.map((n) => n.id));
  const nodesAdded = to.nodes.filter((n) => !fromById.has(n.id));
  const nodesRemoved = from.nodes.filter((n) => !toNodeIds.has(n.id));
  const nodesModified = [];
  for (const after of to.nodes) {
    const before = fromById.get(after.id);
    if (before && (before.signature ?? "") !== (after.signature ?? "")) {
      nodesModified.push({ before, after });
    }
  }
  const fromEdgeKeys = new Set(from.links.map(edgeKey));
  const toEdgeKeys = new Set(to.links.map(edgeKey));
  const edgesAdded = to.links.filter((e) => !fromEdgeKeys.has(edgeKey(e)));
  const edgesRemoved = from.links.filter((e) => !toEdgeKeys.has(edgeKey(e)));
  return {
    nodes: { added: nodesAdded, removed: nodesRemoved, modified: nodesModified },
    edges: { added: edgesAdded, removed: edgesRemoved },
    counts: {
      nodes_added: nodesAdded.length,
      nodes_removed: nodesRemoved.length,
      nodes_modified: nodesModified.length,
      edges_added: edgesAdded.length,
      edges_removed: edgesRemoved.length
    }
  };
}
function loadSnapshotByCommit(baseDir, commitSha) {
  if (!/^[0-9a-f]{4,64}$/i.test(commitSha))
    return null;
  const path = join17(baseDir, "snapshots", `${commitSha}.json`);
  if (!existsSync8(path))
    return null;
  let raw;
  try {
    raw = readFileSync14(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isGraphSnapshotLike(parsed))
      return null;
    return parsed;
  } catch {
    return null;
  }
}
function isGraphSnapshotLike(v) {
  if (v === null || typeof v !== "object")
    return false;
  const s = v;
  return Array.isArray(s.nodes) && Array.isArray(s.links);
}
function printDiffHuman(diff, sampleSize = 10) {
  const { counts } = diff;
  console.log(`Nodes: +${counts.nodes_added} -${counts.nodes_removed}   Edges: +${counts.edges_added} -${counts.edges_removed}`);
  const showNodes = (label, ns) => {
    if (ns.length === 0)
      return;
    console.log("");
    console.log(`${label} (${ns.length}, showing up to ${sampleSize}):`);
    const sorted = [...ns].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const n of sorted.slice(0, sampleSize)) {
      console.log(`  ${n.id} [${n.kind}]${n.exported ? " (exported)" : ""}  ${n.source_file}:${n.source_location}`);
    }
    if (sorted.length > sampleSize)
      console.log(`  \u2026 and ${sorted.length - sampleSize} more`);
  };
  const showEdges = (label, es) => {
    if (es.length === 0)
      return;
    console.log("");
    console.log(`${label} (${es.length}, showing up to ${sampleSize}):`);
    const sorted = [...es].sort((a, b) => edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0);
    for (const e of sorted.slice(0, sampleSize)) {
      console.log(`  ${e.source} --${e.relation}--> ${e.target}${e.ord !== void 0 ? ` (ord=${e.ord})` : ""}`);
    }
    if (sorted.length > sampleSize)
      console.log(`  \u2026 and ${sorted.length - sampleSize} more`);
  };
  showNodes("Nodes added", diff.nodes.added);
  showNodes("Nodes removed", diff.nodes.removed);
  showEdges("Edges added", diff.edges.added);
  showEdges("Edges removed", diff.edges.removed);
}

// dist/src/graph/extract/typescript.js
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
var _typescriptParser = null;
var _tsxParser = null;
function getTypescriptParser() {
  if (_typescriptParser === null) {
    _typescriptParser = new Parser();
    _typescriptParser.setLanguage(TypeScript.typescript);
  }
  return _typescriptParser;
}
function getTsxParser() {
  if (_tsxParser === null) {
    _tsxParser = new Parser();
    _tsxParser.setLanguage(TypeScript.tsx);
  }
  return _tsxParser;
}
function pickParserForPath(relativePath) {
  return relativePath.endsWith(".tsx") || relativePath.endsWith(".jsx") ? getTsxParser() : getTypescriptParser();
}
function extractTypeScript(sourceCode, relativePath) {
  const parser = pickParserForPath(relativePath);
  const CHUNK_BYTES3 = 16384;
  const tree = parser.parse((index) => {
    if (index >= sourceCode.length)
      return null;
    return sourceCode.slice(index, index + CHUNK_BYTES3);
  });
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: "typescript",
    nodes: [],
    edges: [],
    parse_errors: [],
    raw_calls: [],
    import_bindings: []
  };
  collectParseErrors(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode(relativePath);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  extractDeclarations(root, relativePath, result, declByName, moduleNode);
  extractImports(root, relativePath, result, moduleNode);
  extractCalls(root, relativePath, result, declByName);
  if (isJavaScriptPath(relativePath)) {
    result.language = "javascript";
    for (const n of result.nodes)
      n.language = "javascript";
  }
  return result;
}
function isJavaScriptPath(relativePath) {
  return /\.(jsx?|mjs|cjs)$/.test(relativePath);
}
function collectParseErrors(node, relativePath, out) {
  if (node.isError || node.isMissing) {
    out.push({
      source_file: relativePath,
      message: node.isMissing ? `missing node: ${node.type}` : `parse error at ${locationStr(node)}`,
      location: locationStr(node)
    });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectParseErrors(child, relativePath, out);
  }
}
function extractDeclarations(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    const { decl, exported } = unwrapExport(child);
    if (decl !== null) {
      handleDeclaration(decl, exported, relativePath, result, declByName, moduleNode);
    }
    if (child.type === "internal_module" || child.type === "module") {
      extractDeclarations(child, relativePath, result, declByName, moduleNode);
    }
  }
}
function unwrapExport(node) {
  if (node.type === "export_statement") {
    const decl = node.childForFieldName("declaration") ?? firstNamedChildOfTypes(node, [
      "function_declaration",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
      "lexical_declaration"
    ]);
    return { decl, exported: true };
  }
  return { decl: node, exported: false };
}
function handleDeclaration(node, exported, relativePath, result, declByName, moduleNode) {
  switch (node.type) {
    case "function_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "function", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "class_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const classNode = makeNode(relativePath, name, "class", node, exported);
      pushNode(result, declByName, classNode);
      const heritage = firstNamedChildOfTypes(node, ["class_heritage"]);
      if (heritage !== null) {
        for (let i = 0; i < heritage.namedChildCount; i++) {
          const clause = heritage.namedChild(i);
          if (clause === null)
            continue;
          const relation = clause.type === "extends_clause" ? "extends" : clause.type === "implements_clause" ? "implements" : null;
          if (relation === null)
            continue;
          for (let j = 0; j < clause.namedChildCount; j++) {
            const base = clause.namedChild(j);
            if (base === null)
              continue;
            const baseName = base.text;
            if (baseName.length === 0)
              continue;
            result.edges.push({
              source: classNode.id,
              target: nodeIdUnresolved(relativePath, baseName, relation === "extends" ? "class" : "interface"),
              relation,
              confidence: "EXTRACTED"
            });
          }
        }
      }
      const body = firstNamedChildOfTypes(node, ["class_body"]);
      if (body !== null) {
        for (let i = 0; i < body.namedChildCount; i++) {
          const member = body.namedChild(i);
          if (member === null)
            continue;
          if (member.type === "method_definition") {
            const methodName = textOfField(member, "name");
            if (methodName === null)
              continue;
            const accessibility = firstNamedChildOfTypes(member, ["accessibility_modifier"]);
            const isHardPrivate = firstNamedChildOfTypes(member, ["private_property_identifier"]) !== null;
            const isPublic2 = !isHardPrivate && (accessibility === null || accessibility.text === "public");
            const methodExported = exported && isPublic2;
            const methodKey = `${classNode.label}.${methodName}`;
            const methodNode = makeNodeWithExplicitLabel(relativePath, methodKey, methodName, "method", member, methodExported);
            pushNode(result, declByName, methodNode, methodKey);
            result.edges.push({
              source: classNode.id,
              target: methodNode.id,
              relation: "method_of",
              confidence: "EXTRACTED"
            });
          }
        }
      }
      return;
    }
    case "interface_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "interface", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "type_alias_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "type_alias", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "enum_declaration": {
      const name = textOfField(node, "name");
      if (name === null)
        return;
      const decl = makeNode(relativePath, name, "enum", node, exported);
      pushNode(result, declByName, decl);
      return;
    }
    case "lexical_declaration": {
      for (let i = 0; i < node.namedChildCount; i++) {
        const declarator = node.namedChild(i);
        if (declarator === null || declarator.type !== "variable_declarator")
          continue;
        const ident = declarator.childForFieldName("name");
        if (ident === null || ident.type !== "identifier")
          continue;
        const decl = makeNode(relativePath, ident.text, "const", declarator, exported);
        pushNode(result, declByName, decl);
      }
      return;
    }
  }
}
function extractImports(node, relativePath, result, moduleNode) {
  if (node.type === "import_statement") {
    const src = firstNamedChildOfTypes(node, ["string"]);
    if (src !== null) {
      const frag = firstNamedChildOfTypes(src, ["string_fragment"]);
      const specifier = (frag !== null ? frag.text : src.text).replace(/^['"]|['"]$/g, "");
      if (specifier.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${specifier}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
        extractImportBindings(node, specifier, result);
      }
    }
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      extractImports(child, relativePath, result, moduleNode);
  }
}
function extractImportBindings(importStmt, specifier, result) {
  const stmtTypeOnly = /^import\s+type\b/.test(importStmt.text.trimStart());
  const clause = firstNamedChildOfTypes(importStmt, ["import_clause"]);
  if (clause === null)
    return;
  const push = (b) => {
    result.import_bindings.push({ ...b, specifier });
  };
  for (let i = 0; i < clause.namedChildCount; i++) {
    const child = clause.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "identifier") {
      push({ local_name: child.text, imported_name: "default", kind: "default", type_only: stmtTypeOnly });
    } else if (child.type === "namespace_import") {
      const id = firstNamedChildOfTypes(child, ["identifier"]);
      if (id !== null)
        push({ local_name: id.text, imported_name: "*", kind: "namespace", type_only: stmtTypeOnly });
    } else if (child.type === "named_imports") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec === null || spec.type !== "import_specifier")
          continue;
        const specTypeOnly = stmtTypeOnly || /^type\s+(?!as\b)/.test(spec.text);
        const nameNode = spec.childForFieldName("name");
        const aliasNode = spec.childForFieldName("alias");
        const imported = nameNode !== null ? nameNode.text : null;
        if (imported === null)
          continue;
        const local = aliasNode !== null ? aliasNode.text : imported;
        push({ local_name: local, imported_name: imported, kind: "named", type_only: specTypeOnly });
      }
    }
  }
}
function extractCalls(node, relativePath, result, declByName) {
  if (node.type === "call_expression") {
    const callee = node.childForFieldName("function");
    if (callee !== null) {
      const callerNode = findEnclosingDeclaration(node, declByName);
      if (callerNode !== null) {
        const calleeKey = resolveCalleeKey(callee, declByName);
        const targetNode = calleeKey !== null ? declByName.get(calleeKey) : void 0;
        if (targetNode !== void 0) {
          result.edges.push({
            source: callerNode.id,
            target: targetNode.id,
            relation: "calls",
            confidence: "EXTRACTED"
          });
        } else {
          const rc = rawCallFromCallee(callee, callerNode.id);
          if (rc !== null)
            result.raw_calls.push(rc);
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      extractCalls(child, relativePath, result, declByName);
  }
}
function rawCallFromCallee(callee, callerId) {
  if (callee.type === "identifier") {
    return { caller_id: callerId, callee_name: callee.text };
  }
  if (callee.type === "member_expression") {
    const object = callee.childForFieldName("object");
    const property = callee.childForFieldName("property");
    if (object !== null && object.type === "identifier" && property !== null && property.type === "property_identifier") {
      return { caller_id: callerId, callee_name: property.text, receiver: object.text };
    }
  }
  return null;
}
function resolveCalleeKey(callee, declByName) {
  if (callee.type === "identifier")
    return callee.text;
  if (callee.type === "member_expression") {
    const object = callee.childForFieldName("object");
    const property = callee.childForFieldName("property");
    if (object !== null && object.type === "this" && property !== null && property.type === "property_identifier") {
      const className = findEnclosingClassName(callee);
      if (className !== null)
        return `${className}.${property.text}`;
    }
  }
  return null;
}
function findEnclosingDeclaration(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration") {
      const name = textOfField(cur, "name");
      if (name !== null) {
        const n = declByName.get(name);
        if (n !== void 0)
          return n;
      }
    } else if (cur.type === "method_definition") {
      const methodName = textOfField(cur, "name");
      const className = findEnclosingClassName(cur);
      if (methodName !== null && className !== null) {
        const n = declByName.get(`${className}.${methodName}`);
        if (n !== void 0)
          return n;
      }
    } else if (cur.type === "variable_declarator") {
      const value = cur.childForFieldName("value");
      if (value?.type === "arrow_function" || value?.type === "function_expression") {
        const ident = cur.childForFieldName("name");
        if (ident !== null && ident.type === "identifier") {
          const n = declByName.get(ident.text);
          if (n !== void 0)
            return n;
        }
      }
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingClassName(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_declaration") {
      return textOfField(cur, "name");
    }
    cur = cur.parent;
  }
  return null;
}
function makeModuleNode(relativePath) {
  return {
    id: `${relativePath}::module`,
    label: relativePath,
    kind: "module",
    source_file: relativePath,
    source_location: "L1",
    language: "typescript",
    exported: false
  };
}
function makeNode(relativePath, name, kind, node, exported) {
  return {
    id: nodeId(relativePath, name, kind),
    label: name,
    kind,
    source_file: relativePath,
    source_location: locationStr(node),
    language: "typescript",
    exported,
    signature: signatureOf(node, kind)
  };
}
function signatureOf(node, kind) {
  const text = node.text;
  let end = text.length;
  const nl = text.indexOf("\n");
  if (nl >= 0)
    end = Math.min(end, nl);
  const cutsAtBody = kind === "function" || kind === "class" || kind === "method" || kind === "interface" || kind === "enum";
  if (cutsAtBody) {
    const body = node.childForFieldName("body");
    if (body !== null) {
      end = Math.min(end, body.startIndex - node.startIndex);
    } else {
      const brace = text.indexOf("{");
      if (brace >= 0)
        end = Math.min(end, brace);
    }
  }
  const sig = text.slice(0, end).replace(/\s+/g, " ").trim();
  const cps = [...sig];
  return cps.length > 120 ? `${cps.slice(0, 117).join("")}...` : sig;
}
function makeNodeWithExplicitLabel(relativePath, idName, label, kind, node, exported) {
  return {
    id: nodeId(relativePath, idName, kind),
    label,
    kind,
    source_file: relativePath,
    source_location: locationStr(node),
    language: "typescript",
    exported,
    signature: signatureOf(node, kind)
  };
}
function pushNode(result, declByName, node, lookupKey) {
  if (result.nodes.some((n) => n.id === node.id)) {
    if (!declByName.has(lookupKey ?? node.label)) {
      declByName.set(lookupKey ?? node.label, node);
    }
    return;
  }
  result.nodes.push(node);
  declByName.set(lookupKey ?? node.label, node);
}
function nodeId(relativePath, name, kind) {
  return `${relativePath}:${name}:${kind}`;
}
function nodeIdUnresolved(relativePath, name, kind) {
  return `unresolved:${relativePath}:${name}:${kind}`;
}
function locationStr(node) {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  return start === end ? `L${start}` : `L${start}-${end}`;
}
function textOfField(node, fieldName) {
  const child = node.childForFieldName(fieldName);
  if (child === null)
    return null;
  const text = child.text;
  return text.length > 0 ? text : null;
}
function firstNamedChildOfTypes(node, types) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && types.includes(child.type))
      return child;
  }
  return null;
}

// dist/src/graph/extract/javascript.js
import JavaScript from "tree-sitter-javascript";

// dist/src/graph/extract/shared.js
import Parser2 from "tree-sitter";
var CHUNK_BYTES = 16384;
function parseWithChunks(parser, sourceCode) {
  return parser.parse((i) => i >= sourceCode.length ? null : sourceCode.slice(i, i + CHUNK_BYTES));
}
var _parsers = /* @__PURE__ */ new WeakMap();
function getParser(grammar) {
  let p = _parsers.get(grammar);
  if (p === void 0) {
    p = new Parser2();
    p.setLanguage(grammar);
    _parsers.set(grammar, p);
  }
  return p;
}
function collectParseErrors2(node, relativePath, out) {
  if (node.isError || node.isMissing) {
    out.push({
      source_file: relativePath,
      message: node.isMissing ? `missing node: ${node.type}` : `parse error at ${locationStr2(node)}`,
      location: locationStr2(node)
    });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectParseErrors2(child, relativePath, out);
  }
}
function makeModuleNode2(relativePath, language) {
  return {
    id: `${relativePath}::module`,
    label: relativePath,
    kind: "module",
    source_file: relativePath,
    source_location: "L1",
    language,
    exported: false
  };
}
function makeNode2(relativePath, name, kind, node, exported, language) {
  return {
    id: nodeId2(relativePath, name, kind),
    label: name,
    kind,
    source_file: relativePath,
    source_location: locationStr2(node),
    language,
    exported
  };
}
function pushNode2(result, declByName, node, lookupKey) {
  if (result.nodes.some((n) => n.id === node.id)) {
    if (!declByName.has(lookupKey ?? node.label)) {
      declByName.set(lookupKey ?? node.label, node);
    }
    return;
  }
  result.nodes.push(node);
  declByName.set(lookupKey ?? node.label, node);
}
function nodeId2(relativePath, name, kind) {
  return `${relativePath}:${name}:${kind}`;
}
function locationStr2(node) {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  return start === end ? `L${start}` : `L${start}-${end}`;
}
function textOfField2(node, fieldName) {
  const child = node.childForFieldName(fieldName);
  if (child === null)
    return null;
  const t = child.text;
  return t.length > 0 ? t : null;
}
function firstOfType(node, types) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && types.includes(child.type))
      return child;
  }
  return null;
}

// dist/src/graph/extract/javascript.js
var LANG = "javascript";
function extractJavaScript(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(JavaScript), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls(root, relativePath, result, declByName, moduleNode);
  collectImports(root, relativePath, result, moduleNode);
  collectCalls(root, relativePath, result, declByName);
  return result;
}
function collectDecls(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    const { inner, exported } = unwrapExport2(child);
    if (inner.type === "function_declaration" || inner.type === "generator_function_declaration") {
      const name = textOfField2(inner, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", inner, exported, LANG));
    } else if (inner.type === "class_declaration") {
      const name = textOfField2(inner, "name");
      if (name === null)
        continue;
      const classDecl = makeNode2(relativePath, name, "class", inner, exported, LANG);
      pushNode2(result, declByName, classDecl);
      const body = firstOfType(inner, ["class_body"]);
      if (body !== null)
        collectMethods(body, relativePath, result, declByName, name, exported);
    } else if (inner.type === "lexical_declaration" || inner.type === "variable_declaration") {
      for (let j = 0; j < inner.namedChildCount; j++) {
        const decl = inner.namedChild(j);
        if (decl === null || decl.type !== "variable_declarator")
          continue;
        const ident = decl.childForFieldName("name");
        if (ident === null || ident.type !== "identifier")
          continue;
        const val = decl.childForFieldName("value");
        if (val?.type === "arrow_function" || val?.type === "function_expression") {
          pushNode2(result, declByName, makeNode2(relativePath, ident.text, "function", decl, exported, LANG));
        }
      }
    }
  }
}
function collectMethods(body, relativePath, result, declByName, className, classExported) {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member === null || member.type !== "method_definition")
      continue;
    const methodName = textOfField2(member, "name");
    if (methodName === null)
      continue;
    const key = `${className}.${methodName}`;
    const methodNode = {
      id: nodeId2(relativePath, key, "method"),
      label: methodName,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr2(member),
      language: LANG,
      exported: classExported
    };
    pushNode2(result, declByName, methodNode, key);
    result.edges.push({
      source: nodeId2(relativePath, className, "class"),
      target: methodNode.id,
      relation: "method_of",
      confidence: "EXTRACTED"
    });
  }
}
function unwrapExport2(node) {
  if (node.type === "export_statement") {
    const decl = node.childForFieldName("declaration") ?? firstOfType(node, [
      "function_declaration",
      "generator_function_declaration",
      "class_declaration",
      "lexical_declaration",
      "variable_declaration"
    ]);
    if (decl !== null)
      return { inner: decl, exported: true };
  }
  return { inner: node, exported: false };
}
function collectImports(node, relativePath, result, moduleNode) {
  if (node.type === "import_statement") {
    const src = firstOfType(node, ["string"]);
    if (src !== null) {
      const frag = firstOfType(src, ["string_fragment"]);
      const spec = (frag !== null ? frag.text : src.text).replace(/^['"]|['"]$/g, "");
      if (spec.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${spec}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
      }
    }
    return;
  }
  if (node.type === "call_expression" && node.childForFieldName("function")?.text === "require") {
    const args = node.childForFieldName("arguments");
    if (args !== null) {
      const str = firstOfType(args, ["string"]);
      if (str !== null) {
        const frag = firstOfType(str, ["string_fragment"]);
        const spec = (frag?.text ?? str.text).replace(/^['"]|['"]$/g, "");
        if (spec.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${spec}`,
            relation: "imports",
            confidence: "EXTRACTED"
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectImports(child, relativePath, result, moduleNode);
  }
}
function collectCalls(node, relativePath, result, declByName) {
  if (node.type === "call_expression") {
    const callee = node.childForFieldName("function");
    if (callee !== null) {
      let calleeKey = null;
      if (callee.type === "identifier") {
        calleeKey = callee.text;
      } else if (callee.type === "member_expression" && callee.childForFieldName("object")?.type === "this") {
        const prop = callee.childForFieldName("property");
        if (prop !== null) {
          let cur = callee.parent;
          while (cur !== null) {
            if (cur.type === "class_declaration") {
              const cn = textOfField2(cur, "name");
              if (cn !== null) {
                calleeKey = `${cn}.${prop.text}`;
              }
              break;
            }
            cur = cur.parent;
          }
        }
      }
      if (calleeKey !== null) {
        const target = declByName.get(calleeKey);
        if (target !== void 0) {
          const caller = findEnclosingFn(node, declByName);
          if (caller !== null) {
            result.edges.push({
              source: caller.id,
              target: target.id,
              relation: "calls",
              confidence: "EXTRACTED"
            });
          }
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls(child, relativePath, result, declByName);
  }
}
function findEnclosingFn(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration" || cur.type === "generator_function_declaration") {
      const name = textOfField2(cur, "name");
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== void 0)
          return found;
      }
    } else if (cur.type === "method_definition") {
      const methodName = textOfField2(cur, "name");
      let className = null;
      let p = cur.parent;
      while (p !== null) {
        if (p.type === "class_declaration") {
          className = textOfField2(p, "name");
          break;
        }
        p = p.parent;
      }
      if (methodName !== null && className !== null) {
        const found = declByName.get(`${className}.${methodName}`);
        if (found !== void 0)
          return found;
      }
    } else if (cur.type === "variable_declarator") {
      const val = cur.childForFieldName("value");
      if (val?.type === "arrow_function" || val?.type === "function_expression") {
        const ident = cur.childForFieldName("name");
        if (ident !== null && ident.type === "identifier") {
          const found = declByName.get(ident.text);
          if (found !== void 0)
            return found;
        }
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/python.js
import Parser3 from "tree-sitter";
import Python from "tree-sitter-python";
var _pythonParser = null;
function getPythonParser() {
  if (_pythonParser === null) {
    _pythonParser = new Parser3();
    _pythonParser.setLanguage(Python);
  }
  return _pythonParser;
}
var CHUNK_BYTES2 = 16384;
function extractPython(sourceCode, relativePath) {
  const parser = getPythonParser();
  const tree = parser.parse((index) => index >= sourceCode.length ? null : sourceCode.slice(index, index + CHUNK_BYTES2));
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: "python",
    nodes: [],
    edges: [],
    parse_errors: [],
    raw_calls: [],
    import_bindings: []
  };
  collectParseErrors3(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode3(relativePath);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  extractDeclarations2(
    root,
    relativePath,
    result,
    declByName,
    /*topLevel*/
    true
  );
  extractImports2(root, relativePath, result, moduleNode);
  extractCalls2(root, result, declByName);
  return result;
}
function collectParseErrors3(node, relativePath, out) {
  if (node.isError || node.isMissing) {
    out.push({ source_file: relativePath, message: node.isMissing ? `missing node: ${node.type}` : `parse error at ${loc(node)}`, location: loc(node) });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null)
      collectParseErrors3(c, relativePath, out);
  }
}
function extractDeclarations2(node, relativePath, result, declByName, topLevel) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_definition") {
      const name = textOfField3(child, "name");
      if (name !== null)
        pushNode3(result, declByName, makeNode3(relativePath, name, "function", child, isPublic(name)));
    } else if (child.type === "class_definition") {
      handleClass(child, relativePath, result, declByName);
    } else if (topLevel && child.type === "expression_statement") {
      const assign = firstOfType2(child, "assignment");
      if (assign !== null) {
        const lhs = assign.childForFieldName("left");
        if (lhs !== null && lhs.type === "identifier") {
          pushNode3(result, declByName, makeNode3(relativePath, lhs.text, "const", assign, isPublic(lhs.text)));
        }
      }
    } else if (child.type === "decorated_definition") {
      extractDeclarations2(child, relativePath, result, declByName, topLevel);
    }
  }
}
function handleClass(node, relativePath, result, declByName) {
  const name = textOfField3(node, "name");
  if (name === null)
    return;
  const classNode = makeNode3(relativePath, name, "class", node, isPublic(name));
  pushNode3(result, declByName, classNode);
  const supers = node.childForFieldName("superclasses");
  if (supers !== null) {
    for (let i = 0; i < supers.namedChildCount; i++) {
      const base = supers.namedChild(i);
      if (base === null)
        continue;
      let baseName = null;
      if (base.type === "identifier")
        baseName = base.text;
      else if (base.type === "attribute") {
        const attr = base.childForFieldName("attribute");
        baseName = attr !== null ? attr.text : null;
      }
      if (baseName === null || baseName.length === 0)
        continue;
      result.edges.push({
        source: classNode.id,
        target: nodeIdUnresolved2(relativePath, baseName, "class"),
        relation: "extends",
        confidence: "EXTRACTED"
      });
    }
  }
  const body = node.childForFieldName("body");
  if (body !== null) {
    for (let i = 0; i < body.namedChildCount; i++) {
      let member = body.namedChild(i);
      if (member === null)
        continue;
      if (member.type === "decorated_definition")
        member = firstOfType2(member, "function_definition");
      if (member === null || member.type !== "function_definition")
        continue;
      const mName = textOfField3(member, "name");
      if (mName === null)
        continue;
      const methodNode = makeNodeWithExplicitLabel2(relativePath, `${name}.${mName}`, mName, "method", member, isPublic(name) && isPublic(mName));
      pushNode3(result, declByName, methodNode);
      result.edges.push({ source: classNode.id, target: methodNode.id, relation: "method_of", confidence: "EXTRACTED" });
    }
  }
}
function extractImports2(node, relativePath, result, moduleNode) {
  if (node.type === "import_statement") {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child === null)
        continue;
      let modText = null;
      let local = null;
      if (child.type === "dotted_name") {
        modText = child.text;
        local = lastDottedSegment(child.text);
      } else if (child.type === "aliased_import") {
        const name = child.childForFieldName("name");
        const alias = child.childForFieldName("alias");
        if (name !== null) {
          modText = name.text;
          local = alias !== null ? alias.text : lastDottedSegment(name.text);
        }
      }
      if (modText !== null) {
        pushImportEdge(result, moduleNode, modText);
        if (local !== null)
          result.import_bindings.push({ local_name: local, imported_name: "*", kind: "namespace", specifier: modText });
      }
    }
    return;
  }
  if (node.type === "import_from_statement") {
    const modNode = node.childForFieldName("module_name");
    const modText = modNode !== null ? modNode.text : ".";
    pushImportEdge(result, moduleNode, modText);
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child === null || child === modNode)
        continue;
      if (child.type === "dotted_name" || child.type === "identifier") {
        const imported = child.text;
        result.import_bindings.push({ local_name: lastDottedSegment(imported), imported_name: imported, kind: "named", specifier: modText });
      } else if (child.type === "aliased_import") {
        const name = child.childForFieldName("name");
        const alias = child.childForFieldName("alias");
        if (name !== null)
          result.import_bindings.push({ local_name: (
            /* c8 ignore next */
            alias !== null ? alias.text : lastDottedSegment(name.text)
          ), imported_name: name.text, kind: "named", specifier: modText });
      }
    }
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null)
      extractImports2(c, relativePath, result, moduleNode);
  }
}
function pushImportEdge(result, moduleNode, specifier) {
  if (specifier.length === 0)
    return;
  result.edges.push({ source: moduleNode.id, target: `external:${specifier}`, relation: "imports", confidence: "EXTRACTED" });
}
function extractCalls2(node, result, declByName) {
  if (node.type === "call") {
    const callee = node.childForFieldName("function");
    if (callee !== null) {
      const caller = findEnclosingDeclaration2(node, declByName);
      if (caller !== null) {
        const key = resolveCalleeKey2(callee);
        const target = key !== null ? declByName.get(key) : void 0;
        if (target !== void 0) {
          result.edges.push({ source: caller.id, target: target.id, relation: "calls", confidence: "EXTRACTED" });
        } else {
          const rc = rawCallFromCallee2(callee, caller.id);
          if (rc !== null)
            result.raw_calls.push(rc);
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null)
      extractCalls2(c, result, declByName);
  }
}
function resolveCalleeKey2(callee) {
  if (callee.type === "identifier")
    return callee.text;
  if (callee.type === "attribute") {
    const obj = callee.childForFieldName("object");
    const attr = callee.childForFieldName("attribute");
    if (obj !== null && obj.type === "identifier" && obj.text === "self" && attr !== null) {
      const cls = findEnclosingClassName2(callee);
      if (cls !== null)
        return `${cls}.${attr.text}`;
    }
  }
  return null;
}
function rawCallFromCallee2(callee, callerId) {
  if (callee.type === "identifier")
    return { caller_id: callerId, callee_name: callee.text };
  if (callee.type === "attribute") {
    const obj = callee.childForFieldName("object");
    const attr = callee.childForFieldName("attribute");
    if (obj !== null && obj.type === "identifier" && obj.text !== "self" && attr !== null) {
      return { caller_id: callerId, callee_name: attr.text, receiver: obj.text };
    }
  }
  return null;
}
function findEnclosingDeclaration2(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = textOfField3(cur, "name");
      const cls = findEnclosingClassName2(cur);
      if (name !== null) {
        const n = cls !== null ? declByName.get(`${cls}.${name}`) : declByName.get(name);
        if (n !== void 0)
          return n;
      }
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingClassName2(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_definition")
      return textOfField3(cur, "name");
    cur = cur.parent;
  }
  return null;
}
function makeNode3(relativePath, name, kind, node, exported) {
  return { id: nodeId3(relativePath, name, kind), label: name, kind, source_file: relativePath, source_location: loc(node), language: "python", exported, signature: signatureOf2(node, kind) };
}
function makeNodeWithExplicitLabel2(relativePath, idName, label, kind, node, exported) {
  return { id: nodeId3(relativePath, idName, kind), label, kind, source_file: relativePath, source_location: loc(node), language: "python", exported, signature: signatureOf2(node, kind) };
}
function makeModuleNode3(relativePath) {
  return { id: `${relativePath}::module`, label: relativePath, kind: "module", source_file: relativePath, source_location: "L1", language: "python", exported: false };
}
function pushNode3(result, declByName, node) {
  result.nodes.push(node);
  const key = node.kind === "method" ? node.id.split(":")[1] : node.label;
  if (!declByName.has(key))
    declByName.set(key, node);
}
function signatureOf2(node, kind) {
  const text = node.text;
  let end = text.length;
  const nl = text.indexOf("\n");
  if (nl >= 0)
    end = Math.min(end, nl);
  if (kind === "function" || kind === "method" || kind === "class") {
    const body = node.childForFieldName("body");
    if (body !== null)
      end = Math.min(end, body.startIndex - node.startIndex);
  }
  const sig = text.slice(0, end).replace(/\s+/g, " ").replace(/:\s*$/, "").trim();
  const cps = [...sig];
  return cps.length > 120 ? `${cps.slice(0, 117).join("")}...` : sig;
}
function nodeId3(relativePath, name, kind) {
  return `${relativePath}:${name}:${kind}`;
}
function nodeIdUnresolved2(relativePath, name, kind) {
  return `unresolved:${relativePath}:${name}:${kind}`;
}
function loc(node) {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  return end > start ? `L${start}-${end}` : `L${start}`;
}
function textOfField3(node, field) {
  const f = node.childForFieldName(field);
  return f !== null ? f.text : null;
}
function firstOfType2(node, type) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c !== null && c.type === type)
      return c;
  }
  return null;
}
function lastDottedSegment(dotted) {
  const parts = dotted.split(".");
  return parts[parts.length - 1] ?? dotted;
}
function isPublic(name) {
  return !name.startsWith("_");
}

// dist/src/graph/extract/go.js
import Go from "tree-sitter-go";
var LANG2 = "go";
function extractGo(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Go), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG2,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG2);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls2(root, relativePath, result, declByName, moduleNode);
  collectCalls2(root, result, declByName);
  return result;
}
function collectDecls2(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, true, LANG2));
    } else if (child.type === "method_declaration") {
      const name = textOfField2(child, "name");
      const receiver = child.childForFieldName("receiver");
      const receiverType = receiver !== null ? extractReceiverType(receiver) : null;
      if (name === null)
        continue;
      const key = receiverType !== null ? `${receiverType}.${name}` : name;
      const methodNode = {
        id: nodeId2(relativePath, key, "method"),
        label: name,
        kind: "method",
        source_file: relativePath,
        source_location: locationStr2(child),
        language: LANG2,
        exported: name[0] === name[0].toUpperCase()
        // Go: uppercase = exported
      };
      pushNode2(result, declByName, methodNode, key);
      if (receiverType !== null) {
        result.edges.push({
          source: nodeId2(relativePath, receiverType, "class"),
          target: methodNode.id,
          relation: "method_of",
          confidence: "EXTRACTED"
        });
      }
    } else if (child.type === "type_declaration") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec === null || spec.type !== "type_spec")
          continue;
        const name = textOfField2(spec, "name");
        if (name === null)
          continue;
        const typeField = spec.childForFieldName("type");
        const kind = typeField?.type === "interface_type" ? "interface" : "class";
        pushNode2(result, declByName, makeNode2(relativePath, name, kind, spec, name[0] === name[0].toUpperCase(), LANG2));
      }
    } else if (child.type === "import_declaration") {
      collectGoImports(child, result, moduleNode);
    } else if (child.type === "const_declaration" || child.type === "var_declaration") {
      collectGoVarConst(child, relativePath, result, declByName);
    }
  }
}
function extractReceiverType(receiver) {
  for (let i = 0; i < receiver.namedChildCount; i++) {
    const param = receiver.namedChild(i);
    if (param === null)
      continue;
    const typeField = param.childForFieldName("type");
    if (typeField === null)
      continue;
    if (typeField.type === "type_identifier")
      return typeField.text;
    if (typeField.type === "pointer_type") {
      for (let j = 0; j < typeField.namedChildCount; j++) {
        const inner = typeField.namedChild(j);
        if (inner !== null && inner.type === "type_identifier")
          return inner.text;
      }
    }
  }
  return null;
}
function collectGoImports(node, result, moduleNode) {
  const addSpec = (spec) => {
    const path = spec.childForFieldName("path");
    if (path === null)
      return;
    const raw = path.text.replace(/^"|"$/g, "");
    if (raw.length > 0) {
      result.edges.push({
        source: moduleNode.id,
        target: `external:${raw}`,
        relation: "imports",
        confidence: "EXTRACTED"
      });
    }
  };
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "import_spec")
      addSpec(child);
    else if (child.type === "import_spec_list") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec !== null && spec.type === "import_spec")
          addSpec(spec);
      }
    }
  }
}
function collectGoVarConst(node, relativePath, result, declByName) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const spec = node.namedChild(i);
    if (spec === null)
      continue;
    if (spec.type === "const_spec" || spec.type === "var_spec") {
      const nameNode = spec.childForFieldName("name");
      const name = nameNode?.text ?? null;
      if (name !== null && name.length > 0) {
        const kind = spec.type === "const_spec" ? "const" : "variable";
        pushNode2(result, declByName, makeNode2(relativePath, name, kind, spec, name[0] === name[0].toUpperCase(), LANG2));
      }
    }
  }
}
function collectCalls2(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn2(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls2(child, result, declByName);
  }
}
function findEnclosingFn2(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration") {
      const name = textOfField2(cur, "name");
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== void 0)
          return found;
      }
    } else if (cur.type === "method_declaration") {
      const name = textOfField2(cur, "name");
      const receiver = cur.childForFieldName("receiver");
      const rt = receiver !== null ? extractReceiverType(receiver) : null;
      if (name !== null) {
        const key = rt !== null ? `${rt}.${name}` : name;
        const found = declByName.get(key);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/rust.js
import Rust from "tree-sitter-rust";
var LANG3 = "rust";
function extractRust(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Rust), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG3,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG3);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls3(root, relativePath, result, declByName, moduleNode);
  collectCalls3(root, result, declByName);
  return result;
}
function collectDecls3(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      const exported = isRustPub(child);
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, exported, LANG3));
    } else if (child.type === "struct_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "class", child, isRustPub(child), LANG3));
    } else if (child.type === "enum_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "enum", child, isRustPub(child), LANG3));
    } else if (child.type === "trait_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "interface", child, isRustPub(child), LANG3));
    } else if (child.type === "impl_item") {
      collectImplMethods(child, relativePath, result, declByName);
    } else if (child.type === "mod_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "module", child, isRustPub(child), LANG3));
      const body = child.childForFieldName("body");
      if (body !== null) {
        collectDecls3(body, relativePath, result, declByName, moduleNode);
      }
    } else if (child.type === "use_declaration") {
      collectUseDecl(child, result, moduleNode);
    } else if (child.type === "const_item") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "const", child, isRustPub(child), LANG3));
    }
  }
}
function isRustPub(node) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && child.type === "visibility_modifier")
      return true;
  }
  return false;
}
function collectImplMethods(impl, relativePath, result, declByName) {
  const typeNode = impl.childForFieldName("type");
  const implTypeName = typeNode !== null ? typeNode.text.trim() : null;
  const body = impl.childForFieldName("body");
  if (body === null)
    return;
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member === null || member.type !== "function_item")
      continue;
    const name = textOfField2(member, "name");
    if (name === null)
      continue;
    const key = implTypeName !== null ? `${implTypeName}::${name}` : name;
    const methodNode = {
      id: nodeId2(relativePath, key, "method"),
      label: name,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr2(member),
      language: LANG3,
      exported: isRustPub(member)
    };
    pushNode2(result, declByName, methodNode, key);
    if (implTypeName !== null) {
      result.edges.push({
        source: nodeId2(relativePath, implTypeName, "class"),
        target: methodNode.id,
        relation: "method_of",
        confidence: "EXTRACTED"
      });
    }
  }
}
function collectUseDecl(node, result, moduleNode) {
  const arg = node.childForFieldName("argument");
  if (arg === null)
    return;
  const path = extractUsePath(arg);
  if (path.length > 0) {
    result.edges.push({
      source: moduleNode.id,
      target: `external:${path}`,
      relation: "imports",
      confidence: "EXTRACTED"
    });
  }
}
function extractUsePath(node) {
  if (node.type === "scoped_identifier" || node.type === "scoped_use_list") {
    const path = node.childForFieldName("path");
    const name = node.childForFieldName("name");
    const pathStr = path !== null ? extractUsePath(path) : "";
    const nameStr = name !== null ? name.text : "";
    return pathStr.length > 0 && nameStr.length > 0 ? `${pathStr}::${nameStr}` : pathStr || nameStr;
  }
  if (node.type === "identifier" || node.type === "self")
    return node.text;
  return "";
}
function collectCalls3(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn3(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls3(child, result, declByName);
  }
}
function findEnclosingFn3(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_item") {
      const name = textOfField2(cur, "name");
      if (name !== null) {
        const found = declByName.get(name) ?? (() => {
          for (const [k, v] of declByName) {
            if (k.endsWith(`::${name}`) || k === name)
              return v;
          }
          return void 0;
        })();
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/java.js
import Java from "tree-sitter-java";
var LANG4 = "java";
function extractJava(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Java), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG4,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG4);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls4(root, relativePath, result, declByName, moduleNode);
  collectCalls4(root, result, declByName);
  return result;
}
function collectDecls4(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "import_declaration") {
      collectJavaImport(child, result, moduleNode);
    } else if (child.type === "class_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      const classDecl = makeNode2(relativePath, name, "class", child, isJavaPublic(child), LANG4);
      pushNode2(result, declByName, classDecl);
      const body = child.childForFieldName("body");
      if (body !== null)
        collectClassBody(body, relativePath, result, declByName, name, isJavaPublic(child));
    } else if (child.type === "interface_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "interface", child, isJavaPublic(child), LANG4));
    } else if (child.type === "enum_declaration") {
      const name = textOfField2(child, "name");
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "enum", child, isJavaPublic(child), LANG4));
    }
  }
}
function isJavaPublic(node) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && child.type === "modifiers") {
      return child.text.includes("public");
    }
  }
  return false;
}
function collectClassBody(body, relativePath, result, declByName, className, classPublic) {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member === null)
      continue;
    if (member.type === "method_declaration" || member.type === "constructor_declaration") {
      const name = textOfField2(member, "name");
      if (name === null)
        continue;
      const key = `${className}.${name}`;
      const methodNode = {
        id: nodeId2(relativePath, key, "method"),
        label: name,
        kind: "method",
        source_file: relativePath,
        source_location: locationStr2(member),
        language: LANG4,
        exported: classPublic && isJavaPublic(member)
      };
      pushNode2(result, declByName, methodNode, key);
      result.edges.push({
        source: nodeId2(relativePath, className, "class"),
        target: methodNode.id,
        relation: "method_of",
        confidence: "EXTRACTED"
      });
    } else if (member.type === "class_declaration") {
      const name = textOfField2(member, "name");
      if (name === null)
        continue;
      const nestedKey = `${className}.${name}`;
      pushNode2(result, declByName, {
        id: nodeId2(relativePath, nestedKey, "class"),
        label: name,
        kind: "class",
        source_file: relativePath,
        source_location: locationStr2(member),
        language: LANG4,
        exported: isJavaPublic(member)
      });
    }
  }
}
function collectJavaImport(node, result, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "scoped_identifier" || child.type === "identifier") {
      const raw = child.text;
      if (raw.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${raw}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
      }
      break;
    }
  }
}
function collectCalls4(node, result, declByName) {
  if (node.type === "method_invocation") {
    const name = textOfField2(node, "name");
    const object = node.childForFieldName("object");
    if (name !== null) {
      const isThisCall = object === null || object.type === "this";
      if (isThisCall) {
        const className = findEnclosingClassName3(node);
        const key = className !== null ? `${className}.${name}` : name;
        const target = declByName.get(key) ?? declByName.get(name);
        const caller = findEnclosingMethod(node, declByName);
        if (target !== void 0 && caller !== null) {
          result.edges.push({
            source: caller.id,
            target: target.id,
            relation: "calls",
            confidence: "EXTRACTED"
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls4(child, result, declByName);
  }
}
function findEnclosingClassName3(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_declaration")
      return textOfField2(cur, "name");
    cur = cur.parent;
  }
  return null;
}
function findEnclosingMethod(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "method_declaration" || cur.type === "constructor_declaration") {
      const methodName = textOfField2(cur, "name");
      const className = findEnclosingClassName3(cur);
      if (methodName !== null && className !== null) {
        const found = declByName.get(`${className}.${methodName}`);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/ruby.js
import Ruby from "tree-sitter-ruby";
var LANG5 = "ruby";
function extractRuby(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Ruby), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG5,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG5);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls5(root, relativePath, result, declByName, moduleNode, null);
  collectCalls5(root, result, declByName);
  return result;
}
function collectDecls5(node, relativePath, result, declByName, moduleNode, enclosingClass) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "method" || child.type === "singleton_method") {
      const nameNode = child.childForFieldName("name");
      if (nameNode === null)
        continue;
      const sym = nameNode.text;
      const key = enclosingClass !== null ? `${enclosingClass}#${sym}` : sym;
      const kind = enclosingClass !== null ? "method" : "function";
      const decl = makeNode2(relativePath, key, kind, child, true, LANG5);
      pushNode2(result, declByName, decl, key);
      if (enclosingClass !== null) {
        result.edges.push({
          source: nodeId2(relativePath, enclosingClass, "class"),
          target: decl.id,
          relation: "method_of",
          confidence: "EXTRACTED"
        });
      }
    } else if (child.type === "class" || child.type === "module") {
      const nameNode = child.childForFieldName("name");
      if (nameNode === null)
        continue;
      const sym = nameNode.text;
      const classDecl = makeNode2(relativePath, sym, "class", child, true, LANG5);
      pushNode2(result, declByName, classDecl);
      const superclass = child.childForFieldName("superclass");
      if (superclass !== null) {
        result.edges.push({
          source: classDecl.id,
          target: `unresolved:${relativePath}:${superclass.text}:class`,
          relation: "extends",
          confidence: "EXTRACTED"
        });
      }
      const body = child.childForFieldName("body");
      if (body !== null) {
        collectDecls5(body, relativePath, result, declByName, moduleNode, sym);
      }
    } else if (child.type === "call") {
      const method = child.childForFieldName("method");
      if (method !== null && (method.text === "require" || method.text === "require_relative")) {
        const args = child.childForFieldName("arguments");
        if (args !== null) {
          for (let j = 0; j < args.namedChildCount; j++) {
            const arg = args.namedChild(j);
            if (arg === null)
              continue;
            const content = arg.type === "string_content" ? arg.text : arg.type === "string" ? arg.namedChild(0)?.text ?? "" : "";
            if (content.length > 0) {
              result.edges.push({
                source: moduleNode.id,
                target: `external:${content}`,
                relation: "imports",
                confidence: "EXTRACTED"
              });
            }
          }
        }
      }
    } else {
      collectDecls5(child, relativePath, result, declByName, moduleNode, enclosingClass);
    }
  }
}
function collectCalls5(node, result, declByName) {
  if (node.type === "call") {
    const method = node.childForFieldName("method");
    const receiver = node.childForFieldName("receiver");
    if (method !== null && (receiver === null || receiver.type === "self")) {
      const className = findEnclosingClass(node);
      const key = className !== null ? `${className}#${method.text}` : method.text;
      const target = declByName.get(key) ?? declByName.get(method.text);
      const caller = findEnclosingMethod2(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls5(child, result, declByName);
  }
}
function findEnclosingClass(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class" || cur.type === "module") {
      return cur.childForFieldName("name")?.text ?? null;
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingMethod2(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "method" || cur.type === "singleton_method") {
      const nameNode = cur.childForFieldName("name");
      if (nameNode !== null) {
        const className = findEnclosingClass(cur);
        const key = className !== null ? `${className}#${nameNode.text}` : nameNode.text;
        const found = declByName.get(key) ?? declByName.get(nameNode.text);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/c.js
import C from "tree-sitter-c";
var LANG6 = "c";
function extractC(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(C), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG6,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG6);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectDecls6(root, relativePath, result, declByName, moduleNode);
  collectCalls6(root, result, declByName);
  return result;
}
function collectDecls6(node, relativePath, result, declByName, moduleNode) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_definition") {
      const name = extractFunctionName(child);
      if (name === null)
        continue;
      pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, true, LANG6));
    } else if (child.type === "declaration") {
      const name = extractDeclName(child);
      if (name !== null) {
        pushNode2(result, declByName, makeNode2(relativePath, name, "function", child, true, LANG6));
      }
    } else if (child.type === "struct_specifier" || child.type === "union_specifier" || child.type === "enum_specifier") {
      const name = child.childForFieldName("name")?.text ?? null;
      if (name !== null && name.length > 0) {
        pushNode2(result, declByName, makeNode2(relativePath, name, "class", child, true, LANG6));
      }
    } else if (child.type === "preproc_include") {
      const path = child.childForFieldName("path");
      if (path !== null) {
        const raw = path.text.replace(/^["<]|[">]$/g, "");
        if (raw.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${raw}`,
            relation: "imports",
            confidence: "EXTRACTED"
          });
        }
      }
    } else {
      collectDecls6(child, relativePath, result, declByName, moduleNode);
    }
  }
}
function extractFunctionName(fnDef) {
  const topDecl = fnDef.childForFieldName("declarator");
  if (topDecl === null)
    return null;
  return drillToIdentifier(topDecl);
}
function drillToIdentifier(node) {
  if (node.type === "identifier")
    return node.text;
  if (node.type === "function_declarator" || node.type === "pointer_declarator" || node.type === "parenthesized_declarator") {
    const inner = node.childForFieldName("declarator");
    if (inner !== null)
      return drillToIdentifier(inner);
  }
  return null;
}
function extractDeclName(decl) {
  for (let i = 0; i < decl.namedChildCount; i++) {
    const child = decl.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_declarator") {
      return drillToIdentifier(child);
    }
  }
  return null;
}
function collectCalls6(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn4(node, declByName);
      if (target !== void 0 && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED"
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCalls6(child, result, declByName);
  }
}
function findEnclosingFn4(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = extractFunctionName(cur);
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/cpp.js
import Cpp from "tree-sitter-cpp";
var LANG7 = "cpp";
function extractCpp(sourceCode, relativePath) {
  const tree = parseWithChunks(getParser(Cpp), sourceCode);
  const root = tree.rootNode;
  const result = {
    source_file: relativePath,
    language: LANG7,
    nodes: [],
    edges: [],
    parse_errors: []
  };
  collectParseErrors2(root, relativePath, result.parse_errors);
  const moduleNode = makeModuleNode2(relativePath, LANG7);
  result.nodes.push(moduleNode);
  const declByName = /* @__PURE__ */ new Map();
  collectCppDecls(root, relativePath, result, declByName, moduleNode, null);
  collectCppCalls(root, result, declByName);
  return result;
}
function collectCppDecls(node, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace = null) {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null)
      continue;
    if (child.type === "function_definition") {
      const name = extractFunctionName(child);
      if (name === null)
        continue;
      const nsPrefix = enclosingNamespace !== null ? `${enclosingNamespace}::` : "";
      const key = enclosingClass !== null ? `${nsPrefix}${enclosingClass}::${name}` : `${nsPrefix}${name}`;
      const kind = enclosingClass !== null ? "method" : "function";
      const decl = {
        id: nodeId2(relativePath, key, kind),
        label: name,
        kind,
        source_file: relativePath,
        source_location: locationStr2(child),
        language: LANG7,
        exported: true
      };
      pushNode2(result, declByName, decl, key);
      if (enclosingClass !== null) {
        result.edges.push({
          source: nodeId2(relativePath, enclosingClass, "class"),
          target: decl.id,
          relation: "method_of",
          confidence: "EXTRACTED"
        });
      }
    } else if (child.type === "class_specifier" || child.type === "struct_specifier") {
      const name = child.childForFieldName("name")?.text ?? null;
      if (name !== null && name.length > 0) {
        const classDecl = makeNode2(relativePath, name, "class", child, true, LANG7);
        pushNode2(result, declByName, classDecl);
        const body = child.childForFieldName("body");
        if (body !== null) {
          collectCppDecls(body, relativePath, result, declByName, moduleNode, name, enclosingNamespace);
        }
      }
    } else if (child.type === "namespace_definition") {
      const name = child.childForFieldName("name")?.text ?? null;
      if (name !== null && name.length > 0) {
        pushNode2(result, declByName, makeNode2(relativePath, name, "module", child, true, LANG7));
      }
      const body = child.childForFieldName("body");
      if (body !== null) {
        collectCppDecls(body, relativePath, result, declByName, moduleNode, enclosingClass, name ?? enclosingNamespace);
      }
    } else if (child.type === "template_declaration") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const inner = child.namedChild(j);
        if (inner === null)
          continue;
        if (inner.type === "function_definition" || inner.type === "class_specifier" || inner.type === "struct_specifier") {
          const wrapper = {
            ...node,
            namedChildCount: 1,
            namedChild: (_) => inner,
            namedChildren: [inner]
          };
          collectCppDecls(wrapper, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace);
        }
      }
    } else if (child.type === "preproc_include") {
      const path = child.childForFieldName("path");
      if (path !== null) {
        const raw = path.text.replace(/^["<]|[">]$/g, "");
        if (raw.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${raw}`,
            relation: "imports",
            confidence: "EXTRACTED"
          });
        }
      }
    } else if (child.type === "using_declaration") {
      const name = child.text.replace(/^using\s+(namespace\s+)?/, "").replace(/;$/, "").trim();
      if (name.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${name}`,
          relation: "imports",
          confidence: "EXTRACTED"
        });
      }
    } else {
      collectCppDecls(child, relativePath, result, declByName, moduleNode, enclosingClass, enclosingNamespace);
    }
  }
}
function collectCppCalls(node, result, declByName) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null) {
      let key = null;
      if (fn.type === "identifier") {
        key = fn.text;
      } else if (fn.type === "field_expression") {
        const field = fn.childForFieldName("field");
        const obj = fn.childForFieldName("argument");
        if (field !== null && (obj === null || obj.type === "this")) {
          const cn = findEnclosingClass2(fn);
          key = cn !== null ? `${cn}::${field.text}` : field.text;
        }
      } else if (fn.type === "qualified_identifier") {
        const scope = fn.childForFieldName("scope");
        const name = fn.childForFieldName("name");
        if (scope !== null && name !== null)
          key = `${scope.text}::${name.text}`;
      }
      if (key !== null) {
        const target = declByName.get(key);
        const caller = findEnclosingFnCpp(fn, declByName);
        if (target !== void 0 && caller !== null) {
          result.edges.push({
            source: caller.id,
            target: target.id,
            relation: "calls",
            confidence: "EXTRACTED"
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null)
      collectCppCalls(child, result, declByName);
  }
}
function findEnclosingClass2(node) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "class_specifier" || cur.type === "struct_specifier") {
      return cur.childForFieldName("name")?.text ?? null;
    }
    cur = cur.parent;
  }
  return null;
}
function findEnclosingFnCpp(node, declByName) {
  let cur = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = extractFunctionName(cur);
      if (name !== null) {
        const cn = findEnclosingClass2(cur);
        const key = cn !== null ? `${cn}::${name}` : name;
        const found = declByName.get(key) ?? declByName.get(name);
        if (found !== void 0)
          return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}

// dist/src/graph/extract/index.js
function isPythonPath(relativePath) {
  return /\.pyi?$/.test(relativePath);
}
function extractFile(sourceCode, relativePath) {
  const lower = relativePath.toLowerCase();
  if (isPythonPath(lower))
    return extractPython(sourceCode, relativePath);
  if (/\.[cm]?jsx?$/.test(lower))
    return extractJavaScript(sourceCode, relativePath);
  if (lower.endsWith(".go"))
    return extractGo(sourceCode, relativePath);
  if (lower.endsWith(".rs"))
    return extractRust(sourceCode, relativePath);
  if (lower.endsWith(".java"))
    return extractJava(sourceCode, relativePath);
  if (lower.endsWith(".rb"))
    return extractRuby(sourceCode, relativePath);
  if (/\.(cpp|cc|cxx|hpp)$/.test(lower))
    return extractCpp(sourceCode, relativePath);
  if (/\.[ch]$/.test(lower))
    return extractC(sourceCode, relativePath);
  return extractTypeScript(sourceCode, relativePath);
}

// dist/src/graph/ignore-config.js
import { mkdirSync as mkdirSync10, readFileSync as readFileSync15, writeFileSync as writeFileSync9 } from "node:fs";
import { homedir as homedir9 } from "node:os";
import { join as join18 } from "node:path";
var DEFAULT_IGNORE_DIRS = [
  // JS / TS toolchains
  "node_modules",
  "bower_components",
  "jspm_packages",
  ".pnpm-store",
  "dist",
  "build",
  "out",
  "coverage",
  "bundle",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".parcel-cache",
  ".cache",
  ".vite",
  ".nyc_output",
  // Python
  "venv",
  ".venv",
  "env",
  ".env",
  "virtualenv",
  "__pycache__",
  "site-packages",
  "__pypackages__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".eggs",
  ".ipynb_checkpoints",
  ".hypothesis",
  // Rust / Java / .NET / Go vendoring
  "target",
  "obj",
  "vendor",
  ".gradle",
  ".mvn",
  // Native / mobile
  "Pods",
  "DerivedData",
  ".build",
  // VCS / IDE
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  ".vs",
  // Infra / misc
  ".terraform",
  "tmp",
  "temp",
  "logs",
  "third_party",
  "third-party"
];
var FILE_NAME = "graph-ignore.json";
function defaultConfigObject() {
  return {
    _comment: "Directory names skipped when building the hivemind code graph. Edit freely. When respectGitignore is true, the repo's .gitignore is also honored (anchoring-correct).",
    ignoreDirs: [...DEFAULT_IGNORE_DIRS],
    respectGitignore: true
  };
}
function loadGraphIgnore(deeplakeDir = join18(homedir9(), ".deeplake")) {
  const path = join18(deeplakeDir, FILE_NAME);
  try {
    const parsed = JSON.parse(readFileSync15(path, "utf8"));
    const ignoreDirs = Array.isArray(parsed.ignoreDirs) ? parsed.ignoreDirs.filter((s) => typeof s === "string") : [...DEFAULT_IGNORE_DIRS];
    const respectGitignore = typeof parsed.respectGitignore === "boolean" ? parsed.respectGitignore : true;
    return { ignoreDirs, respectGitignore };
  } catch {
  }
  try {
    mkdirSync10(deeplakeDir, { recursive: true });
    writeFileSync9(path, JSON.stringify(defaultConfigObject(), null, 2) + "\n", { flag: "wx" });
  } catch {
  }
  return { ignoreDirs: [...DEFAULT_IGNORE_DIRS], respectGitignore: true };
}
function ignoreDirSet(config) {
  return new Set(config.ignoreDirs);
}
function pathHasIgnoredSegment(relPath, ignore) {
  const segs = relPath.split("/");
  return segs.some((seg, i) => ignore.has(seg) || i < segs.length - 1 && seg.startsWith("."));
}

// dist/src/docs/auto-refresh-trigger.js
function maybeSpawnDocsRefresh(cwd, ctx, deps = {}) {
  const enabled = (deps.isAutoEnabledFn ?? isAutoEnabled)(ctx.orgId, ctx.project);
  if (!enabled)
    return false;
  const cliEntry = deps.cliEntry ?? process.argv[1];
  if (!cliEntry)
    return false;
  const spawn = deps.spawn ?? spawnDetachedNodeWorker;
  spawn(cliEntry, ["docs", "refresh", ...ctx.full ? ["--full"] : [], "--cwd", cwd]);
  spawn(cliEntry, ["docs", "wiki-refresh", "--cwd", cwd]);
  return true;
}

// dist/src/commands/graph.js
var USAGE = `hivemind graph \u2014 codebase-graph commands (Phase 1.5)

Usage:
  hivemind graph build [--cwd <path>]
      Walk the project for supported source files (TS, JS, Python, Go, Rust, Java, Ruby, C, C++), extract symbols + edges,
      and write a snapshot to ~/.hivemind/graphs/<repo-key>/snapshots/<commit-sha>.json.
      Also updates ~/.hivemind/graphs/<repo-key>/latest-commit.txt and the
      per-repo .last-build.json (consumed by the SessionEnd auto-build hook).

  hivemind graph diff <sha1> <sha2> [--cwd <path>] [--json] [--limit N]
      Diff two snapshots by their git commit SHA. Prints added/removed
      counts for nodes and edges, plus up to N=10 (default) examples of each.
      --json: emit machine-readable JSON instead of the human format.
      --limit N: cap the per-category examples (human format only).

  hivemind graph history [--cwd <path>] [-n N] [--json]
      Print the last N (default 20) entries from the per-repo history.jsonl,
      newest last. Each entry shows ts, commit_sha (short), snapshot_sha256
      (short), node/edge counts, and the trigger that fired the build.
      --json: emit raw JSONL (one parsed entry per line, full fields).

  hivemind graph init [--cwd <path>] [--force] [--no-initial-build]
      Install a managed block in .git/hooks/post-commit that fires
      \`hivemind graph build --trigger post-commit\` after each commit
      (async, non-blocking, exit 0 always). Idempotent: re-running on
      an already-installed hook is a no-op. Refuses to clobber an
      existing non-managed hook unless --force is passed.
      Also runs an initial \`hivemind graph build\` unless
      --no-initial-build is passed.

  hivemind graph uninstall [--cwd <path>]
      Remove our managed block from .git/hooks/post-commit. If our block
      was the only content, deletes the file; otherwise leaves the rest
      intact. Snapshots and history are NOT touched (\`rm -rf
      ~/.hivemind/graphs/<key>\` if you really want them gone).

  hivemind graph pull [--cwd <path>]
      Download the freshest cloud snapshot for HEAD into the local graph
      dir (any worktree of this user counts). No-op if local already
      matches cloud sha256 or local was built later than cloud. Requires
      \`hivemind login\`. Best-effort: any network/auth failure leaves
      the local files untouched. Disable via HIVEMIND_GRAPH_PULL=0.

  hivemind graph --help
      Show this message.

  Future subcommands (Phase 1.5+): daemon, search, latest, push, pull, prune.
`;
function runGraphCommand(args) {
  const sub = args[0];
  if (sub === void 0 || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE);
    return;
  }
  if (sub === "build") {
    return runBuildCommand(args.slice(1));
  }
  if (sub === "diff") {
    runDiffCommand(args.slice(1));
    return;
  }
  if (sub === "history") {
    runHistoryCommand(args.slice(1));
    return;
  }
  if (sub === "init") {
    return runInitCommand(args.slice(1));
  }
  if (sub === "uninstall") {
    runUninstallCommand(args.slice(1));
    return;
  }
  if (sub === "pull") {
    return runPullCommand(args.slice(1));
  }
  console.error(`hivemind graph: unknown subcommand '${sub}'`);
  console.error(USAGE);
  process.exit(2);
}
function parseInitArgs(args) {
  let cwd = process.cwd();
  let force = false;
  let initialBuild = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--no-initial-build") {
      initialBuild = false;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph init: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, force, initialBuild };
}
async function runInitCommand(args) {
  const opts = parseInitArgs(args);
  const status = installPostCommitHook(opts.cwd, { force: opts.force });
  switch (status.kind) {
    case "installed":
      console.log(`Installed post-commit hook at ${status.path}`);
      break;
    case "already-ours":
      console.log(`Post-commit hook already managed by hivemind (no change): ${status.path}`);
      break;
    case "foreign-hook":
      console.error(`hivemind graph init: ${status.hint}`);
      process.exit(1);
  }
  if (opts.initialBuild) {
    console.log("");
    console.log("Running initial build...");
    await runBuildCommand(["--cwd", opts.cwd, "--trigger", "manual"]);
  } else {
    console.log("");
    console.log("Skipped initial build (--no-initial-build). Run `hivemind graph build` when ready.");
  }
  const initCfg = loadConfig();
  if (initCfg) {
    const root = tryGitTopLevel(opts.cwd) ?? opts.cwd;
    console.log("");
    const result = await runDocsOnboarding({
      root,
      isGitRepo: tryGitTopLevel(opts.cwd) !== null,
      orgId: initCfg.orgId,
      orgName: initCfg.orgName,
      project: deriveProjectKey(root).key,
      snap: loadCurrentSnapshot(root)
    });
    if (result.generate) {
      const cliEntry = process.argv[1];
      if (cliEntry) {
        spawnDetachedNodeWorker(cliEntry, ["docs", "wiki", "--cwd", root]);
        console.log("Generating wiki docs in the background \u2014 check with: hivemind docs list");
      } else {
        console.log("Run `hivemind docs wiki` to generate the corpus.");
      }
    }
  }
}
function parseUninstallArgs(args) {
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph uninstall: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd };
}
function runUninstallCommand(args) {
  const opts = parseUninstallArgs(args);
  const status = uninstallPostCommitHook(opts.cwd);
  switch (status.kind) {
    case "removed":
      if (status.wholeFileDeleted) {
        console.log(`Removed post-commit hook (file deleted): ${status.path}`);
      } else {
        console.log(`Removed managed block from post-commit hook (other content preserved): ${status.path}`);
      }
      console.log("Local snapshots + history.jsonl are untouched.");
      break;
    case "no-hook":
      console.log(status.path === "" ? "No git repo here (nothing to uninstall)." : `No post-commit hook at ${status.path} (nothing to uninstall).`);
      break;
    case "not-ours":
      console.error(`hivemind graph uninstall: ${status.hint}`);
      process.exit(1);
  }
}
function parseHistoryArgs(args) {
  let cwd = process.cwd();
  let n = 20;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "-n" && i + 1 < args.length) {
      const raw = args[i + 1];
      if (!/^\d+$/.test(raw)) {
        console.error("hivemind graph history: -n must be a non-negative integer");
        process.exit(2);
      }
      n = Number(raw);
      i += 1;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph history: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, n, json };
}
function runHistoryCommand(args) {
  const opts = parseHistoryArgs(args);
  const { key: repoKey } = deriveProjectKey(opts.cwd);
  const baseDir = repoDir(repoKey);
  const total = countHistoryEntries(baseDir);
  const entries = readHistoryTail(baseDir, opts.n);
  if (opts.json) {
    for (const e of entries)
      console.log(JSON.stringify(e));
    return;
  }
  if (total === 0) {
    console.log("No history yet. Run `hivemind graph build` to record one.");
    return;
  }
  console.log(`history.jsonl: ${total} total entries; showing last ${entries.length}`);
  console.log("");
  for (const e of entries) {
    const commit = e.commit_sha === null ? "(no-git)" : e.commit_sha.slice(0, 7);
    const snap = e.snapshot_sha256.slice(0, 7);
    console.log(`  ${e.ts}  commit=${commit}  snap=${snap}  nodes=${e.node_count}  edges=${e.edge_count}  trigger=${e.trigger}`);
  }
}
function parseDiffArgs(args) {
  let cwd = process.cwd();
  let json = false;
  let limit = 10;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--limit" && i + 1 < args.length) {
      const raw = args[i + 1];
      if (!/^\d+$/.test(raw)) {
        console.error("hivemind graph diff: --limit must be a non-negative integer");
        process.exit(2);
      }
      limit = Number(raw);
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (a !== void 0 && !a.startsWith("--")) {
      positional.push(a);
    } else {
      console.error(`hivemind graph diff: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  if (positional.length !== 2) {
    console.error("hivemind graph diff: expected exactly two commit SHAs");
    console.error(USAGE);
    process.exit(2);
  }
  return { cwd, sha1: positional[0], sha2: positional[1], json, limit };
}
function runDiffCommand(args) {
  const opts = parseDiffArgs(args);
  const { key: repoKey } = deriveProjectKey(opts.cwd);
  const baseDir = repoDir(repoKey);
  const from = loadSnapshotByCommit(baseDir, opts.sha1);
  if (from === null) {
    console.error(`hivemind graph diff: snapshot not found for ${opts.sha1}`);
    console.error(`  expected: ${baseDir}/snapshots/${opts.sha1}.json`);
    console.error("  hint: run 'hivemind graph build' on the relevant commit, or check the commit sha");
    process.exit(1);
  }
  const to = loadSnapshotByCommit(baseDir, opts.sha2);
  if (to === null) {
    console.error(`hivemind graph diff: snapshot not found for ${opts.sha2}`);
    console.error(`  expected: ${baseDir}/snapshots/${opts.sha2}.json`);
    process.exit(1);
  }
  const diff = diffSnapshots(from, to);
  if (opts.json) {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }
  console.log(`Diff: ${opts.sha1} \u2192 ${opts.sha2}`);
  console.log("");
  printDiffHuman(diff, opts.limit);
}
function parseBuildArgs(args) {
  let cwd = process.cwd();
  let trigger = "manual";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--trigger" && i + 1 < args.length) {
      const v = args[i + 1];
      if (v === "manual" || v === "session-end" || v === "post-commit" || v === "unknown") {
        trigger = v;
      } else {
        console.error(`hivemind graph build: --trigger must be one of manual|session-end|post-commit|unknown (got '${v}')`);
        process.exit(2);
      }
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph build: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, trigger };
}
async function runBuildCommand(args) {
  const opts = parseBuildArgs(args);
  const cwd = resolve5(opts.cwd);
  const { key: repoKey, project } = deriveProjectKey(cwd);
  const baseDir = repoDir(repoKey);
  const commitSha = readGitCommit(cwd);
  const branch = readGitBranch(cwd);
  const version = getVersion();
  console.log(`Building codebase graph for ${project}`);
  console.log(`  repo_key:   ${repoKey}`);
  console.log(`  commit_sha: ${commitSha ?? "(not in a git repo)"}`);
  console.log(`  branch:     ${branch ?? "(none / detached)"}`);
  console.log(`  output:     ${baseDir}`);
  console.log("");
  const ignoreConfig = loadGraphIgnore();
  const sourceFiles = discoverSourceFiles(cwd, ignoreConfig);
  console.log(`Discovered ${sourceFiles.length} source files. Extracting...`);
  const extractions = [];
  let skipped = 0;
  let totalParseErrors = 0;
  let cacheHits = 0;
  for (const abs of sourceFiles) {
    const rel = toForwardSlash(relative2(cwd, abs));
    try {
      const content = readFileSync16(abs, "utf8");
      const contentSha = fileContentHash(content);
      let extraction = readCache(baseDir, contentSha, rel);
      if (extraction === null) {
        extraction = extractFile(content, rel);
        writeCache(baseDir, contentSha, extraction);
      } else {
        cacheHits += 1;
      }
      if (extraction.parse_errors.length > 0) {
        totalParseErrors += extraction.parse_errors.length;
        for (const err of extraction.parse_errors) {
          console.warn(`  warn: parse issue in ${err.source_file} ${err.location ?? ""}: ${err.message}`);
        }
      }
      extractions.push(extraction);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  warn: skipping ${rel}: ${msg}`);
      skipped += 1;
    }
  }
  const metadata = {
    schema_version: 1,
    generator: "hivemind-graph",
    commit_sha: commitSha,
    repo_key: repoKey
  };
  const observation = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    branch,
    worktree_path: cwd,
    repo_project: project,
    generator_version: version,
    source_files_extracted: extractions.length,
    source_files_skipped: skipped
  };
  const snapshot = buildSnapshot(extractions, metadata, observation);
  const worktreeId = workTreeIdFor3(cwd);
  const result = writeSnapshot(snapshot, baseDir, opts.trigger, worktreeId);
  console.log("");
  console.log(`Snapshot:      ${result.snapshotPath}`);
  console.log(`Latest:        ${result.latestCommitPath ?? "(no commit context \u2014 latest-commit.txt not updated)"}`);
  console.log(`SHA-256:       ${result.snapshotSha256}`);
  console.log(`Nodes:         ${snapshot.nodes.length}`);
  console.log(`Edges:         ${snapshot.links.length}`);
  console.log(`Files extracted: ${extractions.length} (skipped: ${skipped}, parse warnings: ${totalParseErrors}, cache hits: ${cacheHits}/${sourceFiles.length})`);
  const pushOutcome = await pushSnapshot(snapshot, worktreeId, { cwd });
  switch (pushOutcome.kind) {
    case "inserted":
      console.log(`Cloud:         pushed to codebase table (commit ${pushOutcome.commitSha.slice(0, 7)})`);
      break;
    case "inserted-with-duplicate-race":
      console.warn(`Cloud:         pushed (commit ${pushOutcome.commitSha.slice(0, 7)}) but ${pushOutcome.rowCount} rows now share`);
      console.warn(`               this identity key \u2014 a concurrent writer raced. v1.1 adds a server-side`);
      console.warn(`               UNIQUE constraint; until then, the older row(s) should be deleted manually.`);
      break;
    case "already-current":
      console.log(`Cloud:         already up-to-date (commit ${pushOutcome.commitSha.slice(0, 7)})`);
      break;
    case "skipped-no-auth":
      console.log(`Cloud:         skipped (not authenticated; run \`hivemind login\` to enable cloud sync)`);
      break;
    case "skipped-no-commit":
      console.log(`Cloud:         skipped (no commit context \u2014 not in a git repo)`);
      break;
    case "skipped-disabled":
      console.log(`Cloud:         skipped (HIVEMIND_GRAPH_PUSH=0)`);
      break;
    case "skipped-collect-disabled":
      console.log(`Cloud:         skipped (.hivemind collect:false for this directory)`);
      break;
    case "drift":
      console.warn(`Cloud:         DRIFT \u2014 commit ${pushOutcome.commitSha.slice(0, 7)} is in cloud with`);
      console.warn(`               sha256=${pushOutcome.cloudSha256.slice(0, 12)}... but local rebuild produced`);
      console.warn(`               sha256=${pushOutcome.localSha256.slice(0, 12)}...`);
      console.warn(`               (probably extractor version drift; investigate before forcing.)`);
      break;
    case "error":
      console.warn(`Cloud:         push error (non-fatal): ${pushOutcome.message}`);
      break;
  }
  const autoCfg = loadConfig();
  if (autoCfg && maybeSpawnDocsRefresh(cwd, { orgId: autoCfg.orgId, project: deriveProjectKey(cwd).key })) {
    console.log("Docs:          spawned auto sync (enabled for this repo \u2014 `hivemind docs list`)");
  }
}
function parsePullArgs(args) {
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph pull: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd };
}
async function runPullCommand(args) {
  const opts = parsePullArgs(args);
  const outcome = await pullSnapshot(opts.cwd);
  switch (outcome.kind) {
    case "pulled":
      console.log(`Pulled commit ${outcome.commitSha.slice(0, 7)}`);
      console.log(`  sha256:  ${outcome.snapshotSha256.slice(0, 12)}...`);
      console.log(`  bytes:   ${outcome.bytes}`);
      console.log(`  origin:  worktree_id=${outcome.sourceWorktreePath}`);
      console.log(`  cloud ts: ${new Date(outcome.cloudTs).toISOString()}`);
      break;
    case "up-to-date":
      console.log(`Already up-to-date (commit ${outcome.commitSha.slice(0, 7)}, sha256 ${outcome.snapshotSha256.slice(0, 12)}...)`);
      break;
    case "local-newer":
      console.log(`Local is newer than cloud \u2014 not pulling.`);
      console.log(`  commit:   ${outcome.commitSha.slice(0, 7)}`);
      console.log(`  local ts: ${new Date(outcome.localTs).toISOString()}`);
      console.log(`  cloud ts: ${new Date(outcome.cloudTs).toISOString()}`);
      break;
    case "no-cloud-row":
      console.log(`No cloud snapshot for commit ${outcome.commitSha.slice(0, 7)} \u2014 run \`hivemind graph build\` to create one.`);
      break;
    case "skipped-no-auth":
      console.log(`Skipped: not authenticated (run \`hivemind login\`).`);
      break;
    case "skipped-disabled":
      console.log(`Skipped: HIVEMIND_GRAPH_PULL=0.`);
      break;
    case "skipped-no-head":
      console.log(`Skipped: not in a git repo (\`git rev-parse HEAD\` failed).`);
      break;
    case "error":
      console.warn(`Pull error (non-fatal): ${outcome.message}`);
      process.exitCode = 1;
      break;
  }
}
function workTreeIdFor3(cwd) {
  return createHash6("sha256").update(cwd).digest("hex").slice(0, 16);
}
function discoverSourceFiles(rootDir, config) {
  const ignore = ignoreDirSet(config);
  if (config.respectGitignore) {
    const fromGit = gitListSourceFiles(rootDir, ignore);
    if (fromGit !== null)
      return fromGit;
  }
  const out = [];
  walk(rootDir, out, ignore);
  out.sort();
  return out;
}
function gitListSourceFiles(rootDir, ignore) {
  let stdout;
  try {
    stdout = execSync("git ls-files --cached --others --exclude-standard -z", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    return null;
  }
  const out = [];
  for (const rel of stdout.split("\0")) {
    if (rel.length === 0)
      continue;
    if (!isSourceFile(rel))
      continue;
    if (pathHasIgnoredSegment(rel, ignore))
      continue;
    out.push(join19(rootDir, rel));
  }
  out.sort();
  return out;
}
function walk(dir, out, ignore) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ignore.has(entry.name))
      continue;
    if (entry.name.startsWith("."))
      continue;
    const abs = join19(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out, ignore);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      out.push(abs);
    }
  }
}
function isSourceFile(name) {
  if (name.endsWith(".d.ts"))
    return false;
  return /\.(tsx?|jsx?|mjs|cjs|pyi?|go|rs|java|rb|cpp|cc|cxx|hpp|[ch])$/.test(name.toLowerCase());
}
function toForwardSlash(p) {
  return sep === "\\" ? p.replace(/\\/g, "/") : p;
}
function readGitCommit(cwd) {
  try {
    return execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
function readGitBranch(cwd) {
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out === "" || out === "HEAD" ? null : out;
  } catch {
    return null;
  }
}
export {
  runBuildCommand,
  runGraphCommand,
  runPullCommand
};
