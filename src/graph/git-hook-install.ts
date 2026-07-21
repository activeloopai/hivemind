/**
 * git post-commit hook installer/uninstaller for the codebase-graph feature.
 *
 * Idempotent. Detects our own hook via sentinel comments so we can safely
 * coexist with (or refuse to clobber) a user-managed hook.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

/** Sentinel markers — used to find and replace ONLY the lines we own. */
export const HOOK_BEGIN_MARKER = "# HIVEMIND_GRAPH_HOOK_BEGIN — managed by `hivemind graph init`";
export const HOOK_END_MARKER = "# HIVEMIND_GRAPH_HOOK_END";

const SHEBANG = "#!/bin/sh";

/**
 * Build the hook body. `hivemindPath` is the absolute path to the hivemind
 * binary resolved at install time — captured so the hook keeps working
 * even when the user's PATH at commit time differs (GUI git clients like
 * GitHub Desktop / Sourcetree commonly run with a reduced PATH).
 */
function hookBodyLines(hivemindPath: string): string[] {
  return [
    "# Async-detached so commits never wait. Threshold-gate + cache make",
    "# typical re-runs ~85ms. Logs go to ~/.hivemind/post-commit.log",
    "# mkdir is robust against first-run: $HOME/.hivemind may not exist yet,",
    "# in which case the > redirect would fail and the build would never start.",
    'mkdir -p "$HOME/.hivemind" 2>/dev/null || true',
    `nohup ${quoteForShell(hivemindPath)} graph build --trigger post-commit >> "$HOME/.hivemind/post-commit.log" 2>&1 &`,
  ];
}

/** Single-quote `path` for safe POSIX shell use; embeds the path literally. */
function quoteForShell(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export type InstallStatus =
  | { kind: "installed"; path: string; wasNew: boolean }
  | { kind: "already-ours"; path: string }
  | { kind: "foreign-hook"; path: string; hint: string };

export type UninstallStatus =
  | { kind: "removed"; path: string; wholeFileDeleted: boolean }
  | { kind: "no-hook"; path: string }
  | { kind: "not-ours"; path: string; hint: string };

export interface InstallOptions {
  /** If true and there's a foreign hook, OVERWRITE it. Default false. */
  force?: boolean;
}

/**
 * Find the hooks directory for `cwd`. Returns the absolute path or null when
 * cwd is not inside a git repo.
 *
 * Resolution order (matches git's own precedence):
 *   1. `core.hooksPath` — repo-level config that REDIRECTS hook execution
 *      to a custom directory. Teams use this for shared hooks (e.g., via
 *      Husky's _husky.sh / .husky/ or a monorepo's tools/git-hooks/).
 *      If set, installing into .git/hooks/ would silently never fire.
 *   2. `git rev-parse --git-path hooks` — the standard hooks dir, which
 *      correctly handles worktrees, submodules, and bare repos.
 */
export function gitHooksDir(cwd: string): string | null {
  // 1) honor core.hooksPath if set
  const configured = tryGitConfig(cwd, "core.hooksPath");
  if (configured !== null) {
    // Relative paths in core.hooksPath are resolved against the repo top-level,
    // not cwd (per git's documented behavior).
    const top = tryGitTopLevel(cwd);
    return top !== null ? resolve(top, configured) : resolve(cwd, configured);
  }
  // 2) fall back to standard hooks dir
  try {
    const out = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out === "") return null;
    return resolve(cwd, out);
  } catch {
    return null;
  }
}

function tryGitConfig(cwd: string, key: string): string | null {
  try {
    const out = execFileSync("git", ["config", "--get", key], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out === "" ? null : out;
  } catch {
    return null; // missing key or not a git repo
  }
}

export function tryGitTopLevel(cwd: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}

export function postCommitHookPath(cwd: string): string | null {
  const hooksDir = gitHooksDir(cwd);
  return hooksDir === null ? null : join(hooksDir, "post-commit");
}

/**
 * Install our managed block in the resolved post-commit hook path.
 *
 * Cases:
 *   1. No file at all → write a fresh hook with shebang + our block. Mark +x.
 *   2. File exists, contains our markers → leave alone (idempotent).
 *   3. File exists, no markers → refuse unless `force` is true; with force,
 *      overwrite the whole file (the user opted in).
 *
 * The hook embeds the absolute path to the hivemind binary (resolved at
 * install time) so it keeps working under PATH-restricted environments
 * (GUI git clients, cron, system Git wrappers).
 */
export function installPostCommitHook(cwd: string, opts: InstallOptions = {}): InstallStatus {
  const path = postCommitHookPath(cwd);
  if (path === null) {
    return { kind: "foreign-hook", path: "", hint: "not in a git repo (no .git directory found)" };
  }

  // CodeRabbit P1: check the idempotent "already-ours" path BEFORE the
  // binary lookup. A restricted shell where `which hivemind` returns
  // nothing must NOT downgrade a no-op reinstall of OUR own hook to
  // "foreign-hook" — the contract is "re-running on an already-installed
  // hook is a no-op". PATH discovery only matters when we're about to
  // WRITE a new hook file.
  const existed = existsSync(path);
  if (existed) {
    const content = readFileSync(path, "utf8");
    if (containsOurMarkers(content)) {
      return { kind: "already-ours", path };
    }
    if (!opts.force) {
      return {
        kind: "foreign-hook",
        path,
        hint: `existing hook at ${path} is not managed by hivemind; pass --force to overwrite, or merge our block manually (between '${HOOK_BEGIN_MARKER}' and '${HOOK_END_MARKER}')`,
      };
    }
    // force=true → fall through to write
  }

  // Only now (we're committed to writing) do we need a hivemind binary path.
  const hivemindPath = resolveHivemindPath();
  if (hivemindPath === null) {
    return {
      kind: "foreign-hook",
      path,
      hint: "hivemind binary not found on PATH. Install hivemind globally (`npm install -g @deeplake/hivemind`) before running `hivemind graph init`, so the hook can find a stable absolute path to call.",
    };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buildHookFile(hivemindPath), { mode: 0o755 });
  // chmod +x — writeFileSync's mode is honored on most systems but
  // not universally; re-chmod to be safe.
  try {
    chmodSync(path, 0o755);
  } catch {
    // best-effort
  }
  // CodeRabbit Minor: report wasNew honestly. On --force overwrite of a
  // foreign hook the file already existed, so wasNew is false.
  return { kind: "installed", path, wasNew: !existed };
}

/**
 * Resolve the absolute path to the hivemind binary at install time. We try,
 * in order:
 *   1. `which hivemind` — what the user's interactive shell would resolve
 *   2. process.execPath fallback — only used if we're being executed via
 *      `node /path/to/cli.js` directly (which is what happens when running
 *      the bundled CLI in dev). We can't infer the production install path
 *      from execPath alone, so we don't synthesize one.
 *
 * Returns null when neither source produces a working absolute path.
 */
function resolveHivemindPath(): string | null {
  // `which hivemind` gives us whatever the user's shell PATH would have
  // resolved interactively. CodeRabbit P1 dropped the previous `command
  // -v` fallback — `command` is a shell builtin, NOT a binary on PATH,
  // so `execFileSync("command", ["-v", ...])` always throws ENOENT and
  // never served as a useful fallback. If `which` itself is missing
  // (busybox without it, etc.), we report not-found and the caller
  // surfaces the install hint.
  try {
    const out = execFileSync("which", ["hivemind"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out !== "" && out.includes("hivemind")) return out.split("\n")[0]!.trim();
  } catch {
    // which not found, or `hivemind` not on PATH
  }
  return null;
}

/**
 * Remove the post-commit hook IF it's ours. Cases:
 *   1. File missing → no-op.
 *   2. File contains ONLY our block (plus shebang + whitespace) → delete the file.
 *   3. File contains our markers + other user content → strip just our block
 *      (between markers, inclusive), leave the rest intact.
 *   4. File exists but no markers → refuse.
 */
export function uninstallPostCommitHook(cwd: string): UninstallStatus {
  const path = postCommitHookPath(cwd);
  if (path === null) {
    return { kind: "no-hook", path: "" };
  }
  if (!existsSync(path)) {
    return { kind: "no-hook", path };
  }
  const content = readFileSync(path, "utf8");
  if (!containsOurMarkers(content)) {
    return {
      kind: "not-ours",
      path,
      hint: `existing hook at ${path} is not managed by hivemind; remove it manually if you want it gone`,
    };
  }
  const stripped = stripOurBlock(content);
  // Whole-file deletion if nothing meaningful remains (only shebang + whitespace).
  const meaningful = stripped
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#!"));
  if (meaningful.length === 0) {
    unlinkSync(path);
    return { kind: "removed", path, wholeFileDeleted: true };
  }
  writeFileSync(path, stripped);
  return { kind: "removed", path, wholeFileDeleted: false };
}

/** Returns true when both markers are present in the file. */
export function containsOurMarkers(content: string): boolean {
  return content.includes(HOOK_BEGIN_MARKER) && content.includes(HOOK_END_MARKER);
}

/**
 * Remove EXACTLY the bytes of the marker block (from the 'H' of HOOK_BEGIN
 * through the last char of HOOK_END). Everything outside that range is
 * preserved byte-for-byte — heredocs, intentional blank-line patterns, and
 * other shell-significant whitespace in user-managed content stays as
 * written.
 *
 * We deliberately do NOT consume the surrounding newlines. If buildHookFile
 * produced a trailing newline after HOOK_END, that newline stays in the
 * file after stripping — the "ours-only" branch in uninstall handles the
 * leftover shebang/whitespace by deleting the whole file when nothing
 * meaningful remains.
 */
function stripOurBlock(content: string): string {
  const beginIdx = content.indexOf(HOOK_BEGIN_MARKER);
  const endIdx = content.indexOf(HOOK_END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) return content;
  const blockEnd = endIdx + HOOK_END_MARKER.length;
  return content.slice(0, beginIdx) + content.slice(blockEnd);
}

/** Compose the full post-commit file content (shebang + our managed block). */
export function buildHookFile(hivemindPath: string): string {
  return [
    SHEBANG,
    "",
    HOOK_BEGIN_MARKER,
    ...hookBodyLines(hivemindPath),
    HOOK_END_MARKER,
    "",
  ].join("\n");
}
