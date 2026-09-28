#!/usr/bin/env node

// dist/src/hooks/plugin-cache-gc.js
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname as dirname3 } from "node:path";

// dist/src/utils/debug.js
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
var LOG = join(homedir(), ".deeplake", "hook-debug.log");
function isDebug() {
  return process.env.HIVEMIND_DEBUG === "1";
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

// dist/src/utils/plugin-cache.js
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname as dirname2, join as join2, resolve, sep } from "node:path";
import { homedir as homedir2, platform } from "node:os";
var SEMVER_RE = /^\d+\.\d+\.\d+$/;
var KEEP_RE = /\.keep-(\d+)$/;
var IN_USE_DIR = ".in_use";
function isSemver(name) {
  return SEMVER_RE.test(name);
}
function compareSemverDesc(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i])
      return pb[i] - pa[i];
  }
  return 0;
}
function resolveVersionedPluginDir(bundleDir) {
  const pluginDir = dirname2(bundleDir);
  const versionsRoot = dirname2(pluginDir);
  const version = basename(pluginDir);
  if (!isSemver(version))
    return null;
  if (basename(versionsRoot) !== "hivemind")
    return null;
  const expectedPrefix = resolve(homedir2(), ".claude", "plugins", "cache") + sep;
  if (!resolve(versionsRoot).startsWith(expectedPrefix))
    return null;
  return { pluginDir, versionsRoot, version };
}
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}
function readProcStart(pid) {
  if (platform() !== "linux")
    return null;
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const tail = raw.slice(raw.lastIndexOf(")") + 1).trim();
    const fields = tail.split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
  }
}
function isInUseClaimLive(claimPath) {
  let raw;
  try {
    raw = readFileSync(claimPath, "utf-8");
  } catch {
    return false;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const pid = typeof parsed.pid === "number" ? parsed.pid : Number(parsed.pid);
  if (!Number.isFinite(pid) || pid <= 0)
    return false;
  if (!isPidAlive(pid))
    return false;
  if (typeof parsed.procStart === "string" && parsed.procStart.length > 0) {
    const actual = readProcStart(pid);
    if (actual !== null && actual !== parsed.procStart)
      return false;
  }
  return true;
}
function isVersionInUse(versionDir) {
  const inUseDir = join2(versionDir, IN_USE_DIR);
  let entries;
  try {
    entries = readdirSync(inUseDir);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (isInUseClaimLive(join2(inUseDir, name)))
      return true;
  }
  return false;
}
function readCurrentVersionFromManifest(manifestPath) {
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    const entries = parsed?.plugins?.["hivemind@hivemind"];
    if (!Array.isArray(entries))
      return null;
    for (const e of entries) {
      if (typeof e?.version === "string" && isSemver(e.version))
        return e.version;
    }
    return null;
  } catch {
    return null;
  }
}
function planGc(versionsRoot, currentVersion, keepCount, isAlive = isPidAlive, isInUse = isVersionInUse) {
  const entries = safeReaddir(versionsRoot);
  const versions = entries.filter(isSemver);
  const snapshots = entries.filter((e) => KEEP_RE.test(e));
  const sorted = [...versions].sort(compareSemverDesc);
  const keep = /* @__PURE__ */ new Set();
  if (currentVersion && versions.includes(currentVersion))
    keep.add(currentVersion);
  for (const v of sorted) {
    if (keep.size >= keepCount)
      break;
    keep.add(v);
  }
  const deleteVersions = [];
  if (currentVersion && versions.includes(currentVersion)) {
    for (const v of versions) {
      if (keep.has(v))
        continue;
      if (isInUse(join2(versionsRoot, v))) {
        keep.add(v);
        continue;
      }
      deleteVersions.push(v);
    }
  }
  const deleteSnapshots = [];
  for (const s of snapshots) {
    const m = s.match(KEEP_RE);
    if (!m)
      continue;
    const pid = Number(m[1]);
    if (!Number.isFinite(pid) || !isAlive(pid))
      deleteSnapshots.push(s);
  }
  return { keep: [...keep], deleteVersions, deleteSnapshots };
}
function executeGc(versionsRoot, plan) {
  const errors = [];
  const deletedVersions = [];
  const deletedSnapshots = [];
  for (const v of plan.deleteVersions) {
    const target = join2(versionsRoot, v);
    try {
      rmSync(target, { recursive: true, force: true });
      deletedVersions.push(v);
    } catch (e) {
      errors.push(`${v}: ${e.message}`);
    }
  }
  for (const s of plan.deleteSnapshots) {
    const target = join2(versionsRoot, s);
    try {
      rmSync(target, { recursive: true, force: true });
      deletedSnapshots.push(s);
    } catch (e) {
      errors.push(`${s}: ${e.message}`);
    }
  }
  return { kept: plan.keep, deletedVersions, deletedSnapshots, errors };
}
function safeReaddir(dir) {
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(join2(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
var DEFAULT_MANIFEST_PATH = join2(homedir2(), ".claude", "plugins", "installed_plugins.json");
var DEFAULT_KEEP_COUNT = 3;

// dist/src/hooks/plugin-cache-gc.js
var defaultLog = (msg) => log("plugin-cache-gc", msg);
function runGc(bundleDir, opts = {}) {
  const log2 = opts.log ?? defaultLog;
  if (process.env.HIVEMIND_WIKI_WORKER === "1")
    return;
  const resolved = resolveVersionedPluginDir(bundleDir);
  if (!resolved) {
    log2("not a versioned install, skipping");
    return;
  }
  const manifestPath = opts.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const keepCount = opts.keepCount ?? DEFAULT_KEEP_COUNT;
  const currentVersion = readCurrentVersionFromManifest(manifestPath);
  const plan = planGc(resolved.versionsRoot, currentVersion, keepCount);
  if (plan.deleteVersions.length === 0 && plan.deleteSnapshots.length === 0) {
    log2(`nothing to gc (kept: ${plan.keep.join(", ")})`);
    return;
  }
  const result = executeGc(resolved.versionsRoot, plan);
  log2(`gc kept=${result.kept.join(",")} deletedVersions=${result.deletedVersions.join(",")} deletedSnapshots=${result.deletedSnapshots.join(",")} errors=${result.errors.length}`);
}
var __bundleDir = dirname3(fileURLToPath(import.meta.url));
var __entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === __entryUrl) {
  try {
    runGc(__bundleDir);
  } catch (e) {
    defaultLog(`fatal: ${e.message}`);
  }
}
export {
  runGc
};
