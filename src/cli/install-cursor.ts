import { existsSync, lstatSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { HOME, pkgRoot, ensureDir, copyDir, readJson, writeJson, writeJsonIfChanged, symlinkForce, writeVersionStamp, log } from "./util.js";
import { getVersion } from "./version.js";

// Cursor 1.7+ hooks API: https://cursor.com/docs/agent/hooks
//
// Cursor reads ~/.cursor/hooks.json (user-global). Schema:
//   { "version": 1, "hooks": { "<event>": [{ "type": "command", "command": "...", "timeout": ... }] } }
//
// Different from Claude/Codex: NO outer { hooks: [...] } wrapper per entry —
// Cursor's array entries are the command objects directly. Field names also
// differ ("type" + "command" + "timeout"; no "matcher" wrapper at the top).

const CURSOR_HOME = join(HOME, ".cursor");
const PLUGIN_DIR = join(CURSOR_HOME, "hivemind");
const HOOKS_PATH = join(CURSOR_HOME, "hooks.json");
const HIVEMIND_MARKER_KEY = "_hivemindManaged";

interface CursorHookEntry {
  type: "command" | "prompt";
  command?: string;
  timeout?: number;
  matcher?: string | Record<string, unknown>;
}

function buildHookCmd(bundleFile: string, timeout: number): CursorHookEntry {
  return {
    type: "command",
    command: `node "${join(PLUGIN_DIR, "bundle", bundleFile)}"`,
    timeout,
  };
}

function buildHookCmdShellMatcher(bundleFile: string, timeout: number): CursorHookEntry {
  return {
    type: "command",
    command: `node "${join(PLUGIN_DIR, "bundle", bundleFile)}"`,
    timeout,
    matcher: "Shell",
  };
}

function buildHookConfig(): Record<string, CursorHookEntry[]> {
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
    sessionEnd: [buildHookCmd("session-end.js", 30), buildHookCmd("graph-on-stop.js", 30)],
  };
}

export function isHivemindEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const cmd = (entry as { command?: string }).command;
  if (typeof cmd !== "string") return false;
  // Normalize separators: on Windows the command is written with backslashes
  // (`...\.cursor\hivemind\bundle\capture.js`), so a forward-slash-only match
  // would fail and re-install would duplicate the hooks (same Windows bug as
  // codex's isHivemindHookEntry).
  return cmd.replace(/\\/g, "/").includes("/.cursor/hivemind/bundle/");
}

function mergeHooks(existing: Record<string, unknown> | null): Record<string, unknown> {
  const root = (existing ?? { version: 1, hooks: {} }) as { version?: number; hooks?: Record<string, unknown[]> };
  if (!root.version) root.version = 1;
  if (!root.hooks) root.hooks = {};
  const ours = buildHookConfig();
  for (const [event, entries] of Object.entries(ours)) {
    const prior = Array.isArray(root.hooks[event]) ? root.hooks[event] : [];
    const stripped = prior.filter(e => !isHivemindEntry(e));
    root.hooks[event] = [...stripped, ...entries];
  }
  (root as Record<string, unknown>)[HIVEMIND_MARKER_KEY] = { version: getVersion() };
  return root as unknown as Record<string, unknown>;
}

export function stripHooksFromConfig(existing: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!existing) return null;
  const root = existing as { hooks?: Record<string, unknown[]> };
  if (root.hooks) {
    for (const event of Object.keys(root.hooks)) {
      root.hooks[event] = (root.hooks[event] ?? []).filter(e => !isHivemindEntry(e));
      if (root.hooks[event].length === 0) delete root.hooks[event];
    }
    if (Object.keys(root.hooks).length === 0) delete root.hooks;
  }
  delete (existing as Record<string, unknown>)[HIVEMIND_MARKER_KEY];
  return existing;
}

export function installCursor(): void {
  const srcBundle = join(pkgRoot(), "harnesses", "cursor", "bundle");
  if (!existsSync(srcBundle)) {
    throw new Error(`Cursor bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }

  ensureDir(PLUGIN_DIR);
  copyDir(srcBundle, join(PLUGIN_DIR, "bundle"));

  const existing = readJson<Record<string, unknown>>(HOOKS_PATH);
  const merged = mergeHooks(existing);
  // Idempotent (same rationale as codex): skip the rewrite when unchanged so
  // we don't perturb the hooks.json Cursor/Codex-style trust fingerprints.
  writeJsonIfChanged(HOOKS_PATH, merged);

  const pluginNm = join(PLUGIN_DIR, "node_modules");
  const embedDepsNm = join(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync(embedDepsNm)) {
    try { const st = lstatSync(pluginNm); if (st.isDirectory() && !st.isSymbolicLink()) rmSync(pluginNm, { recursive: true }); } catch { /* ok */ }
    symlinkForce(embedDepsNm, pluginNm);
  }

  writeVersionStamp(PLUGIN_DIR, getVersion());
  log(`  Cursor         installed -> ${PLUGIN_DIR}`);
}

export function uninstallCursor(): void {
  const existing = readJson<Record<string, unknown>>(HOOKS_PATH);
  if (!existing) {
    log("  Cursor         no hooks.json to clean");
    return;
  }
  const stripped = stripHooksFromConfig(existing);
  // Delete the file when nothing meaningful remains. The previous check
  // missed two edge cases: an empty object `{}` (no version key at all)
  // and a stripped object with `version: 0` (falsy → block fired wrong).
  // Count keys ignoring `version` regardless of its value.
  const meaningfulKeys = stripped
    ? Object.keys(stripped).filter(k => k !== "version").length
    : 0;
  if (!stripped || meaningfulKeys === 0) {
    if (existsSync(HOOKS_PATH)) unlinkSync(HOOKS_PATH);
  } else {
    writeJson(HOOKS_PATH, stripped);
  }
  log(`  Cursor         hooks removed from ${HOOKS_PATH} (plugin files kept at ${PLUGIN_DIR})`);
}
