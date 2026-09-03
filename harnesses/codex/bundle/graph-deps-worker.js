#!/usr/bin/env node

// dist/src/cli/graph-deps.js
import { execFileSync as execFileSync2 } from "node:child_process";
import { existsSync as existsSync4, mkdirSync as mkdirSync3, readFileSync as readFileSync4, rmSync as rmSync2, statSync as statSync2, utimesSync, writeFileSync as writeFileSync3 } from "node:fs";
import { randomBytes } from "node:crypto";
import { join as join4 } from "node:path";

// dist/src/cli/util.js
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, symlinkSync, unlinkSync, lstatSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
var HOME = homedir();
function pkgRoot() {
  let dir = fileURLToPath(new URL(".", import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
      if (pkg.name === "@deeplake/hivemind" || pkg.name === "hivemind")
        return dir;
    } catch {
    }
    const parent = dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return fileURLToPath(new URL("..", import.meta.url));
}
function ensureDir(path, mode = 493) {
  if (!existsSync(path))
    mkdirSync(path, { recursive: true, mode });
}
function writeJson(path, obj) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}
function claudeDesktopConfigDir() {
  if (process.platform === "darwin")
    return join(HOME, "Library", "Application Support", "Claude");
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(HOME, "AppData", "Roaming"), "Claude");
  return join(HOME, ".config", "Claude");
}
var PLATFORM_MARKERS = [
  { id: "claude", markerDir: join(HOME, ".claude") },
  { id: "codex", markerDir: join(HOME, ".codex") },
  { id: "claw", markerDir: join(HOME, ".openclaw") },
  { id: "cursor", markerDir: join(HOME, ".cursor") },
  { id: "hermes", markerDir: join(HOME, ".hermes") },
  // pi (badlogic/pi-mono coding-agent) — config at ~/.pi/agent/. pi exposes
  // a rich extension event API (session_start / input / tool_call /
  // tool_result / message_end / session_shutdown / etc.) — Tier 1 capable.
  { id: "pi", markerDir: join(HOME, ".pi") },
  // claude_cowork — Anthropic's agentic desktop assistant, hosted in the
  // Claude Desktop app. Registers the shared hivemind MCP server into
  // claude_desktop_config.json (recall-only; capture is the desktop app's
  // own concern). Marker is the OS-specific Claude Desktop config dir.
  { id: "claude_cowork", markerDir: claudeDesktopConfigDir() }
];
function log(msg) {
  process.stdout.write(msg + "\n");
}
function warn(msg) {
  process.stderr.write(msg + "\n");
}

// dist/src/cli/embeddings.js
import { copyFileSync, chmodSync, existsSync as existsSync3, lstatSync as lstatSync2, readdirSync, readFileSync as readFileSync3, readlinkSync, rmSync, statSync, unlinkSync as unlinkSync2 } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import { join as join3 } from "node:path";

// dist/src/embeddings/protocol.js
var DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1e3;

// dist/src/user-config.js
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, renameSync, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";

// dist/src/cli/embeddings.js
var SHARED_DIR = join3(HOME, ".hivemind", "embed-deps");
var SHARED_NODE_MODULES = join3(SHARED_DIR, "node_modules");
var SHARED_DAEMON_PATH = join3(SHARED_DIR, "embed-daemon.js");

// dist/src/cli/graph-deps.js
function isGraphDepsInstalled(sharedNodeModules = SHARED_NODE_MODULES, specs = treeSitterSpecs()) {
  if (specs.length === 0)
    return false;
  return specs.every((s) => existsSync4(join4(sharedNodeModules, s.slice(0, s.lastIndexOf("@")))));
}
function treeSitterSpecs(pkgJsonPath = join4(pkgRoot(), "package.json")) {
  let opt = {};
  try {
    const pkg = JSON.parse(readFileSync4(pkgJsonPath, "utf8"));
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
    const marker = join4(sharedDir, ".graph-deps");
    const attemptFile = join4(sharedDir, ".graph-deps.attempt");
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
    const lockDir = join4(sharedDir, ".graph-deps.lock");
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
        rmSync2(marker, { force: true });
      } catch {
      }
      const pkgPath = join4(sharedDir, "package.json");
      if (!existsSync4(pkgPath)) {
        writeJson(pkgPath, { name: "hivemind-embed-deps", version: "1.0.0", private: true, dependencies: {} });
      }
      logFn(`  Graph          installing tree-sitter parsers into ${sharedDir} (code-graph; ~tens of MB)`);
      refreshLock(lockDir);
      runNpm(specs, sharedDir);
      refreshLock(lockDir);
      runHeal(sharedDir);
      writeFileSync3(marker, wantKey);
      clearAttempt(attemptFile);
    } finally {
      releaseLock(lockDir, token);
    }
  } catch (err) {
    recordFailure(join4(sharedDir, ".graph-deps.attempt"));
    warnFn(`  Graph          tree-sitter provisioning failed (${err instanceof Error ? err.message : String(err)}); code graph stays disabled \u2014 everything else works`);
  }
}
function readMarker(marker) {
  try {
    return existsSync4(marker) ? readFileSync4(marker, "utf8") : "";
  } catch {
    return "";
  }
}
function lockToken() {
  return `${process.pid}.${randomBytes(8).toString("hex")}`;
}
function ownerFile(lockDir) {
  return join4(lockDir, "owner");
}
function acquireLock(lockDir, token) {
  const claim = () => {
    mkdirSync3(lockDir);
    writeFileSync3(ownerFile(lockDir), token);
    return true;
  };
  try {
    return claim();
  } catch {
    try {
      const age = Date.now() - statSync2(lockDir).mtimeMs;
      if (age < LOCK_STALE_MS)
        return false;
      rmSync2(lockDir, { recursive: true, force: true });
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
    const owner = existsSync4(ownerFile(lockDir)) ? readFileSync4(ownerFile(lockDir), "utf8") : "";
    if (owner !== token)
      return;
    rmSync2(lockDir, { recursive: true, force: true });
  } catch {
  }
}
function recentlyFailed(attemptFile) {
  try {
    if (!existsSync4(attemptFile))
      return false;
    const { lastAttemptAt } = JSON.parse(readFileSync4(attemptFile, "utf8"));
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
      const prev = JSON.parse(readFileSync4(attemptFile, "utf8"));
      if (typeof prev.failures === "number")
        failures = prev.failures;
    } catch {
    }
    writeFileSync3(attemptFile, JSON.stringify({ lastAttemptAt: Date.now(), failures: failures + 1 }));
  } catch {
  }
}
function clearAttempt(attemptFile) {
  try {
    rmSync2(attemptFile, { force: true });
  } catch {
  }
}
function defaultRunNpm(specs, cwd) {
  execFileSync2("npm", ["install", ...specs, "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund", "--ignore-scripts"], {
    cwd,
    stdio: "inherit"
  });
}
function defaultRunHeal(cwd, healScript = join4(pkgRoot(), "scripts", "ensure-tree-sitter.mjs")) {
  if (!existsSync4(healScript)) {
    throw new Error(`heal script missing at ${healScript} \u2014 cannot validate native bindings`);
  }
  execFileSync2(process.execPath, [healScript], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HIVEMIND_STRICT_POSTINSTALL: "1" }
  });
}

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync as mkdirSync4 } from "node:fs";
import { dirname as dirname3, join as join5 } from "node:path";
import { homedir as homedir3 } from "node:os";
var LOG = join5(homedir3(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
}
function log2(tag, msg) {
  if (!isDebug())
    return;
  try {
    mkdirSync4(dirname3(LOG), { recursive: true });
    appendFileSync(LOG, `${(/* @__PURE__ */ new Date()).toISOString()} [${tag}] ${msg}
`);
  } catch {
  }
}

// dist/src/hooks/graph-deps-worker.js
var log3 = (msg) => log2("graph-deps-worker", msg);
try {
  ensureGraphDeps({ logFn: log3, warnFn: log3 });
} catch (e) {
  log3(`fatal: ${e?.message ?? e}`);
}
process.exit(0);
