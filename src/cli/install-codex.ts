import { existsSync, lstatSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { HOME, pkgRoot, ensureDir, copyDir, writeJson, writeJsonIfChanged, symlinkForce, writeVersionStamp, log, warn } from "./util.js";
import { getVersion } from "./version.js";
import { upsertMarkedBlock, stripMarkedBlock, HIVEMIND_BLOCK_START, HIVEMIND_BLOCK_END } from "./agents-md.js";

const CODEX_HOME = join(HOME, ".codex");
const PLUGIN_DIR = join(CODEX_HOME, "hivemind");
const HOOKS_PATH = join(CODEX_HOME, "hooks.json");
const AGENTS_SKILLS_DIR = join(HOME, ".agents", "skills");
const SKILL_LINK = join(AGENTS_SKILLS_DIR, "hivemind-memory");
// Codex auto-loads ~/.codex/AGENTS.md into the model context every session,
// SILENTLY (no user-visible TUI cell — verified empirically). This is the
// proactive-memory channel Codex's user-visible `additionalContext` can't be:
// the managed block instructs the model to consult team memory + pull rules /
// goals before starting work, without clobbering the TUI. We own only the
// marker-fenced block; the user's own AGENTS.md content is preserved.
const AGENTS_MD = join(CODEX_HOME, "AGENTS.md");
const CODEX_AGENTS_BLOCK = `${HIVEMIND_BLOCK_START}
## Hivemind Memory

You have global team memory at \`~/.deeplake/memory/\`, shared across all sessions, users, and agents in your org. Proactively consult it before starting a task — and whenever the user asks you to recall, look up, or remember anything:

- Team rules: \`hivemind rules list\`
- Your open goals: \`hivemind goal list --mine\`
- Past sessions: start at \`~/.deeplake/memory/index.md\`, then read \`~/.deeplake/memory/summaries/<user>/<session>.md\`; only fall back to raw \`~/.deeplake/memory/sessions/<user>/*.jsonl\` when a summary lacks the detail.
- Keyword search: \`grep -ri "keyword" ~/.deeplake/memory/summaries/\` (use \`grep\`, NOT \`rg\`/ripgrep — it may not be installed).

Use only bash builtins (cat, ls, grep, jq, head, tail, sed, awk, wc, sort, find) to read this filesystem — rg/ripgrep, node, python, curl are not available there. Do not spawn subagents to read memory.
${HIVEMIND_BLOCK_END}`;

function hookCmd(bundleFile: string, timeout: number, matcher?: string): Record<string, unknown> {
  const block: Record<string, unknown> = {
    hooks: [{
      type: "command",
      command: `node "${join(PLUGIN_DIR, "bundle", bundleFile)}"`,
      timeout,
    }],
  };
  if (matcher) block.matcher = matcher;
  return block;
}

function buildHooksJson(): Record<string, unknown> {
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
      Stop: [stopBlockWithGraph(30)],
    },
  };
}

/** Stop block carrying both the capture stop hook and the graph auto-build. */
function stopBlockWithGraph(timeout: number): Record<string, unknown> {
  return {
    hooks: [
      { type: "command", command: `node "${join(PLUGIN_DIR, "bundle", "stop.js")}"`, timeout },
      { type: "command", command: `node "${join(PLUGIN_DIR, "bundle", "graph-on-stop.js")}"`, timeout },
    ],
  };
}

// Hivemind's codex bundle entry-points. A `command` whose path ends in
// `bundle/<one of these>.js` is almost certainly hivemind regardless of
// where on disk it lives — no other plugin we know of ships this exact
// filename set under a `bundle/` directory.
const HIVEMIND_BUNDLE_FILES = [
  "session-start.js",
  "session-start-setup.js",
  "capture.js",
  "pre-tool-use.js",
  "stop.js",
  "graph-on-stop.js",
  "wiki-worker.js",
] as const;

// True when `entry` is one of our hook blocks. Two ways to recognise it:
//   1. It points into the canonical install dir `<pluginDir>/bundle/`.
//   2. It points at a path matching `bundle/<known-hivemind-file>.js`,
//      regardless of the parent directory. This catches dual-install
//      scenarios — e.g. a user kept a local dev clone of hivemind wired in
//      under a different path (`/path/to/my-clone/codex/bundle/...`) and
//      then ran `hivemind install`, which previously left the dev clone's
//      hooks alongside ours and they raced on every codex session.
//
// Used to strip stale hivemind entries on re-install (so re-installing
// doesn't duplicate our hooks) WITHOUT touching the user's own hook
// entries that happen to share an event.
//
// Exported with an injectable `pluginDir` so unit tests can drive it
// without depending on the real ~/.codex layout.
export function isHivemindHookEntry(entry: unknown, pluginDir: string = PLUGIN_DIR): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  const hooks = Array.isArray(e.hooks) ? (e.hooks as unknown[]) : [];
  return hooks.some(h => {
    if (!h || typeof h !== "object") return false;
    const cmd = (h as Record<string, unknown>).command;
    if (typeof cmd !== "string") return false;
    // Normalize path separators before matching. On Windows the hook command
    // is written via join() (backslashes: `...\hivemind\bundle\capture.js`),
    // but our match patterns use forward slashes. Without this, dedup never
    // matched the prior install on Windows, so every re-install APPENDED a
    // duplicate hivemind hook — the user's "PostToolUse runs twice" bug.
    const nCmd = cmd.replace(/\\/g, "/");
    const nPluginDir = pluginDir.replace(/\\/g, "/");
    if (nCmd.includes(`${nPluginDir}/bundle/`)) return true;
    return HIVEMIND_BUNDLE_FILES.some(f => nCmd.includes(`/bundle/${f}`));
  });
}

// Like isHivemindHookEntry, but only matches entries that point OUTSIDE
// the canonical install dir. Used to surface a warning when re-install
// strips a sibling hivemind clone — those are usually accidental dev-loop
// leftovers, but a user who genuinely wants two installs side-by-side
// needs to see what got removed.
function isForeignHivemindHookEntry(entry: unknown, pluginDir: string = PLUGIN_DIR): boolean {
  if (!isHivemindHookEntry(entry, pluginDir)) return false;
  const e = entry as Record<string, unknown>;
  const hooks = Array.isArray(e.hooks) ? (e.hooks as unknown[]) : [];
  return hooks.every(h => {
    if (!h || typeof h !== "object") return false;
    const cmd = (h as Record<string, unknown>).command;
    if (typeof cmd !== "string") return false;
    // Same separator normalization as isHivemindHookEntry — a canonical-path
    // entry written with backslashes on Windows must NOT be mis-flagged as
    // "foreign" (which would emit a spurious dev-clone warning on re-install).
    return !cmd.replace(/\\/g, "/").includes(`${pluginDir.replace(/\\/g, "/")}/bundle/`);
  });
}

// Pure merge of two hooks-config shapes. Behavior:
//   - Strip prior hivemind entries (matched via isHivemindHookEntry) from
//     each event the user already had configured, so a re-install doesn't
//     duplicate our hooks.
//   - Drop events whose surviving (non-hivemind) entry list is empty.
//   - Append our entries to each event we declare; preserve any other
//     events the user had configured.
//   - Preserve any non-hooks top-level fields from `existing`.
//
// Pure function — no filesystem reads. The wrapper `mergeHooksJson`
// adds the disk read.
export function mergeHooks(
  existing: Record<string, unknown>,
  ours: Record<string, unknown>,
  pluginDir: string = PLUGIN_DIR,
): Record<string, unknown> {
  const existingHooks = (existing.hooks && typeof existing.hooks === "object")
    ? existing.hooks as Record<string, unknown[]>
    : {};
  const ourHooks = ours.hooks as Record<string, unknown[]>;

  const merged: Record<string, unknown[]> = {};
  for (const [event, entries] of Object.entries(existingHooks)) {
    const surviving = (entries ?? []).filter(e => !isHivemindHookEntry(e, pluginDir));
    if (surviving.length) merged[event] = surviving;
  }
  for (const [event, entries] of Object.entries(ourHooks)) {
    merged[event] = [...(merged[event] ?? []), ...(entries ?? [])];
  }
  return { ...existing, hooks: merged };
}

// Filesystem-bound wrapper: reads HOOKS_PATH (if present) and feeds the
// parsed result to the pure mergeHooks. Catches malformed JSON and warns.
// Also surfaces a warning listing any foreign-path hivemind entries
// stripped (e.g. a dev clone wired in under a different directory).
function mergeHooksJson(ours: Record<string, unknown>): Record<string, unknown> {
  let existing: Record<string, unknown> = {};
  try {
    if (existsSync(HOOKS_PATH)) {
      const parsed = JSON.parse(readFileSync(HOOKS_PATH, "utf-8"));
      if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
    }
  } catch {
    warn(`  Codex          ${HOOKS_PATH} unparseable — ignoring prior content`);
  }
  reportForeignHivemindHooks(existing);
  return mergeHooks(existing, ours);
}

function reportForeignHivemindHooks(existing: Record<string, unknown>): void {
  const existingHooks = (existing.hooks && typeof existing.hooks === "object")
    ? existing.hooks as Record<string, unknown[]>
    : {};
  const foreign = new Set<string>();
  for (const entries of Object.values(existingHooks)) {
    for (const e of entries ?? []) {
      if (!isForeignHivemindHookEntry(e)) continue;
      const hooks = Array.isArray((e as Record<string, unknown>).hooks)
        ? ((e as Record<string, unknown>).hooks as unknown[])
        : [];
      for (const h of hooks) {
        const cmd = (h as Record<string, unknown> | null)?.command;
        if (typeof cmd === "string") foreign.add(cmd);
      }
    }
  }
  if (foreign.size === 0) return;
  warn(`  Codex          stripping ${foreign.size} hivemind hook(s) from a non-canonical path:`);
  for (const cmd of foreign) warn(`                   ${cmd}`);
  warn(`                 (these were probably leftover from a local dev clone — re-add them manually if intentional)`);
}

function tryEnableCodexHooks(): void {
  // codex 0.130.0 renamed the `codex_hooks` feature flag to `hooks`. The legacy
  // key still works but prints a deprecation warning on every startup, so we
  // enable the new name and strip the legacy key if it lingers from an older
  // install of this plugin.
  //
  // The strip is gated on a successful enable: on pre-0.130 codex (or if the
  // codex CLI isn't on PATH) the `hooks` feature is unknown and the call
  // throws — in that case we must leave any existing `codex_hooks = true`
  // entry alone, otherwise we'd silently disable hooks on the user's box.
  let enabled = false;
  try {
    execFileSync("codex", ["features", "enable", "hooks"], { stdio: "ignore" });
    enabled = true;
  } catch {
    // codex CLI may not be on PATH (e.g., running under a separate user) or
    // the codex version pre-dates the rename; not fatal.
  }
  if (enabled) stripLegacyCodexHooksKey();
}

function stripLegacyCodexHooksKey(): void {
  const cfgPath = join(CODEX_HOME, "config.toml");
  if (!existsSync(cfgPath)) return;
  try {
    const original = readFileSync(cfgPath, "utf-8");
    // Match a top-level `codex_hooks = ...` line in the `[features]` table.
    // The regex requires the key at line start (after optional whitespace) and
    // immediately followed by `=` or whitespace+`=`, so it won't touch keys
    // like `codex_hooks_other` or `[features.codex_hooks]` table headers.
    const cleaned = original.replace(/^[ \t]*codex_hooks[ \t]*=[^\n]*\r?\n?/gm, "");
    if (cleaned !== original) writeFileSync(cfgPath, cleaned);
  } catch {
    // best-effort cleanup; never fail the install over it.
  }
}

/**
 * Idempotently upsert the hivemind block into ~/.codex/AGENTS.md, the file
 * Codex auto-loads into model context every session. Writes only when the
 * content actually changes, preserving any user content outside the markers.
 */
// Read a file, returning null when it does not exist. Reads directly and
// catches ENOENT rather than existsSync()-then-read, which is a TOCTOU race
// (the file can vanish between the check and the read — flagged by CodeQL
// js/file-system-race).
function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function writeCodexAgentsBlock(): void {
  const prior = readFileOrNull(AGENTS_MD);
  const next = upsertMarkedBlock(prior, CODEX_AGENTS_BLOCK);
  if (next === prior) return;
  writeFileSync(AGENTS_MD, next);
  log(`  Codex          AGENTS.md memory block ${prior ? "updated" : "created"} -> ${AGENTS_MD}`);
}

/**
 * Strip the hivemind block from ~/.codex/AGENTS.md on uninstall, deleting the
 * file when nothing else remains and otherwise preserving the user's content.
 */
function removeCodexAgentsBlock(): void {
  const prior = readFileOrNull(AGENTS_MD);
  if (prior === null) return;
  const stripped = stripMarkedBlock(prior);
  if (stripped === prior) return;
  if (stripped.trim().length === 0) {
    rmSync(AGENTS_MD, { force: true });
    log(`  Codex          removed empty ${AGENTS_MD}`);
  } else {
    writeFileSync(AGENTS_MD, stripped);
    log(`  Codex          stripped hivemind block from ${AGENTS_MD}`);
  }
}

export function installCodex(): void {
  const srcBundle = join(pkgRoot(), "harnesses", "codex", "bundle");
  const srcSkills = join(pkgRoot(), "harnesses", "codex", "skills");

  if (!existsSync(srcBundle)) {
    throw new Error(`Codex bundle missing at ${srcBundle}. Run 'npm run build' first.`);
  }

  ensureDir(PLUGIN_DIR);
  copyDir(srcBundle, join(PLUGIN_DIR, "bundle"));
  if (existsSync(srcSkills)) copyDir(srcSkills, join(PLUGIN_DIR, "skills"));

  tryEnableCodexHooks();
  // Idempotent: only rewrite hooks.json when the merged result actually
  // changed. An unconditional rewrite (even byte-identical) changes the file
  // Codex fingerprints and re-triggers its "Hooks need review" trust prompt on
  // every install/update. Skipping the no-op write keeps the user from being
  // re-prompted each time.
  if (!writeJsonIfChanged(HOOKS_PATH, mergeHooksJson(buildHooksJson()))) {
    log(`  Codex          hooks.json unchanged — skipped rewrite (no re-trust prompt)`);
  }

  ensureDir(AGENTS_SKILLS_DIR);
  const skillTarget = join(PLUGIN_DIR, "skills", "deeplake-memory");
  if (existsSync(skillTarget)) {
    symlinkForce(skillTarget, SKILL_LINK);
  } else {
    warn(`  Codex          skill source missing at ${skillTarget}; skipping symlink`);
  }

  // Link node_modules to embed-deps so graph-on-stop.js (which uses the
  // external tree-sitter native module) can resolve it. The capture hook's
  // ensurePluginNodeModulesLink skips existing real directories — so we
  // replace an empty placeholder dir with a symlink here at install time.
  const pluginNm = join(PLUGIN_DIR, "node_modules");
  const embedDepsNm = join(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync(embedDepsNm)) {
    try {
      const st = lstatSync(pluginNm);
      if (st.isDirectory() && !st.isSymbolicLink()) rmSync(pluginNm, { recursive: true });
    } catch { /* not found — ok */ }
    symlinkForce(embedDepsNm, pluginNm);
  }

  writeCodexAgentsBlock();

  writeVersionStamp(PLUGIN_DIR, getVersion());
  log(`  Codex          installed -> ${PLUGIN_DIR}`);
}

export function uninstallCodex(): void {
  if (existsSync(HOOKS_PATH)) {
    // Symmetric with install: strip ONLY our hivemind entries via mergeHooks.
    // The pre-fix unconditional unlinkSync(HOOKS_PATH) destroyed any user-
    // defined hooks (e.g. a custom Notification handler) that lived alongside
    // ours. mergeHooks(existing, { hooks: {} }) preserves the user's events
    // and removes only the ones whose command points into PLUGIN_DIR/bundle/.
    let existing: Record<string, unknown> = {};
    try {
      const raw = JSON.parse(readFileSync(HOOKS_PATH, "utf-8"));
      if (raw && typeof raw === "object") existing = raw as Record<string, unknown>;
    } catch {
      // Malformed JSON: fall back to deleting the file rather than guess at
      // intent. Same behavior as pre-fix; user can recreate cleanly.
      unlinkSync(HOOKS_PATH);
      log(`  Codex          removed unparseable ${HOOKS_PATH}`);
      existing = {};
    }
    if (Object.keys(existing).length > 0) {
      const stripped = mergeHooks(existing, { hooks: {} });
      const survivingHooks = (stripped.hooks ?? {}) as Record<string, unknown[]>;
      const otherTopLevelKeys = Object.keys(stripped).filter(k => k !== "hooks");
      if (Object.keys(survivingHooks).length === 0 && otherTopLevelKeys.length === 0) {
        unlinkSync(HOOKS_PATH);
        log(`  Codex          removed ${HOOKS_PATH}`);
      } else {
        writeJson(HOOKS_PATH, stripped);
        log(`  Codex          stripped hivemind hooks from ${HOOKS_PATH}`);
      }
    }
  }
  if (existsSync(SKILL_LINK)) {
    unlinkSync(SKILL_LINK);
    log(`  Codex          removed ${SKILL_LINK}`);
  }
  removeCodexAgentsBlock();
  log(`  Codex          plugin files kept at ${PLUGIN_DIR}`);
}
