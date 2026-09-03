#!/usr/bin/env node
import {
  DeeplakeApi,
  HOME,
  SKILLS_COLUMNS,
  allPlatformIds,
  buildCreateTableSql,
  claudeDesktopConfigDir,
  confirm,
  copyDir,
  deeplakeClientHeader,
  deleteCredentials,
  detectPlatforms,
  diffSnapshots,
  ensureDir,
  getVersion,
  healMissingColumns,
  isMissingColumnError,
  isMissingTableError,
  loadCredentials,
  loadRoutedConfig,
  loadSnapshotByCommit,
  log,
  log2,
  pkgRoot,
  promptLine,
  readJson,
  resolveDirConfig,
  saveCredentials,
  symlinkForce,
  utcTimestamp,
  warn,
  writeJson,
  writeJsonIfChanged,
  writeVersionStamp
} from "./chunk-ZUTZ4ZKQ.js";
import "./chunk-PIGOEMQS.js";
import {
  docsHintShown,
  docsInstallLines,
  markDocsHintShown
} from "./chunk-PPCK3RF2.js";
import {
  loadConfig
} from "./chunk-YUCM7LPN.js";
import {
  MAIN_SCOPE,
  WIKI_DOC_PREFIX,
  appendFilesIndex,
  archiveDoc,
  buildAnchor,
  buildClaudeInvocation,
  changedFilesFromGit,
  collectWikiAnchors,
  computeFingerprint,
  computeSymbolHash,
  currentBranch,
  currentScope,
  defaultGit,
  defaultIo,
  detectAvailableAgents,
  docRowId,
  editDoc,
  embeddingSqlLiteral,
  expandToCandidateFiles,
  gateDocEdit,
  generateDocs,
  generateWikiPages,
  getDocLatest,
  getDocsLlmAgent,
  getEmbeddingsEnabled,
  impactedNodes,
  isFresh,
  knownDocsAgents,
  listDocMeta,
  listDocs,
  listDocsByIds,
  makeHostBatchGenerateDoc,
  makeHostGenerate,
  makeHostGenerateDoc,
  makeHostPageRunPrompt,
  makeHostRunPrompt,
  parseFilesIndex,
  parseFingerprint,
  parseScope,
  permissionFlags,
  refreshDocs,
  resolveCliBin,
  runDocsOnboarding,
  runPool,
  selectTargets,
  selectWikiGroups,
  serializeFingerprint,
  setDoc,
  setDocsLlmAgent,
  setEmbeddingsEnabled,
  sourcePushed,
  sqlIdent,
  sqlLike,
  sqlStr,
  stableUnionRows,
  stripFilesIndex,
  trunkBranch,
  unwrapModelOutput,
  upsertDoc,
  wikiDocId,
  wikiGroupEligible,
  workingTreeClean
} from "./chunk-EZ4IN47W.js";
import {
  findEntry,
  isAutoEnabled,
  listEntries,
  setAuto
} from "./chunk-P6DQCJZO.js";
import {
  containsOurMarkers,
  postCommitHookPath,
  tryGitTopLevel
} from "./chunk-5M4YA7ZO.js";
import {
  loadCurrentSnapshot,
  repoDir
} from "./chunk-U5AF2ZBC.js";
import {
  deriveProjectKey
} from "./chunk-YUE5VGV2.js";

// dist/src/cli/install-claude.js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var MARKETPLACE_NAME = "hivemind";
var MARKETPLACE_SOURCE = "activeloopai/hivemind";
var PLUGIN_KEY = "hivemind@hivemind";
function runClaude(args) {
  try {
    const stdout = execFileSync("claude", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err) {
    const e = err;
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? e.message ?? ""
    };
  }
}
function requireClaudeCli() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("Claude Code CLI ('claude') not found on PATH. Install Claude Code first: https://claude.com/claude-code");
  }
}
function marketplaceAlreadyAdded() {
  const r = runClaude(["plugin", "marketplace", "list"]);
  if (!r.ok)
    return false;
  return new RegExp(`(^|\\s)${MARKETPLACE_NAME}(\\s|$)`, "m").test(r.stdout);
}
function pluginAlreadyInstalled() {
  const r = runClaude(["plugin", "list"]);
  if (!r.ok)
    return false;
  return r.stdout.includes(PLUGIN_KEY);
}
var PLUGIN_SCOPES = ["user", "project", "local", "managed"];
function settingsJsonPath() {
  return join(homedir(), ".claude", "settings.json");
}
var LEGACY_PATH_FRAGMENT = ".claude/plugins/hivemind/bundle/";
function isBrokenHivemindHookEntry(h) {
  if (typeof h.command !== "string")
    return false;
  const normalized = h.command.replace(/\\/g, "/");
  if (!normalized.includes(LEGACY_PATH_FRAGMENT))
    return false;
  const match = normalized.match(/"([^"]+\.claude\/plugins\/hivemind\/bundle\/[^"]+)"/);
  const filePath = match ? match[1] : null;
  if (!filePath)
    return false;
  return !existsSync(filePath);
}
function cleanupBrokenSettingsHooks() {
  const settingsPath = settingsJsonPath();
  if (!existsSync(settingsPath))
    return { removed: 0, events: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    return { removed: 0, events: [] };
  }
  if (!parsed || typeof parsed !== "object")
    return { removed: 0, events: [] };
  const settings = parsed;
  if (!settings.hooks || typeof settings.hooks !== "object")
    return { removed: 0, events: [] };
  let removed = 0;
  const touchedEvents = [];
  for (const [event, matchers] of Object.entries(settings.hooks)) {
    if (!Array.isArray(matchers))
      continue;
    const cleanedMatchers = [];
    let eventTouched = false;
    for (const m of matchers) {
      if (!m || !Array.isArray(m.hooks)) {
        cleanedMatchers.push(m);
        continue;
      }
      const keptHooks = m.hooks.filter((h) => {
        const broken = isBrokenHivemindHookEntry(h);
        if (broken) {
          removed += 1;
          eventTouched = true;
        }
        return !broken;
      });
      if (keptHooks.length > 0) {
        cleanedMatchers.push({ ...m, hooks: keptHooks });
      } else if (m.hooks.length > 0) {
        eventTouched = true;
      } else {
        cleanedMatchers.push(m);
      }
    }
    if (eventTouched) {
      settings.hooks[event] = cleanedMatchers;
      touchedEvents.push(event);
    }
  }
  if (removed > 0) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }
  return { removed, events: touchedEvents };
}
function installClaude() {
  requireClaudeCli();
  const marketplacePreexisting = marketplaceAlreadyAdded();
  if (!marketplacePreexisting) {
    const add = runClaude(["plugin", "marketplace", "add", MARKETPLACE_SOURCE]);
    if (!add.ok) {
      throw new Error(`Failed to add marketplace '${MARKETPLACE_SOURCE}': ${add.stderr.slice(0, 200)}`);
    }
  }
  if (!pluginAlreadyInstalled()) {
    if (marketplacePreexisting) {
      runClaude(["plugin", "marketplace", "update", MARKETPLACE_NAME]);
    }
    const inst = runClaude(["plugin", "install", "hivemind"]);
    if (!inst.ok) {
      throw new Error(`Failed to install hivemind plugin: ${inst.stderr.slice(0, 200)}`);
    }
    log(`  Claude Code    installed via marketplace ${MARKETPLACE_SOURCE}`);
  } else {
    runClaude(["plugin", "marketplace", "update", MARKETPLACE_NAME]);
    for (const scope of PLUGIN_SCOPES) {
      runClaude(["plugin", "update", PLUGIN_KEY, "--scope", scope]);
    }
    log(`  Claude Code    refreshed via marketplace ${MARKETPLACE_SOURCE}`);
  }
  runClaude(["plugin", "enable", PLUGIN_KEY]);
  try {
    const cleanup = cleanupBrokenSettingsHooks();
    if (cleanup.removed > 0) {
      log(`  Claude Code    settings.json cleaned: removed ${cleanup.removed} stale hook entr${cleanup.removed === 1 ? "y" : "ies"} (events: ${cleanup.events.join(", ")})`);
    }
  } catch (e) {
    log(`  Claude Code    settings.json cleanup skipped: ${e?.message ?? String(e)}`);
  }
}
function uninstallClaude() {
  try {
    requireClaudeCli();
  } catch {
    log("  Claude Code    skip uninstall \u2014 claude CLI not on PATH");
    return;
  }
  runClaude(["plugin", "disable", PLUGIN_KEY]);
  runClaude(["plugin", "uninstall", PLUGIN_KEY]);
  log("  Claude Code    plugin uninstalled");
}

// dist/src/cli/install-codex.js
import { existsSync as existsSync2, lstatSync, readFileSync as readFileSync2, rmSync, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { execFileSync as execFileSync2 } from "node:child_process";
import { join as join2 } from "node:path";

// dist/src/cli/agents-md.js
var HIVEMIND_BLOCK_START = "<!-- BEGIN hivemind-memory -->";
var HIVEMIND_BLOCK_END = "<!-- END hivemind-memory -->";
function upsertMarkedBlock(existing, block, start = HIVEMIND_BLOCK_START, end = HIVEMIND_BLOCK_END) {
  if (!existing)
    return `${block}
`;
  const first = findFirstBlock(existing, start, end);
  if (!first)
    return `${existing.trimEnd()}

${block}
`;
  const before = existing.slice(0, first.startIdx).trimEnd();
  const after = stripMarkedBlock(existing.slice(first.endIdx + end.length), start, end).replace(/^\n+/, "").trimEnd();
  const head = before ? `${before}

` : "";
  const tail = after ? `

${after}` : "";
  return `${head}${block}${tail}
`;
}
function stripMarkedBlock(existing, start = HIVEMIND_BLOCK_START, end = HIVEMIND_BLOCK_END) {
  let text = existing;
  for (; ; ) {
    const block = findFirstBlock(text, start, end);
    if (!block)
      return text;
    const before = text.slice(0, block.startIdx).trimEnd();
    const after = text.slice(block.endIdx + end.length).replace(/^\n+/, "");
    if (!before && !after)
      text = "";
    else if (!before)
      text = after;
    else if (!after)
      text = `${before}
`;
    else
      text = `${before}

${after}`;
  }
}
function findFirstBlock(text, start, end) {
  let from = 0;
  for (; ; ) {
    const startIdx = text.indexOf(start, from);
    if (startIdx === -1)
      return null;
    const endIdx = text.indexOf(end, startIdx);
    if (endIdx === -1)
      return null;
    const nextStart = text.indexOf(start, startIdx + start.length);
    if (nextStart !== -1 && nextStart < endIdx) {
      from = startIdx + start.length;
      continue;
    }
    return { startIdx, endIdx };
  }
}

// dist/src/cli/install-codex.js
var CODEX_HOME = join2(HOME, ".codex");
var PLUGIN_DIR = join2(CODEX_HOME, "hivemind");
var HOOKS_PATH = join2(CODEX_HOME, "hooks.json");
var AGENTS_SKILLS_DIR = join2(HOME, ".agents", "skills");
var SKILL_LINK = join2(AGENTS_SKILLS_DIR, "hivemind-memory");
var AGENTS_MD = join2(CODEX_HOME, "AGENTS.md");
var CODEX_AGENTS_BLOCK = `${HIVEMIND_BLOCK_START}
## Hivemind Memory

You have global team memory at \`~/.deeplake/memory/\`, shared across all sessions, users, and agents in your org. Proactively consult it before starting a task \u2014 and whenever the user asks you to recall, look up, or remember anything:

- Team rules: \`hivemind rules list\`
- Your open goals: \`hivemind goal list --mine\`
- Past sessions: start at \`~/.deeplake/memory/index.md\`, then read \`~/.deeplake/memory/summaries/<user>/<session>.md\`; only fall back to raw \`~/.deeplake/memory/sessions/<user>/*.jsonl\` when a summary lacks the detail.
- Keyword search: \`grep -ri "keyword" ~/.deeplake/memory/summaries/\` (use \`grep\`, NOT \`rg\`/ripgrep \u2014 it may not be installed).

Use only bash builtins (cat, ls, grep, jq, head, tail, sed, awk, wc, sort, find) to read this filesystem \u2014 rg/ripgrep, node, python, curl are not available there. Do not spawn subagents to read memory.
${HIVEMIND_BLOCK_END}`;
function hookCmd(bundleFile, timeout, matcher) {
  const block = {
    hooks: [{
      type: "command",
      command: `node "${join2(PLUGIN_DIR, "bundle", bundleFile)}"`,
      timeout
    }]
  };
  if (matcher)
    block.matcher = matcher;
  return block;
}
function buildHooksJson() {
  return {
    hooks: {
      SessionStart: [hookCmd("session-start.js", 10, "startup|resume")],
      UserPromptSubmit: [hookCmd("capture.js", 10)],
      PreToolUse: [hookCmd("pre-tool-use.js", 10, "Bash")],
      PostToolUse: [hookCmd("capture.js", 15)],
      // One Stop matcher-block with TWO commands — stop.js (capture) +
      // graph-on-stop.js (code-graph auto-build, G3). Single block (not two)
      // mirrors the static harnesses/codex/hooks/hooks.json and keeps one entry per
      // event for the merge/dedupe logic.
      Stop: [stopBlockWithGraph(30)]
    }
  };
}
function stopBlockWithGraph(timeout) {
  return {
    hooks: [
      { type: "command", command: `node "${join2(PLUGIN_DIR, "bundle", "stop.js")}"`, timeout },
      { type: "command", command: `node "${join2(PLUGIN_DIR, "bundle", "graph-on-stop.js")}"`, timeout }
    ]
  };
}
var HIVEMIND_BUNDLE_FILES = [
  "session-start.js",
  "session-start-setup.js",
  "capture.js",
  "pre-tool-use.js",
  "stop.js",
  "graph-on-stop.js",
  "wiki-worker.js"
];
function isHivemindHookEntry(entry, pluginDir = PLUGIN_DIR) {
  if (!entry || typeof entry !== "object")
    return false;
  const e = entry;
  const hooks = Array.isArray(e.hooks) ? e.hooks : [];
  return hooks.some((h) => {
    if (!h || typeof h !== "object")
      return false;
    const cmd = h.command;
    if (typeof cmd !== "string")
      return false;
    const nCmd = cmd.replace(/\\/g, "/");
    const nPluginDir = pluginDir.replace(/\\/g, "/");
    if (nCmd.includes(`${nPluginDir}/bundle/`))
      return true;
    return HIVEMIND_BUNDLE_FILES.some((f) => nCmd.includes(`/bundle/${f}`));
  });
}
function isForeignHivemindHookEntry(entry, pluginDir = PLUGIN_DIR) {
  if (!isHivemindHookEntry(entry, pluginDir))
    return false;
  const e = entry;
  const hooks = Array.isArray(e.hooks) ? e.hooks : [];
  return hooks.every((h) => {
    if (!h || typeof h !== "object")
      return false;
    const cmd = h.command;
    if (typeof cmd !== "string")
      return false;
    return !cmd.replace(/\\/g, "/").includes(`${pluginDir.replace(/\\/g, "/")}/bundle/`);
  });
}
function mergeHooks(existing, ours, pluginDir = PLUGIN_DIR) {
  const existingHooks = existing.hooks && typeof existing.hooks === "object" ? existing.hooks : {};
  const ourHooks = ours.hooks;
  const merged = {};
  for (const [event, entries] of Object.entries(existingHooks)) {
    const surviving = (entries ?? []).filter((e) => !isHivemindHookEntry(e, pluginDir));
    if (surviving.length)
      merged[event] = surviving;
  }
  for (const [event, entries] of Object.entries(ourHooks)) {
    merged[event] = [...merged[event] ?? [], ...entries ?? []];
  }
  return { ...existing, hooks: merged };
}
function mergeHooksJson(ours) {
  let existing = {};
  try {
    if (existsSync2(HOOKS_PATH)) {
      const parsed = JSON.parse(readFileSync2(HOOKS_PATH, "utf-8"));
      if (parsed && typeof parsed === "object")
        existing = parsed;
    }
  } catch {
    warn(`  Codex          ${HOOKS_PATH} unparseable \u2014 ignoring prior content`);
  }
  reportForeignHivemindHooks(existing);
  return mergeHooks(existing, ours);
}
function reportForeignHivemindHooks(existing) {
  const existingHooks = existing.hooks && typeof existing.hooks === "object" ? existing.hooks : {};
  const foreign = /* @__PURE__ */ new Set();
  for (const entries of Object.values(existingHooks)) {
    for (const e of entries ?? []) {
      if (!isForeignHivemindHookEntry(e))
        continue;
      const hooks = Array.isArray(e.hooks) ? e.hooks : [];
      for (const h of hooks) {
        const cmd = h?.command;
        if (typeof cmd === "string")
          foreign.add(cmd);
      }
    }
  }
  if (foreign.size === 0)
    return;
  warn(`  Codex          stripping ${foreign.size} hivemind hook(s) from a non-canonical path:`);
  for (const cmd of foreign)
    warn(`                   ${cmd}`);
  warn(`                 (these were probably leftover from a local dev clone \u2014 re-add them manually if intentional)`);
}
function tryEnableCodexHooks() {
  let enabled = false;
  try {
    execFileSync2("codex", ["features", "enable", "hooks"], { stdio: "ignore" });
    enabled = true;
  } catch {
  }
  if (enabled)
    stripLegacyCodexHooksKey();
}
function stripLegacyCodexHooksKey() {
  const cfgPath = join2(CODEX_HOME, "config.toml");
  if (!existsSync2(cfgPath))
    return;
  try {
    const original = readFileSync2(cfgPath, "utf-8");
    const cleaned = original.replace(/^[ \t]*codex_hooks[ \t]*=[^\n]*\r?\n?/gm, "");
    if (cleaned !== original)
      writeFileSync2(cfgPath, cleaned);
  } catch {
  }
}
function readFileOrNull(path) {
  try {
    return readFileSync2(path, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT")
      return null;
    throw e;
  }
}
function writeCodexAgentsBlock() {
  const prior = readFileOrNull(AGENTS_MD);
  const next = upsertMarkedBlock(prior, CODEX_AGENTS_BLOCK);
  if (next === prior)
    return;
  writeFileSync2(AGENTS_MD, next);
  log(`  Codex          AGENTS.md memory block ${prior ? "updated" : "created"} -> ${AGENTS_MD}`);
}
function removeCodexAgentsBlock() {
  const prior = readFileOrNull(AGENTS_MD);
  if (prior === null)
    return;
  const stripped = stripMarkedBlock(prior);
  if (stripped === prior)
    return;
  if (stripped.trim().length === 0) {
    rmSync(AGENTS_MD, { force: true });
    log(`  Codex          removed empty ${AGENTS_MD}`);
  } else {
    writeFileSync2(AGENTS_MD, stripped);
    log(`  Codex          stripped hivemind block from ${AGENTS_MD}`);
  }
}
function installCodex() {
  const srcBundle = join2(pkgRoot(), "harnesses", "codex", "bundle");
  const srcSkills = join2(pkgRoot(), "harnesses", "codex", "skills");
  if (!existsSync2(srcBundle)) {
    throw new Error(`Codex bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }
  ensureDir(PLUGIN_DIR);
  copyDir(srcBundle, join2(PLUGIN_DIR, "bundle"));
  if (existsSync2(srcSkills))
    copyDir(srcSkills, join2(PLUGIN_DIR, "skills"));
  tryEnableCodexHooks();
  if (!writeJsonIfChanged(HOOKS_PATH, mergeHooksJson(buildHooksJson()))) {
    log(`  Codex          hooks.json unchanged \u2014 skipped rewrite (no re-trust prompt)`);
  }
  ensureDir(AGENTS_SKILLS_DIR);
  const skillTarget = join2(PLUGIN_DIR, "skills", "deeplake-memory");
  if (existsSync2(skillTarget)) {
    symlinkForce(skillTarget, SKILL_LINK);
  } else {
    warn(`  Codex          skill source missing at ${skillTarget}; skipping symlink`);
  }
  const pluginNm = join2(PLUGIN_DIR, "node_modules");
  const embedDepsNm = join2(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync2(embedDepsNm)) {
    try {
      const st = lstatSync(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink())
        rmSync(pluginNm, { recursive: true });
    } catch {
    }
    symlinkForce(embedDepsNm, pluginNm);
  }
  writeCodexAgentsBlock();
  writeVersionStamp(PLUGIN_DIR, getVersion());
  log(`  Codex          installed -> ${PLUGIN_DIR}`);
}
function uninstallCodex() {
  if (existsSync2(HOOKS_PATH)) {
    let existing = {};
    try {
      const raw = JSON.parse(readFileSync2(HOOKS_PATH, "utf-8"));
      if (raw && typeof raw === "object")
        existing = raw;
    } catch {
      unlinkSync(HOOKS_PATH);
      log(`  Codex          removed unparseable ${HOOKS_PATH}`);
      existing = {};
    }
    if (Object.keys(existing).length > 0) {
      const stripped = mergeHooks(existing, { hooks: {} });
      const survivingHooks = stripped.hooks ?? {};
      const otherTopLevelKeys = Object.keys(stripped).filter((k) => k !== "hooks");
      if (Object.keys(survivingHooks).length === 0 && otherTopLevelKeys.length === 0) {
        unlinkSync(HOOKS_PATH);
        log(`  Codex          removed ${HOOKS_PATH}`);
      } else {
        writeJson(HOOKS_PATH, stripped);
        log(`  Codex          stripped hivemind hooks from ${HOOKS_PATH}`);
      }
    }
  }
  if (existsSync2(SKILL_LINK)) {
    unlinkSync(SKILL_LINK);
    log(`  Codex          removed ${SKILL_LINK}`);
  }
  removeCodexAgentsBlock();
  log(`  Codex          plugin files kept at ${PLUGIN_DIR}`);
}

// dist/src/cli/install-openclaw.js
import { existsSync as existsSync4, copyFileSync, rmSync as rmSync2, lstatSync as lstatSync2 } from "node:fs";
import { join as join4 } from "node:path";

// dist/harnesses/openclaw/src/setup-config.js
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3, renameSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
var HIVEMIND_CORE_ALLOWLIST_TOOLS = [
  "hivemind_search",
  "hivemind_read",
  "hivemind_index"
];
function getOpenclawConfigPath() {
  return join3(homedir2(), ".openclaw", "openclaw.json");
}
function isAllowlistCoveringHivemind(alsoAllow) {
  if (!Array.isArray(alsoAllow))
    return false;
  for (const entry of alsoAllow) {
    if (typeof entry !== "string")
      continue;
    const normalized = entry.trim().toLowerCase();
    if (normalized === "hivemind")
      return true;
    if (normalized === "group:plugins")
      return true;
    if (HIVEMIND_CORE_ALLOWLIST_TOOLS.includes(normalized))
      return true;
  }
  return false;
}
function isPluginsAllowMissingHivemind(allow) {
  return Array.isArray(allow) && allow.length > 0 && !allow.includes("hivemind");
}
function ensureHivemindAllowlisted() {
  const configPath2 = getOpenclawConfigPath();
  if (!existsSync3(configPath2)) {
    return { status: "error", configPath: configPath2, error: "openclaw config file not found" };
  }
  let parsed;
  try {
    const raw = readFileSync3(configPath2, "utf-8");
    parsed = JSON.parse(raw);
  } catch (e) {
    return { status: "error", configPath: configPath2, error: `could not read/parse config: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "error", configPath: configPath2, error: "openclaw config is not a JSON object" };
  }
  const plugins = parsed.plugins ?? {};
  const pluginsAllowRaw = plugins.allow;
  const tools = parsed.tools ?? {};
  const alsoAllowRaw = tools.alsoAllow;
  const pluginsAllowNeedsPatch = isPluginsAllowMissingHivemind(pluginsAllowRaw);
  const toolsAlsoAllowNeedsPatch = Array.isArray(alsoAllowRaw) && alsoAllowRaw.length > 0 && !isAllowlistCoveringHivemind(alsoAllowRaw);
  if (!pluginsAllowNeedsPatch && !toolsAlsoAllowNeedsPatch) {
    return { status: "already-set", configPath: configPath2 };
  }
  const updated = { ...parsed };
  if (pluginsAllowNeedsPatch) {
    updated.plugins = {
      ...plugins,
      // Cast safe — isPluginsAllowMissingHivemind guarantees Array.
      allow: [...pluginsAllowRaw, "hivemind"]
    };
  }
  if (toolsAlsoAllowNeedsPatch) {
    updated.tools = {
      ...tools,
      // Cast safe — the needs-patch check above guarantees Array.
      alsoAllow: [...alsoAllowRaw, "hivemind"]
    };
  }
  const backupPath = `${configPath2}.bak-hivemind-${Date.now()}`;
  const tmpPath = `${configPath2}.tmp-hivemind-${process.pid}`;
  try {
    writeFileSync3(backupPath, readFileSync3(configPath2, "utf-8"));
    writeFileSync3(tmpPath, JSON.stringify(updated, null, 2) + "\n");
    renameSync(tmpPath, configPath2);
  } catch (e) {
    return { status: "error", configPath: configPath2, error: `could not write config: ${e instanceof Error ? e.message : String(e)}` };
  }
  return {
    status: "added",
    configPath: configPath2,
    backupPath,
    delta: {
      pluginsAllow: pluginsAllowNeedsPatch,
      toolsAlsoAllow: toolsAlsoAllowNeedsPatch
    }
  };
}

// dist/src/cli/install-openclaw.js
var PLUGIN_DIR2 = join4(HOME, ".openclaw", "extensions", "hivemind");
function installOpenclaw() {
  const srcDist = join4(pkgRoot(), "harnesses", "openclaw", "dist");
  const srcManifest = join4(pkgRoot(), "harnesses", "openclaw", "openclaw.plugin.json");
  const srcPkg = join4(pkgRoot(), "harnesses", "openclaw", "package.json");
  const srcSkills = join4(pkgRoot(), "harnesses", "openclaw", "skills");
  if (!existsSync4(srcDist)) {
    throw new Error(`OpenClaw bundle missing at ${srcDist}. Run 'npm run build' first.`);
  }
  ensureDir(PLUGIN_DIR2);
  rmSync2(join4(PLUGIN_DIR2, "dist"), { recursive: true, force: true });
  copyDir(srcDist, join4(PLUGIN_DIR2, "dist"));
  if (existsSync4(srcManifest))
    copyFileSync(srcManifest, join4(PLUGIN_DIR2, "openclaw.plugin.json"));
  if (existsSync4(srcPkg))
    copyFileSync(srcPkg, join4(PLUGIN_DIR2, "package.json"));
  if (existsSync4(srcSkills))
    copyDir(srcSkills, join4(PLUGIN_DIR2, "skills"));
  const pluginNm = join4(PLUGIN_DIR2, "node_modules");
  const embedDepsNm = join4(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync4(embedDepsNm)) {
    try {
      const st = lstatSync2(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink())
        rmSync2(pluginNm, { recursive: true });
    } catch {
    }
    symlinkForce(embedDepsNm, pluginNm);
  } else {
    warn(`  OpenClaw       graph workers need tree-sitter native deps at ${embedDepsNm} \u2014 run \`hivemind embeddings install\`, then \`hivemind claw install\` again`);
  }
  writeVersionStamp(PLUGIN_DIR2, getVersion());
  log(`  OpenClaw       installed -> ${PLUGIN_DIR2}`);
  const result = ensureHivemindAllowlisted();
  if (result.status === "added") {
    const touched = [];
    if (result.delta.pluginsAllow)
      touched.push("plugins.allow");
    if (result.delta.toolsAlsoAllow)
      touched.push("tools.alsoAllow");
    log(`  OpenClaw       patched ${touched.join(" + ")} in ${result.configPath}`);
    log(`  OpenClaw       backup: ${result.backupPath}`);
    log(`  OpenClaw       restart the gateway to activate: systemctl --user restart openclaw-gateway.service`);
    log(`  OpenClaw       capture starts on the NEXT turn \u2014 earlier turns are NOT backfilled`);
  } else if (result.status === "already-set") {
    log(`  OpenClaw       allowlist already covers hivemind in ${result.configPath}`);
  } else if (result.status === "error") {
    if (result.error === "openclaw config file not found") {
      log(`  OpenClaw       openclaw.json not present at ${result.configPath} \u2014 run openclaw once, then \`hivemind claw install\` again`);
    } else {
      warn(`  OpenClaw       could not patch allowlist in ${result.configPath}: ${result.error}`);
    }
  }
}
function uninstallOpenclaw() {
  if (existsSync4(PLUGIN_DIR2)) {
    rmSync2(PLUGIN_DIR2, { recursive: true, force: true });
    log(`  OpenClaw       removed ${PLUGIN_DIR2}`);
  } else {
    log(`  OpenClaw       nothing to remove`);
  }
}

// dist/src/cli/install-cursor.js
import { existsSync as existsSync5, lstatSync as lstatSync3, rmSync as rmSync3, unlinkSync as unlinkSync2 } from "node:fs";
import { join as join5 } from "node:path";
var CURSOR_HOME = join5(HOME, ".cursor");
var PLUGIN_DIR3 = join5(CURSOR_HOME, "hivemind");
var HOOKS_PATH2 = join5(CURSOR_HOME, "hooks.json");
var HIVEMIND_MARKER_KEY = "_hivemindManaged";
function buildHookCmd(bundleFile, timeout) {
  return {
    type: "command",
    command: `node "${join5(PLUGIN_DIR3, "bundle", bundleFile)}"`,
    timeout
  };
}
function buildHookCmdShellMatcher(bundleFile, timeout) {
  return {
    type: "command",
    command: `node "${join5(PLUGIN_DIR3, "bundle", bundleFile)}"`,
    timeout,
    matcher: "Shell"
  };
}
function buildHookConfig() {
  return {
    sessionStart: [buildHookCmd("session-start.js", 30)],
    beforeSubmitPrompt: [buildHookCmd("capture.js", 10)],
    // preToolUse with Shell matcher rewrites grep/rg against ~/.deeplake/memory/
    // into a single SQL fast-path call, matching Claude Code / Codex accuracy.
    preToolUse: [buildHookCmdShellMatcher("pre-tool-use.js", 30)],
    postToolUse: [buildHookCmd("capture.js", 15)],
    afterAgentResponse: [buildHookCmd("capture.js", 15)],
    // graph-on-stop: auto-build the code graph (A1 Cursor parity). Same hook
    // Claude Code registers under Stop + SessionEnd. It's gated (rate limit +
    // HEAD-changed + source-diff) so the common path is a ~5ms skip, and runs
    // async so it never blocks Cursor.
    stop: [buildHookCmd("capture.js", 15), buildHookCmd("graph-on-stop.js", 30)],
    sessionEnd: [buildHookCmd("session-end.js", 30), buildHookCmd("graph-on-stop.js", 30)]
  };
}
function isHivemindEntry(entry) {
  if (!entry || typeof entry !== "object")
    return false;
  const cmd = entry.command;
  if (typeof cmd !== "string")
    return false;
  return cmd.replace(/\\/g, "/").includes("/.cursor/hivemind/bundle/");
}
function mergeHooks2(existing) {
  const root = existing ?? { version: 1, hooks: {} };
  if (!root.version)
    root.version = 1;
  if (!root.hooks)
    root.hooks = {};
  const ours = buildHookConfig();
  for (const [event, entries] of Object.entries(ours)) {
    const prior = Array.isArray(root.hooks[event]) ? root.hooks[event] : [];
    const stripped = prior.filter((e) => !isHivemindEntry(e));
    root.hooks[event] = [...stripped, ...entries];
  }
  root[HIVEMIND_MARKER_KEY] = { version: getVersion() };
  return root;
}
function stripHooksFromConfig(existing) {
  if (!existing)
    return null;
  const root = existing;
  if (root.hooks) {
    for (const event of Object.keys(root.hooks)) {
      root.hooks[event] = (root.hooks[event] ?? []).filter((e) => !isHivemindEntry(e));
      if (root.hooks[event].length === 0)
        delete root.hooks[event];
    }
    if (Object.keys(root.hooks).length === 0)
      delete root.hooks;
  }
  delete existing[HIVEMIND_MARKER_KEY];
  return existing;
}
function installCursor() {
  const srcBundle = join5(pkgRoot(), "harnesses", "cursor", "bundle");
  if (!existsSync5(srcBundle)) {
    throw new Error(`Cursor bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }
  ensureDir(PLUGIN_DIR3);
  copyDir(srcBundle, join5(PLUGIN_DIR3, "bundle"));
  const existing = readJson(HOOKS_PATH2);
  const merged = mergeHooks2(existing);
  writeJsonIfChanged(HOOKS_PATH2, merged);
  const pluginNm = join5(PLUGIN_DIR3, "node_modules");
  const embedDepsNm = join5(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync5(embedDepsNm)) {
    try {
      const st = lstatSync3(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink())
        rmSync3(pluginNm, { recursive: true });
    } catch {
    }
    symlinkForce(embedDepsNm, pluginNm);
  }
  writeVersionStamp(PLUGIN_DIR3, getVersion());
  log(`  Cursor         installed -> ${PLUGIN_DIR3}`);
}
function uninstallCursor() {
  const existing = readJson(HOOKS_PATH2);
  if (!existing) {
    log("  Cursor         no hooks.json to clean");
    return;
  }
  const stripped = stripHooksFromConfig(existing);
  const meaningfulKeys = stripped ? Object.keys(stripped).filter((k) => k !== "version").length : 0;
  if (!stripped || meaningfulKeys === 0) {
    if (existsSync5(HOOKS_PATH2))
      unlinkSync2(HOOKS_PATH2);
  } else {
    writeJson(HOOKS_PATH2, stripped);
  }
  log(`  Cursor         hooks removed from ${HOOKS_PATH2} (plugin files kept at ${PLUGIN_DIR3})`);
}

// dist/src/cli/install-hermes.js
import { existsSync as existsSync7, lstatSync as lstatSync4, writeFileSync as writeFileSync4, readFileSync as readFileSync4, rmSync as rmSync4, unlinkSync as unlinkSync3 } from "node:fs";
import { join as join7 } from "node:path";

// node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// dist/src/cli/install-mcp-shared.js
import { existsSync as existsSync6 } from "node:fs";
import { join as join6 } from "node:path";
var HIVEMIND_DIR = join6(HOME, ".hivemind");
var MCP_DIR = join6(HIVEMIND_DIR, "mcp");
var MCP_SERVER_PATH = join6(MCP_DIR, "server.js");
var MCP_PACKAGE_JSON = join6(MCP_DIR, "package.json");
function ensureMcpServerInstalled() {
  const srcDir = join6(pkgRoot(), "mcp", "bundle");
  if (!existsSync6(srcDir)) {
    throw new Error(`MCP server bundle missing at ${srcDir}. Run 'npm run build' to produce it before installing Tier B consumers.`);
  }
  ensureDir(MCP_DIR);
  copyDir(srcDir, MCP_DIR);
  writeVersionStamp(HIVEMIND_DIR, getVersion());
  log(`  hivemind-mcp   server installed -> ${MCP_SERVER_PATH}`);
}
function buildMcpServerEntry() {
  return {
    command: "node",
    args: [MCP_SERVER_PATH]
  };
}

// dist/src/cli/install-hermes.js
var HERMES_HOME = join7(HOME, ".hermes");
var SKILLS_DIR = join7(HERMES_HOME, "skills", "hivemind-memory");
var HIVEMIND_DIR2 = join7(HERMES_HOME, "hivemind");
var BUNDLE_DIR = join7(HIVEMIND_DIR2, "bundle");
var CONFIG_PATH = join7(HERMES_HOME, "config.yaml");
var SERVER_KEY = "hivemind";
var SKILL_BODY = `---
name: hivemind-memory
description: Global team and org memory powered by Activeloop. ALWAYS check BOTH built-in memory AND Hivemind memory when recalling information.
---

# Hivemind Memory

You have persistent memory at \`~/.deeplake/memory/\` \u2014 global memory shared across all sessions, users, and agents in the org.

## Hivemind tools (preferred)

When you need to recall org memory, prefer calling the hivemind MCP tools \u2014 one tool call returns ranked hits across all summaries and sessions in a single SQL query:

- \`hivemind_search { query, limit? }\` \u2014 keyword/regex search across summaries + sessions
- \`hivemind_read { path }\` \u2014 read full content at a Hivemind memory path (e.g. \`/summaries/alice/abc.md\`)
- \`hivemind_index { prefix?, limit? }\` \u2014 list summary entries

Different paths under \`/summaries/<username>/\` are different users \u2014 do NOT merge or alias them.

## Direct filesystem fallback

If MCP tools are unavailable for some reason, fall back to reading the virtual filesystem at \`~/.deeplake/memory/\`:

\`\`\`
~/.deeplake/memory/
\u251C\u2500\u2500 index.md                          \u2190 START HERE \u2014 table of all sessions
\u251C\u2500\u2500 summaries/
\u2502   \u251C\u2500\u2500 session-abc.md                \u2190 AI-generated wiki summary
\u2502   \u2514\u2500\u2500 session-xyz.md
\u2514\u2500\u2500 sessions/
    \u2514\u2500\u2500 username/
        \u251C\u2500\u2500 user_org_ws_slug1.jsonl   \u2190 raw session data
        \u2514\u2500\u2500 user_org_ws_slug2.jsonl
\`\`\`

1. **First**: Read \`~/.deeplake/memory/index.md\`
2. **If you need details**: Read the specific summary at \`~/.deeplake/memory/summaries/<session>.md\`
3. **If you need raw data**: Read the session JSONL at \`~/.deeplake/memory/sessions/<user>/<file>.jsonl\`
4. **Keyword search**: \`grep -r "keyword" ~/.deeplake/memory/\` (use \`grep\`, NOT \`rg\`/ripgrep \u2014 \`rg\` may not be installed)

Do NOT jump straight to reading raw JSONL files. Always start with index.md and summaries.

## Important Constraints

- Use \`grep\` (NOT \`rg\`/ripgrep) for keyword search \u2014 \`rg\` may not be installed on the host system.
- Only use these bash builtins to interact with \`~/.deeplake/memory/\`: \`cat\`, \`ls\`, \`grep\`, \`echo\`, \`jq\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, \`wc\`, \`sort\`, \`find\`. The memory filesystem does NOT support \`rg\`, \`python\`, \`python3\`, \`node\`, or \`curl\`.
- If a file returns empty after 2 attempts, skip it and move on. Report what you found rather than retrying exhaustively.
`;
function isHivemindHook(entry) {
  if (!entry || typeof entry !== "object")
    return false;
  const cmd = entry.command;
  if (typeof cmd !== "string")
    return false;
  return cmd.replace(/\\/g, "/").includes("/.hermes/hivemind/bundle/");
}
function buildHookEntry(bundleFile, timeout, matcher) {
  const entry = {
    command: `node ${join7(BUNDLE_DIR, bundleFile)}`,
    timeout
  };
  if (matcher)
    entry.matcher = matcher;
  return entry;
}
function buildHooksBlock() {
  return {
    on_session_start: [buildHookEntry("session-start.js", 30)],
    // pre_tool_call (matcher: terminal) intercepts grep/rg against
    // ~/.deeplake/memory/ and replies with a single SQL fast-path result.
    // Belt-and-suspenders alongside the hivemind_search MCP tool — if the
    // agent ignores the skill guidance and runs a terminal grep, accuracy
    // still matches Tier 1 (Claude / Codex / Cursor).
    pre_tool_call: [buildHookEntry("pre-tool-use.js", 30, "terminal")],
    pre_llm_call: [buildHookEntry("capture.js", 10)],
    post_tool_call: [buildHookEntry("capture.js", 15)],
    post_llm_call: [buildHookEntry("capture.js", 15)],
    // graph-on-stop: code-graph auto-build parity (G3), same gated hook as the
    // other agents. on_session_end is Hermes's session-close event (analogous
    // to Claude Code's SessionEnd).
    on_session_end: [buildHookEntry("session-end.js", 30), buildHookEntry("graph-on-stop.js", 30)]
  };
}
function mergeHooks3(existing) {
  const merged = { ...existing ?? {} };
  const ours = buildHooksBlock();
  for (const [event, entries] of Object.entries(ours)) {
    const prior = Array.isArray(merged[event]) ? merged[event] : [];
    const stripped = prior.filter((e) => !isHivemindHook(e));
    merged[event] = [...stripped, ...entries];
  }
  return merged;
}
function stripHivemindHooks(existing) {
  if (!existing)
    return void 0;
  const out = {};
  for (const [event, entries] of Object.entries(existing)) {
    const kept = (entries ?? []).filter((e) => !isHivemindHook(e));
    if (kept.length > 0)
      out[event] = kept;
  }
  return Object.keys(out).length > 0 ? out : void 0;
}
function readConfig() {
  if (!existsSync7(CONFIG_PATH))
    return {};
  try {
    const raw = readFileSync4(CONFIG_PATH, "utf-8");
    const parsed = load(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}
function writeConfig(cfg) {
  ensureDir(HERMES_HOME);
  const dumped = dump(cfg, { lineWidth: 100, noRefs: true });
  writeFileSync4(CONFIG_PATH, dumped);
}
function installHermes() {
  ensureDir(SKILLS_DIR);
  writeFileSync4(join7(SKILLS_DIR, "SKILL.md"), SKILL_BODY);
  writeVersionStamp(SKILLS_DIR, getVersion());
  log(`  Hermes         skill installed -> ${SKILLS_DIR}`);
  const srcBundle = join7(pkgRoot(), "harnesses", "hermes", "bundle");
  if (!existsSync7(srcBundle)) {
    throw new Error(`Hermes bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }
  ensureDir(HIVEMIND_DIR2);
  copyDir(srcBundle, BUNDLE_DIR);
  const pluginNm = join7(HIVEMIND_DIR2, "node_modules");
  const embedDepsNm = join7(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync7(embedDepsNm)) {
    try {
      const st = lstatSync4(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink())
        rmSync4(pluginNm, { recursive: true });
    } catch {
    }
    symlinkForce(embedDepsNm, pluginNm);
  }
  writeVersionStamp(HIVEMIND_DIR2, getVersion());
  log(`  Hermes         bundle installed -> ${BUNDLE_DIR}`);
  ensureMcpServerInstalled();
  const cfg = readConfig();
  if (!cfg.mcp_servers || typeof cfg.mcp_servers !== "object")
    cfg.mcp_servers = {};
  cfg.mcp_servers[SERVER_KEY] = {
    command: "node",
    args: [MCP_SERVER_PATH]
  };
  cfg.hooks = mergeHooks3(cfg.hooks);
  cfg.hooks_auto_accept = true;
  writeConfig(cfg);
  log(`  Hermes         config updated -> ${CONFIG_PATH} (mcp_servers + hooks + hooks_auto_accept)`);
}
function uninstallHermes() {
  if (existsSync7(SKILLS_DIR)) {
    rmSync4(SKILLS_DIR, { recursive: true, force: true });
    log(`  Hermes         removed ${SKILLS_DIR}`);
  }
  if (existsSync7(HIVEMIND_DIR2)) {
    rmSync4(HIVEMIND_DIR2, { recursive: true, force: true });
    log(`  Hermes         removed ${HIVEMIND_DIR2}`);
  }
  if (existsSync7(CONFIG_PATH)) {
    const cfg = readConfig();
    let touched = false;
    if (cfg.mcp_servers && typeof cfg.mcp_servers === "object" && SERVER_KEY in cfg.mcp_servers) {
      delete cfg.mcp_servers[SERVER_KEY];
      if (Object.keys(cfg.mcp_servers).length === 0)
        delete cfg.mcp_servers;
      touched = true;
    }
    const stripped = stripHivemindHooks(cfg.hooks);
    if (cfg.hooks && (!stripped || Object.keys(stripped).length !== Object.keys(cfg.hooks).length)) {
      if (stripped)
        cfg.hooks = stripped;
      else
        delete cfg.hooks;
      touched = true;
    }
    if ("hooks_auto_accept" in cfg) {
      delete cfg.hooks_auto_accept;
      touched = true;
    }
    if (touched) {
      if (Object.keys(cfg).length === 0) {
        unlinkSync3(CONFIG_PATH);
      } else {
        writeConfig(cfg);
      }
      log(`  Hermes         hivemind entries removed from ${CONFIG_PATH}`);
    }
  }
}

// dist/src/cli/install-cowork.js
import { existsSync as existsSync8, readFileSync as readFileSync5, writeFileSync as writeFileSync5, unlinkSync as unlinkSync4 } from "node:fs";
import { join as join8 } from "node:path";
var CONFIG_DIR = claudeDesktopConfigDir();
var CONFIG_PATH2 = join8(CONFIG_DIR, "claude_desktop_config.json");
var SERVER_KEY2 = "hivemind";
function readConfig2() {
  if (!existsSync8(CONFIG_PATH2))
    return {};
  const txt = readFileSync5(CONFIG_PATH2, "utf-8").trim();
  if (!txt)
    return {};
  let parsed;
  try {
    parsed = JSON.parse(txt);
  } catch {
    throw new Error(`claude_desktop_config.json at ${CONFIG_PATH2} is not valid JSON. Fix or remove it, then rerun.`);
  }
  return parsed && typeof parsed === "object" ? parsed : {};
}
function writeConfig2(cfg) {
  ensureDir(CONFIG_DIR);
  writeFileSync5(CONFIG_PATH2, JSON.stringify(cfg, null, 2) + "\n");
}
function installCowork() {
  ensureMcpServerInstalled();
  const cfg = readConfig2();
  const servers = cfg.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : {};
  servers[SERVER_KEY2] = buildMcpServerEntry();
  cfg.mcpServers = servers;
  writeConfig2(cfg);
  log(`  Claude Cowork  config updated -> ${CONFIG_PATH2} (mcpServers.${SERVER_KEY2})`);
}
function uninstallCowork() {
  if (!existsSync8(CONFIG_PATH2))
    return;
  let cfg;
  try {
    cfg = readConfig2();
  } catch {
    return;
  }
  const servers = cfg.mcpServers;
  if (!servers || typeof servers !== "object" || !(SERVER_KEY2 in servers))
    return;
  delete servers[SERVER_KEY2];
  if (Object.keys(servers).length === 0)
    delete cfg.mcpServers;
  if (Object.keys(cfg).length === 0) {
    unlinkSync4(CONFIG_PATH2);
  } else {
    writeConfig2(cfg);
  }
  log(`  Claude Cowork  hivemind entry removed from ${CONFIG_PATH2}`);
}

// dist/src/cli/install-pi.js
import { existsSync as existsSync9, writeFileSync as writeFileSync6, rmSync as rmSync5, readFileSync as readFileSync6, copyFileSync as copyFileSync2 } from "node:fs";
import { join as join9 } from "node:path";
var PI_AGENT_DIR = join9(HOME, ".pi", "agent");
var AGENTS_MD2 = join9(PI_AGENT_DIR, "AGENTS.md");
var LEGACY_SKILL_DIR = join9(PI_AGENT_DIR, "skills", "hivemind-memory");
var EXTENSIONS_DIR = join9(PI_AGENT_DIR, "extensions");
var EXTENSION_PATH = join9(EXTENSIONS_DIR, "hivemind.ts");
var VERSION_DIR = join9(PI_AGENT_DIR, ".hivemind");
var WIKI_WORKER_DIR = join9(PI_AGENT_DIR, "hivemind");
var WIKI_WORKER_PATH = join9(WIKI_WORKER_DIR, "wiki-worker.js");
var SKILLIFY_WORKER_PATH = join9(WIKI_WORKER_DIR, "skillify-worker.js");
var AUTOPULL_WORKER_PATH = join9(WIKI_WORKER_DIR, "autopull-worker.js");
var SKILLOPT_WORKER_PATH = join9(WIKI_WORKER_DIR, "skillopt-worker.js");
var NOTIFICATIONS_WORKER_PATH = join9(WIKI_WORKER_DIR, "notifications-worker.js");
var HIVEMIND_BLOCK_BODY = `${HIVEMIND_BLOCK_START}
## Hivemind Memory

You have access to global org memory at \`~/.deeplake/memory/\`. Always check both
your local context AND Hivemind memory when the user asks you to recall, look up,
or remember anything.

- Three hivemind tools are registered: \`hivemind_search\`, \`hivemind_read\`, \`hivemind_index\`. **Prefer these** \u2014 one call returns ranked hits in a single SQL query.
- Fall back to direct filesystem if the tools fail:
- Start with \`~/.deeplake/memory/index.md\` (table of all sessions)
- Then read specific summaries at \`~/.deeplake/memory/summaries/<user>/<session>.md\`
- Only fall back to raw \`~/.deeplake/memory/sessions/<user>/*.jsonl\` if summaries don't have enough detail
- Search: use \`grep\` (NOT \`rg\`/ripgrep \u2014 \`rg\` is not always installed). Example: \`grep -ri "keyword" ~/.deeplake/memory/\`

Use only bash builtins (cat, ls, grep, jq, head, tail, sed, awk, wc, sort, find) to read this filesystem \u2014
rg/ripgrep, node, python, curl are not available there.
${HIVEMIND_BLOCK_END}`;
function upsertHivemindBlock(existing) {
  return upsertMarkedBlock(existing, HIVEMIND_BLOCK_BODY);
}
function stripHivemindBlock(existing) {
  return stripMarkedBlock(existing);
}
function installPi() {
  ensureDir(PI_AGENT_DIR);
  if (existsSync9(LEGACY_SKILL_DIR)) {
    rmSync5(LEGACY_SKILL_DIR, { recursive: true, force: true });
  }
  const prior = existsSync9(AGENTS_MD2) ? readFileSync6(AGENTS_MD2, "utf-8") : null;
  const next = upsertHivemindBlock(prior);
  writeFileSync6(AGENTS_MD2, next);
  const srcExtension = join9(pkgRoot(), "harnesses", "pi", "extension-source", "hivemind.ts");
  if (!existsSync9(srcExtension)) {
    throw new Error(`pi extension source missing at ${srcExtension}. Reinstall the @deeplake/hivemind package.`);
  }
  ensureDir(EXTENSIONS_DIR);
  copyFileSync2(srcExtension, EXTENSION_PATH);
  const srcWorker = join9(pkgRoot(), "harnesses", "pi", "bundle", "wiki-worker.js");
  if (existsSync9(srcWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcWorker, WIKI_WORKER_PATH);
  }
  const srcSkillifyWorker = join9(pkgRoot(), "harnesses", "pi", "bundle", "skillify-worker.js");
  if (existsSync9(srcSkillifyWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcSkillifyWorker, SKILLIFY_WORKER_PATH);
  }
  const srcAutopullWorker = join9(pkgRoot(), "harnesses", "pi", "bundle", "autopull-worker.js");
  if (existsSync9(srcAutopullWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcAutopullWorker, AUTOPULL_WORKER_PATH);
  }
  const srcSkilloptWorker = join9(pkgRoot(), "harnesses", "pi", "bundle", "skillopt-worker.js");
  if (existsSync9(srcSkilloptWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcSkilloptWorker, SKILLOPT_WORKER_PATH);
  }
  const srcNotificationsWorker = join9(pkgRoot(), "harnesses", "pi", "bundle", "notifications-worker.js");
  if (existsSync9(srcNotificationsWorker)) {
    ensureDir(WIKI_WORKER_DIR);
    copyFileSync2(srcNotificationsWorker, NOTIFICATIONS_WORKER_PATH);
  }
  ensureDir(VERSION_DIR);
  writeVersionStamp(VERSION_DIR, getVersion());
  log(`  pi             AGENTS.md updated -> ${AGENTS_MD2}`);
  log(`  pi             extension installed -> ${EXTENSION_PATH}`);
  if (existsSync9(WIKI_WORKER_PATH)) {
    log(`  pi             wiki-worker installed -> ${WIKI_WORKER_PATH}`);
  }
  if (existsSync9(SKILLIFY_WORKER_PATH)) {
    log(`  pi             skillify-worker installed -> ${SKILLIFY_WORKER_PATH}`);
  }
  if (existsSync9(AUTOPULL_WORKER_PATH)) {
    log(`  pi             autopull-worker installed -> ${AUTOPULL_WORKER_PATH}`);
  }
  if (existsSync9(SKILLOPT_WORKER_PATH)) {
    log(`  pi             skillopt-worker installed -> ${SKILLOPT_WORKER_PATH}`);
  }
}
function uninstallPi() {
  if (existsSync9(LEGACY_SKILL_DIR)) {
    rmSync5(LEGACY_SKILL_DIR, { recursive: true, force: true });
    log(`  pi             removed ${LEGACY_SKILL_DIR}`);
  }
  if (existsSync9(EXTENSION_PATH)) {
    rmSync5(EXTENSION_PATH, { force: true });
    log(`  pi             removed extension ${EXTENSION_PATH}`);
  }
  if (existsSync9(WIKI_WORKER_DIR)) {
    rmSync5(WIKI_WORKER_DIR, { recursive: true, force: true });
    log(`  pi             removed wiki-worker dir ${WIKI_WORKER_DIR}`);
  }
  if (existsSync9(AGENTS_MD2)) {
    const prior = readFileSync6(AGENTS_MD2, "utf-8");
    const stripped = stripHivemindBlock(prior);
    if (stripped.trim().length === 0) {
      rmSync5(AGENTS_MD2, { force: true });
      log(`  pi             removed empty ${AGENTS_MD2}`);
    } else {
      writeFileSync6(AGENTS_MD2, stripped);
      log(`  pi             stripped hivemind block from ${AGENTS_MD2}`);
    }
  }
  if (existsSync9(VERSION_DIR)) {
    rmSync5(VERSION_DIR, { recursive: true, force: true });
  }
}

// dist/src/cli/embeddings.js
import { copyFileSync as copyFileSync3, chmodSync, existsSync as existsSync11, lstatSync as lstatSync5, readdirSync, readFileSync as readFileSync8, readlinkSync, rmSync as rmSync7, statSync as statSync2, unlinkSync as unlinkSync5 } from "node:fs";
import { execFileSync as execFileSync4, spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import { join as join11 } from "node:path";

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

// dist/src/cli/graph-deps.js
import { execFileSync as execFileSync3 } from "node:child_process";
import { existsSync as existsSync10, mkdirSync, readFileSync as readFileSync7, rmSync as rmSync6, statSync, utimesSync, writeFileSync as writeFileSync7 } from "node:fs";
import { randomBytes } from "node:crypto";
import { join as join10 } from "node:path";
function isGraphDepsInstalled(sharedNodeModules = SHARED_NODE_MODULES, specs = treeSitterSpecs()) {
  if (specs.length === 0)
    return false;
  return specs.every((s) => existsSync10(join10(sharedNodeModules, s.slice(0, s.lastIndexOf("@")))));
}
function treeSitterSpecs(pkgJsonPath = join10(pkgRoot(), "package.json")) {
  let opt = {};
  try {
    const pkg = JSON.parse(readFileSync7(pkgJsonPath, "utf8"));
    opt = pkg.optionalDependencies ?? {};
  } catch {
    return [];
  }
  return Object.keys(opt).filter((n) => n === "tree-sitter" || n.startsWith("tree-sitter-")).sort().map((n) => `${n}@${opt[n]}`);
}
function graphDepsReadyKey(specs) {
  return [
    specs.join("\n"),
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `abi=${process.versions.modules}`
  ].join("\n");
}
var LOCK_STALE_MS = 30 * 60 * 1e3;
var ATTEMPT_BACKOFF_MS = 6 * 60 * 60 * 1e3;
function ensureGraphDeps(deps = {}) {
  const { sharedDir = SHARED_DIR, sharedNodeModules = SHARED_NODE_MODULES, specs = treeSitterSpecs(), runNpm = defaultRunNpm, runHeal = defaultRunHeal, logFn = log, warnFn = warn } = deps;
  try {
    if (process.env.HIVEMIND_GRAPH_ON_STOP === "0") {
      logFn(`  Graph          provisioning skipped (HIVEMIND_GRAPH_ON_STOP=0)`);
      return;
    }
    if (specs.length === 0) {
      warnFn(`  Graph          no tree-sitter optionalDependencies found in package.json \u2014 skipping`);
      return;
    }
    const marker = join10(sharedDir, ".graph-deps");
    const attemptFile = join10(sharedDir, ".graph-deps.attempt");
    const wantKey = graphDepsReadyKey(specs);
    if (readMarker(marker) === wantKey && isGraphDepsInstalled(sharedNodeModules, specs)) {
      logFn(`  Graph          tree-sitter parsers already present at ${sharedDir}`);
      return;
    }
    if (recentlyFailed(attemptFile)) {
      logFn(`  Graph          skipping provision \u2014 a recent attempt failed (backing off ${ATTEMPT_BACKOFF_MS / 36e5}h)`);
      return;
    }
    ensureDir(sharedDir);
    const lockDir = join10(sharedDir, ".graph-deps.lock");
    const token = lockToken();
    if (!acquireLock(lockDir, token)) {
      logFn(`  Graph          another install holds the lock \u2014 skipping (will retry next session)`);
      return;
    }
    try {
      if (readMarker(marker) === wantKey && isGraphDepsInstalled(sharedNodeModules, specs)) {
        logFn(`  Graph          tree-sitter parsers already present at ${sharedDir}`);
        return;
      }
      try {
        rmSync6(marker, { force: true });
      } catch {
      }
      const pkgPath = join10(sharedDir, "package.json");
      if (!existsSync10(pkgPath)) {
        writeJson(pkgPath, { name: "hivemind-embed-deps", version: "1.0.0", private: true, dependencies: {} });
      }
      logFn(`  Graph          installing tree-sitter parsers into ${sharedDir} (code-graph; ~tens of MB)`);
      refreshLock(lockDir);
      runNpm(specs, sharedDir);
      refreshLock(lockDir);
      runHeal(sharedDir);
      writeFileSync7(marker, wantKey);
      clearAttempt(attemptFile);
    } finally {
      releaseLock(lockDir, token);
    }
  } catch (err) {
    recordFailure(join10(sharedDir, ".graph-deps.attempt"));
    warnFn(`  Graph          tree-sitter provisioning failed (${err instanceof Error ? err.message : String(err)}); code graph stays disabled \u2014 everything else works`);
  }
}
function readMarker(marker) {
  try {
    return existsSync10(marker) ? readFileSync7(marker, "utf8") : "";
  } catch {
    return "";
  }
}
function lockToken() {
  return `${process.pid}.${randomBytes(8).toString("hex")}`;
}
function ownerFile(lockDir) {
  return join10(lockDir, "owner");
}
function acquireLock(lockDir, token) {
  const claim = () => {
    mkdirSync(lockDir);
    writeFileSync7(ownerFile(lockDir), token);
    return true;
  };
  try {
    return claim();
  } catch {
    try {
      const age = Date.now() - statSync(lockDir).mtimeMs;
      if (age < LOCK_STALE_MS)
        return false;
      rmSync6(lockDir, { recursive: true, force: true });
      return claim();
    } catch {
      return false;
    }
  }
}
function refreshLock(lockDir) {
  const now = /* @__PURE__ */ new Date();
  try {
    utimesSync(lockDir, now, now);
  } catch {
  }
  try {
    utimesSync(ownerFile(lockDir), now, now);
  } catch {
  }
}
function releaseLock(lockDir, token) {
  try {
    const owner = existsSync10(ownerFile(lockDir)) ? readFileSync7(ownerFile(lockDir), "utf8") : "";
    if (owner !== token)
      return;
    rmSync6(lockDir, { recursive: true, force: true });
  } catch {
  }
}
function recentlyFailed(attemptFile) {
  try {
    if (!existsSync10(attemptFile))
      return false;
    const { lastAttemptAt } = JSON.parse(readFileSync7(attemptFile, "utf8"));
    if (typeof lastAttemptAt !== "number")
      return false;
    return Date.now() - lastAttemptAt < ATTEMPT_BACKOFF_MS;
  } catch {
    return false;
  }
}
function recordFailure(attemptFile) {
  try {
    let failures = 0;
    try {
      const prev = JSON.parse(readFileSync7(attemptFile, "utf8"));
      if (typeof prev.failures === "number")
        failures = prev.failures;
    } catch {
    }
    writeFileSync7(attemptFile, JSON.stringify({ lastAttemptAt: Date.now(), failures: failures + 1 }));
  } catch {
  }
}
function clearAttempt(attemptFile) {
  try {
    rmSync6(attemptFile, { force: true });
  } catch {
  }
}
function defaultRunNpm(specs, cwd) {
  execFileSync3("npm", ["install", ...specs, "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund", "--ignore-scripts"], {
    cwd,
    stdio: "inherit"
  });
}
function defaultRunHeal(cwd, healScript = join10(pkgRoot(), "scripts", "ensure-tree-sitter.mjs")) {
  if (!existsSync10(healScript)) {
    throw new Error(`heal script missing at ${healScript} \u2014 cannot validate native bindings`);
  }
  execFileSync3(process.execPath, [healScript], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HIVEMIND_STRICT_POSTINSTALL: "1" }
  });
}

// dist/src/cli/embeddings.js
var SHARED_DIR = join11(HOME, ".hivemind", "embed-deps");
var SHARED_NODE_MODULES = join11(SHARED_DIR, "node_modules");
var SHARED_DAEMON_PATH = join11(SHARED_DIR, "embed-daemon.js");
var TRANSFORMERS_PKG = "@huggingface/transformers";
var TRANSFORMERS_RANGE = "^3.0.0";
function findHivemindInstalls(home = HOME) {
  const out = [];
  const fixed = [
    { id: "codex", pluginDir: join11(home, ".codex", "hivemind") },
    { id: "cursor", pluginDir: join11(home, ".cursor", "hivemind") },
    { id: "hermes", pluginDir: join11(home, ".hermes", "hivemind") }
  ];
  for (const inst of fixed) {
    if (existsSync11(join11(inst.pluginDir, "bundle")))
      out.push(inst);
  }
  const ccCache = join11(home, ".claude", "plugins", "cache", "hivemind", "hivemind");
  if (existsSync11(ccCache)) {
    let entries = [];
    try {
      entries = readdirSync(ccCache);
    } catch {
    }
    for (const ver of entries) {
      const dir = join11(ccCache, ver);
      try {
        if (!statSync2(dir).isDirectory())
          continue;
      } catch {
        continue;
      }
      const candidates = [join11(dir, "bundle"), join11(dir, "harnesses", "claude-code", "bundle")];
      if (candidates.some((p) => existsSync11(p))) {
        out.push({ id: `claude (${ver})`, pluginDir: dir });
      }
    }
  }
  return out;
}
function isSharedDepsInstalled(sharedNodeModules = SHARED_NODE_MODULES) {
  return existsSync11(join11(sharedNodeModules, TRANSFORMERS_PKG));
}
function isSymlinkToSharedDeps(linkPath, sharedNodeModules) {
  if (!existsSync11(linkPath))
    return false;
  try {
    if (!lstatSync5(linkPath).isSymbolicLink())
      return false;
    return readlinkSync(linkPath) === sharedNodeModules;
  } catch {
    return false;
  }
}
function linkStateFor(install, sharedNodeModules = SHARED_NODE_MODULES) {
  const link = join11(install.pluginDir, "node_modules");
  if (!existsSync11(link) && !isSymbolicLink(link))
    return { kind: "no-node-modules" };
  try {
    if (lstatSync5(link).isSymbolicLink()) {
      const target = readlinkSync(link);
      return target === sharedNodeModules ? { kind: "linked-to-shared" } : { kind: "linked-elsewhere", target };
    }
  } catch {
    return { kind: "no-node-modules" };
  }
  return { kind: "owns-own-node-modules" };
}
function isSymbolicLink(path) {
  try {
    return lstatSync5(path).isSymbolicLink();
  } catch {
    return false;
  }
}
function ensureSharedDeps() {
  if (!isSharedDepsInstalled()) {
    log(`  Embeddings     installing ${TRANSFORMERS_PKG}@${TRANSFORMERS_RANGE} into ${SHARED_DIR}`);
    log(`                 (~600 MB; first install only \u2014 every agent will share this)`);
    ensureDir(SHARED_DIR);
    const pkgPath = join11(SHARED_DIR, "package.json");
    let existing = {};
    try {
      existing = JSON.parse(readFileSync8(pkgPath, "utf8"));
    } catch {
    }
    writeJson(pkgPath, {
      name: "hivemind-embed-deps",
      version: "1.0.0",
      private: true,
      dependencies: { ...existing.dependencies ?? {}, [TRANSFORMERS_PKG]: TRANSFORMERS_RANGE }
    });
    execFileSync4("npm", ["install", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund"], {
      cwd: SHARED_DIR,
      stdio: "inherit"
    });
  } else {
    log(`  Embeddings     shared deps already present at ${SHARED_DIR}`);
  }
  ensureDir(SHARED_DIR);
  const src = join11(pkgRoot(), "embeddings", "embed-daemon.js");
  if (existsSync11(src)) {
    copyFileSync3(src, SHARED_DAEMON_PATH);
    chmodSync(SHARED_DAEMON_PATH, 493);
  } else {
    warn(`  Embeddings     standalone daemon bundle missing at ${src} (run 'npm run build' first)`);
  }
}
function linkAgent(install) {
  const link = join11(install.pluginDir, "node_modules");
  const state = linkStateFor(install);
  if (state.kind === "owns-own-node-modules") {
    warn(`  Embeddings     ${install.id.padEnd(20)} owns its own node_modules \u2014 skipping symlink (status: owns-own-node-modules)`);
    return;
  }
  symlinkForce(SHARED_NODE_MODULES, link);
  log(`  Embeddings     linked ${install.id.padEnd(20)} -> shared deps`);
}
function installEmbeddings() {
  ensureSharedDeps();
  ensureGraphDeps();
  const installs = findHivemindInstalls();
  if (installs.length === 0) {
    warn("  Embeddings     no hivemind installs detected \u2014 run `hivemind install` first");
    warn("                 (the shared deps are in place; subsequent agent installs will pick them up if you re-run `hivemind embeddings install`)");
  } else {
    for (const inst of installs)
      linkAgent(inst);
  }
  setEmbeddingsEnabled(true);
  log(`  Embeddings     enabled in ~/.deeplake/config.json`);
  log(`  Embeddings     ready. Restart your agents to pick up.`);
}
function enableEmbeddings() {
  setEmbeddingsEnabled(true);
  log(`  Embeddings     enabled in ~/.deeplake/config.json`);
  if (!isSharedDepsInstalled()) {
    warn(`  Embeddings     shared deps not installed yet \u2014 run \`hivemind embeddings install\` to download them`);
  } else {
    log(`  Embeddings     shared deps present \u2014 sessions will start producing embeddings on next restart`);
  }
}
function uninstallEmbeddings(opts) {
  const installs = findHivemindInstalls();
  for (const inst of installs) {
    const link = join11(inst.pluginDir, "node_modules");
    if (isSymlinkToSharedDeps(link, SHARED_NODE_MODULES)) {
      unlinkSync5(link);
      log(`  Embeddings     unlinked ${inst.id}`);
    }
  }
  if (opts?.prune && existsSync11(SHARED_DIR)) {
    rmSync7(SHARED_DIR, { recursive: true, force: true });
    log(`  Embeddings     pruned ${SHARED_DIR}`);
  }
  setEmbeddingsEnabled(false);
  killEmbedDaemon();
  log(`  Embeddings     disabled in ~/.deeplake/config.json`);
}
function disableEmbeddings() {
  setEmbeddingsEnabled(false);
  killEmbedDaemon();
  log(`  Embeddings     disabled in ~/.deeplake/config.json`);
  log(`  Embeddings     daemon terminated; shared deps preserved (run \`hivemind embeddings uninstall\` to remove)`);
}
function killEmbedDaemon(socketDir) {
  const uid = typeof process.getuid === "function" ? process.getuid() : userInfo().uid;
  const pidPath = pidPathFor(String(uid), socketDir);
  const sockPath = socketPathFor(String(uid), socketDir);
  let pid = null;
  try {
    pid = Number.parseInt(readFileSync8(pidPath, "utf-8").trim(), 10);
  } catch {
  }
  if (pid !== null && Number.isFinite(pid) && _isDaemonAliveOnSocket(sockPath)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
    }
  } else if (pid !== null) {
    log(`  Embeddings     pidfile present but socket dead \u2014 skipping SIGTERM on possibly-stale pid ${pid}`);
  }
  try {
    unlinkSync5(sockPath);
  } catch {
  }
  try {
    unlinkSync5(pidPath);
  } catch {
  }
}
function _isDaemonAliveOnSocket(sockPath, timeoutMs = 200) {
  if (!existsSync11(sockPath))
    return false;
  try {
    const child = spawnSync("node", [
      "-e",
      `const n=require("node:net");const s=n.connect(${JSON.stringify(sockPath)});s.once("connect",()=>{s.end();process.exit(0)});s.once("error",()=>process.exit(2));setTimeout(()=>process.exit(3),${timeoutMs});`
    ], { timeout: timeoutMs + 1e3, stdio: "ignore" });
    return child.status === 0;
  } catch {
    return false;
  }
}
function statusEmbeddings() {
  const enabled = getEmbeddingsEnabled();
  log(`Config:        ~/.deeplake/config.json embeddings.enabled = ${enabled}`);
  log(`Shared deps:   ${SHARED_DIR}`);
  log(`Installed:     ${isSharedDepsInstalled() ? "yes" : "no"}`);
  log(`Daemon:        ${existsSync11(SHARED_DAEMON_PATH) ? SHARED_DAEMON_PATH : "(not present)"}`);
  if (!enabled) {
    log("");
    log(`Embeddings are DISABLED in user config. Run \`hivemind embeddings enable\` to opt in,`);
    log(`or \`hivemind embeddings install\` if the shared deps are not yet downloaded.`);
  } else if (!isSharedDepsInstalled()) {
    log("");
    warn(`Embeddings are enabled in config but shared deps are missing.`);
    warn(`Run \`hivemind embeddings install\` to download @huggingface/transformers.`);
  }
  log("");
  log(`Agent installs:`);
  const installs = findHivemindInstalls();
  if (installs.length === 0) {
    log(`  (none detected)`);
    return;
  }
  for (const inst of installs) {
    const state = linkStateFor(inst);
    let label;
    switch (state.kind) {
      case "linked-to-shared":
        label = "\u2713 linked \u2192 shared";
        break;
      case "no-node-modules":
        label = "\u2717 not linked";
        break;
      case "owns-own-node-modules":
        label = "\u25B3 has its own node_modules (not shared)";
        break;
      case "linked-elsewhere":
        label = `\u25B3 linked \u2192 ${state.target}`;
        break;
    }
    log(`  ${inst.id.padEnd(20)} ${label}`);
    log(`  ${" ".repeat(20)}   ${inst.pluginDir}`);
  }
}

// dist/src/cli/auth.js
import { existsSync as existsSync12 } from "node:fs";
import { join as join14 } from "node:path";

// dist/src/commands/install-id.js
import { readFileSync as readFileSync9, writeFileSync as writeFileSync8, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join12 } from "node:path";
import { homedir as homedir3 } from "node:os";
import { randomUUID } from "node:crypto";
function configDir() {
  return join12(homedir3(), ".deeplake");
}
function installIDPath() {
  return join12(configDir(), "install-id");
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function getOrCreateInstallID() {
  try {
    const value = readFileSync9(installIDPath(), "utf-8").trim();
    if (UUID_RE.test(value))
      return value;
  } catch {
  }
  const id = randomUUID();
  try {
    mkdirSync2(configDir(), { recursive: true, mode: 448 });
    writeFileSync8(installIDPath(), id, { mode: 384 });
    return id;
  } catch {
    return "";
  }
}
function hivemindInstallIDHeader() {
  const id = getOrCreateInstallID();
  if (!id)
    return {};
  return { "X-Hivemind-Install-Id": id };
}

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
import { accessSync, constants as fsConstants, statSync as statSync3 } from "node:fs";
import { platform as nodePlatform } from "node:os";
import { delimiter, join as join13 } from "node:path";
function resolveOpenPlatform() {
  const p = nodePlatform();
  if (p === "linux" || p === "darwin" || p === "win32")
    return p;
  return null;
}
function openCommandFor(p, path) {
  switch (p) {
    case "linux":
      return { command: "xdg-open", args: [path] };
    case "darwin":
      return { command: "open", args: [path] };
    case "win32":
      return { command: "cmd", args: ["/c", "start", "", path] };
  }
}
function findBinaryOnPath(name) {
  const PATH = process.env.PATH ?? "";
  if (!PATH)
    return null;
  const isWin = nodePlatform() === "win32";
  const exts = isWin ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.trim()).filter(Boolean) : [""];
  for (const dir of PATH.split(delimiter)) {
    if (!dir)
      continue;
    for (const ext of exts) {
      const candidate = join13(dir, name + ext);
      try {
        const st = statSync3(candidate);
        if (!st.isFile())
          continue;
        if (isWin)
          return candidate;
        try {
          accessSync(candidate, fsConstants.X_OK);
          return candidate;
        } catch {
        }
      } catch {
      }
    }
  }
  return null;
}
function openInBrowser(path, opts = {}) {
  const p = opts.platformOverride === void 0 ? resolveOpenPlatform() : opts.platformOverride;
  if (!p)
    return { attempted: false };
  const { command, args } = openCommandFor(p, path);
  const exists = opts.binaryExists ?? ((cmd) => findBinaryOnPath(cmd) !== null);
  if (!exists(command))
    return { attempted: false };
  const useSpawn = opts.spawner ?? spawn;
  try {
    const child = useSpawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
    });
    if (typeof child.unref === "function") {
      child.unref();
    }
    return { attempted: true, command };
  } catch {
    return { attempted: false };
  }
}
function isRemoteSession(env = process.env) {
  return !!(env.SSH_CLIENT || env.SSH_TTY || env.VSCODE_INJECTION || env.CODESPACES);
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
async function apiDelete(path, token, apiUrl, orgId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader(),
    ...hivemindOsHeader()
  };
  if (orgId)
    headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { method: "DELETE", headers });
  if (!resp.ok)
    throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
}
function hivemindReferrerHeader(ref) {
  const code = ref?.trim();
  if (!code)
    return {};
  return { "X-Hivemind-Referrer": code };
}
function signupFlowHeader() {
  return { "X-Deeplake-Signup-Flow": "hivemind" };
}
async function requestDeviceCode(apiUrl = DEFAULT_API_URL, ref) {
  const resp = await fetch(`${apiUrl}/auth/device/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deeplakeClientHeader(),
      ...hivemindOsHeader(),
      ...hivemindInstallIDHeader(),
      ...hivemindReferrerHeader(ref),
      ...signupFlowHeader()
    }
  });
  if (!resp.ok)
    throw new Error(`Device flow unavailable: HTTP ${resp.status}`);
  return resp.json();
}
async function pollForToken(deviceCode, apiUrl = DEFAULT_API_URL) {
  const resp = await fetch(`${apiUrl}/auth/device/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deeplakeClientHeader(),
      ...hivemindOsHeader(),
      ...hivemindInstallIDHeader(),
      // The backend resolves/creates the user on this poll (trackDeviceFlowAuth),
      // so the flow header must ride along here too — the /auth/device/code
      // request alone no longer parks it (signup_flow_pending was dropped).
      ...signupFlowHeader()
    },
    body: JSON.stringify({ device_code: deviceCode })
  });
  if (resp.ok)
    return resp.json();
  if (resp.status === 400) {
    const err = await resp.json().catch(() => null);
    if (err?.error === "authorization_pending" || err?.error === "slow_down")
      return null;
    if (err?.error === "expired_token")
      throw new Error("Device code expired. Try again.");
    if (err?.error === "access_denied")
      throw new Error("Authorization denied.");
  }
  throw new Error(`Token polling failed: HTTP ${resp.status}`);
}
function openBrowser(url) {
  return openInBrowser(url).attempted;
}
async function deviceFlowLogin(apiUrl = DEFAULT_API_URL, ref) {
  const code = await requestDeviceCode(apiUrl, ref);
  const opened = openBrowser(code.verification_uri_complete);
  const msg = [
    "\nDeeplake Authentication",
    "\u2500".repeat(40),
    `
Open this URL: ${code.verification_uri_complete}`,
    `Or visit ${code.verification_uri} and enter code: ${code.user_code}`,
    opened ? "\nBrowser opened. Waiting for sign in..." : "\nWaiting for sign in..."
  ].join("\n");
  process.stderr.write(msg + "\n");
  const interval = Math.max(code.interval || 5, 5) * 1e3;
  const deadline = Date.now() + code.expires_in * 1e3;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const result = await pollForToken(code.device_code, apiUrl);
    if (result) {
      process.stderr.write("\nAuthentication successful!\n");
      return { token: result.access_token, expiresIn: result.expires_in };
    }
  }
  throw new Error("Device code expired.");
}
async function listOrgs(token, apiUrl = DEFAULT_API_URL) {
  const data = await apiGet("/organizations", token, apiUrl);
  return Array.isArray(data) ? data : [];
}
async function switchOrg(orgId, orgName) {
  const creds = loadCredentials();
  if (!creds)
    throw new Error("Not logged in. Run deeplake login first.");
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL;
  const tokenName = `deeplake-plugin-switch-${Date.now()}`;
  const tokenData = await apiPost("/users/me/tokens", {
    name: tokenName,
    duration: 365 * 24 * 3600,
    organization_id: orgId
  }, creds.token, apiUrl);
  saveCredentials({ ...creds, orgId, orgName, token: tokenData.token.token });
}
async function listWorkspaces(token, apiUrl = DEFAULT_API_URL, orgId) {
  const raw = await apiGet("/workspaces", token, apiUrl, orgId);
  const data = raw.data ?? raw;
  return Array.isArray(data) ? data : [];
}
async function switchWorkspace(workspaceId) {
  const creds = loadCredentials();
  if (!creds)
    throw new Error("Not logged in. Run deeplake login first.");
  saveCredentials({ ...creds, workspaceId });
}
async function inviteMember(username, accessMode, token, orgId, apiUrl = DEFAULT_API_URL) {
  await apiPost(`/organizations/${orgId}/members/invite`, { username, access_mode: accessMode }, token, apiUrl, orgId);
}
async function listMembers(token, orgId, apiUrl = DEFAULT_API_URL) {
  const data = await apiGet(`/organizations/${orgId}/members`, token, apiUrl, orgId);
  return data.members ?? [];
}
async function removeMember(userId, token, orgId, apiUrl = DEFAULT_API_URL) {
  await apiDelete(`/organizations/${orgId}/members/${userId}`, token, apiUrl, orgId);
}
async function saveCredentialsFromToken(token, apiUrl, opts = {}) {
  const user = await apiGet("/me", token, apiUrl);
  const userName = user.name || (user.email ? user.email.split("@")[0] : "unknown");
  process.stderr.write(`
Logged in as: ${userName}
`);
  const orgs = await listOrgs(token, apiUrl);
  if (orgs.length === 0)
    throw new Error("No organizations found for this account.");
  const envOrgId = process.env.HIVEMIND_ORG_ID;
  let preferredOrgId = envOrgId;
  if (!preferredOrgId && opts.skipTokenMint) {
    const claims = decodeJwtPayload(token);
    const claimOrg = claims && typeof claims.org_id === "string" ? claims.org_id : void 0;
    if (claimOrg)
      preferredOrgId = claimOrg;
  }
  let orgId;
  let orgName;
  const matched = preferredOrgId ? orgs.find((o) => o.id === preferredOrgId) : void 0;
  if (matched) {
    orgId = matched.id;
    orgName = matched.name;
    process.stderr.write(`Organization: ${orgName}
`);
  } else if (orgs.length === 1) {
    orgId = orgs[0].id;
    orgName = orgs[0].name;
    process.stderr.write(`Organization: ${orgName}
`);
  } else {
    process.stderr.write("\nOrganizations:\n");
    orgs.forEach((org, i) => process.stderr.write(`  ${i + 1}. ${org.name}
`));
    orgId = orgs[0].id;
    orgName = orgs[0].name;
    if (opts.skipTokenMint) {
      process.stderr.write(`
Using: ${orgName} (set HIVEMIND_ORG_ID to override)
`);
    } else {
      process.stderr.write(`
Using: ${orgName}
`);
    }
  }
  let apiToken = token;
  if (!opts.skipTokenMint) {
    const tokenName = `deeplake-plugin-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
    const tokenData = await apiPost("/users/me/tokens", {
      name: tokenName,
      duration: 365 * 24 * 3600,
      organization_id: orgId
    }, token, apiUrl);
    apiToken = tokenData.token.token;
  }
  const creds = {
    token: apiToken,
    orgId,
    orgName,
    userName,
    workspaceId: "default",
    apiUrl,
    savedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveCredentials(creds);
  return creds;
}
async function login(apiUrl = DEFAULT_API_URL, ref) {
  const { token: authToken } = await deviceFlowLogin(apiUrl, ref);
  return saveCredentialsFromToken(authToken, apiUrl, { skipTokenMint: false });
}

// dist/src/cli/auth.js
var DEFAULT_API_URL2 = "https://api.deeplake.ai";
function resolveApiUrl() {
  return process.env.HIVEMIND_API_URL ?? DEFAULT_API_URL2;
}
var CREDS_PATH = join14(HOME, ".deeplake", "credentials.json");
function isLoggedIn() {
  return existsSync12(CREDS_PATH) && loadCredentials() !== null;
}
async function ensureLoggedIn(ref) {
  if (isLoggedIn())
    return true;
  log("");
  log("No Deeplake credentials found. Starting login...");
  try {
    await login(resolveApiUrl(), ref);
  } catch (err) {
    warn(`Login failed: ${err.message}`);
    return false;
  }
  return isLoggedIn();
}
async function loginWithProvidedToken(flagToken) {
  const token = flagToken ?? process.env.HIVEMIND_TOKEN;
  if (!token)
    return false;
  try {
    await saveCredentialsFromToken(token, resolveApiUrl(), { skipTokenMint: true });
    const source = flagToken ? "--token flag" : "HIVEMIND_TOKEN";
    log(`Signed in via ${source}.`);
    return true;
  } catch (err) {
    warn(`Token authentication failed: ${err.message}`);
    return false;
  }
}
async function maybeShowOrgChoice() {
  const creds = loadCredentials();
  if (!creds)
    return;
  try {
    const orgs = await listOrgs(creds.token, creds.apiUrl ?? "https://api.deeplake.ai");
    if (orgs.length <= 1)
      return;
    const activeName = creds.orgName ?? creds.orgId;
    log("");
    log(`You belong to ${orgs.length} orgs. Active: ${activeName}`);
    log(`  Change with: hivemind org switch <name-or-id>`);
  } catch {
  }
}

// dist/src/commands/session-prune.js
function parseArgs(argv) {
  let before;
  let sessionId;
  let all = false;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--before" && argv[i + 1]) {
      before = argv[++i];
    } else if (arg === "--session-id" && argv[i + 1]) {
      sessionId = argv[++i];
    } else if (arg === "--all") {
      all = true;
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    }
  }
  return { before, sessionId, all, yes };
}
function extractSessionId(path) {
  const m = path.match(/\/sessions\/[^/]+\/[^/]+_([^.]+)\.jsonl$/);
  return m ? m[1] : path.split("/").pop()?.replace(/\.jsonl$/, "") ?? path;
}
async function listSessions(api, sessionsTable, author) {
  const rows = await api.query(`SELECT path, COUNT(*) as cnt, MIN(creation_date) as first_event, MAX(creation_date) as last_event, MAX(project) as project FROM "${sessionsTable}" WHERE author = '${sqlStr(author)}' GROUP BY path ORDER BY first_event DESC`);
  return rows.map((r) => ({
    path: String(r.path),
    rowCount: Number(r.cnt),
    firstEvent: String(r.first_event),
    lastEvent: String(r.last_event),
    project: String(r.project ?? "")
  }));
}
async function deleteSessions(config, sessionPaths) {
  if (sessionPaths.length === 0)
    return { sessionsDeleted: 0, summariesDeleted: 0 };
  const sessionsApi = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.sessionsTableName);
  const memoryApi = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  let sessionsDeleted = 0;
  let summariesDeleted = 0;
  for (const sessionPath of sessionPaths) {
    await sessionsApi.query(`DELETE FROM "${config.sessionsTableName}" WHERE path = '${sqlStr(sessionPath)}'`);
    sessionsDeleted++;
    const sessionId = extractSessionId(sessionPath);
    const summaryPath = `/summaries/${config.userName}/${sessionId}.md`;
    const existing = await memoryApi.query(`SELECT path FROM "${config.tableName}" WHERE path = '${sqlStr(summaryPath)}' LIMIT 1`);
    if (existing.length > 0) {
      await memoryApi.query(`DELETE FROM "${config.tableName}" WHERE path = '${sqlStr(summaryPath)}'`);
      summariesDeleted++;
    }
  }
  return { sessionsDeleted, summariesDeleted };
}
async function sessionPrune(argv) {
  const config = loadConfig();
  if (!config) {
    console.error("Not logged in. Run: deeplake login");
    process.exit(1);
  }
  const { before, sessionId, all, yes } = parseArgs(argv);
  const author = config.userName;
  const sessionsApi = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.sessionsTableName);
  const sessions = await listSessions(sessionsApi, config.sessionsTableName, author);
  if (sessions.length === 0) {
    console.log(`No sessions found for author "${author}".`);
    return;
  }
  let targets;
  if (sessionId) {
    targets = sessions.filter((s) => extractSessionId(s.path) === sessionId);
    if (targets.length === 0) {
      console.error(`Session not found: ${sessionId}`);
      console.error(`
Your sessions:`);
      for (const s of sessions.slice(0, 10)) {
        console.error(`  ${extractSessionId(s.path)}  ${s.firstEvent.slice(0, 10)}  ${s.project}`);
      }
      process.exit(1);
    }
  } else if (before) {
    const cutoff = new Date(before);
    if (isNaN(cutoff.getTime())) {
      console.error(`Invalid date: ${before}`);
      process.exit(1);
    }
    targets = sessions.filter((s) => new Date(s.lastEvent) < cutoff);
  } else if (all) {
    targets = sessions;
  } else {
    console.log(`Sessions for "${author}" (${sessions.length} total):
`);
    console.log("  Session ID".padEnd(42) + "Date".padEnd(14) + "Events".padEnd(10) + "Project");
    console.log("  " + "\u2500".repeat(80));
    for (const s of sessions) {
      const id = extractSessionId(s.path);
      const date = s.firstEvent.slice(0, 10);
      console.log(`  ${id.padEnd(40)}${date.padEnd(14)}${String(s.rowCount).padEnd(10)}${s.project}`);
    }
    console.log(`
To delete, use: --all, --before <date>, or --session-id <id>`);
    return;
  }
  if (targets.length === 0) {
    console.log("No sessions match the given criteria.");
    return;
  }
  console.log(`Will delete ${targets.length} session(s) for "${author}":
`);
  for (const s of targets) {
    const id = extractSessionId(s.path);
    console.log(`  ${id}  ${s.firstEvent.slice(0, 10)}  ${s.rowCount} events  ${s.project}`);
  }
  console.log();
  if (!yes) {
    const ok = await confirm("Proceed with deletion?", false);
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }
  const { sessionsDeleted, summariesDeleted } = await deleteSessions(config, targets.map((t) => t.path));
  console.log(`Deleted ${sessionsDeleted} session(s) and ${summariesDeleted} summary file(s).`);
}

// dist/src/commands/whoami.js
var DEFAULT_API = "https://api.deeplake.ai";
function renderWhoami(config, creds, cwd) {
  const storedOrg = creds.orgName ?? creds.orgId;
  const storedWs = creds.workspaceId ?? "default";
  if (!config) {
    return [
      `User org: ${storedOrg}`,
      `Workspace: ${storedWs}`,
      `API: ${creds.apiUrl ?? DEFAULT_API}`
    ].join("\n");
  }
  const res = resolveDirConfig(config, cwd);
  const eff = res.config;
  const envMoved = config.orgId !== creds.orgId || config.workspaceId !== storedWs;
  const dirMoved = !!res.found && (eff.orgId !== config.orgId || eff.workspaceId !== config.workspaceId);
  const lines = [
    `User org: ${eff.orgName ?? eff.orgId}`,
    `Workspace: ${eff.workspaceId}`,
    `API: ${eff.apiUrl}`
  ];
  const notes = [];
  if (dirMoved)
    notes.push(`Routed by ${res.found?.path}`);
  if (envMoved)
    notes.push("Overridden by HIVEMIND_* environment variables");
  if (notes.length) {
    notes.push(`Stored identity: ${storedOrg} / ${storedWs}`);
  }
  if (res.found && !res.collect) {
    notes.push(`Capture: disabled for this directory by ${res.found.path}`);
  }
  if (notes.length)
    lines.push("", ...notes);
  return lines.join("\n");
}

// dist/src/commands/auth-login.js
async function runAuthCommand(args) {
  const cmd = args[0] ?? "whoami";
  const creds = loadCredentials();
  const apiUrl = creds?.apiUrl ?? "https://api.deeplake.ai";
  switch (cmd) {
    case "login": {
      await login(apiUrl);
      break;
    }
    case "whoami": {
      if (!creds) {
        console.log("Not logged in. Run: hivemind login");
        break;
      }
      console.log(renderWhoami(loadConfig(), creds, process.cwd()));
      break;
    }
    case "org": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const sub = args[1];
      if (sub === "list") {
        const orgs = await listOrgs(creds.token, apiUrl);
        orgs.forEach((o) => console.log(`${o.id}  ${o.name}`));
      } else if (sub === "switch") {
        const target = args[2];
        if (!target) {
          console.log("Usage: org switch <org-name-or-id>");
          process.exit(1);
        }
        const orgs = await listOrgs(creds.token, apiUrl);
        const match = orgs.find((o) => o.id === target || o.name.toLowerCase() === target.toLowerCase());
        if (!match) {
          console.log(`Org not found: ${target}`);
          process.exit(1);
        }
        const prevWs = creds.workspaceId ?? "default";
        const lcPrev = prevWs.toLowerCase();
        const wsList = await listWorkspaces(creds.token, apiUrl, match.id);
        const matchedWs = wsList.find((w) => w.id === prevWs || w.name && w.name.toLowerCase() === lcPrev);
        await switchOrg(match.id, match.name);
        console.log(`Switched to org: ${match.name}`);
        if (!matchedWs) {
          if (prevWs !== "default") {
            await switchWorkspace("default");
            console.log(`Workspace '${prevWs}' is not in org '${match.name}'. Reset workspace to 'default'.`);
            if (wsList.length > 0) {
              console.log(`Available workspaces: ${wsList.map((w) => w.name || w.id).join(", ")}`);
            }
          }
        } else if (matchedWs.id !== prevWs) {
          await switchWorkspace(matchedWs.id);
          console.log(`Workspace name '${prevWs}' resolved to id '${matchedWs.id}' in org '${match.name}'.`);
        }
      } else {
        console.log("Usage: org list | org switch <name-or-id>");
      }
      break;
    }
    case "workspaces": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const ws = await listWorkspaces(creds.token, apiUrl, creds.orgId);
      ws.forEach((w) => console.log(w.name || w.id));
      break;
    }
    case "workspace": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const sub = args[1];
      if (sub === "list") {
        const wsList = await listWorkspaces(creds.token, apiUrl, creds.orgId);
        wsList.forEach((w) => console.log(w.name || w.id));
        break;
      }
      if (sub === "switch") {
        const target = args[2];
        if (!target) {
          console.log("Usage: workspace switch <name-or-id>");
          process.exit(1);
        }
        const wsList = await listWorkspaces(creds.token, apiUrl, creds.orgId);
        const lcTarget = target.toLowerCase();
        const match = wsList.find((w) => w.id === target || w.name && w.name.toLowerCase() === lcTarget);
        if (!match) {
          console.log(`Workspace not found: ${target}`);
          if (wsList.length > 0) {
            console.log(`Available workspaces: ${wsList.map((w) => w.name || w.id).join(", ")}`);
          }
          process.exit(1);
        }
        await switchWorkspace(match.id);
        console.log(`Switched to workspace: ${match.name || match.id}`);
        break;
      }
      console.log("Usage: workspace list | workspace switch <name-or-id>");
      process.exit(1);
    }
    case "invite": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const email = args[1];
      const mode = args[2]?.toUpperCase() ?? "WRITE";
      if (!email) {
        console.log("Usage: invite <email> [ADMIN|WRITE|READ]");
        process.exit(1);
      }
      await inviteMember(email, mode, creds.token, creds.orgId, apiUrl);
      console.log(`Invited ${email} with ${mode} access`);
      break;
    }
    case "members": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const members = await listMembers(creds.token, creds.orgId, apiUrl);
      members.forEach((m) => console.log(`${m.role.padEnd(8)} ${m.email ?? m.name}`));
      break;
    }
    case "remove": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const userId = args[1];
      if (!userId) {
        console.log("Usage: remove <user-id>");
        process.exit(1);
      }
      await removeMember(userId, creds.token, creds.orgId, apiUrl);
      console.log(`Removed user ${userId}`);
      break;
    }
    case "sessions": {
      const sub = args[1];
      if (sub === "prune") {
        await sessionPrune(args.slice(2));
      } else {
        console.log("Usage: sessions prune [--all | --before <date> | --session-id <id>] [--yes]");
      }
      break;
    }
    case "autoupdate": {
      if (!creds) {
        console.log("Not logged in.");
        process.exit(1);
      }
      const val = args[1]?.toLowerCase();
      if (val === "on" || val === "true") {
        saveCredentials({ ...creds, autoupdate: true });
        console.log("Autoupdate enabled. Plugin will update automatically on session start.");
      } else if (val === "off" || val === "false") {
        saveCredentials({ ...creds, autoupdate: false });
        console.log("Autoupdate disabled. You'll see a notice when updates are available.");
      } else {
        const current = creds.autoupdate !== false ? "on" : "off";
        console.log(`Autoupdate is currently: ${current}`);
        console.log("Usage: autoupdate [on|off]");
      }
      break;
    }
    case "logout": {
      if (deleteCredentials()) {
        console.log("Logged out. Credentials removed.");
      } else {
        console.log("Not logged in.");
      }
      break;
    }
    default:
      console.log("Commands: login, logout, whoami, org list, org switch, workspaces, workspace, sessions prune, invite, members, remove, autoupdate");
  }
}
if (process.argv[1] && process.argv[1].endsWith("auth-login.js")) {
  runAuthCommand(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

// dist/src/commands/dashboard.js
import { mkdirSync as mkdirSync6, writeFileSync as writeFileSync11 } from "node:fs";
import { homedir as homedir8 } from "node:os";
import { dirname as dirname4, join as join21, resolve } from "node:path";

// dist/src/dashboard/data.js
import { existsSync as existsSync17, readFileSync as readFileSync13, readdirSync as readdirSync3, statSync as statSync4 } from "node:fs";
import { homedir as homedir7 } from "node:os";
import { join as join20 } from "node:path";

// dist/src/notifications/sources/org-stats.js
import { existsSync as existsSync13, mkdirSync as mkdirSync3, readFileSync as readFileSync10, writeFileSync as writeFileSync9 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { dirname, join as join15 } from "node:path";
var log3 = (msg) => log2("notifications-org-stats", msg);
var FETCH_TIMEOUT_MS = 1500;
var DEFAULT_API_URL3 = "https://api.deeplake.ai";
var CACHE_TTL_MS = 60 * 60 * 1e3;
function cacheFilePath() {
  return join15(homedir4(), ".deeplake", "hivemind-stats-cache.json");
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
  if (!existsSync13(cacheFilePath()))
    return {};
  try {
    const parsed = JSON.parse(readFileSync10(cacheFilePath(), "utf-8"));
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
    log3(`cache read failed: ${e?.message ?? String(e)}`);
    return {};
  }
}
function writeCache(scopeKey, data) {
  try {
    mkdirSync3(dirname(cacheFilePath()), { recursive: true });
    const body = { fetchedAt: Date.now(), scopeKey, data };
    writeFileSync9(cacheFilePath(), JSON.stringify(body), "utf-8");
  } catch (e) {
    log3(`cache write failed: ${e?.message ?? String(e)}`);
  }
}
async function fetchOrgStats(creds) {
  if (!creds?.token)
    return null;
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL3;
  const scopeKey = cacheScopeKey(creds);
  const { fresh, stale } = readCache(scopeKey);
  if (fresh) {
    log3("cache hit \u2014 returning fresh org stats");
    return fresh;
  }
  const url = `${apiUrl}/me/hivemind-stats`;
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
      log3(`fetch ${url} returned ${resp.status}`);
      return stale ?? null;
    }
    const body = await resp.json();
    if (!body || typeof body !== "object") {
      log3(`fetch ${url} returned malformed body`);
      return stale ?? null;
    }
    const data = {
      org: scopeFromServer(body.org),
      user: scopeFromServer(body.user),
      balanceCents: parseBalanceHeader(resp)
    };
    writeCache(scopeKey, data);
    log3(`fetched org stats from ${apiUrl}`);
    return data;
  } catch (e) {
    log3(`fetch ${url} failed: ${e?.message ?? String(e)}`);
    return stale ?? null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// dist/src/notifications/usage-tracker.js
import { appendFileSync, existsSync as existsSync14, mkdirSync as mkdirSync4, readFileSync as readFileSync11, readdirSync as readdirSync2 } from "node:fs";
import { dirname as dirname2, join as join16 } from "node:path";
import { homedir as homedir5 } from "node:os";
var log4 = (msg) => log2("usage-tracker", msg);
function statsFilePath() {
  return join16(homedir5(), ".deeplake", "usage-stats.jsonl");
}
function readUsageRecords() {
  try {
    if (!existsSync14(statsFilePath()))
      return [];
    const raw = readFileSync11(statsFilePath(), "utf-8");
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
    log4(`readUsageRecords failed: ${e?.message ?? String(e)}`);
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
  const dir = join16(homedir5(), ".claude", "skills");
  if (!existsSync14(dir))
    return 0;
  const suffix = `--${userName}`;
  try {
    let count = 0;
    for (const name of readdirSync2(dir)) {
      const idx = name.lastIndexOf(suffix);
      if (idx > 0 && idx + suffix.length === name.length)
        count += 1;
    }
    return count;
  } catch (e) {
    log4(`countUserGeneratedSkills readdir failed: ${e?.message ?? String(e)}`);
    return 0;
  }
}

// dist/src/skillify/state.js
import { readFileSync as readFileSync12, writeFileSync as writeFileSync10, writeSync, mkdirSync as mkdirSync5, renameSync as renameSync3, rmdirSync, existsSync as existsSync16, lstatSync as lstatSync6, unlinkSync as unlinkSync6, openSync, closeSync } from "node:fs";
import { join as join19 } from "node:path";

// dist/src/skillify/legacy-migration.js
import { existsSync as existsSync15, renameSync as renameSync2 } from "node:fs";
import { dirname as dirname3, join as join18 } from "node:path";

// dist/src/skillify/state-dir.js
import { homedir as homedir6 } from "node:os";
import { join as join17 } from "node:path";
function getStateDir() {
  const override = process.env.HIVEMIND_STATE_DIR?.trim();
  return override && override.length > 0 ? override : join17(homedir6(), ".deeplake", "state", "skillify");
}

// dist/src/skillify/legacy-migration.js
var dlog = (msg) => log2("skillify-migrate", msg);
var attempted = false;
function migrateLegacyStateDir() {
  if (process.env.HIVEMIND_STATE_DIR?.trim())
    return;
  if (attempted)
    return;
  attempted = true;
  const current = getStateDir();
  const legacy = join18(dirname3(current), "skilify");
  if (!existsSync15(legacy))
    return;
  if (existsSync15(current))
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
var YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));
var TRIGGER_THRESHOLD = (() => {
  const n = Number(process.env.HIVEMIND_SKILLIFY_EVERY_N_TURNS ?? "");
  return Number.isInteger(n) && n > 0 ? n : 20;
})();

// dist/src/dashboard/data.js
var log5 = (msg) => log2("dashboard-data", msg);
var BYTES_PER_TOKEN = 4;
var SAVINGS_MULTIPLIER = 1.7;
function graphsRoot() {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join20(homedir7(), ".hivemind", "graphs");
}
function bytesToSavedTokens(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return 0;
  const delivered = bytes / BYTES_PER_TOKEN;
  return (SAVINGS_MULTIPLIER - 1) * delivered;
}
function resolveSnapshot(repoDir2) {
  const snapshotsDir = join20(repoDir2, "snapshots");
  if (!existsSync17(snapshotsDir))
    return null;
  let snapshotPath = null;
  const pointer = join20(repoDir2, "latest-commit.txt");
  if (existsSync17(pointer)) {
    try {
      const sha = readFileSync13(pointer, "utf-8").trim();
      if (sha) {
        const candidate = join20(snapshotsDir, `${sha}.json`);
        if (existsSync17(candidate))
          snapshotPath = candidate;
        else
          log5(`latest-commit.txt points at missing ${sha}.json \u2014 scanning snapshots/`);
      }
    } catch (e) {
      log5(`latest-commit.txt read failed: ${e?.message ?? String(e)}`);
    }
  }
  if (!snapshotPath) {
    try {
      const candidates = readdirSync3(snapshotsDir).filter((name) => name.endsWith(".json")).map((name) => {
        const full = join20(snapshotsDir, name);
        return { full, mtime: statSync4(full).mtimeMs };
      }).sort((a, b) => b.mtime - a.mtime);
      if (candidates.length > 0)
        snapshotPath = candidates[0].full;
    } catch (e) {
      log5(`snapshots/ scan failed: ${e?.message ?? String(e)}`);
    }
  }
  if (!snapshotPath)
    return null;
  let raw;
  try {
    raw = readFileSync13(snapshotPath, "utf-8");
  } catch (e) {
    log5(`snapshot read failed: ${e?.message ?? String(e)}`);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    log5(`snapshot parse failed: ${e?.message ?? String(e)}`);
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
    log5("snapshot shape invalid (missing nodes/links arrays)");
    return null;
  }
  return {
    commitSha: parsed.graph?.commit_sha ?? null,
    snapshotPath,
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.links.length,
    snapshot: parsed
  };
}
async function loadKpis(creds) {
  const userName = creds?.userName;
  const skillsCreated = countUserGeneratedSkills(userName);
  const records = readUsageRecords();
  const localBytes = sumMetric(records, "memorySearchBytes");
  const localCount = sumMetric(records, "memorySearchCount");
  let orgStats = null;
  if (creds?.token) {
    try {
      orgStats = await fetchOrgStats(creds);
    } catch (e) {
      log5(`fetchOrgStats threw: ${e?.message ?? String(e)}`);
    }
  }
  if (orgStats) {
    return {
      tokensSaved: bytesToSavedTokens(orgStats.org.memorySearchBytes),
      tokensSource: "org",
      skillsCreated,
      memorySearches: orgStats.org.memoryRecallCount,
      sessionsCount: orgStats.org.sessionsCount,
      userTokensSaved: bytesToSavedTokens(orgStats.user.memorySearchBytes)
    };
  }
  if (records.length > 0) {
    return {
      tokensSaved: bytesToSavedTokens(localBytes),
      tokensSource: "local",
      skillsCreated,
      memorySearches: localCount,
      sessionsCount: records.length,
      userTokensSaved: bytesToSavedTokens(localBytes)
    };
  }
  return {
    tokensSaved: null,
    tokensSource: "none",
    skillsCreated,
    memorySearches: 0,
    sessionsCount: null,
    userTokensSaved: null
  };
}
async function loadDashboardData(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const { key: repoKey, project: repoProject } = deriveProjectKey(cwd);
  const repoDir2 = join20(opts.graphsHome ?? graphsRoot(), repoKey);
  const graph = resolveSnapshot(repoDir2);
  const creds = opts.creds === void 0 ? loadCredentials() : opts.creds;
  const kpis = await loadKpis(creds);
  return {
    repoKey,
    repoProject,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    kpis,
    graph
  };
}

// dist/src/dashboard/render.js
var VIS_NETWORK_CDN = "https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js";
var KIND_COLORS = {
  function: "#7aa2f7",
  // soft blue
  class: "#bb9af7",
  // purple
  method: "#9ece6a",
  // green
  interface: "#e0af68",
  // amber
  type_alias: "#7dcfff",
  // cyan
  enum: "#f7768e",
  // pink
  const: "#9d7cd8",
  // muted purple
  module: "#565f89"
  // slate
};
var DEFAULT_NODE_COLOR = "#565f89";
function isObject2(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function asString(v) {
  return typeof v === "string" ? v : null;
}
function transformSnapshotToVis(snapshot) {
  if (!isObject2(snapshot))
    return { nodes: [], edges: [] };
  const raw = snapshot;
  const visNodes = [];
  const ids = /* @__PURE__ */ new Set();
  if (Array.isArray(raw.nodes)) {
    for (const n of raw.nodes) {
      if (!isObject2(n))
        continue;
      const node = n;
      const id = asString(node.id);
      if (!id)
        continue;
      if (ids.has(id))
        continue;
      ids.add(id);
      const label = asString(node.label) ?? id;
      const kind = asString(node.kind);
      const sourceFile = asString(node.source_file);
      const sourceLoc = asString(node.source_location);
      const titleParts = [];
      if (kind)
        titleParts.push(kind);
      if (sourceFile) {
        const loc = sourceLoc ? `${sourceFile}:${sourceLoc}` : sourceFile;
        titleParts.push(loc);
      }
      const color = kind && KIND_COLORS[kind] ? KIND_COLORS[kind] : DEFAULT_NODE_COLOR;
      visNodes.push({
        id,
        label,
        title: titleParts.length > 0 ? titleParts.map(escHtml).join(" \xB7 ") : escHtml(id),
        group: kind ?? void 0,
        color: { background: color, border: color }
      });
    }
  }
  const visEdges = [];
  if (Array.isArray(raw.links)) {
    for (const l of raw.links) {
      if (!isObject2(l))
        continue;
      const edge = l;
      const from = asString(edge.source);
      const to = asString(edge.target);
      if (!from || !to)
        continue;
      const relation = asString(edge.relation);
      const confidence = asString(edge.confidence);
      const titleParts = [];
      if (relation)
        titleParts.push(relation);
      if (confidence)
        titleParts.push(`[${confidence}]`);
      visEdges.push({
        from,
        to,
        title: titleParts.length > 0 ? titleParts.map(escHtml).join(" ") : `${escHtml(from)} \u2192 ${escHtml(to)}`
      });
    }
  }
  return { nodes: visNodes, edges: visEdges };
}
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeJsonForScript(value) {
  return JSON.stringify(value).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\u0021--").replace(/-->/g, "--\\u003e");
}
function formatTokensCompact(n) {
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
function formatInt(n) {
  if (!Number.isFinite(n))
    return "0";
  return Math.round(n).toLocaleString("en-US");
}
function renderKpiCards(kpis) {
  const tokensValue = kpis.tokensSaved == null ? "\u2014" : `~${formatTokensCompact(kpis.tokensSaved)}`;
  const tokensSub = (() => {
    if (kpis.tokensSource === "org") {
      return kpis.userTokensSaved != null ? `Org-wide \xB7 you ~${formatTokensCompact(kpis.userTokensSaved)}` : "Org-wide";
    }
    if (kpis.tokensSource === "local")
      return "Local (this machine)";
    return "Run a session to start tracking";
  })();
  const memoryValue = kpis.memorySearches > 0 ? formatInt(kpis.memorySearches) : kpis.tokensSource === "none" ? "\u2014" : "0";
  const sessionsValue = kpis.sessionsCount == null ? "\u2014" : formatInt(kpis.sessionsCount);
  const cards = [
    {
      label: "Tokens saved",
      value: tokensValue,
      sub: tokensSub
    },
    {
      label: "Skills created",
      value: formatInt(kpis.skillsCreated),
      sub: "~/.claude/skills/"
    },
    {
      label: "Memory recalls",
      value: memoryValue,
      sub: kpis.tokensSource === "org" ? "Org-wide" : kpis.tokensSource === "local" ? "Local" : ""
    },
    {
      label: "Sessions",
      value: sessionsValue,
      sub: kpis.tokensSource === "org" ? "Org-wide" : kpis.tokensSource === "local" ? "Local" : ""
    }
  ];
  return cards.map((c) => `
        <div class="kpi">
          <div class="kpi-label">${escHtml(c.label)}</div>
          <div class="kpi-value">${escHtml(c.value)}</div>
          <div class="kpi-sub">${escHtml(c.sub)}</div>
        </div>`).join("");
}
function renderGraphSection(data) {
  if (data.graph == null) {
    return `
      <div class="graph-card">
        <h2>Codebase graph</h2>
        <div class="empty">
          No graph snapshot yet for this repo.<br>
          Run <code>hivemind graph build</code> to generate one.
        </div>
      </div>`;
  }
  const visPayload = transformSnapshotToVis(data.graph.snapshot);
  const commitLabel = data.graph.commitSha ? `commit ${data.graph.commitSha.slice(0, 12)}` : "no commit (loose dir)";
  const meta = `${formatInt(data.graph.nodeCount)} nodes \xB7 ${formatInt(data.graph.edgeCount)} edges \xB7 ${commitLabel}`;
  return `
      <div class="graph-card">
        <h2>Codebase graph</h2>
        <div class="graph-meta">${escHtml(meta)}</div>
        <div id="graph"></div>
      </div>
      <script type="application/json" id="hm-graph-data">${safeJsonForScript(visPayload)}</script>
      <script src="${VIS_NETWORK_CDN}"></script>
      <script>
        (function () {
          var holder = document.getElementById('hm-graph-data');
          var container = document.getElementById('graph');
          if (!holder || !container || typeof vis === 'undefined') return;
          var payload;
          try { payload = JSON.parse(holder.textContent); }
          catch (e) { container.textContent = 'graph payload parse failed'; return; }
          if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) {
            container.textContent = 'snapshot has no nodes';
            return;
          }
          new vis.Network(container, payload, {
            nodes: {
              shape: 'dot',
              size: 9,
              font: { color: '#e8eaed', size: 11, face: 'system-ui, sans-serif' },
              borderWidth: 1,
            },
            edges: {
              color: { color: 'rgba(120, 130, 150, 0.45)', highlight: '#f5b80a', hover: '#e8eaed' },
              arrows: { to: { enabled: true, scaleFactor: 0.45 } },
              smooth: { enabled: true, type: 'continuous', roundness: 0.2 },
              width: 1,
            },
            physics: {
              stabilization: { iterations: 120 },
              barnesHut: { gravitationalConstant: -2200, springLength: 80, springConstant: 0.04 },
            },
            interaction: { hover: true, dragNodes: true, tooltipDelay: 120 },
          });
        }());
      </script>`;
}
var STYLES = `
        :root {
          color-scheme: dark;
          --bg: #0b0d10;
          --fg: #e8eaed;
          --muted: #8b9099;
          --accent: #f5b80a;
          --card: #15181d;
          --border: #22272e;
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
          font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--bg);
          color: var(--fg);
          padding: 24px;
        }
        .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .brand { font-weight: 600; font-size: 18px; }
        .brand .bee { color: var(--accent); margin-right: 4px; }
        .brand .repo { color: var(--muted); font-weight: 400; margin-left: 8px; }
        .header .ts { color: var(--muted); font-size: 12px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; }
        .kpi-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
        .kpi-value { font-size: 28px; font-weight: 600; margin-top: 6px; line-height: 1.1; }
        .kpi-sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
        .graph-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
        .graph-card h2 { margin: 0 0 8px; font-size: 15px; font-weight: 500; }
        .graph-meta { color: var(--muted); font-size: 12px; margin-bottom: 12px; }
        #graph { height: 70vh; border: 1px solid var(--border); border-radius: 4px; background: #0e1116; }
        .empty { padding: 48px 16px; text-align: center; color: var(--muted); }
        .empty code { background: #1c2128; padding: 2px 6px; border-radius: 3px; color: var(--fg); font-family: ui-monospace, "SFMono-Regular", monospace; }
        .footer { color: var(--muted); font-size: 11px; margin-top: 24px; text-align: right; }
`;
function renderDashboardHtml(data) {
  const title = `Hivemind Dashboard \xB7 ${data.repoProject}`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escHtml(title)}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="header">
      <div class="brand">
        <span class="bee">\u{1F41D}</span>hivemind dashboard
        <span class="repo">/ ${escHtml(data.repoProject)}</span>
      </div>
      <div class="ts">${escHtml(data.generatedAt)}</div>
    </div>
    <div class="kpi-grid">${renderKpiCards(data.kpis)}
    </div>
    ${renderGraphSection(data)}
    <div class="footer">repo_key ${escHtml(data.repoKey)}</div>
  </body>
</html>
`;
}

// dist/src/dashboard/serve.js
import { createServer } from "node:http";
var DEFAULT_PORT = 8123;
var DEFAULT_HOST = "127.0.0.1";
function handleRequest(html) {
  return (req, res) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0];
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
      return;
    }
    if (req.method === "GET" && path === "/health") {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found. The dashboard lives at /.\n");
  };
}
function tryListen(server, host, port) {
  return new Promise((resolve3, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("server bound to a non-IP address"));
        return;
      }
      resolve3(addr.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}
async function serveDashboardHtml(opts) {
  const host = opts.host ?? DEFAULT_HOST;
  const requested = opts.port === void 0 || !Number.isFinite(opts.port) || opts.port < 0 ? DEFAULT_PORT : opts.port;
  const server = createServer(handleRequest(opts.html));
  let bound;
  try {
    bound = await tryListen(server, host, requested);
  } catch (e) {
    if (e?.code !== "EADDRINUSE")
      throw e;
    const fallback = createServer(handleRequest(opts.html));
    bound = await tryListen(fallback, host, 0);
    server.removeAllListeners();
    return makeHandle(fallback, host, bound);
  }
  return makeHandle(server, host, bound);
}
function makeHandle(server, host, port) {
  let resolveStopped;
  const stopped = new Promise((resolve3) => {
    resolveStopped = resolve3;
  });
  server.on("close", () => resolveStopped());
  return {
    host,
    port,
    stopped,
    close: () => new Promise((resolve3, reject) => {
      server.close((err) => err ? reject(err) : resolve3());
    })
  };
}

// dist/src/commands/dashboard.js
var USAGE = `hivemind dashboard \u2014 codebase graph + KPI dashboard (HTML)

Usage:
  hivemind dashboard [--cwd <path>] [--out <path>] [--no-open]
                     [--serve] [--port <n>]
      Build a self-contained HTML dashboard for this repo, write it
      to disk, and either open it in the default browser or serve
      it over loopback HTTP for headless / SSH workflows.

      --cwd <path>   Use a different project root (defaults to cwd).
      --out <path>   Write to a custom path (defaults to
                     ~/.hivemind/dashboards/<repo-key>/index.html).
      --no-open      Don't open the browser. Combine with --serve
                     to start the server without auto-launching.
      --serve        Start a loopback HTTP server (127.0.0.1) so the
                     dashboard is reachable at a URL. Stays alive
                     until Ctrl+C. Ideal for VS Code / Cursor
                     Remote-SSH (auto-forwards the port \u2192 click to
                     open in the integrated browser tab).
      --port <n>     Port for --serve (default 8123). Falls back to
                     a kernel-assigned port if <n> is in use.

  hivemind dashboard --help
      Show this message.

Data sources (all read-only):
  - Graph snapshot at ~/.hivemind/graphs/<repo-key>/   (produced by
    \`hivemind graph build\`; the dashboard works without it and shows
    an empty-state until the producer has run)
  - KPIs via the org stats endpoint (cached) with a local fallback
    to ~/.deeplake/usage-stats.jsonl
  - Skills created from ~/.claude/skills/<name>--<author>/ directories
`;
function parsePort(raw) {
  if (raw === void 0 || raw === "")
    return { error: "--port requires a value" };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    return { error: `--port must be an integer in [0, 65535], got '${raw}'` };
  }
  return n;
}
function parseDashboardArgs(args) {
  let cwd;
  let outPath = "";
  let open = true;
  let serve = false;
  let port;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h")
      return { help: true };
    if (a === "--no-open") {
      open = false;
      continue;
    }
    if (a === "--serve") {
      serve = true;
      continue;
    }
    if (a === "--cwd") {
      const v = args[++i];
      if (v === void 0 || v.startsWith("-")) {
        return { error: "--cwd requires a value" };
      }
      cwd = v;
      continue;
    }
    if (a.startsWith("--cwd=")) {
      cwd = a.slice("--cwd=".length);
      continue;
    }
    if (a === "--out") {
      const v = args[++i];
      if (v === void 0 || v.startsWith("-")) {
        return { error: "--out requires a value" };
      }
      outPath = v;
      continue;
    }
    if (a.startsWith("--out=")) {
      outPath = a.slice("--out=".length);
      continue;
    }
    if (a === "--port") {
      const v = args[++i];
      if (v === void 0 || v.startsWith("-")) {
        return { error: "--port requires a value" };
      }
      const parsed = parsePort(v);
      if (typeof parsed === "object")
        return { error: parsed.error };
      port = parsed;
      continue;
    }
    if (a.startsWith("--port=")) {
      const parsed = parsePort(a.slice("--port=".length));
      if (typeof parsed === "object")
        return { error: parsed.error };
      port = parsed;
      continue;
    }
    return { error: `unknown arg '${a}'` };
  }
  if (port !== void 0 && !serve) {
    return { error: "--port requires --serve" };
  }
  return {
    args: {
      cwd: cwd ?? process.cwd(),
      outPath,
      open,
      serve,
      port
    }
  };
}
function defaultDashboardOutPath(repoKey) {
  return join21(homedir8(), ".hivemind", "dashboards", repoKey, "index.html");
}
async function runDashboardCommand(rawArgs, runOpts = {}) {
  const out = runOpts.out ?? ((s) => {
    process.stdout.write(s);
  });
  const err = runOpts.err ?? ((s) => {
    process.stderr.write(s);
  });
  const opener = runOpts.opener ?? openInBrowser;
  const parsed = parseDashboardArgs(rawArgs);
  if (parsed.help) {
    out(USAGE);
    return 0;
  }
  if (parsed.error || !parsed.args) {
    err(`hivemind dashboard: ${parsed.error ?? "invalid arguments"}
`);
    err(USAGE);
    return 2;
  }
  const { cwd, outPath, open } = parsed.args;
  let data;
  try {
    data = await loadDashboardData({ cwd });
  } catch (e) {
    err(`hivemind dashboard: failed to load data: ${e?.message ?? String(e)}
`);
    return 1;
  }
  const html = renderDashboardHtml(data);
  const finalOut = outPath || defaultDashboardOutPath(data.repoKey);
  const absOut = resolve(finalOut);
  try {
    mkdirSync6(dirname4(absOut), { recursive: true });
    writeFileSync11(absOut, html, "utf-8");
  } catch (e) {
    err(`hivemind dashboard: failed to write ${absOut}: ${e?.message ?? String(e)}
`);
    return 1;
  }
  out(`Wrote ${absOut}
`);
  if (data.graph == null) {
    out(`(no codebase graph yet \u2014 run 'hivemind graph build' to populate)
`);
  }
  const remote = runOpts.isRemote ?? isRemoteSession();
  const autoServe = !parsed.args.serve && open && remote;
  if (parsed.args.serve || autoServe) {
    if (autoServe) {
      out(`(remote session detected \u2014 serving over localhost instead of opening a file)
`);
    }
    return await runServeLoop(html, parsed.args, runOpts, out, err);
  }
  if (open) {
    const result = opener(absOut);
    if (result.attempted) {
      out(`Opening via ${result.command}
`);
    } else {
      out(`(no browser opener found \u2014 starting local server instead)
`);
      return await runServeLoop(html, parsed.args, runOpts, out, err);
    }
  }
  return 0;
}
async function runServeLoop(html, args, runOpts, out, err) {
  const server = runOpts.server ?? serveDashboardHtml;
  const opener = runOpts.opener ?? openInBrowser;
  const onSignal = runOpts.onSignal ?? defaultOnSignal;
  let handle;
  try {
    handle = await server({ html, port: args.port });
  } catch (e) {
    err(`hivemind dashboard: failed to start server: ${e?.message ?? String(e)}
`);
    return 1;
  }
  const url = `http://${handle.host}:${handle.port}/`;
  out(`Serving dashboard at ${url}  (Ctrl+C to stop)
`);
  if (args.open) {
    const result = opener(url);
    if (result.attempted) {
      out(`Opening via ${result.command}
`);
    } else {
      out(`(no opener for this platform; click the URL above or open it manually)
`);
    }
  }
  let resolveDone;
  const done = new Promise((r) => {
    resolveDone = r;
  });
  const shutdown = async () => {
    try {
      await handle.close();
    } catch {
    }
    resolveDone(0);
  };
  const offInt = onSignal("SIGINT", shutdown);
  const offTerm = onSignal("SIGTERM", shutdown);
  handle.stopped.then(() => resolveDone(0));
  try {
    return await done;
  } finally {
    offInt();
    offTerm();
  }
}
function defaultOnSignal(signal, handler) {
  process.on(signal, handler);
  return () => process.off(signal, handler);
}

// dist/src/commands/skillify.js
import { readdirSync as readdirSync7, existsSync as existsSync30, readFileSync as readFileSync22, mkdirSync as mkdirSync13, renameSync as renameSync6 } from "node:fs";
import { homedir as homedir17 } from "node:os";
import { dirname as dirname9, join as join33 } from "node:path";

// dist/src/skillify/scope-config.js
import { existsSync as existsSync18, mkdirSync as mkdirSync7, readFileSync as readFileSync14, writeFileSync as writeFileSync12 } from "node:fs";
import { join as join22 } from "node:path";
function configPath() {
  return join22(getStateDir(), "config.json");
}
var DEFAULT = { scope: "me", team: [], install: "project" };
function loadScopeConfig() {
  migrateLegacyStateDir();
  const CONFIG_PATH3 = configPath();
  if (!existsSync18(CONFIG_PATH3))
    return DEFAULT;
  try {
    const raw = JSON.parse(readFileSync14(CONFIG_PATH3, "utf-8"));
    const scope = raw.scope === "team" ? "team" : raw.scope === "org" ? "team" : "me";
    const team = Array.isArray(raw.team) ? raw.team.filter((s) => typeof s === "string") : [];
    const install = raw.install === "global" ? "global" : "project";
    return { scope, team, install };
  } catch {
    return DEFAULT;
  }
}
function saveScopeConfig(cfg) {
  migrateLegacyStateDir();
  mkdirSync7(getStateDir(), { recursive: true });
  writeFileSync12(configPath(), JSON.stringify(cfg, null, 2));
}

// dist/src/skillify/pull.js
import { existsSync as existsSync22, readFileSync as readFileSync17, writeFileSync as writeFileSync15, mkdirSync as mkdirSync10, renameSync as renameSync5, rmSync as rmSync8, lstatSync as lstatSync8, readlinkSync as readlinkSync2, symlinkSync, unlinkSync as unlinkSync8 } from "node:fs";
import { homedir as homedir11 } from "node:os";
import { dirname as dirname6, join as join26 } from "node:path";

// dist/src/skillify/skill-writer.js
import { existsSync as existsSync19, mkdirSync as mkdirSync8, readFileSync as readFileSync15, readdirSync as readdirSync4, statSync as statSync5, writeFileSync as writeFileSync13 } from "node:fs";
import { homedir as homedir9 } from "node:os";
import { join as join23 } from "node:path";
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
function skillDir(skillsRoot, name) {
  return join23(skillsRoot, name);
}
function skillPath(skillsRoot, name) {
  return join23(skillDir(skillsRoot, name), "SKILL.md");
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
function writeNewSkill(args) {
  assertValidSkillName(args.name);
  const name = capSkillName(args.name);
  const dir = skillDir(args.skillsRoot, name);
  const path = skillPath(args.skillsRoot, name);
  if (existsSync19(path)) {
    throw new Error(`skill already exists at ${path}; use mergeSkill`);
  }
  mkdirSync8(dir, { recursive: true });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const author = args.author && args.author.length > 0 ? args.author : void 0;
  const contributors = author ? [author] : [];
  const fm = {
    name,
    description: args.description,
    trigger: args.trigger,
    author,
    source_sessions: args.sourceSessions,
    contributors,
    version: 1,
    created_by_agent: args.agent,
    created_at: now,
    updated_at: now
  };
  const text = `${renderFrontmatter(fm)}

${args.body.trim()}
`;
  writeFileSync13(path, text);
  return {
    path,
    name,
    action: "created",
    version: 1,
    createdAt: now,
    updatedAt: now,
    author,
    contributors
  };
}
function listSkills(skillsRoot) {
  if (!existsSync19(skillsRoot))
    return [];
  const out = [];
  for (const name of readdirSync4(skillsRoot)) {
    const skillFile = join23(skillsRoot, name, "SKILL.md");
    if (existsSync19(skillFile) && statSync5(skillFile).isFile()) {
      out.push({ name, body: readFileSync15(skillFile, "utf-8") });
    }
  }
  return out;
}
function resolveSkillsRoot(install, cwd) {
  if (install === "global") {
    return join23(homedir9(), ".claude", "skills");
  }
  return join23(cwd, ".claude", "skills");
}

// dist/src/skillify/manifest.js
import { existsSync as existsSync20, lstatSync as lstatSync7, mkdirSync as mkdirSync9, readFileSync as readFileSync16, renameSync as renameSync4, unlinkSync as unlinkSync7, writeFileSync as writeFileSync14 } from "node:fs";
import { dirname as dirname5, join as join24 } from "node:path";
function emptyManifest() {
  return { version: 1, entries: [] };
}
function manifestPath() {
  return join24(getStateDir(), "pulled.json");
}
function loadManifest(path = manifestPath()) {
  migrateLegacyStateDir();
  if (!existsSync20(path))
    return emptyManifest();
  let raw;
  try {
    raw = readFileSync16(path, "utf-8");
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
  mkdirSync9(dirname5(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync14(tmp, JSON.stringify(m, null, 2) + "\n", { mode: 384 });
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
      st = lstatSync7(path);
    } catch {
      continue;
    }
    if (!st.isSymbolicLink())
      continue;
    try {
      unlinkSync7(path);
    } catch {
    }
  }
}
function pruneOrphanedEntries(path = manifestPath()) {
  const m = loadManifest(path);
  const live = [];
  let pruned = 0;
  for (const e of m.entries) {
    if (existsSync20(join24(e.installRoot, e.dirName))) {
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
import { existsSync as existsSync21 } from "node:fs";
import { homedir as homedir10 } from "node:os";
import { join as join25 } from "node:path";
function resolveDetected(home) {
  const out = [];
  const codexInstalled = existsSync21(join25(home, ".codex"));
  const piInstalled = existsSync21(join25(home, ".pi", "agent"));
  const hermesInstalled = existsSync21(join25(home, ".hermes"));
  if (codexInstalled || piInstalled) {
    out.push(join25(home, ".agents", "skills"));
  }
  if (hermesInstalled) {
    out.push(join25(home, ".hermes", "skills"));
  }
  if (piInstalled) {
    out.push(join25(home, ".pi", "agent", "skills"));
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
function isMissingTableError2(message) {
  if (!message)
    return false;
  if (/\bcolumn\b/i.test(message))
    return false;
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}
function resolvePullDestination(install, cwd) {
  if (install === "global")
    return join26(homedir11(), ".claude", "skills");
  if (!cwd)
    throw new Error("install=project requires a cwd");
  return join26(cwd, ".claude", "skills");
}
function fanOutSymlinks(canonicalDir, dirName, agentRoots) {
  const out = [];
  for (const root of agentRoots) {
    const link = join26(root, dirName);
    let existing;
    try {
      existing = lstatSync8(link);
    } catch {
      existing = null;
    }
    if (existing) {
      if (!existing.isSymbolicLink()) {
        continue;
      }
      let current;
      try {
        current = readlinkSync2(link);
      } catch {
        current = null;
      }
      if (current === canonicalDir) {
        out.push(link);
        continue;
      }
      try {
        unlinkSync8(link);
      } catch {
        continue;
      }
    }
    try {
      mkdirSync10(dirname6(link), { recursive: true });
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
    const canonical = join26(entry.installRoot, entry.dirName);
    if (!existsSync22(canonical))
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
  return `${renderFrontmatter2(fm)}

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
function renderFrontmatter2(fm) {
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
  if (!existsSync22(path))
    return null;
  try {
    const text = readFileSync17(path, "utf-8");
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
      if (isMissingTableError2(e?.message)) {
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
    const skillDir2 = join26(root, dirName);
    const skillFile = join26(skillDir2, "SKILL.md");
    const staleDir = name !== rawName ? `${rawName}--${author}` : null;
    const staleOwned = !!staleDir && staleDir !== dirName && entriesForRoot(loadManifest(), opts.install, root).some((e) => e.dirName === staleDir);
    const staleFile = staleOwned ? join26(root, staleDir, "SKILL.md") : null;
    const staleVersion = staleFile && existsSync22(staleFile) ? readLocalVersion(staleFile) : null;
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
      mkdirSync10(skillDir2, { recursive: true });
      if (existsSync22(skillFile)) {
        try {
          renameSync5(skillFile, `${skillFile}.bak`);
        } catch {
        }
      }
      if (staleFile && staleVersion !== null && staleVersion >= remoteVersion && !(opts.force ?? false)) {
        try {
          const migrated = readFileSync17(staleFile, "utf-8").replace(/^name:.*$/m, `name: ${name}`);
          writeFileSync15(skillFile, migrated);
        } catch {
          writeFileSync15(skillFile, renderSkillFile(row, name));
        }
      } else {
        writeFileSync15(skillFile, renderSkillFile(row, name));
      }
      const symlinks = opts.install === "global" ? fanOutSymlinks(skillDir2, dirName, detectAgentSkillsRoots(root)) : [];
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
    if (staleDir && staleDir !== dirName && !(opts.dryRun ?? false) && existsSync22(skillFile) && existsSync22(join26(root, staleDir))) {
      try {
        const entries = entriesForRoot(loadManifest(), opts.install, root);
        let canonicalRecorded = entries.some((e) => e.dirName === dirName);
        const staleEntry = entries.find((e) => e.dirName === staleDir);
        if (!canonicalRecorded && staleEntry && !manifestError) {
          try {
            const symlinks = opts.install === "global" ? fanOutSymlinks(skillDir2, dirName, detectAgentSkillsRoots(root)) : [];
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
          rmSync8(join26(root, staleDir), { recursive: true, force: true });
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

// dist/src/skillify/push.js
import { existsSync as existsSync23, readFileSync as readFileSync18 } from "node:fs";
import { join as join27 } from "node:path";

// dist/src/skillify/skills-table.js
import { randomUUID as randomUUID2 } from "node:crypto";
function esc2(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
async function insertSkillRow(args) {
  const id = args.id ?? randomUUID2();
  const sourceSessionsJson = JSON.stringify(args.sourceSessions);
  const contributorsJson = JSON.stringify(args.contributors);
  const sql = `INSERT INTO "${sqlIdent(args.tableName)}" (id, name, project, project_key, local_path, install, source_sessions, source_agent, scope, author, contributors, description, trigger_text, body, version, created_at, updated_at) VALUES ('${esc2(id)}', '${esc2(args.name)}', '${esc2(args.project)}', '${esc2(args.projectKey)}', '${esc2(args.localPath)}', '${esc2(args.install)}', '${esc2(sourceSessionsJson)}', '${esc2(args.sourceAgent)}', '${esc2(args.scope)}', '${esc2(args.author)}', '${esc2(contributorsJson)}', '${esc2(args.description)}', '${esc2(args.trigger ?? "")}', '${esc2(args.body)}', ${args.version}, '${esc2(args.createdAt)}', '${esc2(args.updatedAt)}')`;
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
function asString2(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asStringArray(v) {
  if (Array.isArray(v))
    return v.map(asString2);
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(asString2) : [];
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
    name: asString2(r.name) || name,
    author: asString2(r.author) || author,
    project: asString2(r.project),
    projectKey: asString2(r.project_key),
    localPath: asString2(r.local_path),
    install: asString2(r.install) === "global" ? "global" : "project",
    sourceSessions: asStringArray(r.source_sessions),
    sourceAgent: asString2(r.source_agent),
    scope: asString2(r.scope) === "team" ? "team" : "me",
    contributors: asStringArray(r.contributors),
    description: asString2(r.description),
    trigger: asString2(r.trigger_text),
    body: asString2(r.body),
    version: Number.isFinite(version) && version > 0 ? version : 1,
    createdAt: asString2(r.created_at)
  };
}

// dist/src/skillify/push.js
function readLocalSkill(skillsRoot, name) {
  assertValidSkillName(name);
  const path = join27(skillsRoot, name, "SKILL.md");
  if (!existsSync23(path)) {
    throw new Error(`skill '${name}' not found at ${path}`);
  }
  const parsed = parseFrontmatter(readFileSync18(path, "utf-8"));
  if (!parsed) {
    throw new Error(`skill '${name}' at ${path} has no valid frontmatter \u2014 cannot push`);
  }
  const fm = parsed.fm;
  return {
    description: typeof fm.description === "string" ? fm.description : "",
    trigger: typeof fm.trigger === "string" ? fm.trigger : void 0,
    body: parsed.body.trim(),
    author: typeof fm.author === "string" && fm.author.length > 0 ? fm.author : void 0,
    contributors: Array.isArray(fm.contributors) ? fm.contributors : [],
    sourceSessions: Array.isArray(fm.source_sessions) ? fm.source_sessions : [],
    version: typeof fm.version === "number" && fm.version > 0 ? fm.version : 1,
    agent: typeof fm.created_by_agent === "string" ? fm.created_by_agent : void 0,
    createdAt: typeof fm.created_at === "string" ? fm.created_at : void 0
  };
}
function computePushContributors(base, author, pusher) {
  const seed = base.length > 0 ? base : author ? [author] : [];
  const out = [...seed];
  if (pusher && !out.includes(pusher))
    out.push(pusher);
  return out;
}
async function runPush(args) {
  const skillsRoot = resolveSkillsRoot(args.from, args.cwd);
  const local = readLocalSkill(skillsRoot, args.skillName);
  const localPath = join27(skillsRoot, args.skillName, "SKILL.md");
  const author = local.author ?? args.pusher;
  let current;
  try {
    current = await readCurrentSkillRow(args.query, args.tableName, args.skillName, author);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingTableError(msg))
      current = null;
    else
      throw e;
  }
  const previousVersion = current ? current.version : null;
  const version = current ? current.version + 1 : local.version;
  const contributors = computePushContributors(local.contributors, local.author, args.pusher);
  const { key: projectKey, project } = deriveProjectKey(args.cwd);
  const now = args.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const createdAt = local.createdAt || current?.createdAt || now;
  if (!args.dryRun) {
    await insertSkillRow({
      query: args.query,
      tableName: args.tableName,
      workspaceId: args.workspaceId,
      name: args.skillName,
      project,
      projectKey,
      localPath,
      install: args.from,
      sourceSessions: local.sourceSessions,
      sourceAgent: local.agent ?? args.agent,
      scope: args.scope,
      author,
      contributors,
      description: local.description,
      trigger: local.trigger,
      body: local.body,
      version,
      createdAt,
      updatedAt: now
    });
  }
  return {
    name: args.skillName,
    localPath,
    author,
    contributors,
    version,
    previousVersion,
    action: args.dryRun ? "dryrun" : "pushed",
    project,
    projectKey,
    scope: args.scope
  };
}

// dist/src/skillify/unpull.js
import { existsSync as existsSync24, readdirSync as readdirSync5, rmSync as rmSync9, statSync as statSync6 } from "node:fs";
import { homedir as homedir12 } from "node:os";
import { join as join28 } from "node:path";
function resolveUnpullRoot(install, cwd) {
  if (install === "global")
    return join28(homedir12(), ".claude", "skills");
  if (!cwd)
    throw new Error("cwd required when install === 'project'");
  return join28(cwd, ".claude", "skills");
}
function runUnpull(opts) {
  const root = resolveUnpullRoot(opts.install, opts.cwd);
  const summary = {
    scanned: 0,
    removed: 0,
    wouldRemove: 0,
    kept: 0,
    manifestPruned: 0,
    entries: []
  };
  const userFilter = new Set(opts.users.filter((u) => u.length > 0));
  const haveUserFilter = userFilter.size > 0;
  if ((opts.all || opts.legacyCleanup) && (haveUserFilter || opts.notMine)) {
    const flags = [opts.all && "--all", opts.legacyCleanup && "--legacy-cleanup"].filter(Boolean).join(" / ");
    const filters = [haveUserFilter && "--user/--users", opts.notMine && "--not-mine"].filter(Boolean).join(" / ");
    throw new Error(`${flags} cannot be combined with ${filters}: entries removed by ${flags} are not in the manifest and have no author metadata, so the filter would silently fail to apply. Run the filtered unpull first, then ${flags} as a separate invocation.`);
  }
  const manifest = loadManifest();
  const entries = entriesForRoot(manifest, opts.install, root);
  for (const entry of entries) {
    summary.scanned++;
    const path = join28(root, entry.dirName);
    if (!existsSync24(path)) {
      if (!opts.dryRun) {
        unlinkSymlinks(entry.symlinks);
        removePullEntry(opts.install, entry.installRoot, entry.dirName);
      }
      summary.entries.push({
        dirName: entry.dirName,
        kind: "manifest-orphan",
        author: entry.author,
        name: entry.name,
        action: opts.dryRun ? "kept-policy" : "manifest-pruned",
        reason: opts.dryRun ? "would-prune (orphan, dir missing)" : "directory was already missing",
        path: ""
      });
      if (!opts.dryRun)
        summary.manifestPruned++;
      else
        summary.kept++;
      continue;
    }
    const decision = decideTargetForManifestEntry(entry, opts, userFilter, haveUserFilter);
    const result = {
      dirName: entry.dirName,
      kind: "pulled-manifest",
      author: entry.author,
      name: entry.name,
      action: "kept-policy",
      path
    };
    if (!decision.shouldRemove) {
      result.reason = decision.reason;
      summary.kept++;
      summary.entries.push(result);
      continue;
    }
    if (opts.dryRun) {
      result.action = "would-remove";
      summary.wouldRemove++;
    } else {
      try {
        rmSync9(path, { recursive: true, force: true });
        unlinkSymlinks(entry.symlinks);
        removePullEntry(opts.install, entry.installRoot, entry.dirName);
        result.action = "removed";
        summary.removed++;
      } catch (e) {
        result.action = "kept-policy";
        result.reason = `rm failed: ${e?.message ?? e}`;
        summary.kept++;
      }
    }
    summary.entries.push(result);
  }
  if (existsSync24(root) && (opts.all || opts.legacyCleanup)) {
    const manifestDirNames = new Set(entries.map((e) => e.dirName));
    for (const dirName of readdirSync5(root)) {
      if (manifestDirNames.has(dirName))
        continue;
      const path = join28(root, dirName);
      let st;
      try {
        st = statSync6(path);
      } catch {
        continue;
      }
      if (!st.isDirectory())
        continue;
      const isLegacyProjectKey = /^[0-9a-f]{16}$/.test(dirName);
      const isLocallyMined = !isLegacyProjectKey && /^[A-Za-z0-9_.-]+$/.test(dirName) && !dirName.includes("--");
      let kind;
      let shouldRemove = false;
      let reason;
      if (isLegacyProjectKey) {
        kind = "legacy-projectkey";
        if (opts.legacyCleanup)
          shouldRemove = true;
        else
          reason = "legacy project_key dir (use --legacy-cleanup)";
      } else if (isLocallyMined) {
        kind = "locally-mined";
        if (opts.all)
          shouldRemove = true;
        else
          reason = "locally-mined (use --all to remove)";
      } else {
        continue;
      }
      summary.scanned++;
      const result = {
        dirName,
        kind,
        author: null,
        name: kind === "locally-mined" ? dirName : null,
        action: "kept-policy",
        path,
        reason
      };
      if (!shouldRemove) {
        summary.kept++;
        summary.entries.push(result);
        continue;
      }
      if (opts.dryRun) {
        result.action = "would-remove";
        summary.wouldRemove++;
      } else {
        try {
          rmSync9(path, { recursive: true, force: true });
          result.action = "removed";
          summary.removed++;
        } catch (e) {
          result.action = "kept-policy";
          result.reason = `rm failed: ${e?.message ?? e}`;
          summary.kept++;
        }
      }
      summary.entries.push(result);
    }
  }
  return summary;
}
function decideTargetForManifestEntry(entry, opts, userFilter, haveUserFilter) {
  if (haveUserFilter && !userFilter.has(entry.author)) {
    return { shouldRemove: false, reason: `author '${entry.author}' not in filter` };
  }
  if (opts.notMine) {
    if (!opts.myUsername)
      return { shouldRemove: false, reason: "--not-mine requires myUsername" };
    if (entry.author === opts.myUsername) {
      return { shouldRemove: false, reason: "your own pull (--not-mine excludes self)" };
    }
  }
  return { shouldRemove: true };
}

// dist/src/commands/mine-local.js
import { spawn as spawn3 } from "node:child_process";
import { existsSync as existsSync29, mkdirSync as mkdirSync12, readFileSync as readFileSync21, writeFileSync as writeFileSync17 } from "node:fs";
import { homedir as homedir16 } from "node:os";
import { basename, dirname as dirname8, join as join32 } from "node:path";

// dist/src/skillify/local-source.js
import { readdirSync as readdirSync6, readFileSync as readFileSync19, existsSync as existsSync25, statSync as statSync7 } from "node:fs";
import { homedir as homedir13 } from "node:os";
import { join as join29 } from "node:path";
var HOME2 = homedir13();
function encodeCwdClaudeCode(cwd) {
  return cwd.replace(/[/_]/g, "-");
}
function detectInstalledAgents() {
  const installs = [];
  const claudeRoot = join29(HOME2, ".claude", "projects");
  if (existsSync25(claudeRoot)) {
    installs.push({
      agent: "claude_code",
      sessionRoot: claudeRoot,
      encodeCwd: encodeCwdClaudeCode
    });
  }
  const codexRoot = join29(HOME2, ".codex", "sessions");
  if (existsSync25(codexRoot)) {
    installs.push({
      agent: "codex",
      sessionRoot: codexRoot,
      encodeCwd: () => "__cwd_unknown__"
    });
  }
  return installs;
}
function detectHostAgent() {
  if (process.env.CLAUDECODE === "1" || process.env.CLAUDE_CODE_ENTRYPOINT)
    return "claude_code";
  if (process.env.CODEX_HOME || process.env.CODEX_SESSION_ID)
    return "codex";
  return null;
}
function pushJsonlFile(out, agent, dir, fileName, inCwd) {
  if (!fileName.endsWith(".jsonl"))
    return;
  const fullPath = join29(dir, fileName);
  let stats;
  try {
    stats = statSync7(fullPath);
  } catch {
    return;
  }
  if (!stats.isFile())
    return;
  out.push({
    agent,
    path: fullPath,
    mtime: stats.mtimeMs,
    inCwd,
    sessionId: fileName.replace(/\.jsonl$/, "")
  });
}
function collectJsonlRecursive(out, agent, dir, inCwd) {
  let entries;
  try {
    entries = readdirSync6(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory())
      collectJsonlRecursive(out, agent, join29(dir, e.name), inCwd);
    else if (e.isFile())
      pushJsonlFile(out, agent, dir, e.name, inCwd);
  }
}
function listLocalSessions(installs, cwd) {
  const out = [];
  for (const install of installs) {
    const cwdEncoded = install.encodeCwd(cwd);
    let top;
    try {
      top = readdirSync6(install.sessionRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of top) {
      const inCwd = entry.name === cwdEncoded;
      if (entry.isDirectory()) {
        collectJsonlRecursive(out, install.agent, join29(install.sessionRoot, entry.name), inCwd);
      } else if (entry.isFile()) {
        pushJsonlFile(out, install.agent, install.sessionRoot, entry.name, inCwd);
      }
    }
  }
  return out;
}
function pickSessions(candidates, opts) {
  const { n, epsilon } = opts;
  if (n <= 0 || candidates.length === 0)
    return [];
  const sorted = [...candidates].sort((a, b) => b.mtime - a.mtime);
  const cwdQuota = Math.ceil((1 - epsilon) * n);
  const globalQuota = Math.floor(epsilon * n);
  const picked = [];
  const taken = /* @__PURE__ */ new Set();
  for (const s of sorted) {
    if (picked.length >= cwdQuota)
      break;
    if (s.inCwd && !taken.has(s.path)) {
      picked.push(s);
      taken.add(s.path);
    }
  }
  const cap2 = picked.length + globalQuota;
  for (const s of sorted) {
    if (picked.length >= cap2)
      break;
    if (!taken.has(s.path)) {
      picked.push(s);
      taken.add(s.path);
    }
  }
  for (const s of sorted) {
    if (picked.length >= n)
      break;
    if (!taken.has(s.path)) {
      picked.push(s);
      taken.add(s.path);
    }
  }
  return picked;
}
function nativeJsonlToRows(filePath, sessionId, agent) {
  let raw;
  try {
    raw = readFileSync19(filePath, "utf-8");
  } catch {
    return [];
  }
  const rows = [];
  let pendingAsstText;
  let pendingAsstTs;
  const flushAssistant = () => {
    if (pendingAsstText && pendingAsstText.trim().length > 0) {
      rows.push({
        type: "assistant_message",
        content: pendingAsstText,
        creation_date: pendingAsstTs,
        session_id: sessionId,
        agent
      });
    }
    pendingAsstText = void 0;
    pendingAsstTs = void 0;
  };
  for (const line of raw.split(/\n/)) {
    if (!line)
      continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const t = obj?.type;
    const ts = obj?.timestamp ?? obj?.created_at;
    if (t === "user") {
      const c = obj?.message?.content;
      if (typeof c === "string" && c.trim().length > 0) {
        flushAssistant();
        rows.push({
          type: "user_message",
          content: c,
          creation_date: ts,
          session_id: sessionId,
          agent
        });
      }
    } else if (t === "assistant") {
      const c = obj?.message?.content;
      if (Array.isArray(c)) {
        const text = c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n\n");
        if (text.trim().length > 0) {
          pendingAsstText = text;
          pendingAsstTs = ts;
        }
      }
    }
  }
  flushAssistant();
  return rows;
}

// dist/src/skillify/extractors/index.js
function extractPairs(rows) {
  const pairs2 = [];
  let pendingPrompt = null;
  let pendingAnswer = [];
  function flush() {
    if (pendingPrompt && pendingAnswer.length > 0) {
      pairs2.push({
        sessionId: pendingPrompt.row.session_id ?? "",
        agent: pendingPrompt.row.agent ?? null,
        date: pendingPrompt.row.creation_date ?? null,
        prompt: pendingPrompt.content,
        answer: pendingAnswer.join("\n\n")
      });
    }
    pendingPrompt = null;
    pendingAnswer = [];
  }
  for (const r of rows) {
    if (r.type === "user_message" && typeof r.content === "string") {
      flush();
      pendingPrompt = { content: r.content, row: r };
    } else if (r.type === "assistant_message" && typeof r.content === "string" && pendingPrompt) {
      if (r.content.trim().length > 0)
        pendingAnswer.push(r.content);
    }
  }
  flush();
  return pairs2;
}

// dist/src/skillify/gate-runner.js
import { existsSync as existsSync26 } from "node:fs";
import { createRequire } from "node:module";
import { homedir as homedir14 } from "node:os";
import { join as join30 } from "node:path";
var requireForCp = createRequire(import.meta.url);
var { execFileSync: runChildProcess } = requireForCp("node:child_process");
var inheritedEnv = process;
function firstExistingPath(candidates) {
  for (const c of candidates) {
    if (existsSync26(c))
      return c;
  }
  return null;
}
function findAgentBin(agent) {
  const home = homedir14();
  switch (agent) {
    // /usr/bin/<name> is included in every candidate list — that's the
    // common Linux package-manager install path (apt, dnf, pacman). Old
    // code used `which` which always checked it; the static-scan fix
    // dropped `which`, so /usr/bin needs to be explicit. CodeRabbit on
    // #170 caught the gap.
    case "claude_code":
      return firstExistingPath([
        join30(home, ".claude", "local", "claude"),
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        join30(home, ".npm-global", "bin", "claude"),
        join30(home, ".local", "bin", "claude"),
        "/opt/homebrew/bin/claude"
      ]) ?? join30(home, ".claude", "local", "claude");
    case "codex":
      return firstExistingPath([
        "/usr/local/bin/codex",
        "/usr/bin/codex",
        join30(home, ".npm-global", "bin", "codex"),
        join30(home, ".local", "bin", "codex"),
        "/opt/homebrew/bin/codex"
      ]) ?? "/usr/local/bin/codex";
    case "cursor":
      return firstExistingPath([
        "/usr/local/bin/cursor-agent",
        "/usr/bin/cursor-agent",
        join30(home, ".npm-global", "bin", "cursor-agent"),
        join30(home, ".local", "bin", "cursor-agent"),
        "/opt/homebrew/bin/cursor-agent"
      ]) ?? "/usr/local/bin/cursor-agent";
    case "hermes":
      return firstExistingPath([
        join30(home, ".local", "bin", "hermes"),
        "/usr/local/bin/hermes",
        "/usr/bin/hermes",
        join30(home, ".npm-global", "bin", "hermes"),
        "/opt/homebrew/bin/hermes"
      ]) ?? join30(home, ".local", "bin", "hermes");
    case "pi":
      return firstExistingPath([
        join30(home, ".local", "bin", "pi"),
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        join30(home, ".npm-global", "bin", "pi"),
        "/opt/homebrew/bin/pi"
      ]) ?? join30(home, ".local", "bin", "pi");
  }
}

// dist/src/skillify/gate-parser.js
function extractJsonBlock(s) {
  const trimmed = s.trim();
  if (!trimmed)
    return null;
  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenced)
    return fenced[1].trim();
  const start = trimmed.indexOf("{");
  if (start < 0)
    return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "{")
      depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0)
        return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

// dist/src/skillify/advisor.js
import { spawn as spawn2 } from "node:child_process";
import { existsSync as existsSync28 } from "node:fs";

// dist/src/skillify/local-manifest.js
import { existsSync as existsSync27, mkdirSync as mkdirSync11, readFileSync as readFileSync20, writeFileSync as writeFileSync16 } from "node:fs";
import { homedir as homedir15 } from "node:os";
import { dirname as dirname7, join as join31 } from "node:path";
var LOCAL_MANIFEST_PATH = join31(homedir15(), ".claude", "hivemind", "local-mined.json");
var LOCAL_MINE_LOCK_PATH = join31(homedir15(), ".claude", "hivemind", "local-mined.lock");
function readLocalManifest(path = LOCAL_MANIFEST_PATH) {
  if (!existsSync27(path))
    return null;
  try {
    return JSON.parse(readFileSync20(path, "utf-8"));
  } catch {
    return null;
  }
}
function writeLocalManifest(m, path = LOCAL_MANIFEST_PATH) {
  mkdirSync11(dirname7(path), { recursive: true });
  writeFileSync16(path, JSON.stringify(m, null, 2));
}
var LATEST_RUN_WINDOW_MS = 5 * 60 * 1e3;

// dist/src/skillify/advisor.js
var ADVISOR_TIMEOUT_MS = 6e4;
var MAX_CANDIDATES = 20;
function buildAdvisorPrompt(candidates) {
  const lines = [
    "You are reviewing skill candidates extracted from a user's coding sessions.",
    "Pick the ONE candidate whose `insight` field is most useful to show the user as a",
    "concrete finding from their past work. Reply on EXACTLY ONE LINE.",
    "",
    "GOOD insights are:",
    "  - Concrete and counted (cite specific numbers, file names, durations)",
    '  - About a real coding mistake or pattern the USER made (in 2nd person \u2014 "You did X")',
    "  - Actionable: the user can change behavior based on knowing this",
    "",
    "BAD insights (REJECT these) are:",
    '  - Meta-commentary about why the skill was saved ("User explicitly requested...")',
    "  - Vague / generic engineering platitudes the user already knows",
    "  - About someone other than the user (a teammate, a third party)",
    '  - Hypothetical ("could lead to...", "might cause...") rather than observed',
    "",
    "Output format \u2014 STRICT, one line only:",
    "  PICK: <number 1-N>",
    "OR",
    "  REJECT_ALL: <short reason why every candidate failed>",
    "",
    "Candidates:"
  ];
  for (const [i, c] of candidates.entries()) {
    lines.push(`${i + 1}. name=${c.skill_name}  insight=${JSON.stringify((c.insight ?? "").slice(0, 400))}`);
  }
  return lines.join("\n");
}
function parseAdvisorOutput(raw, candidates) {
  const cleaned = raw.trim();
  const pickMatch = cleaned.match(/PICK:\s*(\d+)/i);
  if (pickMatch) {
    const idx = parseInt(pickMatch[1], 10) - 1;
    if (idx >= 0 && idx < candidates.length) {
      return {
        pickedSkillName: candidates[idx].skill_name,
        reason: cleaned,
        rawOutput: raw
      };
    }
  }
  const rejectMatch = cleaned.match(/REJECT_ALL:\s*(.+)/i);
  if (rejectMatch) {
    return { pickedSkillName: null, reason: rejectMatch[1].trim(), rawOutput: raw };
  }
  return { pickedSkillName: null, reason: `unparseable advisor output: ${cleaned.slice(0, 120)}`, rawOutput: raw };
}
function runAdvisorGate(prompt, claudeBin) {
  return new Promise((resolve3, reject) => {
    const child = spawn2(claudeBin, [
      "-p",
      "--no-session-persistence",
      "--model",
      "sonnet",
      "--permission-mode",
      "bypassPermissions"
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" },
      // CREATE_NO_WINDOW: this runs inside the detached, console-less mine-local
      // worker, so without it Windows pops a visible console window for the
      // claude child. No-op on POSIX.
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (err, out) => {
      if (settled)
        return;
      settled = true;
      if (err)
        reject(err);
      else
        resolve3(out);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
      finish(new Error(`advisor timed out after ${ADVISOR_TIMEOUT_MS}ms`), "");
    }, ADVISOR_TIMEOUT_MS);
    child.stdout.on("data", (b) => {
      stdout += b.toString("utf-8");
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString("utf-8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      finish(e, "");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish(new Error(`advisor CLI exit ${code}; stderr=${stderr.slice(0, 200)}`), "");
      } else {
        finish(null, stdout);
      }
    });
    child.stdin.on("error", (e) => {
      clearTimeout(timer);
      finish(e, "");
    });
    child.stdin.end(prompt);
  });
}
async function runAdvisor(manifestPath2 = LOCAL_MANIFEST_PATH) {
  const m = readLocalManifest(manifestPath2);
  if (!m || !Array.isArray(m.entries))
    return null;
  const insightBearing = m.entries.filter((e) => e && typeof e.insight === "string" && e.insight.trim().length > 0);
  if (insightBearing.length === 0)
    return null;
  if (insightBearing.length === 1) {
    insightBearing[0].primary = true;
    writeLocalManifest(m, manifestPath2);
    return {
      pickedSkillName: insightBearing[0].skill_name,
      reason: "trivial pick (single candidate)",
      rawOutput: ""
    };
  }
  const claudeBin = findAgentBin("claude_code");
  if (!claudeBin || !existsSync28(claudeBin)) {
    return null;
  }
  const ranked = [...insightBearing].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, MAX_CANDIDATES);
  const prompt = buildAdvisorPrompt(ranked);
  let raw;
  try {
    raw = await runAdvisorGate(prompt, claudeBin);
  } catch (err) {
    return {
      pickedSkillName: null,
      reason: `advisor invocation failed: ${err.message}`,
      rawOutput: ""
    };
  }
  const result = parseAdvisorOutput(raw, ranked);
  if (result.pickedSkillName) {
    for (const e of m.entries) {
      if (e && e.primary === true)
        delete e.primary;
    }
    for (const e of m.entries) {
      if (e && e.skill_name === result.pickedSkillName) {
        e.primary = true;
        break;
      }
    }
    writeLocalManifest(m, manifestPath2);
  }
  return result;
}

// dist/src/commands/mine-local.js
import { unlinkSync as unlinkSync9 } from "node:fs";
var EPSILON = 0.3;
var DEFAULT_N = 8;
var PAIR_CHAR_CAP = 4e3;
var PER_SESSION_PAIR_CAP = 30;
var PER_SESSION_PROMPT_CAP = 12e4;
var GATE_CONCURRENCY = 4;
var IN_FLIGHT_MAX_AGE_MS = 6e4;
var GATE_TIMEOUT_MS = 24e4;
var MANIFEST_PATH = LOCAL_MANIFEST_PATH;
function runGateViaStdin(opts) {
  return new Promise((resolve3) => {
    if (opts.agent !== "claude_code") {
      resolve3({
        stdout: "",
        stderr: "",
        errored: true,
        errorMessage: `stdin gate runner only supports claude_code (got ${opts.agent}); for other agents the prompt must fit in argv`
      });
      return;
    }
    if (!existsSync29(opts.bin)) {
      resolve3({
        stdout: "",
        stderr: "",
        errored: true,
        errorMessage: `agent binary not found at ${opts.bin}`
      });
      return;
    }
    const args = [
      "-p",
      "--no-session-persistence",
      "--model",
      "haiku",
      ...permissionFlags(opts.grants)
    ];
    const child = spawn3(opts.bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" },
      // CREATE_NO_WINDOW: this runs inside the detached, console-less mine-local
      // worker, so without it Windows pops a visible console window for the
      // summarizer CLI child. No-op on POSIX.
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r) => {
      if (settled)
        return;
      settled = true;
      resolve3(r);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
      finish({
        stdout,
        stderr,
        errored: true,
        errorMessage: `gate timed out after ${opts.timeoutMs}ms`
      });
    }, opts.timeoutMs);
    child.stdout.on("data", (b) => {
      stdout += b.toString("utf-8");
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString("utf-8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      finish({ stdout, stderr, errored: true, errorMessage: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        stdout,
        stderr,
        errored: code !== 0,
        errorMessage: code !== 0 ? `claude_code CLI exited with code ${code}` : void 0
      });
    });
    child.stdin.on("error", (e) => {
      clearTimeout(timer);
      finish({ stdout, stderr, errored: true, errorMessage: `stdin write failed: ${e.message}` });
    });
    child.stdin.end(opts.prompt);
  });
}
var loadManifest2 = readLocalManifest;
var saveManifest2 = writeLocalManifest;
function truncate(s, max) {
  if (s.length <= max)
    return s;
  return s.slice(0, max) + `
[\u2026truncated ${s.length - max} chars]`;
}
function renderPairsBlock(pairs2) {
  let total = 0;
  const out = [];
  for (const [i, p] of pairs2.entries()) {
    const block = `--- exchange ${i + 1} ---
USER:
${truncate(p.prompt, PAIR_CHAR_CAP)}

ASSISTANT:
${truncate(p.answer, PAIR_CHAR_CAP)}
`;
    if (total + block.length > PER_SESSION_PROMPT_CAP) {
      out.push(`[\u2026${pairs2.length - i} more exchanges omitted to stay under budget]`);
      break;
    }
    out.push(block);
    total += block.length;
  }
  return out.join("\n");
}
function buildSessionPrompt(pairs2, session, verdictPath) {
  return [
    `You are a skill curator examining ONE session of recent agent activity.`,
    `Your job: identify up to 3 distinct, non-overlapping reusable skills hiding in this session.`,
    `Distinct = different problem domains. Empty list is fine if nothing qualifies.`,
    ``,
    `Session: ${session.sessionId} (agent: ${session.agent})`,
    ``,
    `RULES:`,
    `- A skill qualifies if it captures a concrete, repeatable workflow OR a non-obvious`,
    `  constraint/gotcha a future engineer would benefit from knowing. Intra-session is fine \u2014`,
    `  one deep dive yielding a generalizable takeaway counts.`,
    `- Especially valuable: REPEATABLE-MISTAKE patterns. Cases where the assistant declared`,
    `  work "done"/"fixed"/"verified" and the user came back to the same problem later; where`,
    `  the same class of mistake recurs (forgot to run tests, mishandled async state,`,
    `  hallucinated function/file existence, re-asked for confirmation on already-authorized`,
    `  work, jumped to plans without checking with the user, etc.); where the user manually`,
    `  corrected the same kind of error >1 time. These are the highest-value catches.`,
    `- Skip patterns that are obvious from reading the codebase or already in CLAUDE.md.`,
    `- Each body uses short sections (When to use, Workflow, Anti-patterns), concrete commands`,
    `  / paths / snippets drawn from the exchanges below, no marketing, no emojis.`,
    `- Each body under ~3000 characters.`,
    `- Skill names are kebab-case slugs (lowercase letters/digits/hyphens only).`,
    `- For each skill, also emit a one-line "insight": a concrete, quantified, second-person`,
    `  sentence describing what hivemind found that prompted the skill. Examples:`,
    `    "You revisited 4 merged PRs in the last month because the assistant declared 'done'`,
    `     before checking test output."`,
    `    "You corrected the same env-mismatch (beta vs prod) twice in the same week before`,
    `     deciding to switch deployment targets."`,
    `  The insight is what users will see at next SessionStart, so it must be honest \u2014 only`,
    `  assert counts and patterns you can ground in THIS session's exchanges. Omit the field`,
    `  if you cannot write a concrete, quantified line.`,
    ``,
    `=== EXCHANGES (user prompts + assistant final answers, tool calls stripped) ===`,
    renderPairsBlock(pairs2),
    ``,
    `=== YOUR TASK ===`,
    `Output a single JSON object. You may either:`,
    `  (a) Write the JSON to this exact path using the Write tool: ${verdictPath}`,
    `  (b) Print the JSON object to stdout as your final message, nothing else.`,
    `Pick whichever you prefer. Do not do both.`,
    ``,
    `Required shape:`,
    `{`,
    `  "reason": "<one-line justification>",`,
    `  "skills": [`,
    `    {`,
    `      "name": "<kebab-case>",`,
    `      "description": "<one-line: what the skill does>",`,
    `      "trigger": "<REQUIRED: one concrete activation condition, phrased 'Use this skill when <situation>' \u2014 folded into the host-visible description, so make it specific>",`,
    `      "body": "<full SKILL.md body without frontmatter>",`,
    `      "insight": "<one-line, concrete + quantified + second person; OPTIONAL>"`,
    `    },`,
    `    ... up to 3 entries, or [] if nothing qualifies`,
    `  ]`,
    `}`,
    ``,
    `If you print to stdout, do not include any prose before or after the JSON.`
  ].join("\n");
}
function parseMultiVerdict(raw) {
  const block = extractJsonBlock(raw);
  if (!block)
    return null;
  let parsed;
  try {
    parsed = JSON.parse(block);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object")
    return null;
  const skills = parsed.skills;
  if (!Array.isArray(skills))
    return null;
  const out = [];
  for (const s of skills) {
    if (!s || typeof s !== "object")
      continue;
    const name = typeof s.name === "string" ? s.name.trim() : "";
    const description = typeof s.description === "string" ? s.description.trim() : "";
    const body = typeof s.body === "string" ? s.body.trim() : "";
    const trigger = typeof s.trigger === "string" ? s.trigger.trim() : void 0;
    const rawInsight = typeof s.insight === "string" ? s.insight : "";
    const normalizedInsight = rawInsight.replace(/\s+/g, " ").trim();
    const insight = normalizedInsight.length > 0 ? normalizedInsight.slice(0, 280) : void 0;
    if (!name || !body)
      continue;
    out.push({ name, description, body, trigger, insight });
  }
  return { reason: typeof parsed.reason === "string" ? parsed.reason : void 0, skills: out };
}
function gateAgentFor(host, fallback, installs) {
  const installed = new Set(installs.map((i) => i.agent));
  if (installed.has("claude_code"))
    return "claude_code";
  return host ?? fallback;
}
async function parallelMap(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length)
          return;
        results[i] = await fn(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}
var SUMMARY_STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "via",
  "this",
  "that",
  "your",
  "you",
  "are",
  "was",
  "were",
  "use",
  "using",
  "uses",
  "used",
  "skill",
  "when",
  "what",
  "where",
  "which",
  "while",
  "how",
  "non",
  "any",
  "all",
  "code",
  "file",
  "files",
  "way",
  "ways",
  "via"
]);
function summaryTokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !SUMMARY_STOPWORDS.has(t)));
}
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0)
    return 0;
  let intersection = 0;
  for (const t of a)
    if (b.has(t))
      intersection++;
  return intersection / (a.size + b.size - intersection);
}
var OVERLAP_THRESHOLD = 0.4;
function findOverlap(candidateDesc, others) {
  const ct = summaryTokens(candidateDesc);
  let best = null;
  for (const e of others) {
    const score = jaccard(ct, summaryTokens(e.desc));
    if (score >= OVERLAP_THRESHOLD && (!best || score > best.score)) {
      best = { name: e.name, score };
    }
  }
  return best;
}
function loadExistingSummaries(skillsRoot) {
  const out = [];
  for (const s of listSkills(skillsRoot)) {
    const parsed = parseFrontmatter(s.body);
    const desc = parsed?.fm.description ?? "";
    if (desc)
      out.push({ name: s.name, desc });
  }
  return out;
}
function takeFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return null;
  const v = args[idx + 1];
  if (v === void 0 || v.startsWith("--")) {
    console.error(`${flag} requires a value`);
    process.exit(1);
  }
  args.splice(idx, 2);
  return v;
}
function takeBoolFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return false;
  args.splice(idx, 1);
  return true;
}
async function runMineLocal(args) {
  let lockReleased = false;
  const releaseLock3 = () => {
    if (lockReleased)
      return;
    lockReleased = true;
    try {
      unlinkSync9(LOCAL_MINE_LOCK_PATH);
    } catch {
    }
  };
  process.on("exit", releaseLock3);
  try {
    return await runMineLocalImpl(args);
  } finally {
    releaseLock3();
  }
}
async function runMineLocalImpl(args) {
  const work = [...args];
  const force = takeBoolFlag(work, "--force");
  const dryRun = takeBoolFlag(work, "--dry-run");
  const nRaw = takeFlagValue(work, "--n");
  const onlyAgent = takeFlagValue(work, "--only");
  const advise = takeBoolFlag(work, "--advise");
  if (loadManifest2() && !force) {
    console.error(`Local skills have already been mined on this machine.`);
    console.error(`Manifest: ${MANIFEST_PATH}`);
    console.error(`Pass --force to re-mine.`);
    process.exit(1);
  }
  const installsAll = detectInstalledAgents();
  if (installsAll.length === 0) {
    console.error(`No agent session directories detected. Run a session first.`);
    process.exit(1);
  }
  const installs = onlyAgent ? installsAll.filter((i) => i.agent === onlyAgent) : installsAll;
  if (installs.length === 0) {
    console.error(`No '${onlyAgent}' session directory detected. Skipping mine-local.`);
    process.exit(1);
  }
  console.log(`Detected installed agents: ${installs.map((i) => i.agent).join(", ")}${onlyAgent ? ` (filtered to ${onlyAgent})` : ""}`);
  const host = detectHostAgent();
  const fallback = installs[0].agent;
  const gateAgent = gateAgentFor(host, fallback, installs);
  if (gateAgent !== "claude_code") {
    console.error(`mine-local v1 requires the Claude Code CLI as its LLM gate.`);
    console.error(`Detected gate agent: ${gateAgent} (no claude_code session dir found at ~/.claude/projects/).`);
    console.error(`Install Claude Code, or run a Claude Code session once, then re-run.`);
    process.exit(1);
  }
  const gateBin = findAgentBin(gateAgent);
  console.log(`Gate CLI: ${gateAgent} (${gateBin})${host ? " \u2014 host-agent detected" : ""}`);
  const cwd = process.cwd();
  const rawSessions = listLocalSessions(installs, cwd);
  const now = Date.now();
  const allSessions = rawSessions.filter((s) => now - s.mtime >= IN_FLIGHT_MAX_AGE_MS);
  const dropped = rawSessions.length - allSessions.length;
  const cwdCount = allSessions.filter((s) => s.inCwd).length;
  console.log(`Found ${allSessions.length} local session(s) (${cwdCount} in cwd${dropped > 0 ? `, ${dropped} in-flight skipped` : ""})`);
  if (allSessions.length === 0) {
    console.error(`No mineable session files (all were modified within the last ${IN_FLIGHT_MAX_AGE_MS / 1e3}s).`);
    process.exit(1);
  }
  const n = nRaw === "all" ? allSessions.length : nRaw ? Math.max(1, parseInt(nRaw, 10) || DEFAULT_N) : DEFAULT_N;
  const picked = pickSessions(allSessions, { n, epsilon: EPSILON });
  console.log(`Picking ${picked.length} session(s) (\u03B5=${EPSILON}, N=${n}): ${picked.map((s) => s.sessionId.slice(0, 8)).join(", ")}`);
  if (dryRun) {
    console.log(`Dry-run: would invoke ${gateAgent} gate on ${picked.length} session(s) in parallel (concurrency=${GATE_CONCURRENCY}).`);
    return;
  }
  const tmpDir = join32(homedir16(), ".claude", "hivemind", `mine-local-${Date.now()}`);
  mkdirSync12(tmpDir, { recursive: true });
  console.log(`Running ${picked.length} gate call(s) in parallel (concurrency=${GATE_CONCURRENCY}, timeout=${GATE_TIMEOUT_MS / 1e3}s each)...`);
  const results = await parallelMap(picked, GATE_CONCURRENCY, async (s) => {
    const shortId = s.sessionId.slice(0, 8);
    const rows = nativeJsonlToRows(s.path, s.sessionId, s.agent);
    const pairs2 = extractPairs(rows);
    if (pairs2.length === 0) {
      console.log(`  [${shortId}] no usable pairs \u2014 skipped`);
      return { session: s, skills: [], reason: "no pairs", error: null };
    }
    const tail = pairs2.slice(-PER_SESSION_PAIR_CAP);
    const sessionTmp = join32(tmpDir, `s-${shortId}`);
    mkdirSync12(sessionTmp, { recursive: true });
    const verdictPath = join32(sessionTmp, "verdict.json");
    const prompt = buildSessionPrompt(tail, s, verdictPath);
    writeFileSync17(join32(sessionTmp, "prompt.txt"), prompt);
    const gate = await runGateViaStdin({
      agent: gateAgent,
      bin: gateBin,
      prompt,
      timeoutMs: GATE_TIMEOUT_MS,
      grants: { addDirs: [sessionTmp], allowedTools: ["Read", "Write"] }
    });
    try {
      writeFileSync17(join32(sessionTmp, "gate-stdout.txt"), gate.stdout);
      if (gate.stderr)
        writeFileSync17(join32(sessionTmp, "gate-stderr.txt"), gate.stderr);
    } catch {
    }
    if (gate.errored) {
      console.log(`  [${shortId}] gate failed: ${gate.errorMessage}`);
      return { session: s, skills: [], reason: null, error: gate.errorMessage ?? "gate failed" };
    }
    const verdictText = existsSync29(verdictPath) ? readFileSync21(verdictPath, "utf-8") : gate.stdout;
    const mv = parseMultiVerdict(verdictText);
    if (!mv) {
      console.log(`  [${shortId}] unparseable verdict (kept at ${sessionTmp})`);
      return { session: s, skills: [], reason: null, error: "unparseable verdict" };
    }
    console.log(`  [${shortId}] ${mv.skills.length} skill candidate(s) \u2014 ${mv.reason ?? "no reason given"}`);
    return { session: s, skills: mv.skills, reason: mv.reason ?? null, error: null };
  });
  const skillsRoot = resolveSkillsRoot("global", cwd);
  const totalCandidates = results.reduce((sum, r) => sum + r.skills.length, 0);
  const existingSummaries = loadExistingSummaries(skillsRoot);
  console.log("");
  console.log(`Got ${totalCandidates} candidate(s) across ${picked.length} session(s). Checking overlap against ${existingSummaries.length} installed skill(s) + each new write.`);
  if (totalCandidates === 0) {
    const existing = loadManifest2();
    saveManifest2({
      created_at: existing?.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
      entries: existing?.entries ?? []
    });
    console.log(`No skills to write.`);
    console.log(`tmp dir kept for inspection: ${tmpDir}`);
    return;
  }
  const flat = [];
  for (const r of results) {
    for (const sk of r.skills)
      flat.push({ skill: sk, session: r.session });
  }
  flat.sort((a, b) => b.session.mtime - a.session.mtime);
  const fanOutRoots = detectAgentSkillsRoots(skillsRoot);
  if (fanOutRoots.length > 0) {
    console.log(`Fan-out targets: ${fanOutRoots.join(", ")}`);
  }
  const written = [];
  const knownSummaries = [...existingSummaries];
  for (const { skill, session } of flat) {
    const overlap = findOverlap(skill.description, knownSummaries);
    if (overlap) {
      console.log(`  skipped ${skill.name} \u2190 session ${session.sessionId.slice(0, 8)} (description overlaps "${overlap.name}", Jaccard=${overlap.score.toFixed(2)})`);
      continue;
    }
    try {
      const result = writeNewSkill({
        skillsRoot,
        name: skill.name,
        description: skill.description,
        trigger: skill.trigger,
        body: skill.body,
        sourceSessions: [session.sessionId],
        agent: gateAgent
      });
      const canonicalDir = dirname8(result.path);
      const symlinks = fanOutRoots.length > 0 ? fanOutSymlinks(canonicalDir, basename(canonicalDir), fanOutRoots) : [];
      const symlinkSuffix = symlinks.length > 0 ? `, fan-out \u2192 ${symlinks.length} root(s)` : "";
      console.log(`  wrote ${result.name} \u2190 session ${session.sessionId.slice(0, 8)} (${session.agent}${symlinkSuffix})`);
      written.push({ skill, session, result, symlinks });
      knownSummaries.push({ name: result.name, desc: skill.description });
    } catch (e) {
      if (/already exists/i.test(e.message ?? "")) {
        console.log(`  skipped ${skill.name} (file already exists at ${skillsRoot})`);
      } else {
        console.log(`  failed ${skill.name}: ${e.message}`);
      }
    }
  }
  if (written.length > 0) {
    const existing = loadManifest2();
    const newEntries = written.map(({ skill, session, result, symlinks }) => ({
      // result.name is the canonical (possibly length-capped) on-disk name, so
      // the manifest identity matches canonical_path / the frontmatter — not
      // the raw model name, which may not exist on disk.
      skill_name: result.name,
      canonical_path: result.path,
      symlinks,
      source_session_ids: [session.sessionId],
      source_session_paths: [session.path],
      source_agent: session.agent,
      gate_agent: gateAgent,
      created_at: result.createdAt,
      uploaded: false,
      // Persist the one-line insight when the gate produced one. Omitted
      // (undefined → absent in JSON) when the gate couldn't ground a
      // concrete line, so the SessionStart banner falls back to the
      // count-only surface for entries written before this field landed.
      ...skill.insight ? { insight: skill.insight } : {}
    }));
    saveManifest2({
      created_at: existing?.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
      entries: [...existing?.entries ?? [], ...newEntries]
    });
    if (advise) {
      try {
        await runAdvisor();
      } catch {
      }
    }
  }
  console.log("");
  console.log(`Mined ${written.length} skill(s) from ${picked.length} session(s) (${results.filter((r) => r.skills.length > 0).length} session(s) contributed candidate(s)).`);
  console.log(`Installed to ${skillsRoot}/ \u2014 local-only, not shared.`);
  console.log(`Sign in with 'hivemind login' to share with your team later.`);
}

// dist/src/cli/skillify-spec.js
var SKILLIFY_SPEC = [
  {
    cmd: "hivemind skillify",
    desc: "show scope, team, install, per-project state"
  },
  {
    cmd: "hivemind skillify pull",
    desc: "sync project skills from the org table to local FS",
    options: [
      { flag: "--user <email>", desc: "only skills authored by that user" },
      { flag: "--users <a,b,c>", desc: "only skills from those authors" },
      { flag: "--all-users", desc: 'explicit "no author filter" (default)' },
      { flag: "--to <project|global>", desc: "install location (project=cwd/.claude/skills, global=~/.claude/skills)" },
      { flag: "--dry-run", desc: "preview without touching disk" },
      { flag: "--force", desc: "overwrite local files even if up-to-date (creates .bak)" },
      { flag: "<skill-name>", desc: "pull only that one skill (combines with --user)" }
    ],
    note: "every agent's SessionStart hook auto-runs 'pull --all-users --to global' on every session. File writes are idempotent (skipped when local is at-or-newer than remote). Disable via HIVEMIND_AUTOPULL_DISABLED=1."
  },
  {
    cmd: "hivemind skillify push",
    args: "<skill-name>",
    desc: "upload a local skill to the org table (inverse of pull)",
    options: [
      { flag: "--from <project|global>", desc: "which local skills dir to read (default: project)" },
      { flag: "--dry-run", desc: "preview without writing to the org table" }
    ],
    note: "the manual counterpart to mining \u2014 push a skill Claude wrote locally straight to the org table (append-only: re-pushing an existing skill lands a new version). Authorship/lineage is preserved; you're added as a contributor."
  },
  {
    cmd: "hivemind skillify unpull",
    desc: "remove every skill previously installed by pull",
    options: [
      { flag: "--user <email>", desc: "remove only that author's pulls" },
      { flag: "--not-mine", desc: "remove all pulls except your own" },
      { flag: "--dry-run", desc: "preview without touching disk" }
    ]
  },
  {
    cmd: "hivemind skillify scope",
    args: "<me|team|org>",
    desc: "sharing scope for newly mined skills"
  },
  {
    cmd: "hivemind skillify install",
    args: "<project|global>",
    desc: "default install location for new skills"
  },
  {
    cmd: "hivemind skillify promote",
    args: "<skill-name>",
    desc: "move a project skill to the global location"
  },
  {
    cmd: "hivemind skillify team add|remove|list",
    args: "<name>",
    desc: "manage team member list"
  },
  {
    cmd: "hivemind skillify mine-local",
    desc: "one-shot: mine skills from local sessions (no auth needed)",
    options: [
      { flag: "--n <num|all>", desc: "how many sessions to mine (default: 8)" },
      { flag: "--force", desc: "re-run even if the manifest sentinel exists" },
      { flag: "--dry-run", desc: "stop before calling the LLM gate" }
    ]
  }
];
function renderCliHelpBlock() {
  const INDENT = "  ";
  const CMD_COL_WIDTH = 42;
  const lines = [];
  for (const sub of SKILLIFY_SPEC) {
    const left = sub.args ? `${sub.cmd} ${sub.args}` : sub.cmd;
    const padded = left.length >= CMD_COL_WIDTH ? `${left}  ` : left.padEnd(CMD_COL_WIDTH);
    lines.push(`${INDENT}${padded}${capitalize(sub.desc)}.`);
    if (sub.options && sub.options.length > 0) {
      const optsList = sub.options.map((o) => o.flag).join(", ");
      lines.push(`${INDENT}${" ".repeat(CMD_COL_WIDTH)}Options: ${optsList}.`);
    }
    if (sub.note) {
      const noteWrapped = wrapAt(`Note: ${sub.note}`, 72);
      for (const noteLine of noteWrapped) {
        lines.push(`${INDENT}${" ".repeat(CMD_COL_WIDTH)}${noteLine}`);
      }
    }
  }
  return lines.join("\n");
}
function renderSubcommandUsageBlock() {
  const INDENT = "  ";
  const SUB_INDENT = "    ";
  const FLAG_INDENT = "      ";
  const CMD_COL_WIDTH = 44;
  const FLAG_COL_WIDTH = 26;
  const lines = [];
  for (const sub of SKILLIFY_SPEC) {
    const left = sub.args ? `${sub.cmd} ${sub.args}` : sub.cmd;
    const padded = left.length >= CMD_COL_WIDTH ? `${left}  ` : left.padEnd(CMD_COL_WIDTH);
    lines.push(`${INDENT}${padded}${sub.desc}`);
    if (sub.options && sub.options.length > 0) {
      const tail = sub.cmd.split(" ").slice(-1)[0];
      lines.push(`${SUB_INDENT}Options for ${tail}:`);
      for (const opt of sub.options) {
        const flagPadded = opt.flag.length >= FLAG_COL_WIDTH ? `${opt.flag}  ` : opt.flag.padEnd(FLAG_COL_WIDTH);
        lines.push(`${FLAG_INDENT}${flagPadded}${opt.desc}`);
      }
    }
  }
  return lines.join("\n");
}
function capitalize(s) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
function wrapAt(s, max) {
  const words = s.split(/\s+/);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0) {
      cur = w;
    } else if (cur.length + 1 + w.length > max) {
      out.push(cur);
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur)
    out.push(cur);
  return out;
}

// dist/src/commands/skillify.js
function stateDir() {
  return getStateDir();
}
function showStatus() {
  const cfg = loadScopeConfig();
  console.log(`scope:   ${cfg.scope}`);
  console.log(`team:    ${cfg.team.length === 0 ? "(empty)" : cfg.team.join(", ")}`);
  console.log(`install: ${cfg.install}  (${cfg.install === "global" ? "~/.claude/skills/" : "<project>/.claude/skills/"})`);
  const dir = stateDir();
  if (!existsSync30(dir)) {
    console.log(`state: (no projects tracked yet)`);
    return;
  }
  const files = readdirSync7(dir).filter((f) => f.endsWith(".json") && f !== "config.json" && f !== "pulled.json" && f !== "autopull-last-run.json");
  if (files.length === 0) {
    console.log(`state: (no projects tracked yet)`);
    return;
  }
  console.log(`state: ${files.length} project(s) tracked`);
  for (const f of files) {
    try {
      const s = JSON.parse(readFileSync22(join33(dir, f), "utf-8"));
      const last = typeof s.updatedAt === "number" ? new Date(s.updatedAt).toISOString() : s.lastDate ?? "never";
      const skills = Array.isArray(s.skillsGenerated) && s.skillsGenerated.length > 0 ? s.skillsGenerated.join(", ") : "none";
      console.log(`  - ${s.project} (counter=${s.counter}, last=${last}, skills=${skills})`);
    } catch {
    }
  }
}
function setScope(scope) {
  if (scope !== "me" && scope !== "team") {
    console.error(`Invalid scope '${scope}'. Use one of: me, team`);
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  saveScopeConfig({ ...cfg, scope });
  console.log(`Scope set to '${scope}'.`);
  if (scope === "team" && cfg.team.length === 0) {
    console.log(`Note: team list is empty. Use 'hivemind skillify team add <username>' to populate it.`);
  }
}
function setInstall(loc) {
  if (loc !== "project" && loc !== "global") {
    console.error(`Invalid install location '${loc}'. Use one of: project, global`);
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  saveScopeConfig({ ...cfg, install: loc });
  const path = loc === "global" ? join33(homedir17(), ".claude", "skills") : "<cwd>/.claude/skills";
  console.log(`Install location set to '${loc}'. New skills will be written to ${path}/<name>/SKILL.md.`);
}
function promoteSkill(name, cwd) {
  if (!name) {
    console.error("Usage: hivemind skillify promote <skill-name>");
    process.exit(1);
  }
  const projectPath = join33(cwd, ".claude", "skills", name);
  const globalPath = join33(homedir17(), ".claude", "skills", name);
  if (!existsSync30(join33(projectPath, "SKILL.md"))) {
    console.error(`Skill '${name}' not found at ${projectPath}/SKILL.md`);
    process.exit(1);
  }
  if (existsSync30(join33(globalPath, "SKILL.md"))) {
    console.error(`Skill '${name}' already exists at ${globalPath}/SKILL.md \u2014 refusing to overwrite. Remove it first or rename the project skill.`);
    process.exit(1);
  }
  mkdirSync13(dirname9(globalPath), { recursive: true });
  renameSync6(projectPath, globalPath);
  console.log(`Promoted '${name}' from ${projectPath} \u2192 ${globalPath}.`);
}
function teamAdd(name) {
  if (!name) {
    console.error("Usage: hivemind skillify team add <username>");
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  if (cfg.team.includes(name)) {
    console.log(`'${name}' is already in the team list.`);
    return;
  }
  const next = [...cfg.team, name].sort();
  saveScopeConfig({ ...cfg, team: next });
  console.log(`Added '${name}' to team. Team is now: ${next.join(", ")}`);
}
function teamRemove(name) {
  if (!name) {
    console.error("Usage: hivemind skillify team remove <username>");
    process.exit(1);
  }
  const cfg = loadScopeConfig();
  if (!cfg.team.includes(name)) {
    console.log(`'${name}' is not in the team list.`);
    return;
  }
  const next = cfg.team.filter((n) => n !== name);
  saveScopeConfig({ ...cfg, team: next });
  console.log(`Removed '${name}' from team. Team is now: ${next.length === 0 ? "(empty)" : next.join(", ")}`);
}
function teamList() {
  const cfg = loadScopeConfig();
  if (cfg.team.length === 0) {
    console.log(`(team list is empty)`);
    return;
  }
  for (const n of cfg.team)
    console.log(n);
}
function usage() {
  console.log("Usage:");
  console.log(renderSubcommandUsageBlock());
}
function takeFlagValue2(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return null;
  const value = args[idx + 1];
  if (value === void 0 || value.startsWith("--")) {
    console.error(`${flag} requires a value`);
    process.exit(1);
  }
  args.splice(idx, 2);
  return value;
}
function takeBooleanFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0)
    return false;
  args.splice(idx, 1);
  return true;
}
async function pullSkills(args) {
  const work = [...args];
  const toRaw = takeFlagValue2(work, "--to") ?? "global";
  const userOne = takeFlagValue2(work, "--user");
  const usersMany = takeFlagValue2(work, "--users");
  const allUsers = takeBooleanFlag(work, "--all-users");
  const dryRun = takeBooleanFlag(work, "--dry-run");
  const force = takeBooleanFlag(work, "--force");
  const skillName = work[0];
  if (toRaw !== "project" && toRaw !== "global") {
    console.error(`Invalid --to '${toRaw}'. Use 'project' or 'global'.`);
    process.exit(1);
  }
  let users = [];
  if (allUsers)
    users = [];
  else if (userOne)
    users = [userOne];
  else if (usersMany)
    users = usersMany.split(",").map((s) => s.trim()).filter(Boolean);
  const config = loadRoutedConfig();
  if (!config) {
    console.error("Not logged in. Run: hivemind login");
    process.exit(1);
  }
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.skillsTableName);
  const query = (sql) => api.query(sql);
  let summary;
  try {
    summary = await runPull({
      query,
      tableName: config.skillsTableName,
      install: toRaw,
      cwd: toRaw === "project" ? process.cwd() : void 0,
      users,
      skillName,
      dryRun,
      force
    });
  } catch (e) {
    console.error(`pull failed: ${e?.message ?? e}`);
    process.exit(1);
  }
  const dest = toRaw === "global" ? join33(homedir17(), ".claude", "skills") : join33(process.cwd(), ".claude", "skills");
  const filterDesc = users.length === 0 ? "all users" : users.join(", ");
  console.log(`Destination: ${dest}`);
  console.log(`Filter:      ${filterDesc}${skillName ? ` \xB7 skill='${skillName}'` : ""}${dryRun ? " \xB7 dry-run" : ""}${force ? " \xB7 force" : ""}`);
  console.log(`Scanned ${summary.scanned} remote skill(s).`);
  for (const e of summary.entries) {
    const tag = e.action === "wrote" ? "\u2713 wrote" : e.action === "dryrun" ? "\u2192 would write" : "\xB7 skipped";
    const ver = e.localVersion === null ? `v${e.remoteVersion} (new)` : `v${e.localVersion} \u2192 v${e.remoteVersion}`;
    console.log(`  ${tag.padEnd(15)} ${e.name.padEnd(40)} ${ver.padEnd(20)} (${e.author}/${e.sourceAgent})`);
    if (e.manifestError) {
      console.warn(`    \u26A0 manifest not updated: ${e.manifestError} \u2014 \`unpull\` will not see this entry until a successful repull.`);
    }
  }
  console.log(`Result: ${summary.wrote} written, ${summary.dryrun} dry-run, ${summary.skipped} skipped.`);
}
async function pushSkills(args) {
  const work = [...args];
  const fromRaw = takeFlagValue2(work, "--from") ?? "project";
  const dryRun = takeBooleanFlag(work, "--dry-run");
  const skillName = work[0];
  if (fromRaw !== "project" && fromRaw !== "global") {
    throw new Error(`Invalid --from '${fromRaw}'. Use 'project' or 'global'.`);
  }
  if (!skillName) {
    throw new Error("Usage: hivemind skillify push <skill-name> [--from project|global] [--dry-run]");
  }
  const config = loadRoutedConfig();
  if (!config) {
    throw new Error("Not logged in. Run: hivemind login");
  }
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.skillsTableName);
  const query = (sql) => api.query(sql);
  const scopeCfg = loadScopeConfig();
  const summary = await runPush({
    query,
    tableName: config.skillsTableName,
    workspaceId: config.workspaceId,
    from: fromRaw,
    cwd: process.cwd(),
    skillName,
    pusher: config.userName,
    scope: scopeCfg.scope,
    agent: "cli",
    dryRun
  });
  const src = fromRaw === "global" ? join33(homedir17(), ".claude", "skills") : join33(process.cwd(), ".claude", "skills");
  const verDesc = summary.previousVersion === null ? `v${summary.version} (new)` : `v${summary.previousVersion} \u2192 v${summary.version}`;
  const tag = summary.action === "pushed" ? "\u2713 pushed" : "\u2192 would push";
  console.log(`Source:      ${src}`);
  console.log(`  ${tag.padEnd(15)} ${summary.name.padEnd(40)} ${verDesc.padEnd(18)} (${summary.author}, scope=${summary.scope})`);
  if (summary.action === "dryrun") {
    console.log("Dry run \u2014 nothing written to the org skills table.");
  } else {
    console.log(`Pushed to org skills table as version ${summary.version}. Teammates get it on next \`hivemind skillify pull\`.`);
  }
}
async function unpullSkills(args) {
  const work = [...args];
  const toRaw = takeFlagValue2(work, "--to") ?? "global";
  const userOne = takeFlagValue2(work, "--user");
  const usersMany = takeFlagValue2(work, "--users");
  const notMine = takeBooleanFlag(work, "--not-mine");
  const dryRun = takeBooleanFlag(work, "--dry-run");
  const all = takeBooleanFlag(work, "--all");
  const legacyCleanup = takeBooleanFlag(work, "--legacy-cleanup");
  if (toRaw !== "project" && toRaw !== "global") {
    throw new Error(`Invalid --to '${toRaw}'. Use 'project' or 'global'.`);
  }
  let users = [];
  if (userOne)
    users = [userOne];
  else if (usersMany)
    users = usersMany.split(",").map((s) => s.trim()).filter(Boolean);
  let myUsername;
  if (notMine) {
    const config = loadConfig();
    if (!config) {
      throw new Error("--not-mine requires a logged-in user. Run: hivemind login");
    }
    myUsername = config.userName;
  }
  const summary = runUnpull({
    install: toRaw,
    cwd: toRaw === "project" ? process.cwd() : void 0,
    users,
    myUsername,
    notMine,
    dryRun,
    all,
    legacyCleanup
  });
  const dest = toRaw === "global" ? join33(homedir17(), ".claude", "skills") : join33(process.cwd(), ".claude", "skills");
  const filterParts = [];
  if (users.length > 0)
    filterParts.push(`users=${users.join(",")}`);
  if (notMine)
    filterParts.push("not-mine");
  if (all)
    filterParts.push("all");
  if (legacyCleanup)
    filterParts.push("legacy-cleanup");
  if (dryRun)
    filterParts.push("dry-run");
  const filterDesc = filterParts.length ? filterParts.join(" \xB7 ") : "(no filter \u2014 all pulled)";
  console.log(`Scanning:    ${dest}`);
  console.log(`Filter:      ${filterDesc}`);
  console.log(`Scanned ${summary.scanned} dir(s).`);
  for (const e of summary.entries) {
    const tag = e.action === "removed" ? "\u2713 removed" : e.action === "would-remove" ? "\u2192 would remove" : e.action === "manifest-pruned" ? "\u26A0 pruned (orphan)" : "\xB7 kept";
    const id = e.dirName;
    const note = e.reason ? `  (${e.reason})` : "";
    console.log(`  ${tag.padEnd(20)} ${id.padEnd(50)} [${e.kind}]${note}`);
  }
  const prunedNote = summary.manifestPruned > 0 ? `, ${summary.manifestPruned} manifest-pruned` : "";
  console.log(`Result: ${summary.removed} removed, ${summary.wouldRemove} dry-run, ${summary.kept} kept${prunedNote}.`);
}
function runSkillifyCommand(args) {
  const sub = args[0];
  if (!sub || sub === "status") {
    showStatus();
    return;
  }
  if (sub === "scope") {
    setScope(args[1] ?? "");
    return;
  }
  if (sub === "install") {
    setInstall(args[1] ?? "");
    return;
  }
  if (sub === "promote") {
    promoteSkill(args[1] ?? "", process.cwd());
    return;
  }
  if (sub === "pull") {
    pullSkills(args.slice(1)).catch((e) => {
      console.error(`pull error: ${e?.message ?? e}`);
      process.exit(1);
    });
    return;
  }
  if (sub === "push") {
    pushSkills(args.slice(1)).catch((e) => {
      console.error(`push error: ${e?.message ?? e}`);
      process.exit(1);
    }).catch(() => {
    });
    return;
  }
  if (sub === "unpull") {
    unpullSkills(args.slice(1)).catch((e) => {
      console.error(`unpull error: ${e?.message ?? e}`);
      process.exit(1);
    }).catch(() => {
    });
    return;
  }
  if (sub === "team") {
    const action = args[1];
    if (action === "add") {
      teamAdd(args[2] ?? "");
      return;
    }
    if (action === "remove") {
      teamRemove(args[2] ?? "");
      return;
    }
    if (action === "list") {
      teamList();
      return;
    }
    console.error("Usage: hivemind skillify team <add|remove|list> [name]");
    process.exit(1);
  }
  if (sub === "mine-local") {
    runMineLocal(args.slice(1)).catch((e) => {
      console.error(`mine-local error: ${e?.message ?? e}`);
      process.exit(1);
    });
    return;
  }
  if (sub === "--help" || sub === "-h" || sub === "help") {
    usage();
    return;
  }
  console.error(`Unknown skillify subcommand: ${sub}`);
  usage();
  process.exit(1);
}
if (process.argv[1] && process.argv[1].endsWith("skillify.js")) {
  runSkillifyCommand(process.argv.slice(2));
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
async function getRuleLatest(query, tableName, ruleId) {
  const safe = sqlIdent(tableName);
  const rows = await query(`SELECT ${SELECT_COLS} FROM "${safe}" WHERE rule_id = '${sqlStr(ruleId)}' ORDER BY version DESC, created_at DESC, id DESC LIMIT 1`);
  if (rows.length === 0)
    return null;
  return normalize(rows[0]);
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

// dist/src/rules/write.js
var MAX_TEXT_LENGTH = 2e3;
function assertValidText(text) {
  if (text.length === 0)
    throw new Error("Rule text must not be empty");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Rule text exceeds ${MAX_TEXT_LENGTH} chars (got ${text.length})`);
  }
  if (/[\r\n\u2028\u2029\u0085]/.test(text)) {
    throw new Error("Rule text must not contain newlines (use one rule per line)");
  }
}
async function insertRule(query, tableName, input) {
  assertValidText(input.text);
  const safe = sqlIdent(tableName);
  const ruleId = randomUUID3();
  const rowId = randomUUID3();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const agent = input.agent ?? "manual";
  const pluginVersion = input.plugin_version ?? "";
  const sql = `INSERT INTO "${safe}" (id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version) VALUES ('${sqlStr(rowId)}', '${sqlStr(ruleId)}', E'${sqlStr(input.text)}', 'team', 'active', '${sqlStr(input.assigned_by)}', 1, '${sqlStr(now)}', '${sqlStr(agent)}', '${sqlStr(pluginVersion)}')`;
  await query(sql);
  return { rule_id: ruleId, version: 1 };
}
async function editRule(query, tableName, input) {
  const previous = await getRuleLatest(query, tableName, input.rule_id);
  if (!previous) {
    throw new Error(`Rule not found: ${input.rule_id}`);
  }
  return appendVersion(query, tableName, previous, {
    text: input.text ?? previous.text,
    status: input.status ?? previous.status,
    assigned_by: input.assigned_by,
    agent: input.agent,
    plugin_version: input.plugin_version
  });
}
async function markRuleDone(query, tableName, input) {
  return editRule(query, tableName, { ...input, status: "done" });
}
async function appendVersion(query, tableName, previous, next) {
  assertValidText(next.text);
  const safe = sqlIdent(tableName);
  const rowId = randomUUID3();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const nextVersion = previous.version + 1;
  const agent = next.agent ?? "manual";
  const pluginVersion = next.plugin_version ?? "";
  const sql = `INSERT INTO "${safe}" (id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version) VALUES ('${sqlStr(rowId)}', '${sqlStr(previous.rule_id)}', E'${sqlStr(next.text)}', 'team', '${sqlStr(next.status)}', '${sqlStr(next.assigned_by)}', ${nextVersion}, '${sqlStr(now)}', '${sqlStr(agent)}', '${sqlStr(pluginVersion)}')`;
  await query(sql);
  return { rule_id: previous.rule_id, version: nextVersion };
}

// dist/src/commands/rules.js
var USAGE2 = `
hivemind rules \u2014 manage team-wide rules

Usage:
  hivemind rules add "<text>" [--scope team]
  hivemind rules list [--status active|done|all] [--limit N]
  hivemind rules edit <rule-id> "<new text>"
  hivemind rules done <rule-id>
`.trim();
function logUsageAndExit(code = 1) {
  console.error(USAGE2);
  process.exit(code);
  throw new Error("unreachable");
}
function requireConfig() {
  const cfg = loadRoutedConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }
  return cfg;
}
function makeApi(cfg) {
  return new DeeplakeApi(cfg.token, cfg.apiUrl, cfg.orgId, cfg.workspaceId, cfg.tableName);
}
function parseScope2(args) {
  const idx = args.findIndex((a) => a === "--scope" || a.startsWith("--scope="));
  if (idx === -1)
    return "team";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw !== "team") {
    console.error(`Invalid --scope value: ${raw}. Rules support 'team' only in v1.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return "team";
}
function parseStatus(args) {
  const idx = args.findIndex((a) => a === "--status" || a.startsWith("--status="));
  if (idx === -1)
    return "active";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw === "active" || raw === "done" || raw === "all")
    return raw;
  console.error(`Invalid --status value: ${raw}. Allowed: active | done | all.`);
  process.exit(1);
  throw new Error("unreachable");
}
function parseLimit(args) {
  const idx = args.findIndex((a) => a === "--limit" || a.startsWith("--limit="));
  if (idx === -1)
    return 10;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(`Invalid --limit value: ${raw}. Must be a positive integer.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return n;
}
function stripKnownFlags(args) {
  const KNOWN = /* @__PURE__ */ new Set(["--scope", "--status", "--limit"]);
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (KNOWN.has(a)) {
      i++;
      continue;
    }
    if (KNOWN.has(a.split("=", 2)[0])) {
      continue;
    }
    out.push(a);
  }
  return out;
}
function formatListRow(r) {
  const tag = r.status === "done" ? "[done]" : "[active]";
  return `${tag} ${r.rule_id}  v${r.version}  ${r.assigned_by}  ${r.text}`;
}
async function runRulesCommand(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE2);
    return;
  }
  const cfg = requireConfig();
  const api = makeApi(cfg);
  const tableName = cfg.rulesTableName;
  const WRITE_SUBS = /* @__PURE__ */ new Set(["add", "edit", "done"]);
  if (WRITE_SUBS.has(sub)) {
    await api.ensureRulesTable(tableName);
  }
  const pluginVersion = getVersion();
  if (sub === "add") {
    const positional = stripKnownFlags(args.slice(1));
    const text = positional[0];
    if (!text) {
      console.error('Missing rule text. Usage: hivemind rules add "<text>" [--scope team]');
      process.exit(1);
      throw new Error("unreachable");
    }
    parseScope2(args.slice(1));
    try {
      const out = await insertRule(api.query.bind(api), tableName, {
        text,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion
      });
      console.log(`Added rule ${out.rule_id} (v${out.version}).`);
    } catch (err) {
      console.error(`Add failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (sub === "list") {
    const status = parseStatus(args.slice(1));
    const limit = parseLimit(args.slice(1));
    const knownTables = await api.knownTablesOrNull();
    if (knownTables !== null && !knownTables.includes(tableName)) {
      console.log(`(no rules with status=${status})`);
      return;
    }
    let rows = [];
    try {
      rows = await listRules(api.query.bind(api), tableName, { status, limit });
    } catch (err) {
      const msg = err.message;
      if (!isMissingTableError(msg))
        throw err;
    }
    if (rows.length === 0) {
      console.log(`(no rules with status=${status})`);
      return;
    }
    for (const r of rows)
      console.log(formatListRow(r));
    return;
  }
  if (sub === "edit") {
    const positional = stripKnownFlags(args.slice(1));
    const ruleId = positional[0];
    const newText = positional[1];
    if (!ruleId || !newText) {
      console.error('Usage: hivemind rules edit <rule-id> "<new text>"');
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await editRule(api.query.bind(api), tableName, {
        rule_id: ruleId,
        text: newText,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion
      });
      console.log(`Edited rule ${out.rule_id} \u2192 v${out.version}.`);
    } catch (err) {
      console.error(`Edit failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (sub === "done") {
    const positional = stripKnownFlags(args.slice(1));
    const ruleId = positional[0];
    if (!ruleId) {
      console.error("Usage: hivemind rules done <rule-id>");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await markRuleDone(api.query.bind(api), tableName, {
        rule_id: ruleId,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion
      });
      console.log(`Marked rule ${out.rule_id} done (v${out.version}).`);
    } catch (err) {
      console.error(`Done failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  console.error(`Unknown rules subcommand: ${sub}`);
  logUsageAndExit(1);
}

// dist/src/commands/goal.js
import { randomUUID as randomUUID4 } from "node:crypto";
var VALID_STATUS = /* @__PURE__ */ new Set(["opened", "in_progress", "closed"]);
var VALID_AGENT = /* @__PURE__ */ new Set(["manual", "capture"]);
function parseAgentFlag(args) {
  const rest = [];
  let agent = "manual";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent") {
      const val = args[i + 1];
      if (!val) {
        process.stderr.write("usage: --agent requires a value (manual|capture)\n");
        process.exit(1);
      }
      agent = val;
      i++;
      continue;
    }
    rest.push(args[i]);
  }
  if (!VALID_AGENT.has(agent)) {
    process.stderr.write(`invalid --agent: ${agent} (expected manual|capture)
`);
    process.exit(1);
  }
  return { agent, rest };
}
function loadApiOrDie(table) {
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("hivemind: not logged in. Run `hivemind login` first.\n");
    process.exit(1);
  }
  const api = new DeeplakeApi(cfg.token, cfg.apiUrl, cfg.orgId, cfg.workspaceId, table);
  const query = (sql) => api.query(sql);
  return { api, query, userName: cfg.userName };
}
async function goalAdd(text, agent = "manual") {
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("hivemind: not logged in.\n");
    process.exit(1);
  }
  const table = cfg.goalsTableName;
  const { api, query } = loadApiOrDie(table);
  await api.ensureGoalsTable(table);
  const safe = sqlIdent(table);
  const goalId = randomUUID4();
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`INSERT INTO "${safe}" (id, goal_id, owner, status, content, version, created_at, updated_at, agent, plugin_version) VALUES ('${randomUUID4()}', '${sqlStr(goalId)}', '${sqlStr(cfg.userName)}', 'opened', E'${sqlStr(text)}', 1, '${sqlStr(ts)}', '${sqlStr(ts)}', '${sqlStr(agent)}', '')`);
  process.stdout.write(`${goalId}
`);
}
async function goalList(filter) {
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { query } = loadApiOrDie(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  let where = "";
  if (filter === "mine")
    where = `WHERE owner = '${sqlStr(cfg.userName)}'`;
  try {
    const rows = await query(`SELECT goal_id, owner, status, content FROM "${safe}" ${where} ORDER BY created_at DESC LIMIT 50`);
    if (rows.length === 0) {
      process.stdout.write("(no goals)\n");
      return;
    }
    for (const r of rows) {
      const text = String(r.content ?? "").split(/\r?\n/)[0].trim();
      process.stdout.write(`${r.goal_id}	${r.owner}	${r.status}	${text}
`);
    }
  } catch (e) {
    process.stderr.write(`hivemind goal list: ${e.message}
`);
    process.exit(1);
  }
}
async function goalGet(goalId) {
  if (!goalId) {
    process.stderr.write("usage: hivemind goal get <goal_id>\n");
    process.exit(1);
  }
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { query } = loadApiOrDie(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  try {
    const rows = await query(`SELECT content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' ORDER BY version DESC, created_at DESC LIMIT 1`);
    if (rows.length === 0) {
      process.stderr.write(`goal not found: ${goalId}
`);
      process.exit(1);
    }
    process.stdout.write(`${String(rows[0].content ?? "")}
`);
  } catch (e) {
    process.stderr.write(`hivemind goal get: ${e.message}
`);
    process.exit(1);
  }
}
async function goalDone(goalId) {
  await goalProgress(goalId, "closed");
}
async function goalProgress(goalId, status) {
  if (!VALID_STATUS.has(status)) {
    process.stderr.write(`invalid status: ${status} (expected opened|in_progress|closed)
`);
    process.exit(1);
  }
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { api, query } = loadApiOrDie(cfg.goalsTableName);
  await api.ensureGoalsTable(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`UPDATE "${safe}" SET status = '${sqlStr(status)}', updated_at = '${sqlStr(ts)}' WHERE goal_id = '${sqlStr(goalId)}'`);
  process.stdout.write(`${goalId} -> ${status}
`);
}
async function kpiAdd(args) {
  const [goalId, kpiId, targetStr, unit, ...nameParts] = args;
  if (!goalId || !kpiId || !targetStr || !unit) {
    process.stderr.write("usage: hivemind kpi add <goal_id> <kpi_id> <target> <unit> [name]\n");
    process.exit(1);
  }
  const target = Number.parseInt(targetStr, 10);
  if (!Number.isFinite(target) || target <= 0) {
    process.stderr.write(`invalid target: ${targetStr} (must be positive integer)
`);
    process.exit(1);
  }
  const name = nameParts.length > 0 ? nameParts.join(" ") : kpiId;
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { api, query } = loadApiOrDie(cfg.kpisTableName);
  await api.ensureKpisTable(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  const content = `${name}

- target: ${target}
- current: 0
- unit: ${unit}`;
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`INSERT INTO "${safe}" (id, goal_id, kpi_id, content, version, created_at, updated_at, agent, plugin_version) VALUES ('${randomUUID4()}', '${sqlStr(goalId)}', '${sqlStr(kpiId)}', E'${sqlStr(content)}', 1, '${sqlStr(ts)}', '${sqlStr(ts)}', 'manual', '')`);
  process.stdout.write(`${goalId}/${kpiId}
`);
}
async function kpiList(goalId) {
  if (!goalId) {
    process.stderr.write("usage: hivemind kpi list <goal_id>\n");
    process.exit(1);
  }
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { query } = loadApiOrDie(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  try {
    const rows = await query(`SELECT kpi_id, content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' ORDER BY created_at ASC LIMIT 50`);
    if (rows.length === 0) {
      process.stdout.write("(no kpis)\n");
      return;
    }
    for (const r of rows) {
      const firstLine = String(r.content ?? "").split(/\r?\n/)[0].trim();
      process.stdout.write(`${r.kpi_id}	${firstLine}
`);
    }
  } catch (e) {
    process.stderr.write(`hivemind kpi list: ${e.message}
`);
    process.exit(1);
  }
}
async function kpiBump(goalId, kpiId, deltaStr) {
  if (!goalId || !kpiId || !deltaStr) {
    process.stderr.write("usage: hivemind kpi bump <goal_id> <kpi_id> <delta>\n");
    process.exit(1);
  }
  const delta = Number.parseInt(deltaStr, 10);
  if (!Number.isFinite(delta)) {
    process.stderr.write(`invalid delta: ${deltaStr}
`);
    process.exit(1);
  }
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("not logged in\n");
    process.exit(1);
  }
  const { api, query } = loadApiOrDie(cfg.kpisTableName);
  await api.ensureKpisTable(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  const rows = await query(`SELECT content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' AND kpi_id = '${sqlStr(kpiId)}' LIMIT 1`);
  if (rows.length === 0) {
    process.stderr.write(`kpi not found: ${goalId}/${kpiId}
`);
    process.exit(1);
  }
  const content = String(rows[0].content ?? "");
  const newContent = content.replace(/^(\s*-?\s*current\s*:\s*)(-?\d+)(\s*)$/m, (_m, prefix, n, suffix) => `${prefix}${Number.parseInt(n, 10) + delta}${suffix}`);
  if (newContent === content) {
    process.stderr.write(`could not find 'current:' line in kpi ${goalId}/${kpiId}
`);
    process.exit(1);
  }
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await query(`UPDATE "${safe}" SET content = E'${sqlStr(newContent)}', updated_at = '${sqlStr(ts)}' WHERE goal_id = '${sqlStr(goalId)}' AND kpi_id = '${sqlStr(kpiId)}'`);
  process.stdout.write(`${goalId}/${kpiId} +${delta}
`);
}
var USAGE_GOAL = `
hivemind goal \u2014 manage team goals

Usage:
  hivemind goal add "<text>" [--agent manual|capture]
                                        create a goal (status=opened)
  hivemind goal list [--all|--mine]     list goals (default: --mine)
  hivemind goal get <goal_id>           print a goal's full body (resume context)
  hivemind goal done <goal_id>          mark goal closed
  hivemind goal progress <goal_id> <opened|in_progress|closed>
`.trim();
async function runGoalCommand(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(USAGE_GOAL + "\n");
    return;
  }
  if (sub === "add") {
    const { agent, rest } = parseAgentFlag(args.slice(1));
    const text = rest.join(" ").trim();
    if (!text) {
      process.stderr.write('usage: hivemind goal add "<text>"\n');
      process.exit(1);
    }
    await goalAdd(text, agent);
    return;
  }
  if (sub === "list") {
    const filter = args.includes("--all") ? "all" : "mine";
    await goalList(filter);
    return;
  }
  if (sub === "get") {
    const id = args[1];
    if (!id) {
      process.stderr.write("usage: hivemind goal get <goal_id>\n");
      process.exit(1);
    }
    await goalGet(id);
    return;
  }
  if (sub === "done") {
    const id = args[1];
    if (!id) {
      process.stderr.write("usage: hivemind goal done <goal_id>\n");
      process.exit(1);
    }
    await goalDone(id);
    return;
  }
  if (sub === "progress") {
    const id = args[1];
    const status = args[2];
    if (!id || !status) {
      process.stderr.write("usage: hivemind goal progress <goal_id> <status>\n");
      process.exit(1);
    }
    await goalProgress(id, status);
    return;
  }
  process.stderr.write(`unknown goal subcommand: ${sub}
${USAGE_GOAL}
`);
  process.exit(1);
}
var USAGE_KPI = `
hivemind kpi \u2014 manage goal KPIs

Usage:
  hivemind kpi add <goal_id> <kpi_id> <target> <unit> [name]
  hivemind kpi list <goal_id>
  hivemind kpi bump <goal_id> <kpi_id> <delta>
`.trim();
async function runKpiCommand(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(USAGE_KPI + "\n");
    return;
  }
  if (sub === "add") {
    await kpiAdd(args.slice(1));
    return;
  }
  if (sub === "list") {
    await kpiList(args[1]);
    return;
  }
  if (sub === "bump") {
    await kpiBump(args[1], args[2], args[3]);
    return;
  }
  process.stderr.write(`unknown kpi subcommand: ${sub}
${USAGE_KPI}
`);
  process.exit(1);
}

// dist/src/commands/docs.js
import { existsSync as existsSync35, readFileSync as readFileSync27 } from "node:fs";

// dist/src/docs/index-render.js
function dirOf(docId) {
  const i = docId.lastIndexOf("/");
  return i < 0 ? "" : docId.slice(0, i);
}
function childUnder(atDir, docId) {
  const prefix = atDir === "" ? "" : atDir + "/";
  if (!docId.startsWith(prefix))
    return null;
  const rest = docId.slice(prefix.length);
  if (rest === "" || rest.startsWith("/"))
    return null;
  const slash = rest.indexOf("/");
  if (slash < 0)
    return { kind: "file", name: rest };
  return { kind: "dir", name: rest.slice(0, slash) };
}
function firstDocLine(content, max = 90) {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line === "---")
      continue;
    return line.length > max ? line.slice(0, max - 1).trimEnd() + "\u2026" : line;
  }
  return "";
}
function dateOnly(ts) {
  return ts.slice(0, 10);
}
function buildDocsIndex(meta, atDir = "", summaries = /* @__PURE__ */ new Map()) {
  const active = meta.filter((m) => m.status === "active");
  const subdirs = /* @__PURE__ */ new Map();
  const files = [];
  for (const m of active) {
    const child = childUnder(atDir, m.doc_id);
    if (!child)
      continue;
    if (child.kind === "file") {
      files.push(m);
    } else {
      const agg = subdirs.get(child.name);
      if (agg) {
        agg.count++;
        if (m.updated_at > agg.latest)
          agg.latest = m.updated_at;
      } else {
        subdirs.set(child.name, { count: 1, latest: m.updated_at });
      }
    }
  }
  const title = atDir === "" ? "# Docs Index" : `# Docs: ${atDir}/`;
  const lines = [
    title,
    "",
    "Per-file documentation, kept fresh on code changes. Drill into a directory,",
    "or open a file's doc directly. Metadata only \u2014 open a leaf for the content.",
    ""
  ];
  if (subdirs.size > 0) {
    lines.push("## Directories", "");
    lines.push("| Directory | Docs | Last updated |");
    lines.push("|-----------|------|--------------|");
    for (const name of [...subdirs.keys()].sort()) {
      const agg = subdirs.get(name);
      const rel = `${name}/index.md`;
      lines.push(`| [${name}/](${rel}) | ${agg.count} | ${dateOnly(agg.latest)} |`);
    }
    lines.push("");
  }
  if (files.length > 0) {
    lines.push("## Files", "");
    const hasSummary = files.some((f) => (summaries.get(f.doc_id) ?? "") !== "");
    if (hasSummary) {
      lines.push("| File | Version | Updated | Summary |");
      lines.push("|------|---------|---------|---------|");
    } else {
      lines.push("| File | Version | Updated |");
      lines.push("|------|---------|---------|");
    }
    for (const f of files.sort((a, b) => a.doc_id.localeCompare(b.doc_id))) {
      const base = f.doc_id.slice(f.doc_id.lastIndexOf("/") + 1);
      const rel = `${base}.md`;
      const ver = `v${f.version}`;
      if (hasSummary) {
        lines.push(`| [${base}](${rel}) | ${ver} | ${dateOnly(f.updated_at)} | ${summaries.get(f.doc_id) ?? ""} |`);
      } else {
        lines.push(`| [${base}](${rel}) | ${ver} | ${dateOnly(f.updated_at)} |`);
      }
    }
    lines.push("");
  }
  if (subdirs.size === 0 && files.length === 0) {
    lines.push(atDir === "" ? "_(no docs yet \u2014 run `hivemind docs generate`)_" : `_(no docs under ${atDir}/)_`);
    lines.push("");
  }
  const totalActive = active.length;
  const archived = meta.length - totalActive;
  lines.push("---", `${totalActive} active doc(s)${archived > 0 ? `, ${archived} archived` : ""}.`);
  return lines.join("\n");
}

// dist/src/docs/impact.js
function computeStaleDocs(args) {
  const nodeById = new Map(args.snap.nodes.map((n) => [n.id, n]));
  const out = [];
  for (const doc of args.docs) {
    const reasons = [];
    for (const anchor of doc.anchors) {
      const node = nodeById.get(anchor.symbol_id);
      if (!node) {
        reasons.push({ kind: "symbol_missing", symbol_id: anchor.symbol_id });
        continue;
      }
      const current = computeSymbolHash(node, args.repoRoot);
      if (current === null) {
        reasons.push({ kind: "symbol_missing", symbol_id: anchor.symbol_id });
        continue;
      }
      if (current !== anchor.content_hash) {
        reasons.push({ kind: "code_changed", symbol_id: anchor.symbol_id });
      }
    }
    if (reasons.length > 0)
      out.push({ doc_id: doc.doc_id, reasons });
  }
  return out;
}
function widenByBlastRadius(args) {
  const changed = new Set(args.changedSymbolIds);
  if (changed.size === 0)
    return [];
  const closure = impactedNodes(args.snap, changed);
  const out = [];
  for (const doc of args.docs) {
    const reasons = [];
    for (const anchor of doc.anchors) {
      if (closure.has(anchor.symbol_id) && !changed.has(anchor.symbol_id)) {
        reasons.push({ kind: "caller_changed", symbol_id: anchor.symbol_id });
      }
    }
    if (reasons.length > 0)
      out.push({ doc_id: doc.doc_id, reasons });
  }
  return out;
}
function computeImpactedDocs(args) {
  const merged = /* @__PURE__ */ new Map();
  const add = (d) => {
    const cur = merged.get(d.doc_id);
    if (cur)
      cur.push(...d.reasons);
    else
      merged.set(d.doc_id, [...d.reasons]);
  };
  const direct = computeStaleDocs({ snap: args.snap, docs: args.docs, repoRoot: args.repoRoot });
  for (const d of direct)
    add(d);
  const seeds = /* @__PURE__ */ new Set();
  if (args.diff) {
    for (const n of args.diff.nodes.added)
      seeds.add(n.id);
    for (const n of args.diff.nodes.removed)
      seeds.add(n.id);
  }
  for (const d of direct) {
    for (const r of d.reasons) {
      if (r.kind === "code_changed")
        seeds.add(r.symbol_id);
    }
  }
  for (const d of widenByBlastRadius({ snap: args.snap, changedSymbolIds: seeds, docs: args.docs })) {
    add(d);
  }
  return [...merged.entries()].map(([doc_id, reasons]) => ({ doc_id, reasons }));
}

// dist/src/docs/wiki-refresh.js
import { existsSync as existsSync32, readFileSync as readFileSync24, writeFileSync as writeFileSync19 } from "node:fs";
import { join as join35 } from "node:path";

// dist/src/docs/meta.js
var META_DOC_ID = "_meta";
var CLAIM_TTL_MS = 30 * 60 * 1e3;
var EMPTY_META = {
  last_refresh_sha: "",
  claimed_by: null,
  claimed_at: null,
  patch_counts: {}
};
function parseMeta(content) {
  try {
    const raw = JSON.parse(content);
    return {
      last_refresh_sha: typeof raw.last_refresh_sha === "string" ? raw.last_refresh_sha : "",
      claimed_by: typeof raw.claimed_by === "string" ? raw.claimed_by : null,
      claimed_at: typeof raw.claimed_at === "string" ? raw.claimed_at : null,
      patch_counts: raw.patch_counts && typeof raw.patch_counts === "object" ? raw.patch_counts : {}
    };
  } catch {
    return { ...EMPTY_META };
  }
}
async function readRefreshMeta(query, tableName, project, scope = "main") {
  const safe = sqlIdent(tableName);
  const id = docRowId(project, scope, META_DOC_ID);
  const rows = await query(`SELECT content, updated_at FROM "${safe}" WHERE id = '${sqlStr(id)}' ORDER BY updated_at DESC LIMIT 1`);
  if (!rows.length)
    return null;
  return {
    meta: parseMeta(String(rows[0].content ?? "")),
    updated_at: String(rows[0].updated_at ?? "")
  };
}
async function writeMetaRow(query, tableName, project, scope, meta, now) {
  const safe = sqlIdent(tableName);
  const id = docRowId(project, scope, META_DOC_ID);
  await query(`DELETE FROM "${safe}" WHERE id = '${sqlStr(id)}'`);
  await query(`INSERT INTO "${safe}" (id, doc_id, path, content, anchors, tier, status, project, scope, version, created_at, updated_at, agent, plugin_version) VALUES ('${sqlStr(id)}', '${META_DOC_ID}', '', E'${sqlStr(JSON.stringify(meta))}', '[]', 'slow', 'meta', '${sqlStr(project)}', '${sqlStr(scope)}', 1, '${sqlStr(now)}', '${sqlStr(now)}', 'refresh-meta', '')`);
  await query(`DELETE FROM "${safe}" WHERE id = '${sqlStr(id)}' AND updated_at < '${sqlStr(now)}'`);
}
async function tryClaimTurn(query, tableName, project, scope, opts) {
  const ttl = opts.ttlMs ?? CLAIM_TTL_MS;
  const nowFn = opts.now ?? (() => /* @__PURE__ */ new Date());
  const sleep2 = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const current = await readRefreshMeta(query, tableName, project, scope);
  const nowIso = nowFn().toISOString();
  if (current?.meta.claimed_at && current.meta.claimed_by) {
    const age = nowFn().getTime() - new Date(current.meta.claimed_at).getTime();
    if (age < ttl)
      return { won: false, reason: "held" };
  }
  const fresh = await readRefreshMeta(query, tableName, project, scope);
  const claimed = {
    ...fresh?.meta ?? current?.meta ?? EMPTY_META,
    claimed_by: opts.owner,
    claimed_at: nowIso
  };
  await writeMetaRow(query, tableName, project, scope, claimed, nowIso);
  await sleep2(250);
  const after = await readRefreshMeta(query, tableName, project, scope);
  if (after?.meta.claimed_by === opts.owner && after.meta.claimed_at === nowIso) {
    return { won: true, meta: after.meta };
  }
  return { won: false, reason: "lost-race" };
}
async function releaseClaim(query, tableName, project, scope, opts) {
  const nowFn = opts.now ?? (() => /* @__PURE__ */ new Date());
  const current = await readRefreshMeta(query, tableName, project, scope);
  if (current?.meta.claimed_by !== opts.owner)
    return false;
  await writeMetaRow(query, tableName, project, scope, {
    last_refresh_sha: current.meta.last_refresh_sha,
    claimed_by: null,
    claimed_at: null,
    patch_counts: opts.patchCounts ?? current.meta.patch_counts
  }, nowFn().toISOString());
  return true;
}
async function commitRefresh(query, tableName, project, scope, sha, patchCounts, opts) {
  const nowFn = opts.now ?? (() => /* @__PURE__ */ new Date());
  const current = await readRefreshMeta(query, tableName, project, scope);
  if (current?.meta.claimed_by !== opts.owner) {
    return { committed: false, reason: "lost-lease" };
  }
  const meta = {
    last_refresh_sha: sha,
    claimed_by: null,
    claimed_at: null,
    patch_counts: patchCounts
  };
  await writeMetaRow(query, tableName, project, scope, meta, nowFn().toISOString());
  return { committed: true };
}

// dist/src/docs/wiki-update.js
var NO_CHANGE = "NO_CHANGE";
var DEFAULT_MAX_PATCHES = 15;
var DEFAULT_MAX_SIGNATURE_CHANGES = 5;
var DEFAULT_WIKI_MAX_CHANGED_LINES = 60;
function buildUpdatePrompt(pageKey, narrative, diff) {
  return [
    `Below is the internal wiki page for the subsystem \`${pageKey}\`, followed by`,
    "the unified diff of the code changes since the page was last verified.",
    "",
    "Correct ONLY the statements this diff makes false. Do NOT rephrase, restyle,",
    "or expand anything the diff does not contradict. Keep every untouched line",
    "byte-identical. Do NOT add a file listing section.",
    `If nothing in the page is contradicted by the diff, reply with exactly: ${NO_CHANGE}`,
    "Otherwise output the FULL corrected page as raw markdown (no preamble, no outer code fence).",
    "",
    "=== CURRENT PAGE ===",
    "",
    narrative,
    "",
    "=== CODE DIFF ===",
    "",
    diff
  ].join("\n");
}
function shouldEscalate(input) {
  const reasons = [];
  if (input.membershipChanged)
    reasons.push("group membership changed");
  const maxSig = input.maxSignatureChanges ?? DEFAULT_MAX_SIGNATURE_CHANGES;
  if (input.signatureChanges > maxSig) {
    reasons.push(`too many signature changes: ${input.signatureChanges} > ${maxSig}`);
  }
  const maxPatches = input.maxPatches ?? DEFAULT_MAX_PATCHES;
  if (input.patchCount >= maxPatches) {
    reasons.push(`patch budget exhausted: ${input.patchCount} >= ${maxPatches}`);
  }
  return { escalate: reasons.length > 0, reasons };
}
function anchorsEqual(a, b) {
  if (a.length !== b.length)
    return false;
  const key = (x) => `${x.symbol_id}\0${x.content_hash}`;
  const set2 = new Set(a.map(key));
  return b.every((x) => set2.has(key(x)));
}
async function updateWikiPage(args) {
  const pre = shouldEscalate(args.escalation);
  if (pre.escalate)
    return { action: "escalate", reasons: pre.reasons };
  const narrative = stripFilesIndex(args.page.content);
  let response;
  try {
    response = (await args.run(buildUpdatePrompt(args.pageKey, narrative, args.diff))).trim();
  } catch (err) {
    return { action: "failed", reason: `update failed: ${err.message}` };
  }
  const noChange = response === NO_CHANGE;
  if (!noChange && response === "")
    return { action: "failed", reason: "empty patch response" };
  let newNarrative = narrative;
  if (!noChange) {
    const unwrapped = unwrapModelOutput(response);
    const firstHeading = unwrapped.search(/^#{1,6} /m);
    if (firstHeading < 0)
      return { action: "failed", reason: "patch response has no markdown heading \u2014 not a page" };
    newNarrative = unwrapped.slice(firstHeading).trimEnd();
  }
  const newContent = appendFilesIndex(newNarrative, args.files);
  const newAnchors = collectWikiAnchors(args.snap, args.files, args.repoRoot);
  if (newContent === args.page.content && anchorsEqual(newAnchors, args.page.anchors)) {
    return { action: "no_change" };
  }
  const gate = gateDocEdit({
    tier: args.page.tier,
    allowSlow: true,
    // wiki pages are slow-tier but machine-authored — see gate.ts
    prevContent: args.page.content,
    newContent,
    newAnchors,
    snap: args.snap,
    maxChangedLines: args.maxChangedLines ?? DEFAULT_WIKI_MAX_CHANGED_LINES
  });
  if (!gate.ok) {
    return { action: "escalate", reasons: gate.reasons };
  }
  try {
    const source_fp = serializeFingerprint(computeFingerprint(defaultGit(args.repoRoot), args.files));
    if (args.privateSink) {
      args.privateSink({ doc_id: args.page.doc_id, path: args.page.path, content: newContent, source_fp, tier: args.page.tier });
      return noChange ? { action: "mechanics_refreshed", version: args.page.version } : { action: "patched", version: args.page.version, changedLines: gate.changedLines };
    }
    const content_embedding = args.embed ? await args.embed(newContent) ?? void 0 : void 0;
    const targetScope = args.scope ?? "main";
    const pageScope = args.page.scope ?? "main";
    let res;
    if (pageScope === targetScope) {
      res = await editDoc(args.query, args.tableName, {
        doc_id: args.page.doc_id,
        content: newContent,
        anchors: newAnchors,
        source_fp,
        agent: args.agent ?? "docs-wiki-update",
        plugin_version: args.pluginVersion,
        content_embedding
      }, { project: args.page.project, scope: targetScope });
    } else {
      res = await upsertDoc(args.query, args.tableName, {
        doc_id: args.page.doc_id,
        path: args.page.path,
        content: newContent,
        anchors: newAnchors,
        tier: args.page.tier,
        project: args.page.project,
        scope: targetScope,
        source_fp,
        agent: args.agent ?? "docs-wiki-update",
        plugin_version: args.pluginVersion,
        content_embedding
      });
    }
    return noChange ? { action: "mechanics_refreshed", version: res.version } : { action: "patched", version: res.version, changedLines: gate.changedLines };
  } catch (err) {
    return { action: "failed", reason: `write failed: ${err.message}` };
  }
}

// dist/src/docs/promote.js
function planPromotions(rows, git, groupFiles) {
  const byDoc = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!r.doc_id.startsWith(WIKI_DOC_PREFIX))
      continue;
    const g = byDoc.get(r.doc_id) ?? { overlays: [] };
    if (parseScope(r.scope).kind === "branch")
      g.overlays.push(r);
    else
      g.main = r;
    byDoc.set(r.doc_id, g);
  }
  const out = [];
  for (const [doc_id, g] of byDoc) {
    if (g.overlays.length === 0)
      continue;
    const files = groupFiles.get(doc_id);
    if (!files || files.length === 0)
      continue;
    const mainFp = computeFingerprint(git, files);
    if (Object.keys(mainFp).length === 0)
      continue;
    const mainFpStr = serializeFingerprint(mainFp);
    for (const ov of g.overlays) {
      if (!sameFileSet(parseFilesIndex(ov.content), files))
        continue;
      if (isFresh(parseFingerprint(ov.source_fp), mainFp)) {
        out.push({ doc_id, fromScope: ov.scope, path: ov.path, content: ov.content, tier: ov.tier, mainFp: mainFpStr });
      }
    }
  }
  return out;
}
function sameFileSet(a, b) {
  if (a.length !== b.length)
    return false;
  const s = new Set(a);
  return b.every((f) => s.has(f));
}
async function promoteMergedOverlays(query, tableName, project, git, groupFiles, opts = {}) {
  const safe = sqlIdent(tableName);
  const raw = await stableUnionRows(query, `SELECT id, doc_id, path, content, tier, scope, source_fp FROM "${safe}" WHERE project = '${sqlStr(project)}' AND status = 'active'`);
  const rows = raw.map((r) => ({
    doc_id: String(r.doc_id ?? ""),
    path: String(r.path ?? ""),
    content: String(r.content ?? ""),
    tier: String(r.tier ?? "slow"),
    scope: String(r.scope ?? MAIN_SCOPE),
    source_fp: String(r.source_fp ?? "{}")
  }));
  const outcomes = [];
  for (const p of planPromotions(rows, git, groupFiles)) {
    try {
      await upsertDoc(query, tableName, {
        doc_id: p.doc_id,
        path: p.path,
        content: p.content,
        tier: p.tier === "fast" ? "fast" : "slow",
        project,
        scope: MAIN_SCOPE,
        source_fp: p.mainFp,
        agent: opts.agent ?? "docs-wiki-promote",
        plugin_version: opts.pluginVersion
      });
      await editDoc(query, tableName, { doc_id: p.doc_id, status: "archived" }, { project, scope: p.fromScope });
      outcomes.push({ doc_id: p.doc_id, fromScope: p.fromScope, action: "promoted" });
    } catch {
    }
  }
  return outcomes;
}

// dist/src/docs/private-store.js
import { mkdirSync as mkdirSync14, readFileSync as readFileSync23, writeFileSync as writeFileSync18, renameSync as renameSync7, existsSync as existsSync31 } from "node:fs";
import { homedir as homedir18 } from "node:os";
import { createHash } from "node:crypto";
import { dirname as dirname10, join as join34 } from "node:path";
function privateStoreRoot() {
  return process.env.HIVEMIND_DOCS_PRIVATE_DIR || join34(homedir18(), ".hivemind", "docs-private");
}
function storeFile(project, scope) {
  const key = createHash("sha256").update(`${project}\0${scope}`).digest("hex");
  return join34(privateStoreRoot(), `${key}.json`);
}
function readMap(file) {
  try {
    if (!existsSync31(file))
      return {};
    const raw = JSON.parse(readFileSync23(file, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return {};
    return raw;
  } catch {
    return {};
  }
}
function writeMap(file, map2) {
  mkdirSync14(dirname10(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync18(tmp, JSON.stringify(map2, null, 1) + "\n");
  renameSync7(tmp, file);
}
function writePrivateDoc(project, scope, doc) {
  const file = storeFile(project, scope);
  const map2 = readMap(file);
  map2[doc.doc_id] = doc;
  writeMap(file, map2);
}
function deletePrivateDoc(project, scope, docId) {
  const file = storeFile(project, scope);
  const map2 = readMap(file);
  if (docId in map2) {
    delete map2[docId];
    writeMap(file, map2);
  }
}

// dist/src/docs/wiki-refresh.js
var DEFAULT_MIN_PERIOD_MS = 6 * 60 * 60 * 1e3;
function defaultRegenerate(args) {
  return async (group) => {
    const report = await generateWikiPages({
      query: args.query,
      tableName: args.tableName,
      snap: args.snap,
      repoRoot: args.repoRoot,
      project: args.project,
      scope: args.scope,
      include: group.files,
      existing: /* @__PURE__ */ new Set(),
      force: true,
      run: args.run,
      runPage: args.runPage,
      embed: args.embed,
      agent: args.agent,
      pluginVersion: args.pluginVersion
    });
    if (report.created > 0 && report.failed === 0)
      return "created";
    if (report.failed === 0 && report.skipped > 0)
      return "skipped";
    return "failed";
  };
}
async function runLocalWikiRefresh(args) {
  const changedOut = args.git(["diff", "--name-only", "HEAD"]);
  const changed = new Set((changedOut ?? "").split("\n").map((l) => l.trim()).filter(Boolean));
  const untracked = args.git(["ls-files", "--others", "--exclude-standard"]);
  for (const l of (untracked ?? "").split("\n"))
    if (l.trim())
      changed.add(l.trim());
  const outcomes = [];
  if (changed.size === 0)
    return { outcomes };
  for (const group of selectWikiGroups(args.snap)) {
    const touched = group.files.filter((f) => changed.has(f));
    if (touched.length === 0)
      continue;
    const localFile = `${group.key}.wiki.hivemind.md`;
    const abs = join35(args.repoRoot, localFile);
    if (!existsSync32(abs)) {
      outcomes.push({ file: localFile, action: "not-materialized", reasons: ["run `hivemind docs pull` first"] });
      continue;
    }
    const diff = args.git(["diff", "HEAD", "--", ...touched]) ?? "";
    if (diff.trim() === "")
      continue;
    let current;
    try {
      current = readFileSync24(abs, "utf-8");
    } catch {
      outcomes.push({ file: localFile, action: "not-materialized", reasons: ["file vanished during refresh"] });
      continue;
    }
    let response;
    try {
      response = (await args.run(buildUpdatePrompt(group.key, stripFilesIndex(current), diff))).trim();
    } catch (err) {
      outcomes.push({ file: localFile, action: "failed", reasons: [err.message] });
      continue;
    }
    if (response === NO_CHANGE || response === "") {
      outcomes.push({ file: localFile, action: "no_change" });
      continue;
    }
    const next = appendFilesIndex(response, group.files);
    const gate = gateDocEdit({
      tier: "slow",
      allowSlow: true,
      prevContent: current,
      newContent: next,
      newAnchors: [],
      snap: args.snap,
      maxChangedLines: args.maxChangedLines ?? DEFAULT_WIKI_MAX_CHANGED_LINES
    });
    if (!gate.ok) {
      outcomes.push({ file: localFile, action: "escalate-skipped", reasons: gate.reasons });
      continue;
    }
    writeFileSync19(abs, next.endsWith("\n") ? next : next + "\n");
    outcomes.push({ file: localFile, action: "patched" });
  }
  return { outcomes };
}
async function runWikiRefreshCycle(args) {
  const log7 = args.log ?? (() => {
  });
  const nowFn = args.now ?? (() => /* @__PURE__ */ new Date());
  const scope = args.scope ?? "main";
  const head = args.git(["rev-parse", "HEAD"])?.trim();
  if (!head)
    return { status: "no-git", outcomes: [] };
  const metaBefore = await readRefreshMeta(args.query, args.tableName, args.project, scope);
  if (metaBefore?.meta.last_refresh_sha === head) {
    return { status: "up-to-date", head, outcomes: [] };
  }
  if (metaBefore && !args.force) {
    const sinceLastTouch = nowFn().getTime() - new Date(metaBefore.updated_at).getTime();
    const minPeriod = args.minPeriodMs ?? DEFAULT_MIN_PERIOD_MS;
    if (Number.isFinite(sinceLastTouch) && sinceLastTouch < minPeriod) {
      return { status: "too-soon", head, outcomes: [] };
    }
  }
  const claim = await tryClaimTurn(args.query, args.tableName, args.project, scope, {
    owner: args.owner,
    now: args.now,
    sleep: args.sleep
  });
  if (!claim.won)
    return { status: "not-claimed", head, outcomes: [] };
  if (claim.meta.last_refresh_sha === head) {
    await commitRefresh(args.query, args.tableName, args.project, scope, head, claim.meta.patch_counts, {
      owner: args.owner,
      now: args.now
    });
    return { status: "up-to-date", head, outcomes: [] };
  }
  const lastSha = claim.meta.last_refresh_sha;
  const patchCounts = { ...claim.meta.patch_counts };
  let baseSha = lastSha;
  if (lastSha === "" && parseScope(scope).kind === "branch") {
    const trunk = trunkBranch(args.git);
    const mb = (args.git(["merge-base", "HEAD", `origin/${trunk}`]) ?? args.git(["merge-base", "HEAD", trunk]))?.trim();
    if (mb) {
      baseSha = mb;
      log7(`branch first cycle \u2014 window from merge-base ${mb.slice(0, 8)}..HEAD`);
    }
  }
  let changed = null;
  if (baseSha !== "") {
    const out = args.git(["diff", "--name-only", `${baseSha}..HEAD`]);
    if (out !== null) {
      changed = new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
    } else {
      log7(`diff ${baseSha}..HEAD unavailable \u2014 full-candidate cycle`);
    }
  } else {
    log7("first refresh cycle \u2014 full-candidate cycle");
  }
  let modified = [];
  if (lastSha !== "" && args.loadSnapshotAt) {
    const prevSnap = args.loadSnapshotAt(lastSha);
    if (prevSnap)
      modified = diffSnapshots(prevSnap, args.snap).nodes.modified ?? [];
    else
      log7(`no graph snapshot at ${lastSha} \u2014 signature-churn escalation disabled this cycle`);
  }
  const sigChangesByFile = /* @__PURE__ */ new Map();
  for (const m of modified) {
    sigChangesByFile.set(m.after.source_file, (sigChangesByFile.get(m.after.source_file) ?? 0) + 1);
  }
  const groups = selectWikiGroups(args.snap);
  const pages = /* @__PURE__ */ new Map();
  for (const d of await listDocs(args.query, args.tableName, { project: args.project, status: "active", limit: 1e5, readerScope: scope })) {
    if (d.doc_id.startsWith(WIKI_DOC_PREFIX))
      pages.set(d.doc_id, d);
  }
  const regenerate = args.regenerate ?? defaultRegenerate(args);
  const outcomes = [];
  let failures = 0;
  let pendingPublish = 0;
  const parsedScope = parseScope(scope);
  const branchName = parsedScope.kind === "branch" ? parsedScope.branch : null;
  const detached = branchName === null && currentBranch(args.git) === null;
  const promotedIds = /* @__PURE__ */ new Set();
  if (branchName === null && !detached) {
    const groupFiles = new Map(groups.map((g) => [wikiDocId(g.key), g.files]));
    for (const p of await promoteMergedOverlays(args.query, args.tableName, args.project, args.git, groupFiles, { agent: args.agent, pluginVersion: args.pluginVersion })) {
      promotedIds.add(p.doc_id);
      outcomes.push({ doc_id: p.doc_id, action: "promoted", reasons: [`from ${p.fromScope}`] });
    }
  }
  const holdReason = (files) => {
    if (detached)
      return "detached HEAD \u2014 ambiguous branch identity";
    if (!workingTreeClean(args.git, files))
      return "uncommitted changes in member files";
    return null;
  };
  const isPrivate = (files) => branchName !== null && !sourcePushed(args.git, files, branchName);
  const stampPrivate = (doc) => writePrivateDoc(args.project, scope, { ...doc, updated_at: nowFn().toISOString() });
  for (const group of groups) {
    const docId = wikiDocId(group.key);
    const page = pages.get(docId);
    if (promotedIds.has(docId))
      continue;
    if (!page) {
      const hr2 = holdReason(group.files);
      if (hr2) {
        outcomes.push({ doc_id: docId, action: "held", reasons: [hr2] });
        continue;
      }
      if (isPrivate(group.files)) {
        outcomes.push({ doc_id: docId, action: "held", reasons: ["new subsystem on an unpushed branch \u2014 publishes on push"] });
        pendingPublish++;
        continue;
      }
      const res = await regenerate(group);
      if (res === "skipped") {
        outcomes.push({ doc_id: docId, action: "skipped", reasons: ["below min size \u2014 no page wanted"] });
        continue;
      }
      outcomes.push({ doc_id: docId, action: res === "created" ? "generated" : "failed" });
      if (res === "failed")
        failures++;
      else {
        patchCounts[docId] = 0;
        if (branchName)
          deletePrivateDoc(args.project, scope, docId);
      }
      continue;
    }
    const pageFiles = parseFilesIndex(page.content);
    const membershipChanged = pageFiles.length > 0 && (pageFiles.length !== group.files.length || group.files.some((f) => !pageFiles.includes(f)));
    const touched = changed === null || group.files.some((f) => changed.has(f));
    if (!touched && !membershipChanged)
      continue;
    const hr = holdReason(group.files);
    if (hr) {
      outcomes.push({ doc_id: docId, action: "held", reasons: [hr] });
      continue;
    }
    const priv = isPrivate(group.files);
    const diff = baseSha === "" ? null : args.git(["diff", `${baseSha}..HEAD`, "--", ...group.files]);
    if (diff === null && !membershipChanged) {
      if (priv) {
        outcomes.push({ doc_id: docId, action: "held", reasons: ["private page needs regeneration \u2014 publishes on push"] });
        pendingPublish++;
        continue;
      }
      const res = await regenerate(group);
      outcomes.push({ doc_id: docId, action: res === "failed" ? "failed" : "regenerated", reasons: ["no usable diff"] });
      if (res === "failed")
        failures++;
      else
        patchCounts[docId] = 0;
      continue;
    }
    const out = await updateWikiPage({
      query: args.query,
      tableName: args.tableName,
      page,
      scope,
      privateSink: priv ? stampPrivate : void 0,
      pageKey: group.key,
      files: group.files,
      snap: args.snap,
      repoRoot: args.repoRoot,
      diff: diff ?? "",
      run: args.run,
      escalation: {
        membershipChanged,
        signatureChanges: group.files.reduce((n, f) => n + (sigChangesByFile.get(f) ?? 0), 0),
        patchCount: patchCounts[docId] ?? 0
      },
      embed: args.embed,
      agent: args.agent,
      pluginVersion: args.pluginVersion
    });
    if (priv) {
      pendingPublish++;
    } else if (branchName) {
      deletePrivateDoc(args.project, scope, docId);
    }
    if (out.action === "escalate") {
      if (priv) {
        outcomes.push({ doc_id: docId, action: "held", reasons: ["private page over patch budget \u2014 regenerates on push"] });
      } else {
        const res = await regenerate(group);
        outcomes.push({ doc_id: docId, action: res === "failed" ? "failed" : "regenerated", reasons: out.reasons });
        if (res === "failed")
          failures++;
        else
          patchCounts[docId] = 0;
      }
    } else if (out.action === "failed") {
      outcomes.push({ doc_id: docId, action: "failed", reasons: [out.reason] });
      failures++;
    } else if (out.action === "patched") {
      outcomes.push({ doc_id: docId, action: "patched" });
      patchCounts[docId] = (patchCounts[docId] ?? 0) + 1;
    } else {
      outcomes.push({ doc_id: docId, action: out.action });
    }
  }
  if (failures > 0 || pendingPublish > 0) {
    log7(`${failures} failed, ${pendingPublish} pending publish \u2014 sha NOT advanced, next turn redoes the window`);
    await releaseClaim(args.query, args.tableName, args.project, scope, {
      owner: args.owner,
      patchCounts,
      now: args.now
    });
    return { status: "incomplete", head, outcomes };
  }
  const committed = await commitRefresh(args.query, args.tableName, args.project, scope, head, patchCounts, {
    owner: args.owner,
    now: args.now
  });
  if (!committed.committed)
    return { status: "lost-lease", head, outcomes };
  return { status: "committed", head, outcomes };
}

// dist/src/docs/pull.js
import { existsSync as existsSync33, mkdirSync as mkdirSync15, readFileSync as readFileSync25, rmSync as rmSync10, writeFileSync as writeFileSync20 } from "node:fs";
import { dirname as dirname11, join as join36, resolve as resolve2, sep } from "node:path";
var PULL_MANIFEST_DIR = ".hivemind";
var PULL_MANIFEST_FILE = "docs-pull.json";
var GITIGNORE_ENTRIES = ["*.hivemind.md", ".hivemind/"];
function localDocPath(docId) {
  const isWiki = docId.startsWith(WIKI_DOC_PREFIX);
  const rel = isWiki ? docId.slice(WIKI_DOC_PREFIX.length) : docId;
  if (rel === "" || rel.startsWith("/") || /^[a-zA-Z]:/.test(rel))
    return null;
  if (rel.split("/").some((seg) => seg === ".." || seg === ""))
    return null;
  return isWiki ? `${rel}.wiki.hivemind.md` : `${rel}.hivemind.md`;
}
function readPullManifest(repoRoot) {
  try {
    const raw = JSON.parse(readFileSync25(join36(repoRoot, PULL_MANIFEST_DIR, PULL_MANIFEST_FILE), "utf-8"));
    return { cursor: typeof raw?.cursor === "string" ? raw.cursor : "" };
  } catch {
    return { cursor: "" };
  }
}
function writePullManifest(repoRoot, manifest) {
  const dir = join36(repoRoot, PULL_MANIFEST_DIR);
  mkdirSync15(dir, { recursive: true });
  writeFileSync20(join36(dir, PULL_MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");
}
function ensureGitignoreEntries(repoRoot) {
  const path = join36(repoRoot, ".gitignore");
  let current = "";
  try {
    current = readFileSync25(path, "utf-8");
  } catch {
  }
  const lines = new Set(current.split("\n").map((l) => l.trim()));
  const missing = GITIGNORE_ENTRIES.filter((e) => !lines.has(e));
  if (missing.length === 0)
    return false;
  const prefix = current === "" || current.endsWith("\n") ? current : current + "\n";
  writeFileSync20(path, prefix + missing.join("\n") + "\n");
  return true;
}
async function pullDocs(args) {
  const scope = args.scope ?? "main";
  const manifest = readPullManifest(args.repoRoot);
  const cursor = args.force ? "" : manifest.cursor;
  const safe = sqlIdent(args.tableName);
  const idPrefix = docRowId(args.project, scope, "");
  const cursorFilter = cursor === "" ? "" : ` AND updated_at >= '${sqlStr(cursor)}'`;
  const rows = await stableUnionRows(args.query, `SELECT id, doc_id, content, status, updated_at FROM "${safe}" WHERE id LIKE '${sqlLike(idPrefix)}%'${cursorFilter}`);
  const latest = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const doc_id = String(r.doc_id ?? "");
    if (doc_id === "" || doc_id === META_DOC_ID)
      continue;
    const updated_at = String(r.updated_at ?? "");
    const prev = latest.get(doc_id);
    if (!prev || updated_at > prev.updated_at) {
      latest.set(doc_id, { doc_id, content: String(r.content ?? ""), status: String(r.status ?? ""), updated_at });
    }
  }
  const written = [];
  const removed = [];
  let unchanged = 0;
  let maxSeen = manifest.cursor;
  const rootAbs = resolve2(args.repoRoot);
  for (const doc of latest.values()) {
    if (doc.updated_at > maxSeen)
      maxSeen = doc.updated_at;
    const rel = localDocPath(doc.doc_id);
    if (rel === null)
      continue;
    const abs = resolve2(rootAbs, rel);
    if (!abs.startsWith(rootAbs + sep))
      continue;
    if (doc.status !== "active") {
      if (existsSync33(abs)) {
        rmSync10(abs);
        removed.push(rel);
      }
      continue;
    }
    const body = doc.content.endsWith("\n") ? doc.content : doc.content + "\n";
    let existing = null;
    try {
      existing = readFileSync25(abs, "utf-8");
    } catch {
    }
    if (existing === body) {
      unchanged++;
      continue;
    }
    mkdirSync15(dirname11(abs), { recursive: true });
    writeFileSync20(abs, body);
    written.push(rel);
  }
  ensureGitignoreEntries(args.repoRoot);
  writePullManifest(args.repoRoot, { cursor: maxSeen });
  return { written, removed, unchanged, cursor: maxSeen };
}

// dist/src/commands/docs.js
import { execFileSync as execFileSync5 } from "node:child_process";
import { hostname, userInfo as userInfo2 } from "node:os";

// dist/src/docs/embed.js
import { dirname as dirname12, join as join39 } from "node:path";
import { fileURLToPath } from "node:url";

// dist/src/embeddings/client.js
import { connect } from "node:net";
import { spawn as spawn4 } from "node:child_process";
import { openSync as openSync2, closeSync as closeSync2, writeSync as writeSync2, unlinkSync as unlinkSync10, existsSync as existsSync34, readFileSync as readFileSync26 } from "node:fs";
import { homedir as homedir19 } from "node:os";
import { join as join37 } from "node:path";
var SHARED_DAEMON_PATH2 = join37(homedir19(), ".hivemind", "embed-deps", "embed-daemon.js");
var log6 = (m) => log2("embed-client", m);
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
    this.daemonEntry = opts.daemonEntry ?? process.env.HIVEMIND_EMBED_DAEMON ?? (existsSync34(SHARED_DAEMON_PATH2) ? SHARED_DAEMON_PATH2 : void 0);
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
        log6(`embed err: ${err}`);
        if (isTransformersMissingError(err)) {
          this.handleTransformersMissing(err);
        }
        return null;
      }
      return resp.embedding;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log6(`embed failed: ${err}`);
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
      if (existsSync34(this.socketPath))
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
      log6(`hello probe failed (inconclusive, will retry next connect): ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    const hello = resp;
    if (_recycledStuckDaemon) {
      return false;
    }
    if (!hello.daemonPath) {
      _recycledStuckDaemon = true;
      log6(`daemon does not implement hello (older protocol); recycling`);
      this.recycleDaemon(hello.pid);
      return true;
    }
    if (hello.daemonPath !== this.daemonEntry && !existsSync34(hello.daemonPath)) {
      _recycledStuckDaemon = true;
      log6(`daemon path no longer on disk \u2014 running=${hello.daemonPath} (gone) expected=${this.daemonEntry}; recycling`);
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
        pid = Number.parseInt(readFileSync26(this.pidPath, "utf-8").trim(), 10);
      } catch {
      }
    }
    if (Number.isFinite(pid) && pid !== null && pid > 0 && existsSync34(this.socketPath)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    } else if (pid !== null) {
      log6(`recycle: socket gone, skipping SIGTERM on possibly-stale pid ${pid}`);
    }
    try {
      unlinkSync10(this.socketPath);
    } catch {
    }
    try {
      unlinkSync10(this.pidPath);
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
    return new Promise((resolve3, reject) => {
      const sock = connect(this.socketPath);
      const to = setTimeout(() => {
        sock.destroy();
        reject(new Error("connect timeout"));
      }, this.timeoutMs);
      sock.once("connect", () => {
        clearTimeout(to);
        resolve3(sock);
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
          unlinkSync10(this.pidPath);
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
    if (!this.daemonEntry || !existsSync34(this.daemonEntry)) {
      log6(`daemonEntry not configured or missing: ${this.daemonEntry}`);
      try {
        closeSync2(fd);
        unlinkSync10(this.pidPath);
      } catch {
      }
      return;
    }
    try {
      const child = spawn4(process.execPath, [this.daemonEntry], {
        detached: true,
        stdio: "ignore",
        // SW_HIDE: the daemon is auto-spawned from the backfill path, which
        // itself runs detached — without this it flashes a console. No-op on
        // POSIX.
        windowsHide: true,
        env: process.env
      });
      child.unref();
      log6(`spawned daemon pid=${child.pid}`);
    } finally {
      closeSync2(fd);
    }
  }
  isPidFileStale() {
    try {
      const raw = readFileSync26(this.pidPath, "utf-8").trim();
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
      if (!existsSync34(this.socketPath))
        continue;
      try {
        return await this.connectOnce();
      } catch {
      }
    }
    throw new Error("daemon did not become ready within spawnWaitMs");
  }
  sendAndWait(sock, req) {
    return new Promise((resolve3, reject) => {
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
          resolve3(JSON.parse(line));
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
import { createRequire as createRequire2 } from "node:module";
import { homedir as homedir20 } from "node:os";
import { join as join38 } from "node:path";
import { pathToFileURL } from "node:url";
var cachedStatus = null;
function defaultResolveTransformers() {
  const sharedDir = join38(homedir20(), ".hivemind", "embed-deps");
  try {
    createRequire2(pathToFileURL(`${sharedDir}/`).href).resolve("@huggingface/transformers");
    return;
  } catch {
  }
  createRequire2(import.meta.url).resolve("@huggingface/transformers");
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

// dist/src/docs/embed.js
function resolveEmbedDaemonPath() {
  return join39(dirname12(fileURLToPath(import.meta.url)), "embeddings", "embed-daemon.js");
}
function makeDocEmbedder() {
  if (embeddingsDisabled())
    return async () => null;
  const client = new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() });
  return async (text) => {
    try {
      return await client.embed(text, "document");
    } catch {
      return null;
    }
  };
}

// dist/src/docs/backfill.js
async function backfillDocEmbeddings(query, tableName, embed, concurrency = 4) {
  const safe = sqlIdent(tableName);
  const rows = await query(`SELECT id, content, ARRAY_LENGTH(content_embedding, 1) AS dims FROM "${safe}" WHERE status = 'active'`);
  const missing = rows.filter((r) => r["dims"] == null || Number(r["dims"]) === 0);
  let embedded = 0;
  await runPool(missing, concurrency, async (r) => {
    const vec = await embed(String(r["content"] ?? ""));
    if (!vec || vec.length === 0)
      return;
    await query(`UPDATE "${safe}" SET content_embedding = ${embeddingSqlLiteral(vec)} WHERE id = '${sqlStr(String(r["id"]))}'`);
    embedded++;
  });
  return { scanned: rows.length, embedded, skipped: rows.length - embedded };
}

// dist/src/commands/docs.js
var USAGE3 = `
hivemind docs \u2014 documentation that stays in sync with the code

Everyday:
  hivemind docs list [--repos] [--all] [--project P]
      Status header for this repo (root, org, auto ON/off, sync freshness,
      graph) + THIS repo's pages. --project P shows another repo's pages
      (accepts a repo name, path, or key prefix). --all shows every repo,
      grouped one section per repo. --repos lists every repo registered
      for auto sync.
  hivemind docs sync [--cwd <dir>] [--force] [--local]
      Bring the docs up to date with the code (wiki pages + per-file docs).
      Builds the code graph under the hood if missing. First interactive run
      on an empty corpus walks the same consent flow as graph init. --local
      previews WIKI-page patches on the working tree only (never writes the
      table; per-file docs have no local preview).
  hivemind docs pull [--cwd <dir>] [--project P] [--scope S] [--force]
      Materialize the docs locally as gitignored *.hivemind.md files next to
      the code. Incremental (local cursor); --force re-pulls everything.
  hivemind docs auto on|off [--cwd <dir>]
      Turn automatic per-commit sync on/off for THIS repo on THIS org.
      Enabling with no corpus asks for explicit confirmation (LLM cost).
  hivemind docs agent [claude|codex|pi|cursor]
      Show or set which host CLI authors the docs (persisted globally).
      No arg \u2192 show current + installed. Overridable per-run with
      HIVEMIND_DOCS_LLM_AGENT.
  hivemind docs show <doc-id>

Advanced / plumbing:
  hivemind docs wiki [--cwd] [--include] [--exclude] [--limit] [--concurrency] [--force] [--dry-run]
      Generate the narrative wiki pages (one per subsystem) explicitly.
  hivemind docs wiki-refresh [--cwd] [--force] [--local]
      One lease-guarded wiki refresh cycle (what sync/auto run for you).
  hivemind docs refresh [--cwd <dir>] [--dry-run]
      Per-file docs drift refresh (what sync runs for you).
  hivemind docs generate [--cwd] [--scope file|symbol] [--include] [--exclude]
                         [--limit] [--concurrency] [--batch] [--project P]
                         [--force] [--dry-run]
      Auto-author per-file docs from the AST graph. Batches 5 files/call.
  hivemind docs set <doc-id> ["<markdown>"] [--file <path>] [--project P] [--tier fast|slow] [--path <vfs-path>]
  hivemind docs index [<dir>]
  hivemind docs archive <doc-id>
  hivemind docs reindex
      Backfill semantic-search vectors for docs that lack them (no LLM).
`.trim();
function gitHeadOf(cwd) {
  try {
    return execFileSync5("git", ["-C", cwd, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}
function hookInstalledAt(cwd) {
  const p = postCommitHookPath(cwd);
  if (!p)
    return false;
  try {
    return existsSync35(p) && containsOurMarkers(readFileSync27(p, "utf8"));
  } catch {
    return false;
  }
}
function wikiFreshnessHint(state) {
  if (state.autoEnabled && state.hookInstalled)
    return null;
  if (state.autoEnabled) {
    return "Auto refresh is ON (updates on session start). For instant per-commit refresh: hivemind graph init";
  }
  const base = `${state.subject} will NOT stay fresh \u2014 nothing refreshes it yet. Enable per-session refresh: hivemind docs auto on`;
  return state.hookInstalled ? base : `${base} (and per-commit refresh: hivemind graph init)`;
}
async function offerAutoRefresh(cfg, project, cwd, subject) {
  if (isAutoEnabled(cfg.orgId, project))
    return;
  const io = defaultIo();
  if (io.interactive) {
    const a = await io.ask(`
Keep ${subject} fresh automatically on every commit? [y/N] `);
    if (/^y(es)?$/i.test(a.trim())) {
      setAuto({ orgId: cfg.orgId, orgName: cfg.orgName, project, path: cwd, auto: true });
      console.log("Auto refresh ON. For instant per-commit refresh also run: hivemind graph init");
      return;
    }
  }
  const sentenceSubject = subject.charAt(0).toUpperCase() + subject.slice(1);
  const hint = wikiFreshnessHint({ autoEnabled: false, hookInstalled: hookInstalledAt(cwd), subject: sentenceSubject });
  if (hint)
    console.log(`
${hint}`);
}
function requireConfig2() {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }
  return cfg;
}
function makeApi2(cfg) {
  return new DeeplakeApi(cfg.token, cfg.apiUrl, cfg.orgId, cfg.workspaceId, cfg.tableName);
}
function flagValue(args, name) {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx === -1)
    return void 0;
  return args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
}
function flagValues(args, name) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === name) {
      if (args[i + 1] !== void 0)
        out.push(args[i + 1]);
      i++;
    } else if (a.startsWith(`${name}=`)) {
      out.push(a.split("=", 2)[1]);
    }
  }
  return out;
}
function parseStatus2(args) {
  const raw = flagValue(args, "--status");
  if (raw === void 0)
    return "active";
  if (raw === "active" || raw === "archived" || raw === "all")
    return raw;
  console.error(`Invalid --status value: ${raw}. Allowed: active | archived | all.`);
  process.exit(1);
  throw new Error("unreachable");
}
function parseTier(args) {
  const raw = flagValue(args, "--tier");
  if (raw === void 0)
    return "fast";
  if (raw === "fast" || raw === "slow")
    return raw;
  console.error(`Invalid --tier value: ${raw}. Allowed: fast | slow.`);
  process.exit(1);
  throw new Error("unreachable");
}
function parseOptionalLimit(args) {
  const raw = flagValue(args, "--limit");
  if (raw === void 0)
    return void 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(`Invalid --limit value: ${raw}. Must be a positive integer.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return n;
}
function parseLimit2(args) {
  return parseOptionalLimit(args) ?? 200;
}
var KNOWN_FLAGS = /* @__PURE__ */ new Set(["--file", "--project", "--tier", "--path", "--status", "--limit", "--cwd", "--dry-run", "--anchor", "--scope", "--include", "--exclude", "--concurrency", "--force", "--batch", "--local", "--repos", "--full", "--all"]);
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set(["--dry-run", "--force", "--local", "--repos", "--full", "--all"]);
function stripKnownFlags2(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (KNOWN_FLAGS.has(a)) {
      if (!BOOLEAN_FLAGS.has(a))
        i++;
      continue;
    }
    if (KNOWN_FLAGS.has(a.split("=", 2)[0]))
      continue;
    out.push(a);
  }
  return out;
}
function resolveContent(positionalContent, args) {
  const file = flagValue(args, "--file");
  if (file !== void 0)
    return readFileSync27(file, "utf-8");
  if (positionalContent === "-")
    return readFileSync27(0, "utf-8");
  return positionalContent ?? "";
}
function defaultVfsPath(project, docId) {
  const proj = project || "default";
  return `/docs/${proj}/${docId}.md`;
}
function formatListRow2(r) {
  const tag = r.status === "archived" ? "[archived]" : "[active]";
  const anchors = r.anchors.length === 1 ? "1 anchor" : `${r.anchors.length} anchors`;
  return `${tag} ${r.doc_id}  v${r.version}  (${r.tier}, ${anchors})  ${r.path}`;
}
function resolveProjectArg(arg) {
  const entries = listEntries();
  const byPath = entries.find((e) => e.path === arg || e.path.split("/").pop() === arg || e.path.endsWith(`/${arg}`));
  if (byPath)
    return byPath.project;
  const byPrefix = entries.filter((e) => e.project.startsWith(arg));
  if (byPrefix.length === 1)
    return byPrefix[0].project;
  return arg;
}
var ALL_VIEW_PER_REPO_CAP = 20;
function printGroupedByRepo(rows) {
  const entries = listEntries();
  const nameOf = new Map(entries.map((e) => [e.project, e.path]));
  const groups = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = r.project ?? "";
    if (!groups.has(k))
      groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const [proj, group] of groups) {
    const label = proj === "" ? "(legacy rows \u2014 no project stamp)" : nameOf.get(proj) ?? `project ${proj}`;
    console.log(`
${label}${proj && nameOf.has(proj) ? `  (project: ${proj})` : ""}  \u2014  ${group.length} page(s)`);
    console.log("\u2500".repeat(60));
    for (const r of group.slice(0, ALL_VIEW_PER_REPO_CAP))
      console.log(formatListRow2(r));
    if (group.length > ALL_VIEW_PER_REPO_CAP) {
      const more = group.length - ALL_VIEW_PER_REPO_CAP;
      const ref = proj ? nameOf.get(proj)?.split("/").pop() ?? proj.slice(0, 8) : "";
      console.log(`  (+${more} more \u2014 hivemind docs list --project ${ref})`);
    }
  }
}
async function runDocsCommand(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE3);
    return;
  }
  if (sub === "agent") {
    const name = args[1];
    const installed = detectAvailableAgents();
    if (!name) {
      const cur = getDocsLlmAgent();
      console.log(`Docs LLM agent: ${cur ?? `auto (${installed[0] ?? "none installed"})`}`);
      console.log(`Installed on PATH: ${installed.join(", ") || "none"}`);
      console.log(`Set with: hivemind docs agent <${knownDocsAgents().join("|")}>  (or HIVEMIND_DOCS_LLM_BIN for any other CLI)`);
      return;
    }
    const lname = name.toLowerCase();
    if (!knownDocsAgents().includes(lname)) {
      console.error(`Unknown agent "${name}". Known: ${knownDocsAgents().join(", ")}. For any other CLI use HIVEMIND_DOCS_LLM_BIN.`);
      process.exit(1);
      throw new Error("unreachable");
    }
    if (!installed.includes(lname)) {
      console.error(`Warning: "${lname}" is not installed on PATH \u2014 doc generation will fail until it is.`);
    }
    setDocsLlmAgent(lname);
    console.log(`Docs LLM agent set to: ${lname}. Change with: hivemind docs agent <name>.`);
    return;
  }
  const cfg = requireConfig2();
  const api = makeApi2(cfg);
  const tableName = cfg.docsTableName;
  const query = api.query.bind(api);
  const pluginVersion = getVersion();
  const WRITE_SUBS = /* @__PURE__ */ new Set(["set", "archive"]);
  if (WRITE_SUBS.has(sub)) {
    await api.ensureDocsTable(tableName);
  }
  if (sub === "set") {
    const positional = stripKnownFlags2(args.slice(1));
    const docId = positional[0];
    if (!docId) {
      console.error('Missing doc-id. Usage: hivemind docs set <doc-id> "<markdown>" [--file <path>]');
      process.exit(1);
      throw new Error("unreachable");
    }
    const project = flagValue(args, "--project") ?? "";
    const path = flagValue(args, "--path") ?? defaultVfsPath(project, docId);
    const tier = parseTier(args);
    const anchorIds = flagValues(args, "--anchor");
    let anchors;
    if (anchorIds.length > 0) {
      const snap = loadCurrentSnapshot(flagValue(args, "--cwd") ?? process.cwd());
      if (!snap) {
        console.error("--anchor needs a built graph. Run `hivemind graph build` first.");
        process.exit(1);
        throw new Error("unreachable");
      }
      const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
      anchors = [];
      for (const sid of anchorIds) {
        const node = nodeById.get(sid);
        if (!node) {
          console.error(`--anchor: symbol not in graph: ${sid}`);
          process.exit(1);
          throw new Error("unreachable");
        }
        const a = buildAnchor(node, flagValue(args, "--cwd") ?? process.cwd());
        if (!a) {
          console.error(`--anchor: could not read source for ${sid}`);
          process.exit(1);
          throw new Error("unreachable");
        }
        anchors.push(a);
      }
    }
    try {
      const content = resolveContent(positional[1], args);
      const out = await setDoc(query, tableName, {
        doc_id: docId,
        path,
        content,
        anchors,
        tier,
        project,
        agent: cfg.userName,
        plugin_version: pluginVersion
      }, { project: flagValue(args, "--project") });
      console.log(`Set doc ${out.doc_id} \u2192 v${out.version}.`);
    } catch (err) {
      console.error(`Set failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (sub === "index") {
    const atDir = (stripKnownFlags2(args.slice(1))[0] ?? "").replace(/\/+$/, "");
    let meta = [];
    try {
      const rows = await listDocMeta(query, tableName, { dirPrefix: atDir });
      meta = rows.map((r) => ({
        doc_id: r.doc_id,
        version: r.version,
        updated_at: r.updated_at,
        status: r.status,
        tier: r.tier
      }));
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
    }
    const directFiles = meta.filter((m) => m.status === "active" && dirOf(m.doc_id) === atDir).map((m) => m.doc_id);
    const summaries = /* @__PURE__ */ new Map();
    if (directFiles.length > 0) {
      try {
        for (const d of await listDocsByIds(query, tableName, directFiles)) {
          summaries.set(d.doc_id, firstDocLine(d.content));
        }
      } catch (err) {
        if (!isMissingTableError(err.message))
          throw err;
      }
    }
    console.log(buildDocsIndex(meta, atDir, summaries));
    return;
  }
  if (sub === "show") {
    const docId = stripKnownFlags2(args.slice(1))[0];
    if (!docId) {
      console.error("Usage: hivemind docs show <doc-id>");
      process.exit(1);
      throw new Error("unreachable");
    }
    let row = null;
    try {
      const showCwd = flagValue(args, "--cwd") ?? process.cwd();
      row = await getDocLatest(query, tableName, docId, { readerScope: currentScope(defaultGit(showCwd)) });
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
    }
    if (!row) {
      console.log(`(no doc for ${docId})`);
      return;
    }
    console.log(`# ${row.doc_id}`);
    console.log(`version: ${row.version}  tier: ${row.tier}  status: ${row.status}`);
    console.log(`project: ${row.project}  path: ${row.path}`);
    console.log(`created: ${row.created_at}  updated: ${row.updated_at}`);
    console.log(`anchors: ${row.anchors.length}`);
    console.log("---");
    console.log(row.content);
    return;
  }
  if (sub === "list") {
    if (args.includes("--repos")) {
      const entries = listEntries();
      if (entries.length === 0) {
        console.log("(no repos registered \u2014 enable one with `hivemind docs auto on` or via `hivemind graph init`)");
        return;
      }
      for (const e of entries) {
        console.log(`${e.auto ? "AUTO " : "  off"}  ${e.path}  (org: ${e.orgName ?? e.orgId}, project: ${e.project})`);
      }
      return;
    }
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const headerProject = deriveProjectKey(cwd).key;
    const root = tryGitTopLevel(cwd) ?? cwd;
    const entry = findEntry(cfg.orgId, headerProject);
    const headerSnap = loadCurrentSnapshot(cwd);
    const snapOk = headerSnap !== null;
    const status = parseStatus2(args.slice(1));
    const limit = parseLimit2(args.slice(1));
    const explicitProject = flagValue(args, "--project");
    const notARepo = !snapOk && entry === void 0 && explicitProject === void 0;
    const allView = args.includes("--all") || notARepo;
    if (notARepo) {
      console.log(`${root} is not a docs-enabled repo \u2014 showing every repo in org ${cfg.orgName ?? cfg.orgId}. Register one with \`hivemind graph init\` (or \`hivemind docs auto on\` inside a repo).`);
    } else {
      let freshness = "never synced";
      try {
        const meta = await readRefreshMeta(query, tableName, headerProject, "main");
        if (meta?.meta.last_refresh_sha) {
          const head = gitHeadOf(cwd);
          if (head === null)
            freshness = "no git";
          else if (head === meta.meta.last_refresh_sha)
            freshness = "in sync (HEAD)";
          else
            freshness = `behind HEAD (last: ${meta.meta.last_refresh_sha.slice(0, 8)})`;
        }
      } catch (err) {
        if (!isMissingTableError(err.message))
          throw err;
      }
      console.log(`repo: ${root}  org: ${cfg.orgName ?? cfg.orgId}  auto: ${entry?.auto ? "ON" : "off"}  sync: ${freshness}  graph: ${snapOk ? "ok" : "missing"}`);
      console.log("\u2500".repeat(60));
    }
    let rows = [];
    try {
      rows = allView ? await listDocs(query, tableName, { status, limit }) : await listDocs(query, tableName, { status, projectOrLegacy: explicitProject !== void 0 ? resolveProjectArg(explicitProject) : headerProject, limit, readerScope: explicitProject === void 0 ? currentScope(defaultGit(flagValue(args, "--cwd") ?? process.cwd())) : void 0 });
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
    }
    if (allView) {
      if (rows.length === 0)
        console.log(`(no docs with status=${status})`);
      else
        printGroupedByRepo(rows);
      return;
    }
    if (rows.length === 0)
      console.log(`(no docs with status=${status})`);
    else
      for (const r of rows)
        console.log(formatListRow2(r));
    if (explicitProject === void 0 && headerSnap) {
      const planned = selectWikiGroups(headerSnap).filter((g) => wikiGroupEligible(g.files, root));
      if (planned.length > 0) {
        const have = new Set(rows.filter((r) => r.doc_id.startsWith(WIKI_DOC_PREFIX)).map((r) => r.doc_id));
        const pending = planned.filter((g) => !have.has(wikiDocId(g.key)));
        if (pending.length === 0) {
          console.log(`
wiki: ${planned.length}/${planned.length} pages generated`);
        } else {
          console.log(`
wiki: ${planned.length - pending.length}/${planned.length} pages generated \u2014 pending: ${pending.map((g) => wikiDocId(g.key)).join(", ")}`);
          console.log("  (a background generation may still be running; kick one explicitly with `hivemind docs wiki`)");
        }
      }
    }
    return;
  }
  if (sub === "archive") {
    const docId = stripKnownFlags2(args.slice(1))[0];
    if (!docId) {
      console.error("Usage: hivemind docs archive <doc-id>");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await archiveDoc(query, tableName, {
        doc_id: docId,
        agent: cfg.userName,
        plugin_version: pluginVersion
      }, { project: flagValue(args, "--project") });
      console.log(`Archived doc ${out.doc_id} \u2192 v${out.version}.`);
    } catch (err) {
      console.error(`Archive failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (sub === "refresh") {
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const dryRun = args.includes("--dry-run");
    const snap = loadCurrentSnapshot(cwd);
    if (!snap) {
      console.error("No local graph for this directory. Run `hivemind graph build` first.");
      process.exit(1);
      throw new Error("unreachable");
    }
    const changed = args.includes("--full") ? null : changedFilesFromGit(cwd);
    let docs = [];
    try {
      if (changed !== null) {
        const candidates = expandToCandidateFiles(snap, changed);
        docs = await listDocsByIds(query, tableName, candidates, { projectOrLegacy: deriveProjectKey(cwd).key });
        docs = docs.filter((d) => d.status === "active");
        console.error(`[docs refresh] scoped to ${candidates.length} candidate file(s) from git diff (${changed.length} changed)`);
      } else {
        docs = await listDocs(query, tableName, { status: "active", limit: 1e5, projectOrLegacy: deriveProjectKey(cwd).key });
        console.error(`[docs refresh] no git signal \u2014 full scan of ${docs.length} doc(s)`);
      }
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
    }
    const impacted = computeImpactedDocs({ snap, docs, repoRoot: cwd });
    if (dryRun) {
      if (impacted.length === 0) {
        console.log("(no docs need refreshing \u2014 all anchors fresh)");
      } else {
        console.log(`${impacted.length} doc(s) would be refreshed:`);
        for (const i of impacted) {
          console.log(`  ${i.doc_id}  [${i.reasons.map((r) => r.kind).join(", ")}]`);
        }
      }
      return;
    }
    await api.ensureDocsTable(tableName);
    if (impacted.length === 0) {
      console.log("(no docs need refreshing \u2014 all anchors fresh)");
    } else {
      const docsById = new Map(docs.map((d) => [d.doc_id, d]));
      const report = await refreshDocs({
        query,
        tableName,
        snap,
        repoRoot: cwd,
        impacted,
        docsById,
        generate: makeHostGenerate(),
        embed: makeDocEmbedder(),
        agent: cfg.userName,
        pluginVersion
      });
      console.log(`Refreshed ${report.refreshed}, archived ${report.archived}, rejected ${report.rejected}, skipped ${report.skipped}.`);
      for (const o of report.outcomes) {
        if (o.status === "refreshed")
          console.log(`  refreshed ${o.doc_id} \u2192 v${o.version}`);
        else if (o.status === "archived")
          console.log(`  archived ${o.doc_id} \u2192 v${o.version} (${(o.reasons ?? []).join("; ")})`);
        else
          console.log(`  ${o.status} ${o.doc_id}: ${(o.reasons ?? []).join("; ")}`);
      }
    }
    if (changed !== null && changed.length > 0) {
      const existing = new Set(docs.map((d) => d.doc_id));
      const genReport = await generateDocs({
        query,
        tableName,
        snap,
        repoRoot: cwd,
        project: deriveProjectKey(cwd).key,
        include: changed,
        existing,
        generate: makeHostGenerateDoc(),
        embed: makeDocEmbedder(),
        agent: cfg.userName,
        pluginVersion
      });
      if (genReport.created > 0) {
        console.log(`Generated ${genReport.created} new doc(s) for added files:`);
        for (const o of genReport.outcomes) {
          if (o.status === "created")
            console.log(`  created ${o.doc_id}`);
        }
      }
    }
    return;
  }
  if (sub === "wiki-refresh") {
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const force = args.includes("--force");
    const local = args.includes("--local");
    const project = flagValue(args, "--project") ?? deriveProjectKey(cwd).key;
    const snap = loadCurrentSnapshot(cwd);
    if (!snap) {
      console.error("No local graph for this directory. Run `hivemind graph build` first.");
      process.exit(1);
      throw new Error("unreachable");
    }
    const git = (gitArgs) => {
      try {
        return execFileSync5("git", ["-C", cwd, ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return null;
      }
    };
    if (local) {
      const report2 = await runLocalWikiRefresh({ snap, repoRoot: cwd, run: makeHostRunPrompt(), git });
      if (report2.outcomes.length === 0) {
        console.log("Local wiki preview: nothing touched by the working tree.");
      } else {
        console.log(`Local wiki preview: ${report2.outcomes.length} page(s) considered.`);
        for (const o of report2.outcomes) {
          console.log(`  ${o.action} ${o.file}${o.reasons ? ` (${o.reasons.join("; ")})` : ""}`);
        }
      }
      return;
    }
    await api.ensureDocsTable(tableName);
    if (!process.env.HIVEMIND_QUERY_TIMEOUT_MS)
      process.env.HIVEMIND_QUERY_TIMEOUT_MS = "30000";
    const report = await runWikiRefreshCycle({
      query,
      tableName,
      snap,
      repoRoot: cwd,
      project,
      // Branch identity: on the trunk this is `main` (canonical corpus); on a
      // feature branch it is `b:<branch>`, so the refresh reads/writes/leases
      // its own overlay and never touches main.
      scope: currentScope(git),
      run: makeHostRunPrompt(),
      runPage: makeHostPageRunPrompt(),
      git,
      owner: `${userInfo2().username}@${hostname()}:${process.pid}`,
      force,
      // Tuning knob (NOT a consent switch — that is the registry): shortens
      // the 6h quiet period for e2e tests and impatient operators.
      minPeriodMs: Number(process.env.HIVEMIND_DOCS_MIN_PERIOD_MS ?? "") || void 0,
      // Snapshots live under the repo-derived key even when --project overrides
      // the table stamp.
      loadSnapshotAt: (sha) => loadSnapshotByCommit(repoDir(deriveProjectKey(cwd).key), sha),
      embed: makeDocEmbedder(),
      agent: cfg.userName,
      pluginVersion,
      log: (m) => console.error(`[wiki-refresh] ${m}`)
    });
    console.log(`Wiki refresh: ${report.status}${report.head ? ` @ ${report.head.slice(0, 8)}` : ""}.`);
    for (const o of report.outcomes) {
      console.log(`  ${o.action} ${o.doc_id}${o.reasons ? ` (${o.reasons.join("; ")})` : ""}`);
    }
    return;
  }
  if (sub === "sync") {
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const force = args.includes("--force");
    const local = args.includes("--local");
    const project = deriveProjectKey(cwd).key;
    const io = defaultIo();
    if (!io.interactive && !isAutoEnabled(cfg.orgId, project)) {
      console.log("docs sync: auto not enabled for this repo on this org \u2014 nothing to do (enable with `hivemind docs auto on`).");
      return;
    }
    if (!loadCurrentSnapshot(cwd)) {
      console.log("Building code graph first (no LLM)...");
      const { runBuildCommand } = await import("./graph-UTYDPAHF.js");
      await runBuildCommand(["--cwd", cwd, "--trigger", "manual"]);
    }
    if (io.interactive) {
      let pages = 0;
      try {
        const rows = await listDocs(query, tableName, { project, status: "active", limit: 1e5 });
        pages = rows.filter((r) => r.doc_id.startsWith(WIKI_DOC_PREFIX)).length;
      } catch (err) {
        if (!isMissingTableError(err.message))
          throw err;
      }
      if (pages === 0) {
        const result = await runDocsOnboarding({
          root: tryGitTopLevel(cwd) ?? cwd,
          isGitRepo: tryGitTopLevel(cwd) !== null,
          orgId: cfg.orgId,
          orgName: cfg.orgName,
          project,
          snap: loadCurrentSnapshot(cwd),
          io
        });
        if (!result.generate)
          return;
      }
    }
    if (local) {
      await runDocsCommand(["wiki-refresh", "--cwd", cwd, "--local"]);
      return;
    }
    await runDocsCommand(["wiki-refresh", "--cwd", cwd, ...force ? ["--force"] : []]);
    await runDocsCommand(["refresh", "--cwd", cwd, "--full"]);
    return;
  }
  if (sub === "auto") {
    const mode = args[1];
    if (mode !== "on" && mode !== "off") {
      console.error("Usage: hivemind docs auto on|off [--cwd <dir>]");
      process.exit(1);
      throw new Error("unreachable");
    }
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const project = deriveProjectKey(cwd).key;
    if (mode === "off") {
      setAuto({ orgId: cfg.orgId, orgName: cfg.orgName, project, path: cwd, auto: false });
      console.log(`Auto sync OFF for this repo on org ${cfg.orgName ?? cfg.orgId}.`);
      return;
    }
    const snap = loadCurrentSnapshot(cwd);
    let pages = 0;
    try {
      const rows = await listDocs(query, tableName, { project, status: "active", limit: 1e5 });
      pages = rows.filter((r) => r.doc_id.startsWith(WIKI_DOC_PREFIX)).length;
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
    }
    if (pages === 0) {
      const est = snap ? `~${selectWikiGroups(snap).length} pages` : "the full corpus";
      const io = defaultIo();
      if (!io.interactive) {
        console.error(`No wiki corpus yet for this repo \u2014 enabling auto would generate ${est} on the first cycle. Run interactively (or generate first with \`hivemind docs wiki\`).`);
        process.exit(1);
        throw new Error("unreachable");
      }
      const a = await io.ask(`No wiki corpus yet: ${est} will be generated on the first cycle (LLM cost). Proceed? [y/N] `);
      if (!/^y(es)?$/i.test(a.trim())) {
        console.log("Left OFF. Generate first with: hivemind docs wiki");
        return;
      }
    }
    setAuto({ orgId: cfg.orgId, orgName: cfg.orgName, project, path: cwd, auto: true });
    console.log(`Auto sync ON for this repo on org ${cfg.orgName ?? cfg.orgId}. Docs stay fresh on every commit (consumes LLM tokens). Turn off with: hivemind docs auto off`);
    return;
  }
  if (sub === "pull") {
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const force = args.includes("--force");
    const scope = flagValue(args, "--scope") ?? "main";
    const project = flagValue(args, "--project") ?? deriveProjectKey(cwd).key;
    try {
      const report = await pullDocs({ query, tableName, repoRoot: cwd, project, scope, force });
      if (report.written.length === 0 && report.removed.length === 0) {
        console.log(`Docs up to date (${report.unchanged} unchanged).`);
      } else {
        console.log(`Pulled ${report.written.length} doc(s), removed ${report.removed.length} (${report.unchanged} unchanged).`);
        for (const p of report.written)
          console.log(`  wrote ${p}`);
        for (const p of report.removed)
          console.log(`  removed ${p}`);
      }
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
      console.log("(no docs table yet \u2014 nothing to pull)");
    }
    return;
  }
  if (sub === "wiki") {
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const dryRun = args.includes("--dry-run");
    const force = args.includes("--force");
    const include = flagValues(args, "--include");
    const exclude = flagValues(args, "--exclude");
    const limit = parseOptionalLimit(args);
    const concurrency = Number(flagValue(args, "--concurrency") ?? "2");
    const project = flagValue(args, "--project") ?? deriveProjectKey(cwd).key;
    const snap = loadCurrentSnapshot(cwd);
    if (!snap) {
      console.error("No local graph for this directory. Run `hivemind graph build` first.");
      process.exit(1);
      throw new Error("unreachable");
    }
    let existingDocs = [];
    try {
      existingDocs = await listDocs(query, tableName, { status: "all", projectOrLegacy: project, limit: 1e6 });
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
    }
    const existing = new Set(existingDocs.filter((d) => d.doc_id.startsWith(WIKI_DOC_PREFIX)).map((d) => d.doc_id));
    if (dryRun) {
      const groups = selectWikiGroups(snap, { include, exclude });
      const todo = force ? groups : groups.filter((g) => !existing.has(wikiDocId(g.key)));
      const effective = limit !== void 0 ? todo.slice(0, limit) : todo;
      console.log(`${effective.length} wiki page(s) would be generated (${groups.length - effective.length} already exist or skipped).`);
      for (const g of effective.slice(0, 60)) {
        console.log(`  wiki/${g.key}  (${g.files.length} files)`);
      }
      return;
    }
    await api.ensureDocsTable(tableName);
    if (!process.env.HIVEMIND_QUERY_TIMEOUT_MS)
      process.env.HIVEMIND_QUERY_TIMEOUT_MS = "30000";
    const report = await generateWikiPages({
      query,
      tableName,
      snap,
      repoRoot: cwd,
      project,
      // Branch identity for the written rows: `main` on the trunk, `b:<branch>`
      // on a feature branch (a branch-scoped overlay, invisible on main).
      scope: currentScope(defaultGit(cwd)),
      include,
      exclude,
      existing,
      force,
      limit,
      concurrency,
      run: makeHostRunPrompt(),
      runPage: makeHostPageRunPrompt(),
      embed: makeDocEmbedder(),
      agent: cfg.userName,
      pluginVersion
    });
    console.log(`Wiki: created ${report.created}, skipped ${report.skipped}, failed ${report.failed} (of ${report.groups} groups).`);
    for (const o of report.outcomes) {
      if (o.status === "created")
        console.log(`  created ${o.doc_id} (${o.files} files, ${o.chunks} chunk${o.chunks === 1 ? "" : "s"})`);
      else
        console.log(`  ${o.status} ${o.doc_id}: ${o.reason ?? ""}`);
    }
    await offerAutoRefresh(cfg, project, cwd, "this wiki");
    return;
  }
  if (sub === "reindex") {
    if (!process.env.HIVEMIND_QUERY_TIMEOUT_MS)
      process.env.HIVEMIND_QUERY_TIMEOUT_MS = "30000";
    try {
      await api.ensureDocsTable(tableName);
      const report = await backfillDocEmbeddings(query, tableName, makeDocEmbedder());
      console.log(`Reindexed: ${report.embedded} embedded (of ${report.scanned} active docs; ${report.skipped} already had a vector or skipped).`);
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
      console.log("(no docs table yet \u2014 nothing to reindex)");
    }
    return;
  }
  if (sub === "generate") {
    const cwd = flagValue(args, "--cwd") ?? process.cwd();
    const dryRun = args.includes("--dry-run");
    const force = args.includes("--force");
    const scopeRaw = flagValue(args, "--scope") ?? "file";
    if (scopeRaw !== "file" && scopeRaw !== "symbol") {
      console.error("Invalid --scope. Allowed: file | symbol.");
      process.exit(1);
      throw new Error("unreachable");
    }
    const scope = scopeRaw;
    const include = flagValues(args, "--include");
    const exclude = flagValues(args, "--exclude");
    const limit = parseOptionalLimit(args);
    const concurrency = Number(flagValue(args, "--concurrency") ?? "4");
    const project = flagValue(args, "--project") ?? deriveProjectKey(cwd).key;
    const snap = loadCurrentSnapshot(cwd);
    if (!snap) {
      console.error("No local graph for this directory. Run `hivemind graph build` first.");
      process.exit(1);
      throw new Error("unreachable");
    }
    let existingDocs = [];
    try {
      existingDocs = await listDocs(query, tableName, { status: "all", projectOrLegacy: project, limit: 1e6 });
    } catch (err) {
      if (!isMissingTableError(err.message))
        throw err;
    }
    const existing = new Set(existingDocs.map((d) => d.doc_id));
    const allTargets = selectTargets(snap, { scope, include, exclude });
    const todo = force ? allTargets : allTargets.filter((t) => !existing.has(t.doc_id));
    if (dryRun) {
      const effective = limit !== void 0 ? todo.slice(0, limit) : todo;
      console.log(`${effective.length} target(s) would be documented (scope=${scope}); ${allTargets.length - effective.length} already documented or skipped.`);
      for (const t of effective.slice(0, 60)) {
        console.log(`  ${t.doc_id}  (${t.symbols.length} symbols)`);
      }
      return;
    }
    await api.ensureDocsTable(tableName);
    if (!process.env.HIVEMIND_QUERY_TIMEOUT_MS)
      process.env.HIVEMIND_QUERY_TIMEOUT_MS = "30000";
    const batchSize = scope === "symbol" ? 1 : Number(flagValue(args, "--batch") ?? "5");
    const report = await generateDocs({
      query,
      tableName,
      snap,
      repoRoot: cwd,
      project,
      scope,
      include,
      exclude,
      existing,
      force,
      limit,
      concurrency,
      generate: makeHostGenerateDoc(),
      batchSize,
      batchGenerate: batchSize > 1 ? makeHostBatchGenerateDoc() : void 0,
      embed: makeDocEmbedder(),
      agent: cfg.userName,
      pluginVersion
    });
    console.log(`Generated ${report.created}, skipped ${report.skipped}, failed ${report.failed} (of ${report.targets} targets).`);
    for (const o of report.outcomes) {
      if (o.status !== "created")
        console.log(`  ${o.status} ${o.doc_id}: ${o.reason ?? ""}`);
    }
    await offerAutoRefresh(cfg, project, cwd, "these docs");
    return;
  }
  console.error(`Unknown subcommand: ${sub}`);
  console.error(USAGE3);
  process.exit(1);
}

// dist/src/hooks/shared/context-renderer.js
async function renderContextBlock(query, input, opts = {}) {
  const maxRules = opts.maxRules ?? 10;
  const maxGoals = opts.maxGoals ?? 10;
  const log7 = opts.log ?? (() => {
  });
  try {
    const tableExists = opts.tableExists;
    let rules = [];
    if (tableExists && !tableExists(input.rulesTable)) {
      log7(`render-context-block: rules table "${input.rulesTable}" not present \u2014 skipping read`);
    } else {
      try {
        rules = await listRules(query, input.rulesTable, {
          status: "active",
          limit: Math.max(maxRules * 4, maxRules + 1)
        });
      } catch (rulesErr) {
        const rmsg = rulesErr instanceof Error ? rulesErr.message : String(rulesErr);
        log7(`render-context-block: rules unavailable (continuing): ${rmsg}`);
      }
    }
    let goals = [];
    if (tableExists && !tableExists(input.goalsTable)) {
      log7(`render-context-block: goals table "${input.goalsTable}" not present \u2014 skipping read`);
    } else {
      try {
        goals = await listOpenGoals(query, input.goalsTable, input.currentUser, {
          limit: Math.max(maxGoals * 4, maxGoals + 1)
        });
      } catch (goalsErr) {
        const gmsg = goalsErr instanceof Error ? goalsErr.message : String(goalsErr);
        log7(`render-context-block: goals unavailable (continuing): ${gmsg}`);
      }
    }
    const rulesShown = rules.slice(0, maxRules);
    const rulesHidden = Math.max(0, rules.length - maxRules);
    const goalsShown = goals.slice(0, maxGoals);
    const goalsHidden = Math.max(0, goals.length - maxGoals);
    return formatBlock({ rules: rulesShown, rulesHidden, goals: goalsShown, goalsHidden });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log7(`render-context-block: ${msg}`);
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

// dist/src/commands/context.js
var USAGE4 = `
hivemind context \u2014 print the rules + open-goals block on demand

Usage:
  hivemind context

Same output that SessionStart auto-injects for claude-code / cursor /
hermes: active org rules + the current user's open goals (status
opened or in_progress). Use from pi / openclaw agents (which have no
SessionStart hook in v1) to pull the block manually, or anywhere as
a read-only diagnostic to see what the renderer would produce right
now.
`.trim();
async function runContextCommand(args) {
  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    console.log(USAGE4);
    return;
  }
  const cfg = loadRoutedConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }
  const api = new DeeplakeApi(cfg.token, cfg.apiUrl, cfg.orgId, cfg.workspaceId, cfg.tableName);
  const known = await api.knownTablesOrNull();
  const tableExists = known ? (name) => known.includes(name) : void 0;
  const block = await renderContextBlock((sql) => api.query(sql), {
    rulesTable: cfg.rulesTableName,
    goalsTable: cfg.goalsTableName,
    currentUser: cfg.userName
  }, { tableExists });
  if (!block) {
    console.error("(no active rules or open goals)");
    return;
  }
  console.log(block);
}

// dist/src/commands/backfill-memory.js
import { homedir as homedir23 } from "node:os";

// dist/src/utils/project-name.js
import { basename as basename2 } from "node:path";
function projectNameFromCwd(cwd) {
  return basename2(cwd ?? "") || "unknown";
}

// dist/src/skillify/pending-memory-manifest.js
import { existsSync as existsSync36, mkdirSync as mkdirSync16, readFileSync as readFileSync28, renameSync as renameSync8, writeFileSync as writeFileSync21 } from "node:fs";
import { homedir as homedir21 } from "node:os";
import { dirname as dirname13, join as join40 } from "node:path";
var HIVEMIND_DIR3 = join40(homedir21(), ".claude", "hivemind");
var PENDING_MEMORY_DIR = join40(HIVEMIND_DIR3, "pending-memory");
var PENDING_MEMORY_MANIFEST_PATH = join40(HIVEMIND_DIR3, "pending-memory.json");
var PENDING_MEMORY_LOCK_PATH = join40(HIVEMIND_DIR3, "pending-memory.lock");
function readPendingMemoryManifest(path = PENDING_MEMORY_MANIFEST_PATH) {
  if (!existsSync36(path))
    return null;
  try {
    return JSON.parse(readFileSync28(path, "utf-8"));
  } catch {
    return null;
  }
}
function writePendingMemoryManifest(m, path = PENDING_MEMORY_MANIFEST_PATH) {
  mkdirSync16(dirname13(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync21(tmp, JSON.stringify(m, null, 2));
  renameSync8(tmp, path);
}
function stagedSessionIds(path = PENDING_MEMORY_MANIFEST_PATH) {
  const m = readPendingMemoryManifest(path);
  const ids = /* @__PURE__ */ new Set();
  if (Array.isArray(m?.entries)) {
    for (const e of m.entries) {
      if (e && typeof e.session_id === "string")
        ids.add(e.session_id);
    }
  }
  return ids;
}
function upsertPendingMemoryEntry(entry, now, path = PENDING_MEMORY_MANIFEST_PATH) {
  const existing = readPendingMemoryManifest(path) ?? { created_at: now, entries: [] };
  const entries = Array.isArray(existing.entries) ? existing.entries : [];
  const next = entries.filter((e) => e && e.session_id !== entry.session_id);
  next.push(entry);
  writePendingMemoryManifest({ created_at: existing.created_at ?? now, entries: next }, path);
}
function markUploaded(sessionId, org, now, path = PENDING_MEMORY_MANIFEST_PATH) {
  const m = readPendingMemoryManifest(path);
  if (!m || !Array.isArray(m.entries))
    return false;
  let found = false;
  for (const e of m.entries) {
    if (e && e.session_id === sessionId) {
      e.uploaded = true;
      e.uploaded_at = now;
      e.uploaded_org = org;
      found = true;
    }
  }
  if (found)
    writePendingMemoryManifest(m, path);
  return found;
}

// dist/src/skillify/stage-memory.js
import { spawn as spawn5 } from "node:child_process";
import { existsSync as existsSync37, mkdirSync as mkdirSync19, readFileSync as readFileSync30, writeFileSync as writeFileSync23, unlinkSync as unlinkSync11 } from "node:fs";
import { dirname as dirname16, join as join44 } from "node:path";

// dist/src/hooks/spawn-wiki-worker.js
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname15, join as join43 } from "node:path";
import { writeFileSync as writeFileSync22, mkdirSync as mkdirSync18 } from "node:fs";
import { homedir as homedir22, tmpdir } from "node:os";

// dist/src/utils/wiki-log.js
import { mkdirSync as mkdirSync17, appendFileSync as appendFileSync2 } from "node:fs";
import { join as join41 } from "node:path";
function makeWikiLogger(hooksDir, filename = "deeplake-wiki.log") {
  const path = join41(hooksDir, filename);
  return {
    path,
    log(msg) {
      try {
        mkdirSync17(hooksDir, { recursive: true });
        appendFileSync2(path, `[${utcTimestamp()}] ${msg}
`);
      } catch {
      }
    }
  };
}

// dist/src/utils/version-check.js
import { readFileSync as readFileSync29 } from "node:fs";
import { dirname as dirname14, join as join42 } from "node:path";
function isNewer(latest, current) {
  const parse = (v) => v.split(".").map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  return la > ca || la === ca && lb > cb || la === ca && lb === cb && lc > cc;
}

// dist/src/hooks/spawn-wiki-worker.js
var HOME3 = homedir22();
var wikiLogger = makeWikiLogger(join43(HOME3, ".claude", "hooks"));
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

// dist/src/skillify/stage-memory.js
function countLines(path) {
  try {
    const buf = readFileSync30(path, "utf-8");
    if (!buf)
      return 0;
    return buf.endsWith("\n") ? buf.split("\n").length - 1 : buf.split("\n").length;
  } catch {
    return 0;
  }
}
function planClaudeSpawn(inv) {
  const shell = inv.options.shell === true;
  const stdinInput = shell && typeof inv.options.input === "string" ? inv.options.input : null;
  return {
    file: inv.file,
    args: inv.args,
    // stdout/stderr stay ignored — success is judged by the summary file
    // landing on disk, and the backfill executor surfaces a `claude-failed`
    // reason on non-zero exit.
    stdio: [stdinInput !== null ? "pipe" : "ignore", "ignore", "ignore"],
    shell,
    stdinInput,
    windowsHide: inv.options.windowsHide === true
  };
}
function runClaude2(claudeBin, prompt, timeoutMs, grants) {
  const plan = planClaudeSpawn(buildClaudeInvocation(claudeBin, prompt, grants));
  return new Promise((resolve3) => {
    const child = spawn5(plan.file, plan.args, {
      stdio: plan.stdio,
      // HIVEMIND_CAPTURE=false: our own extraction claude -p calls must
      // not re-trigger the capture/wiki hooks and recurse.
      env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" },
      timeout: timeoutMs,
      shell: plan.shell,
      windowsHide: plan.windowsHide
    });
    child.on("error", () => resolve3(false));
    if (plan.stdinInput !== null)
      child.stdin?.end(plan.stdinInput);
    child.on("close", (code) => resolve3(code === 0));
  });
}
async function defaultEmbed(text) {
  if (embeddingsDisabled())
    return null;
  return new EmbedClient({ autoSpawn: true }).embed(text, "document");
}
function backfillSessionKey(agent, sessionId) {
  return `${agent}-${sessionId}`;
}
async function stageSession(input, opts) {
  const stagingDir = opts.stagingDir ?? PENDING_MEMORY_DIR;
  const key = backfillSessionKey(input.agent, input.sessionId);
  const summaryPath = join44(stagingDir, `${key}.md`);
  const embeddingPath = join44(stagingDir, `${key}.embedding.json`);
  if (!existsSync37(input.jsonlPath)) {
    return { sessionId: key, ok: false, embedded: false, reason: "jsonl-missing" };
  }
  try {
    mkdirSync19(stagingDir, { recursive: true });
  } catch {
    return { sessionId: key, ok: false, embedded: false, reason: "mkdir-failed" };
  }
  const jsonlLines = countLines(input.jsonlPath);
  const prompt = WIKI_PROMPT_TEMPLATE.replace(/__JSONL__/g, input.jsonlPath).replace(/__SUMMARY__/g, summaryPath).replace(/__SESSION_ID__/g, input.sessionId).replace(/__PROJECT__/g, input.project).replace(/__PREV_OFFSET__/g, "0").replace(/__JSONL_LINES__/g, String(jsonlLines)).replace(/__JSONL_SERVER_PATH__/g, `local:${input.agent}/${input.sessionId}`);
  if (existsSync37(summaryPath)) {
    try {
      unlinkSync11(summaryPath);
    } catch {
    }
  }
  const runAgent = opts.runAgent ?? runClaude2;
  const ran = await runAgent(opts.claudeBin, prompt, opts.timeoutMs, {
    addDirs: [dirname16(input.jsonlPath), stagingDir],
    allowedTools: ["Read", "Write"]
  });
  if (!existsSync37(summaryPath)) {
    return { sessionId: key, ok: false, embedded: false, reason: ran ? "no-summary" : "claude-failed" };
  }
  const text = readFileSync30(summaryPath, "utf-8");
  if (!text.trim()) {
    return { sessionId: key, ok: false, embedded: false, reason: "empty-summary" };
  }
  let embedded = false;
  if (!opts.skipEmbed) {
    try {
      const embed = opts.embed ?? defaultEmbed;
      const vec = await embed(text);
      if (vec) {
        writeFileSync23(embeddingPath, JSON.stringify(vec));
        embedded = true;
      }
    } catch {
    }
  }
  const entry = {
    session_id: key,
    source_agent: input.agent,
    project: input.project,
    source_session_path: input.jsonlPath,
    summary_path: summaryPath,
    embedded,
    embedding_path: embedded ? embeddingPath : void 0,
    extracted_at: opts.now(),
    uploaded: false
  };
  upsertPendingMemoryEntry(entry, entry.extracted_at, opts.manifestPath ?? PENDING_MEMORY_MANIFEST_PATH);
  return { sessionId: key, ok: true, embedded };
}
function resolveClaudeBin() {
  return resolveCliBin("claude");
}

// dist/src/commands/backfill-memory.js
import { existsSync as existsSync38, unlinkSync as unlinkSync12 } from "node:fs";
var DEFAULT_WINDOW_DAYS = 42;
var DEFAULT_MAX_SESSIONS = 50;
var DEFAULT_CONCURRENCY = 4;
var PER_SESSION_TIMEOUT_MS = 12e4;
var DEFAULT_BUDGET_MS = 15 * 60 * 1e3;
var IN_FLIGHT_MAX_AGE_MS2 = 6e4;
function parseBackfillArgs(argv, cwd) {
  const opts = {
    windowDays: DEFAULT_WINDOW_DAYS,
    dryRun: false,
    force: false,
    projectOnly: false,
    maxSessions: DEFAULT_MAX_SESSIONS,
    verbose: false,
    cwd
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run")
      opts.dryRun = true;
    else if (a === "--force")
      opts.force = true;
    else if (a === "--verbose" || a === "-v")
      opts.verbose = true;
    else if (a === "--project-only")
      opts.projectOnly = true;
    else if (a === "--window-days") {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0)
        opts.windowDays = Math.floor(n);
    } else if (a === "--n") {
      const v = argv[++i];
      if (v === "all")
        opts.maxSessions = null;
      else {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0)
          opts.maxSessions = Math.floor(n);
      }
    }
  }
  return opts;
}
function planFromSessions(all, stagedIds, opts, now) {
  const cutoffMs = now - opts.windowDays * 24 * 60 * 60 * 1e3;
  const inFlightCutoff = now - IN_FLIGHT_MAX_AGE_MS2;
  const inWindow = all.filter((s) => {
    if (s.mtime < cutoffMs)
      return false;
    if (s.mtime >= inFlightCutoff)
      return false;
    if (opts.projectOnly && !s.inCwd)
      return false;
    return true;
  });
  inWindow.sort((a, b) => b.mtime - a.mtime);
  const staged = opts.force ? /* @__PURE__ */ new Set() : stagedIds;
  const alreadyStaged = [];
  const eligible = [];
  for (const s of inWindow) {
    if (staged.has(backfillSessionKey(s.agent, s.sessionId)))
      alreadyStaged.push(s);
    else
      eligible.push(s);
  }
  const cap = opts.maxSessions;
  const toExtract = cap === null ? eligible : eligible.slice(0, cap);
  const skippedByCap = eligible.length - toExtract.length;
  const byAgent = {};
  for (const s of toExtract)
    byAgent[s.agent] = (byAgent[s.agent] ?? 0) + 1;
  return { windowDays: opts.windowDays, cutoffMs, inWindow, alreadyStaged, toExtract, skippedByCap, byAgent };
}
function planBackfill(opts, now) {
  const all = listLocalSessions(detectInstalledAgents(), opts.cwd);
  return planFromSessions(all, stagedSessionIds(), opts, now);
}
function renderPlan(plan, opts) {
  const lines = [];
  lines.push(`memory backfill \u2014 ${opts.dryRun ? "DRY RUN" : "plan"}`);
  lines.push(`  window:        last ${plan.windowDays} days`);
  lines.push(`  project-only:  ${opts.projectOnly ? `yes (${projectNameFromCwd(opts.cwd)})` : "no"}`);
  lines.push(`  in window:     ${plan.inWindow.length} session(s)`);
  lines.push(`  already staged:${" "}${plan.alreadyStaged.length}`);
  lines.push(`  cap:           ${opts.maxSessions === null ? "none (--n all)" : opts.maxSessions}`);
  lines.push(`  to extract:    ${plan.toExtract.length}${plan.skippedByCap ? ` (${plan.skippedByCap} over cap, newest kept)` : ""}`);
  const agents = Object.keys(plan.byAgent).sort();
  if (agents.length) {
    lines.push(`  by agent:      ${agents.map((a) => `${a}=${plan.byAgent[a]}`).join(", ")}`);
  }
  return lines.join("\n");
}
function defaultStageFn(cwd, perSessionTimeoutMs) {
  const claudeBin = resolveClaudeBin();
  const project = projectNameFromCwd(cwd);
  return async (s) => {
    const res = await stageSession({ sessionId: s.sessionId, jsonlPath: s.path, agent: s.agent, project }, { claudeBin, timeoutMs: perSessionTimeoutMs, skipEmbed: false, now: () => (/* @__PURE__ */ new Date()).toISOString() });
    return { ok: res.ok, embedded: res.embedded, reason: res.reason };
  };
}
async function executeBackfill(toExtract, opts) {
  const stage = opts.stage ?? defaultStageFn(opts.cwd, opts.perSessionTimeoutMs);
  const now = opts.now ?? Date.now;
  const summary = {
    attempted: 0,
    staged: 0,
    embedded: 0,
    failed: 0,
    timedOutOnBudget: false,
    failureReasons: {},
    failures: []
  };
  const recordFailure2 = (s, reason) => {
    summary.failed++;
    summary.failureReasons[reason] = (summary.failureReasons[reason] ?? 0) + 1;
    summary.failures.push({ session: backfillSessionKey(s.agent, s.sessionId), reason });
  };
  const queue = [...toExtract];
  const deadline = opts.startMs + opts.budgetMs;
  async function worker() {
    for (; ; ) {
      if (now() >= deadline) {
        if (queue.length)
          summary.timedOutOnBudget = true;
        return;
      }
      const s = queue.shift();
      if (!s)
        return;
      summary.attempted++;
      try {
        const res = await stage(s);
        if (res.ok) {
          summary.staged++;
          if (res.embedded)
            summary.embedded++;
        } else {
          recordFailure2(s, res.reason ?? "unknown");
        }
      } catch (e) {
        recordFailure2(s, `threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  const n = Math.max(1, Math.min(opts.concurrency, toExtract.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return summary;
}
function releaseBackfillLock(lockPath = PENDING_MEMORY_LOCK_PATH) {
  if (process.env.HIVEMIND_BACKFILL_LOCK_OWNED !== "1")
    return;
  try {
    if (existsSync38(lockPath))
      unlinkSync12(lockPath);
  } catch {
  }
}
async function runBackfillMemory(argv) {
  const cwd = process.cwd();
  const opts = parseBackfillArgs(argv, cwd);
  try {
    const plan = planBackfill(opts, Date.now());
    process.stdout.write(renderPlan(plan, opts) + "\n");
    if (opts.dryRun)
      return 0;
    return await runExtract(plan, cwd, opts);
  } finally {
    releaseBackfillLock();
  }
}
function renderFailures(result, verbose) {
  if (result.failed === 0)
    return [];
  const lines = [];
  const reasons = Object.keys(result.failureReasons).sort();
  lines.push(`  ${result.failed} session(s) failed:`);
  for (const r of reasons)
    lines.push(`    ${r}: ${result.failureReasons[r]}`);
  if (verbose) {
    lines.push("  failing sessions:");
    for (const f of result.failures)
      lines.push(`    ${f.session} \u2014 ${f.reason}`);
  } else {
    lines.push("  re-run with --verbose to list each failing session.");
  }
  return lines;
}
function summarizeExtract(result, verbose) {
  const lines = [
    `staged ${result.staged}/${result.attempted} session(s) (${result.embedded} embedded, ${result.failed} failed${result.timedOutOnBudget ? ", budget reached" : ""}). Sign in and run the flush to push them into team memory.`,
    ...renderFailures(result, verbose)
  ];
  const exitCode = result.failed > 0 && result.staged === 0 ? 1 : 0;
  return { lines, exitCode };
}
async function runExtract(plan, cwd, opts) {
  if (plan.toExtract.length === 0) {
    process.stdout.write("nothing to extract; all in-window sessions already staged.\n");
    return 0;
  }
  const result = await executeBackfill(plan.toExtract, {
    concurrency: DEFAULT_CONCURRENCY,
    budgetMs: DEFAULT_BUDGET_MS,
    perSessionTimeoutMs: PER_SESSION_TIMEOUT_MS,
    cwd,
    startMs: Date.now()
  });
  const { lines, exitCode } = summarizeExtract(result, opts.verbose);
  process.stdout.write(lines.join("\n") + "\n");
  void homedir23;
  return exitCode;
}

// dist/src/commands/flush-memory.js
import { existsSync as existsSync39, readFileSync as readFileSync31 } from "node:fs";

// dist/src/hooks/upload-summary.js
import { randomUUID as randomUUID5 } from "node:crypto";

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
function esc3(s) {
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
async function uploadSummary(query, params) {
  const { tableName, vpath, fname, userName, project, agent } = params;
  const text = redactSecrets(params.text);
  const ts = params.ts ?? (/* @__PURE__ */ new Date()).toISOString();
  const desc = extractDescription(text);
  const sizeBytes = Buffer.byteLength(text);
  const embSql = embeddingSqlLiteral(params.embedding ?? null);
  const pluginVersion = params.pluginVersion;
  const existing = await query(`SELECT path, summary, description FROM "${tableName}" WHERE path = '${esc3(vpath)}' LIMIT 1`);
  if (existing.length > 0) {
    const incomingFinalized = isFinalizedSummaryText(text);
    const existingFinalized = isFinalizedRow(existing[0]["summary"], existing[0]["description"]);
    if (!incomingFinalized && existingFinalized) {
      return { path: "skip", sql: "", descLength: desc.length, summaryLength: text.length };
    }
    const pluginVersionSet = pluginVersion === void 0 ? "" : `plugin_version = '${esc3(pluginVersion)}', `;
    const sql2 = `UPDATE "${tableName}" SET summary = E'${esc3(text)}', summary_embedding = ${embSql}, size_bytes = ${sizeBytes}, description = E'${esc3(desc)}', ` + pluginVersionSet + `last_update_date = '${ts}' WHERE path = '${esc3(vpath)}'`;
    await query(sql2);
    return { path: "update", sql: sql2, descLength: desc.length, summaryLength: text.length };
  }
  const pluginVersionForInsert = pluginVersion ?? "";
  const sql = `INSERT INTO "${tableName}" (id, path, filename, summary, summary_embedding, author, mime_type, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) VALUES ('${randomUUID5()}', '${esc3(vpath)}', '${esc3(fname)}', E'${esc3(text)}', ${embSql}, '${esc3(userName)}', 'text/markdown', ${sizeBytes}, '${esc3(project)}', E'${esc3(desc)}', '${esc3(agent)}', '${esc3(pluginVersionForInsert)}', '${ts}', '${ts}')`;
  await query(sql);
  return { path: "insert", sql, descLength: desc.length, summaryLength: text.length };
}

// dist/src/commands/flush-memory.js
function loadEmbedding(entry) {
  if (!entry.embedded || !entry.embedding_path)
    return null;
  try {
    const v = JSON.parse(readFileSync31(entry.embedding_path, "utf-8"));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
async function defaultEmbed2(text) {
  if (embeddingsDisabled())
    return null;
  try {
    return await new EmbedClient({ autoSpawn: true }).embed(text, "document");
  } catch {
    return null;
  }
}
function defaultDeps(pluginVersion) {
  return {
    // Route by cwd so a flush targets the directory's `.hivemind` workspace,
    // consistent with capture (see src/dir-config.ts).
    loadConfig: loadRoutedConfig,
    makeQuery: (config) => (sql) => new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName).query(sql),
    upload: uploadSummary,
    embed: defaultEmbed2,
    pluginVersion
  };
}
async function runFlushMemory(deps = defaultDeps()) {
  const config = deps.loadConfig();
  if (!config) {
    return { pending: 0, uploaded: 0, failed: 0, reason: "not-logged-in" };
  }
  const manifestPath2 = deps.manifestPath ?? PENDING_MEMORY_MANIFEST_PATH;
  const manifest = readPendingMemoryManifest(manifestPath2);
  const pending = (manifest?.entries ?? []).filter((e) => e && e.uploaded === false);
  if (pending.length === 0) {
    return { pending: 0, uploaded: 0, failed: 0 };
  }
  const query = deps.makeQuery(config);
  const result = { pending: pending.length, uploaded: 0, failed: 0 };
  for (const entry of pending) {
    if (!existsSync39(entry.summary_path)) {
      result.failed++;
      continue;
    }
    let text;
    try {
      text = readFileSync31(entry.summary_path, "utf-8");
    } catch {
      result.failed++;
      continue;
    }
    if (!text.trim()) {
      result.failed++;
      continue;
    }
    try {
      const staged = loadEmbedding(entry);
      const embedding = staged ?? await deps.embed(text);
      const fname = `${entry.session_id}.md`;
      const vpath = `/summaries/${config.userName}/${fname}`;
      await deps.upload(query, {
        tableName: config.tableName,
        vpath,
        fname,
        userName: config.userName,
        project: entry.project,
        agent: entry.source_agent,
        sessionId: entry.session_id,
        text,
        embedding,
        pluginVersion: deps.pluginVersion
      });
      markUploaded(entry.session_id, config.orgName, (/* @__PURE__ */ new Date()).toISOString(), manifestPath2);
      result.uploaded++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

// dist/src/skillify/spawn-backfill-memory-worker.js
import { closeSync as closeSync4, existsSync as existsSync41, mkdirSync as mkdirSync21, openSync as openSync4, statSync as statSync9, unlinkSync as unlinkSync14 } from "node:fs";
import { spawn as spawn7 } from "node:child_process";
import { homedir as homedir25 } from "node:os";
import { join as join46 } from "node:path";

// dist/src/skillify/spawn-mine-local-worker.js
import { execFileSync as execFileSync6, spawn as spawn6 } from "node:child_process";
import { closeSync as closeSync3, existsSync as existsSync40, mkdirSync as mkdirSync20, openSync as openSync3, readdirSync as readdirSync8, statSync as statSync8, unlinkSync as unlinkSync13 } from "node:fs";
import { homedir as homedir24 } from "node:os";
import { dirname as dirname17, join as join45 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var HOME4 = homedir24();
var HIVEMIND_DIR4 = join45(HOME4, ".claude", "hivemind");
var LOG_PATH = join45(HOME4, ".claude", "hooks", "mine-local.log");
var CLAUDE_PROJECTS_DIR = join45(HOME4, ".claude", "projects");
var LOCK_STALE_MS2 = 15 * 60 * 1e3;
function findBundledCliPath() {
  try {
    const thisDir = dirname17(fileURLToPath3(import.meta.url));
    const cliPath = join45(thisDir, "..", "..", "bundle", "cli.js");
    return existsSync40(cliPath) ? cliPath : null;
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
    const out = execFileSync6(lookup, ["hivemind"], {
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
  if (!existsSync40(CLAUDE_PROJECTS_DIR))
    return false;
  let subdirs;
  try {
    subdirs = readdirSync8(CLAUDE_PROJECTS_DIR);
  } catch {
    return false;
  }
  for (const sub of subdirs) {
    let files;
    try {
      files = readdirSync8(join45(CLAUDE_PROJECTS_DIR, sub));
    } catch {
      continue;
    }
    if (files.some((f) => f.endsWith(".jsonl")))
      return true;
  }
  return false;
}
function maybeAutoMineLocal(opts = {}) {
  if (existsSync40(LOCAL_MANIFEST_PATH))
    return { triggered: false, reason: "manifest-exists" };
  if (existsSync40(LOCAL_MINE_LOCK_PATH)) {
    let stale = false;
    try {
      const stats = statSync8(LOCAL_MINE_LOCK_PATH);
      stale = Date.now() - stats.mtimeMs > LOCK_STALE_MS2;
    } catch {
    }
    if (!stale)
      return { triggered: false, reason: "lock-exists" };
    try {
      unlinkSync13(LOCAL_MINE_LOCK_PATH);
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
    mkdirSync20(HIVEMIND_DIR4, { recursive: true });
    const fd = openSync3(LOCAL_MINE_LOCK_PATH, "wx");
    closeSync3(fd);
  } catch {
    return { triggered: false, reason: "lock-acquire-failed" };
  }
  try {
    mkdirSync20(join45(HOME4, ".claude", "hooks"), { recursive: true });
    const out = openSync3(LOG_PATH, "a");
    const mineArgs = ["skillify", "mine-local"];
    if (opts.sessionCount != null)
      mineArgs.push("--n", String(opts.sessionCount));
    if (opts.onlyAgent)
      mineArgs.push("--only", opts.onlyAgent);
    if (opts.advise)
      mineArgs.push("--advise");
    const [cmd, args] = launcher.kind === "node-script" ? [process.execPath, [launcher.path, ...mineArgs]] : [launcher.path, mineArgs];
    const child = spawn6(cmd, args, {
      detached: true,
      stdio: ["ignore", out, out],
      // SW_HIDE: libuv still applies it alongside detached, so the mining
      // worker never flashes a console. No-op on POSIX.
      windowsHide: true,
      env: process.env
    });
    closeSync3(out);
    child.unref();
    return { triggered: true };
  } catch {
    try {
      unlinkSync13(LOCAL_MINE_LOCK_PATH);
    } catch {
    }
    return { triggered: false, reason: "spawn-failed" };
  }
}

// dist/src/skillify/backfill-guards.js
var LOCK_STALE_MS3 = 30 * 60 * 1e3;
function runBackfillGuards(deps) {
  if (deps.manifestExists())
    return { triggered: false, reason: "manifest-exists" };
  if (deps.lockExists()) {
    if (deps.lockAgeMs() <= LOCK_STALE_MS3)
      return { triggered: false, reason: "lock-exists" };
    if (!deps.removeLock())
      return { triggered: false, reason: "lock-exists" };
  }
  if (!deps.hasAgents())
    return { triggered: false, reason: "no-local-sessions" };
  if (!deps.hasLauncher())
    return { triggered: false, reason: "no-hivemind-bin" };
  if (!deps.acquireLock())
    return { triggered: false, reason: "lock-acquire-failed" };
  if (!deps.spawn()) {
    deps.removeLock();
    return { triggered: false, reason: "spawn-failed" };
  }
  return { triggered: true };
}

// dist/src/skillify/spawn-backfill-memory-worker.js
var HOME5 = homedir25();
var HIVEMIND_DIR5 = join46(HOME5, ".claude", "hivemind");
var LOG_PATH2 = join46(HOME5, ".claude", "hooks", "backfill-memory.log");
function realSpawn() {
  const launcher = findHivemindLauncher();
  if (!launcher)
    return false;
  mkdirSync21(join46(HOME5, ".claude", "hooks"), { recursive: true });
  const out = openSync4(LOG_PATH2, "a");
  const [cmd, cmdArgs] = launcher.kind === "node-script" ? [process.execPath, [launcher.path, "memory", "backfill"]] : [launcher.path, ["memory", "backfill"]];
  const child = spawn7(cmd, cmdArgs, {
    detached: true,
    stdio: ["ignore", out, out],
    // SW_HIDE: libuv still applies it alongside detached, so the backfill
    // worker never flashes a console. No-op on POSIX.
    windowsHide: true,
    // Mark the spawned process as the lock owner so it (and only it) releases
    // the lock on exit — a manual `hivemind memory backfill` won't clear it.
    env: { ...process.env, HIVEMIND_BACKFILL_LOCK_OWNED: "1" }
  });
  closeSync4(out);
  child.unref();
  return true;
}
function maybeAutoBackfillMemory() {
  return runBackfillGuards({
    manifestExists: () => existsSync41(PENDING_MEMORY_MANIFEST_PATH),
    lockExists: () => existsSync41(PENDING_MEMORY_LOCK_PATH),
    lockAgeMs: () => {
      try {
        return Date.now() - statSync9(PENDING_MEMORY_LOCK_PATH).mtimeMs;
      } catch {
        return 0;
      }
    },
    removeLock: () => {
      try {
        unlinkSync14(PENDING_MEMORY_LOCK_PATH);
        return true;
      } catch {
        return false;
      }
    },
    hasAgents: () => detectInstalledAgents().length > 0,
    hasLauncher: () => findHivemindLauncher() !== null,
    acquireLock: () => {
      try {
        mkdirSync21(HIVEMIND_DIR5, { recursive: true });
        closeSync4(openSync4(PENDING_MEMORY_LOCK_PATH, "wx"));
        return true;
      } catch {
        return false;
      }
    },
    spawn: () => {
      try {
        return realSpawn();
      } catch {
        return false;
      }
    }
  });
}

// dist/src/cli/update.js
import { execFileSync as execFileSync7 } from "node:child_process";
import { closeSync as closeSync5, existsSync as existsSync42, mkdirSync as mkdirSync22, openSync as openSync5, readFileSync as readFileSync32, realpathSync, unlinkSync as unlinkSync15, writeSync as writeSync3 } from "node:fs";
import { homedir as homedir26 } from "node:os";
import { dirname as dirname18, join as join47, sep as sep2 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
var NPM_REGISTRY_URL = "https://registry.npmjs.org/@deeplake/hivemind/latest";
var PKG_NAME = "@deeplake/hivemind";
function defaultLockPath() {
  return join47(homedir26(), ".deeplake", "hivemind-update.lock");
}
function detectInstallKind(argv1) {
  const realArgv1 = (() => {
    try {
      return realpathSync(argv1 ?? process.argv[1] ?? fileURLToPath4(import.meta.url));
    } catch {
      return argv1 ?? process.argv[1] ?? fileURLToPath4(import.meta.url);
    }
  })();
  let dir = dirname18(realArgv1);
  let installDir = null;
  for (let i = 0; i < 10; i++) {
    const pkgPath = `${dir}${sep2}package.json`;
    try {
      const pkg = JSON.parse(readFileSync32(pkgPath, "utf-8"));
      if (pkg.name === PKG_NAME || pkg.name === "hivemind") {
        installDir = dir;
        break;
      }
    } catch {
    }
    const parent = dirname18(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  installDir ??= dirname18(realArgv1);
  if (realArgv1.includes(`${sep2}_npx${sep2}`) || realArgv1.includes(`${sep2}.npx${sep2}`)) {
    return { kind: "npx", installDir };
  }
  if (realArgv1.includes(`${sep2}node_modules${sep2}@deeplake${sep2}hivemind`) || realArgv1.includes(`${sep2}node_modules${sep2}hivemind`)) {
    return { kind: "npm-global", installDir };
  }
  let gitDir = installDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync42(`${gitDir}${sep2}.git`)) {
      return { kind: "local-dev", installDir };
    }
    const parent = dirname18(gitDir);
    if (parent === gitDir)
      break;
    gitDir = parent;
  }
  return { kind: "unknown", installDir };
}
async function getLatestNpmVersion(timeoutMs = 5e3) {
  try {
    const res = await fetch(NPM_REGISTRY_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok)
      return null;
    const meta = await res.json();
    return meta.version ?? null;
  } catch {
    return null;
  }
}
var defaultSpawn = (cmd, args) => {
  execFileSync7(cmd, args, { stdio: "inherit" });
};
function tryAcquireLock(path) {
  mkdirSync22(dirname18(path), { recursive: true, mode: 448 });
  const claim = () => {
    const fd = openSync5(path, "wx", 384);
    writeSync3(fd, String(process.pid));
    return fd;
  };
  try {
    return claim();
  } catch (e) {
    if (e.code !== "EEXIST")
      throw e;
  }
  let holderPid = 0;
  try {
    holderPid = Number(readFileSync32(path, "utf-8").trim()) || 0;
  } catch {
    try {
      return claim();
    } catch {
      return null;
    }
  }
  if (holderPid > 0) {
    try {
      process.kill(holderPid, 0);
      log(`another hivemind update is already running (pid=${holderPid}); skipping.`);
      return null;
    } catch {
    }
  }
  try {
    unlinkSync15(path);
  } catch {
  }
  try {
    return claim();
  } catch {
    log(`another hivemind update is already running; skipping.`);
    return null;
  }
}
function releaseLock2(fd, path) {
  try {
    closeSync5(fd);
  } catch {
  }
  try {
    unlinkSync15(path);
  } catch {
  }
}
async function runUpdate(opts = {}) {
  const current = opts.currentVersionOverride ?? getVersion();
  const latest = opts.latestVersionOverride !== void 0 ? opts.latestVersionOverride : await getLatestNpmVersion();
  if (!latest) {
    warn(`Could not reach npm registry to check for updates.`);
    warn(`Current version: ${current}`);
    return 1;
  }
  if (!isNewer(latest, current)) {
    log(`hivemind ${current} is up to date (npm latest: ${latest}).`);
    return 0;
  }
  log(`Update available: ${current} \u2192 ${latest}`);
  const detected = opts.installKindOverride ?? detectInstallKind();
  const spawn8 = opts.spawn ?? defaultSpawn;
  switch (detected.kind) {
    case "npm-global": {
      if (opts.dryRun) {
        log(`(dry-run) Would run: npm install -g ${PKG_NAME}@${latest}`);
        log(`(dry-run) Would re-run: hivemind install --skip-auth`);
        return 0;
      }
      const lockPath = opts.lockPathOverride ?? defaultLockPath();
      const lockFd = tryAcquireLock(lockPath);
      if (lockFd === null)
        return 0;
      try {
        log(`Upgrading via npm\u2026`);
        try {
          spawn8("npm", ["install", "-g", `${PKG_NAME}@${latest}`]);
        } catch (e) {
          warn(`npm install failed: ${e.message}`);
          warn(`Try running it manually: npm install -g ${PKG_NAME}@${latest}`);
          return 1;
        }
        log(``);
        log(`Refreshing agent bundles\u2026`);
        try {
          spawn8("hivemind", ["install", "--skip-auth"]);
        } catch (e) {
          warn(`Agent refresh failed: ${e.message}`);
          warn(`Run manually: hivemind install`);
          return 1;
        }
        log(``);
        log(`Updated to ${latest}.`);
        return 0;
      } finally {
        releaseLock2(lockFd, lockPath);
      }
    }
    case "npx": {
      if (opts.dryRun) {
        log(`(dry-run) Would print npx-pin instructions (no persistent install to upgrade).`);
        return 0;
      }
      log(`You ran hivemind via npx, which does not have a persistent global install.`);
      log(`To use the new version, re-run with the explicit version pin:`);
      log(``);
      log(`  npx ${PKG_NAME}@${latest} install`);
      log(``);
      log(`Or install globally so future updates are one command:`);
      log(``);
      log(`  npm install -g ${PKG_NAME}@${latest}`);
      return 0;
    }
    case "local-dev": {
      if (opts.dryRun) {
        log(`(dry-run) Would refuse: running from a local dev checkout (${detected.installDir}).`);
        return 0;
      }
      warn(`hivemind is running from a local development checkout (${detected.installDir}).`);
      warn(`Update via your dev workflow (git pull + npm install + npm run build),`);
      warn(`not via 'hivemind update'.`);
      return 1;
    }
    case "unknown":
    default: {
      if (opts.dryRun) {
        log(`(dry-run) Would refuse: install kind unknown (${detected.installDir}).`);
        return 0;
      }
      warn(`Could not determine how hivemind was installed (path: ${detected.installDir}).`);
      warn(`Update manually: npm install -g ${PKG_NAME}@${latest}`);
      return 1;
    }
  }
}

// dist/src/cli/index.js
var AUTH_SUBCOMMANDS = /* @__PURE__ */ new Set([
  "whoami",
  "logout",
  "org",
  "workspaces",
  "workspace",
  "invite",
  "members",
  "remove",
  "autoupdate",
  "sessions"
]);
var USAGE5 = `
hivemind \u2014 one brain for every agent on your team

Usage:
  hivemind install   [--only <platforms>] [--skip-auth] [--token <value>]
                     [--ref <code>] [--no-scan]
      Auto-detect assistants on this machine and install hivemind into each.
      --only takes a comma-separated list: ${allPlatformIds().join(",")}
      --token, or env HIVEMIND_TOKEN, signs in non-interactively (useful
      for CI / scripted installs). Without it, a TTY install shows a
      consent prompt; a headless install skips auth and prints a hint
      for 'hivemind login'.
      --ref <code> attributes a NEW signup to an affiliate/referrer code
      (e.g. --ref mario). Ignored for already-registered users.
      By default install kicks off a background scan of your recent Claude
      Code sessions for repeatable mistakes (surfaced next session). Pass
      --no-scan, or set HIVEMIND_INSTALL_SCAN=0, to skip it.

  hivemind uninstall [--only <platforms>]
      Auto-detect installed assistants and remove hivemind from each.
      --only takes the same list to scope the removal.

  hivemind claude  install | uninstall
  hivemind codex   install | uninstall
  hivemind claw    install | uninstall
  hivemind cursor  install | uninstall
  hivemind hermes  install | uninstall
  hivemind claude_cowork install | uninstall
  hivemind pi      install | uninstall
      Install or remove hivemind for a specific assistant.

  hivemind login [--ref <code>]
                            Run device-flow login (open browser). --ref
                            attributes a new signup to a referrer code.
  hivemind status           Show which assistants are wired up.
  hivemind update [--dry-run]
      Check npm for a newer @deeplake/hivemind, upgrade the CLI, and refresh
      every detected agent bundle. Single command for all agents.

  hivemind dashboard [--cwd <path>] [--out <path>] [--no-open]
                     [--serve] [--port <n>]
      Build a self-contained HTML dashboard for this repo. Combines
      KPI cards (tokens saved, skills created, memory recalls,
      sessions) with the codebase-graph visualization. Writes to
      ~/.hivemind/dashboards/<repo-key>/index.html by default.
      --no-open skips the browser launch (headless / CI scenarios).
      --serve starts a loopback HTTP server at http://127.0.0.1:<port>
      (default 8123) so the dashboard is reachable via a URL \u2014 useful
      over SSH; VS Code / Cursor Remote-SSH auto-forwards the port
      and opens it in the integrated Simple Browser tab on click.

Semantic search (embeddings):
  hivemind embeddings install                Download @huggingface/transformers
                                             once (~600 MB) into a shared dir,
                                             symlink every detected agent
                                             plugin to it, and set
                                             embeddings.enabled = true in
                                             ~/.deeplake/config.json. Idempotent.
  hivemind embeddings enable                 Light opt-in: flip
                                             embeddings.enabled = true in
                                             ~/.deeplake/config.json. Use this
                                             after \`disable\` to turn back on
                                             without re-running install.
  hivemind embeddings disable                Light opt-out: flip
                                             embeddings.enabled = false and
                                             SIGTERM the running daemon. Shared
                                             deps stay on disk.
  hivemind embeddings uninstall [--prune]    Full opt-out: remove the per-agent
                                             symlinks, flip
                                             embeddings.enabled = false, and
                                             SIGTERM the daemon. --prune also
                                             deletes the shared dir to reclaim
                                             ~600 MB.
  hivemind embeddings status                 Show config + shared-deps + per-
                                             agent state.

  Add --with-embeddings to "hivemind install" (or "hivemind <agent> install")
  to run "embeddings install" automatically after installing the agent(s).

Codebase graph (per-repo AST snapshot + cloud sync):
  hivemind graph build [--cwd <path>]        Walk TypeScript sources, extract
                                             AST nodes + edges, write a
                                             snapshot, and push to cloud.
  hivemind graph diff <sha1> <sha2>          Diff two snapshots by commit.
  hivemind graph history [-n N] [--json]     Show last N build entries.
  hivemind graph init [--force]              Install a managed
                                             .git/hooks/post-commit hook
                                             that rebuilds on each commit.
  hivemind graph pull                        Download the freshest cloud
                                             snapshot for HEAD into local.
  hivemind graph uninstall                   Remove the managed post-commit
                                             hook.
  Agents query the local snapshot via the Deeplake mount at
  ~/.deeplake/memory/graph/{index.md,find/<pattern>,show/<handle-or-pattern>}.

Skill management (mine + share reusable Claude skills across the org):
${renderCliHelpBlock()}

Team-wide rules:
  hivemind rules add "<text>" [--scope team]   Add a new rule (org-wide).
  hivemind rules list [--status active|done|all] [--limit N]
                                               List rules. Default: active, 10 newest.
  hivemind rules edit <rule-id> "<new text>"   Edit a rule (bumps version).
  hivemind rules done <rule-id>                Mark a rule done.
  Note: active rules are auto-injected into the SessionStart block for
  claude-code / cursor / hermes; codex / pi / openclaw use 'hivemind context'.

Cross-agent helpers:
  hivemind context                             Print the rules + open-goals block on demand.
                                               Fallback for harnesses/pi/openclaw agents (no SessionStart hook)
                                               and read-only diagnostic for any agent.

Account / org / workspace:
  hivemind whoami                          Show current user, org, workspace.
  hivemind logout                          Remove credentials.
  hivemind org list                        List organizations.
  hivemind org switch <name-or-id>         Switch active organization.
  hivemind workspaces                      List workspaces in current org.
  hivemind workspace list                  List workspaces (alias of 'workspaces').
  hivemind workspace switch <name-or-id>   Switch active workspace.
  hivemind members                         List org members.
  hivemind invite <email> <ADMIN|WRITE|READ>  Invite a teammate.
  hivemind remove <user-id>                Remove a member.
  hivemind autoupdate [on|off]             Toggle Claude Code plugin auto-update.
  hivemind sessions prune [...]            Manage your captured sessions.

  hivemind --version        Print the hivemind version.
  hivemind --help           Show this message.

Docs:  https://github.com/activeloopai/hivemind
`.trim();
function parseOnly(args) {
  const idx = args.findIndex((a) => a === "--only" || a.startsWith("--only="));
  if (idx === -1)
    return null;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (!raw)
    return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = new Set(allPlatformIds());
  const bad = ids.filter((id) => !valid.has(id));
  if (bad.length > 0) {
    warn(`Unknown platform(s): ${bad.join(", ")}. Valid: ${allPlatformIds().join(", ")}`);
    process.exit(1);
  }
  return ids;
}
function hasFlag(args, flag) {
  return args.includes(flag);
}
function parseToken(args) {
  const idx = args.findIndex((a) => a === "--token" || a.startsWith("--token="));
  if (idx === -1)
    return void 0;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  return raw && raw.length > 0 ? raw : void 0;
}
function parseRef(args) {
  const idx = args.findIndex((a) => a === "--ref" || a.startsWith("--ref="));
  if (idx === -1)
    return void 0;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (!raw || raw.startsWith("--"))
    return void 0;
  const code = raw.trim();
  return code.length > 0 ? code : void 0;
}
function hasEnvToken() {
  return Boolean(process.env.HIVEMIND_TOKEN);
}
function installScanOptedOut(args) {
  if (args.includes("--no-scan"))
    return true;
  const env = (process.env.HIVEMIND_INSTALL_SCAN ?? "").trim().toLowerCase();
  return env === "0" || env === "false" || env === "no" || env === "off";
}
async function runAuthGate(args) {
  const flagToken = parseToken(args);
  const isTTY = Boolean(process.stdin.isTTY);
  if (flagToken || hasEnvToken()) {
    const ok = await loginWithProvidedToken(flagToken);
    if (ok)
      return;
  }
  if (!isTTY) {
    log("");
    log("No TTY detected \u2014 continuing without sign-in.");
    log("To sign in:");
    log("  1) Visit https://app.deeplake.ai/api-keys to create an API key");
    log("  2) Rerun: HIVEMIND_TOKEN=<key> hivemind install");
    log("Or run `hivemind login` after install.");
    return;
  }
  if (!installScanOptedOut(args)) {
    const auto = maybeAutoMineLocal({
      sessionCount: 10,
      onlyAgent: "claude_code",
      advise: true
    });
    if (auto.triggered) {
      log("");
      log("\u{1F41D} Scanning your recent Claude Code sessions for repeatable mistakes in the");
      log("   background (using your Claude Code subscription). Your first insight will");
      log("   appear the next time you start Claude Code.");
    }
  }
  log("");
  log("\u{1F41D} One more step to unlock Hivemind");
  log("");
  log("To enable shared memory and auto-learning across your agents,");
  log("we need to sign you in. Your traces will be securely stored in");
  log("your private Hivemind, so all your agents can recall them.");
  log("");
  log("You can later connect your own cloud storage like S3/GCS/Azure Blob.");
  log("");
  const yes = await confirm("Sign in now?", true);
  let signedIn = false;
  if (yes) {
    signedIn = await ensureLoggedIn(parseRef(args));
    if (!signedIn) {
      warn("Login did not complete.");
    }
  }
  if (!signedIn) {
    log("");
    log("Alternatively, sign in at https://app.deeplake.ai/api-keys, create");
    log("an API key, and paste it here. Press Enter to skip and continue");
    log("installing without sign-in (you can run `hivemind login` later).");
    log("");
    const MAX_PASTE_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_PASTE_ATTEMPTS; attempt++) {
      const pasted = await promptLine("API key: ");
      if (!pasted)
        break;
      signedIn = await loginWithProvidedToken(pasted);
      if (signedIn)
        break;
      const remaining = MAX_PASTE_ATTEMPTS - attempt;
      if (remaining > 0) {
        log("");
        log(`That key wasn't accepted (likely invalid or revoked). Try again (${remaining} attempt${remaining === 1 ? "" : "s"} left) or press Enter to skip.`);
        log("");
      }
    }
    if (!signedIn) {
      log("");
      log("Continuing install without sign-in. Run `hivemind login` later, or");
      log("rerun with `HIVEMIND_TOKEN=<key> hivemind install`.");
    }
  }
}
async function runInstallAll(args) {
  const only = parseOnly(args);
  const skipAuth = hasFlag(args, "--skip-auth");
  const withEmbeddings = hasFlag(args, "--with-embeddings");
  const targets = only ?? detectPlatforms().map((p) => p.id);
  if (targets.length === 0) {
    log("No supported assistants detected.");
    log("Supported: Claude Code, Codex, OpenClaw, Cursor, Hermes Agent, Pi, Claude Cowork.");
    log("Install one and rerun `hivemind install`, or target a specific assistant: `hivemind cursor install`.");
    return;
  }
  log(`Installing hivemind ${getVersion()} for: ${targets.join(", ")}`);
  log("");
  if (!skipAuth && !isLoggedIn()) {
    await runAuthGate(args);
  }
  for (const id of targets)
    runSingleInstall(id);
  if (withEmbeddings) {
    log("");
    installEmbeddings();
  }
  await maybeShowOrgChoice();
  const backfill = maybeAutoBackfillMemory();
  if (backfill.triggered) {
    log("");
    log("Mining your past sessions for team memory in the background \u2014 sign in, then run `hivemind memory flush` to push.");
  }
  const { homedir: homedir27 } = await import("node:os");
  const { tryGitTopLevel: tryGitTopLevel2 } = await import("./git-hook-install-KB5REAXY.js");
  const { loadConfig: loadConfig2 } = await import("./config-ICGRRHKH.js");
  const { spawnDetachedNodeWorker: spawnDetachedNodeWorker2 } = await import("./spawn-detached-TQUM3IUW.js");
  const { isAutoEnabled: isAutoEnabled2 } = await import("./auto-registry-D6H4EMTE.js");
  const { deriveProjectKey: deriveProjectKey2 } = await import("./repo-identity-2VPNHTNU.js");
  const { runInstallDocsOnboarding } = await import("./install-docs-JAH2HUWD.js");
  await runInstallDocsOnboarding({
    cwd: process.cwd(),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    loggedIn: isLoggedIn(),
    home: homedir27(),
    gitTopLevel: (cwd) => tryGitTopLevel2(cwd),
    loadCfg: () => loadConfig2(),
    autoEnabled: (orgId, root) => isAutoEnabled2(orgId, deriveProjectKey2(root).key),
    // Build inline (fast, no LLM) so the wiki worker has a snapshot + the
    // page estimate is real. Heavy graph deps stay lazy.
    buildGraph: async (root) => {
      const { runBuildCommand } = await import("./graph-UTYDPAHF.js");
      await runBuildCommand(["--cwd", root, "--trigger", "manual"]);
    },
    onboard: async ({ root, orgId, orgName }) => {
      const { runDocsOnboarding: runDocsOnboarding2 } = await import("./onboarding-PQVGG65K.js");
      const { deriveProjectKey: deriveProjectKey3 } = await import("./repo-identity-2VPNHTNU.js");
      const { loadCurrentSnapshot: loadCurrentSnapshot2 } = await import("./load-current-QY3G23GI.js");
      return runDocsOnboarding2({
        root,
        isGitRepo: true,
        orgId,
        orgName,
        project: deriveProjectKey3(root).key,
        snap: loadCurrentSnapshot2(root)
      });
    },
    spawn: (workerArgs) => {
      const cliEntry = process.argv[1];
      if (!cliEntry)
        return false;
      spawnDetachedNodeWorker2(cliEntry, workerArgs);
      return true;
    },
    showHint: () => {
      if (docsHintShown())
        return;
      log("");
      for (const line of docsInstallLines())
        log(line);
      markDocsHintShown();
    },
    log,
    warn
  });
  log("");
  log("Done. Restart each assistant to activate hooks.");
}
function runSingleInstall(id) {
  try {
    if (id === "claude")
      installClaude();
    else if (id === "codex")
      installCodex();
    else if (id === "claw")
      installOpenclaw();
    else if (id === "cursor")
      installCursor();
    else if (id === "hermes")
      installHermes();
    else if (id === "pi")
      installPi();
    else if (id === "claude_cowork")
      installCowork();
  } catch (err) {
    warn(`  ${id.padEnd(14)} FAILED: ${err.message}`);
  }
}
function runSingleUninstall(id) {
  try {
    if (id === "claude")
      uninstallClaude();
    else if (id === "codex")
      uninstallCodex();
    else if (id === "claw")
      uninstallOpenclaw();
    else if (id === "cursor")
      uninstallCursor();
    else if (id === "hermes")
      uninstallHermes();
    else if (id === "pi")
      uninstallPi();
    else if (id === "claude_cowork")
      uninstallCowork();
  } catch (err) {
    warn(`  ${id.padEnd(14)} FAILED: ${err.message}`);
  }
}
function runStatus() {
  const detected = detectPlatforms();
  log(`hivemind ${getVersion()}`);
  log(`logged in: ${isLoggedIn() ? "yes" : "no"}`);
  log("");
  log("Detected assistants:");
  if (detected.length === 0)
    log("  (none)");
  for (const p of detected)
    log(`  ${p.id.padEnd(8)} ${p.markerDir}`);
}
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    log(USAGE5);
    return;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    log(getVersion());
    return;
  }
  if (cmd === "install") {
    await runInstallAll(args.slice(1));
    return;
  }
  if (cmd === "uninstall") {
    const only = parseOnly(args.slice(1));
    const targets = only ?? detectPlatforms().map((p) => p.id);
    for (const id of targets)
      runSingleUninstall(id);
    return;
  }
  if (cmd === "login") {
    await ensureLoggedIn(parseRef(args.slice(1)));
    return;
  }
  if (cmd === "status") {
    runStatus();
    return;
  }
  if (cmd === "update") {
    const code = await runUpdate({ dryRun: hasFlag(args.slice(1), "--dry-run") });
    process.exit(code);
  }
  if (cmd === "skillify") {
    runSkillifyCommand(args.slice(1));
    return;
  }
  if (cmd === "rules") {
    await runRulesCommand(args.slice(1));
    return;
  }
  if (cmd === "goal" || cmd === "goals") {
    await runGoalCommand(args.slice(1));
    return;
  }
  if (cmd === "kpi" || cmd === "kpis") {
    await runKpiCommand(args.slice(1));
    return;
  }
  if (cmd === "docs" || cmd === "doc") {
    await runDocsCommand(args.slice(1));
    return;
  }
  if (cmd === "context") {
    await runContextCommand(args.slice(1));
    return;
  }
  if (cmd === "graph") {
    if (args[1] === "init") {
      try {
        ensureGraphDeps();
      } catch {
      }
    }
    let runGraphCommand;
    try {
      ({ runGraphCommand } = await import("./graph-UTYDPAHF.js"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("tree-sitter") || err?.code === "ERR_MODULE_NOT_FOUND") {
        console.error("hivemind graph requires the optional 'tree-sitter' native module, which is not installed.\nIt can fail to build on some platforms (e.g. Node 24 / arm64). Everything else in Hivemind\nworks without it. To enable the codebase graph, reinstall with a toolchain that can build\nnative addons, or install tree-sitter manually in the package directory.");
        process.exit(1);
      }
      throw err;
    }
    await runGraphCommand(args.slice(1));
    return;
  }
  if (cmd === "dashboard") {
    const code = await runDashboardCommand(args.slice(1));
    process.exit(code);
  }
  if (cmd === "embeddings") {
    const sub = args[1];
    if (sub === "install") {
      installEmbeddings();
      return;
    }
    if (sub === "enable") {
      enableEmbeddings();
      return;
    }
    if (sub === "disable") {
      disableEmbeddings();
      return;
    }
    if (sub === "uninstall") {
      uninstallEmbeddings({ prune: hasFlag(args.slice(2), "--prune") });
      return;
    }
    if (sub === "status") {
      statusEmbeddings();
      return;
    }
    warn("Usage: hivemind embeddings install | enable | disable | uninstall [--prune] | status");
    process.exit(1);
  }
  if (cmd === "memory") {
    const sub = args[1];
    if (sub === "backfill") {
      const code = await runBackfillMemory(args.slice(2));
      process.exit(code);
    }
    if (sub === "flush") {
      const r = await runFlushMemory();
      if (r.reason === "not-logged-in") {
        warn("Not logged in \u2014 run `hivemind login` before flushing staged memory.");
        process.exit(1);
      }
      log(`memory flush: uploaded ${r.uploaded}/${r.pending} staged summary(ies)${r.failed ? `, ${r.failed} failed` : ""}.`);
      return;
    }
    warn("Usage: hivemind memory backfill [--dry-run] [--force] [--n <num|all>] [--window-days N] [--project-only] [--verbose] | flush");
    process.exit(1);
  }
  if (AUTH_SUBCOMMANDS.has(cmd)) {
    await runAuthCommand(args);
    return;
  }
  const platformCmds = ["claude", "codex", "claw", "cursor", "hermes", "pi", "claude_cowork"];
  if (platformCmds.includes(cmd)) {
    const sub = args[1];
    if (sub === "install") {
      runSingleInstall(cmd);
      if (hasFlag(args.slice(2), "--with-embeddings")) {
        log("");
        installEmbeddings();
      }
    } else if (sub === "uninstall")
      runSingleUninstall(cmd);
    else {
      warn(`Usage: hivemind ${cmd} install [--with-embeddings] | uninstall`);
      process.exit(1);
    }
    return;
  }
  warn(`Unknown command: ${cmd}`);
  log(USAGE5);
  process.exit(1);
}
main().catch((err) => {
  warn(`hivemind: ${err.message}`);
  process.exit(1);
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
