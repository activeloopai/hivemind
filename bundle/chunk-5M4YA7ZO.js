// dist/src/graph/git-hook-install.js
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
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
    const out = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
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
    const out = execFileSync("git", ["config", "--get", key], {
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
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
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
  return hooksDir === null ? null : join(hooksDir, "post-commit");
}
function installPostCommitHook(cwd, opts = {}) {
  const path = postCommitHookPath(cwd);
  if (path === null) {
    return { kind: "foreign-hook", path: "", hint: "not in a git repo (no .git directory found)" };
  }
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buildHookFile(hivemindPath), { mode: 493 });
  try {
    chmodSync(path, 493);
  } catch {
  }
  return { kind: "installed", path, wasNew: !existed };
}
function resolveHivemindPath() {
  try {
    const out = execFileSync("which", ["hivemind"], {
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
  if (!existsSync(path)) {
    return { kind: "no-hook", path };
  }
  const content = readFileSync(path, "utf8");
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
  writeFileSync(path, stripped);
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

export {
  HOOK_BEGIN_MARKER,
  HOOK_END_MARKER,
  gitHooksDir,
  tryGitTopLevel,
  postCommitHookPath,
  installPostCommitHook,
  uninstallPostCommitHook,
  containsOurMarkers,
  buildHookFile
};
