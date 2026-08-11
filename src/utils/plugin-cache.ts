import { cpSync, existsSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { homedir, platform } from "node:os";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const KEEP_RE = /\.keep-(\d+)$/;
const IN_USE_DIR = ".in_use";

export function isSemver(name: string): boolean {
  return SEMVER_RE.test(name);
}

export function compareSemverDesc(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

/**
 * Resolve the versioned plugin directory from the hook's bundle dir.
 *
 * Expected layout: `<cacheRoot>/plugins/cache/hivemind/hivemind/<version>/bundle/`.
 * Returns null when we're not running from that layout — e.g. a local
 * `--plugin-dir` dev run — so callers skip snapshot/restore/GC entirely.
 */
export function resolveVersionedPluginDir(bundleDir: string): {
  pluginDir: string;
  versionsRoot: string;
  version: string;
} | null {
  const pluginDir = dirname(bundleDir);
  const versionsRoot = dirname(pluginDir);
  const version = basename(pluginDir);
  if (!isSemver(version)) return null;
  if (basename(versionsRoot) !== "hivemind") return null;
  const cacheRoot = resolve(homedir(), ".claude", "plugins", "cache");
  let canonicalRoot = resolve(versionsRoot);
  let canonicalCache = cacheRoot;
  try { canonicalRoot = realpathSync.native(canonicalRoot); } catch { /* keep resolved path */ }
  try { canonicalCache = realpathSync.native(canonicalCache); } catch { /* keep resolved path */ }
  if (!canonicalRoot.startsWith(canonicalCache + sep)) return null;
  return { pluginDir: join(canonicalRoot, version), versionsRoot: canonicalRoot, version };
}

function snapshotPath(pluginDir: string, pid: number): string {
  return `${pluginDir}.keep-${pid}`;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
}

/**
 * Read `/proc/<pid>/stat` field 22 (start time in jiffies since boot) on
 * Linux. Returns null when the file can't be read (process gone, macOS,
 * weird perms) — callers fall back to PID-only liveness in that case.
 *
 * field 22 = "starttime" per `man 5 proc`. Stable across the process's
 * lifetime, monotonic across reboots (it's relative to boot time but the
 * counter only increments while a given boot is running). Combined with
 * the PID, it uniquely identifies a process on this host across PID
 * reuse — exactly the property Claude Code relies on when writing
 * `.in_use/<pid>` files with shape `{"pid":N,"procStart":"<starttime>"}`.
 */
function readProcStart(pid: number): string | null {
  if (platform() !== "linux") return null;
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf-8");
    // Field 2 ("comm") is bracketed by () and may contain spaces; skip it
    // by splitting on the LAST closing paren, then take field 20 of the
    // remainder (field 22 of the whole line, 1-indexed).
    const tail = raw.slice(raw.lastIndexOf(")") + 1).trim();
    const fields = tail.split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/**
 * A `.in_use/<pid>` file claims that PID is actively using this plugin
 * version. We treat the claim as live iff:
 *
 *   1. The PID is alive on this host (`kill(pid, 0)` succeeds), AND
 *   2. If the file includes `procStart`, it matches `/proc/<pid>/stat`
 *      field 22 — same process, not a PID-reused-by-the-kernel reincarnation.
 *
 * Returns false on malformed JSON or unreadable files. Returns true on
 * matching live process. Returns false on dead/reused PID.
 *
 * macOS (or anywhere `/proc` doesn't exist) skips the procStart check
 * and accepts kill(pid, 0) as sufficient evidence. False-keep is much
 * cheaper than false-delete: a kept old version costs disk; a deleted
 * in-use version breaks every hook in the session that depends on it.
 */
function isInUseClaimLive(claimPath: string): boolean {
  let raw: string;
  try { raw = readFileSync(claimPath, "utf-8"); } catch { return false; }
  let parsed: { pid?: unknown; procStart?: unknown };
  try { parsed = JSON.parse(raw); } catch { return false; }
  const pid = typeof parsed.pid === "number" ? parsed.pid : Number(parsed.pid);
  if (!Number.isFinite(pid) || pid <= 0) return false;

  if (!isPidAlive(pid)) return false;

  if (typeof parsed.procStart === "string" && parsed.procStart.length > 0) {
    const actual = readProcStart(pid);
    // Only enforce match when we can read procfs. On macOS or when
    // /proc isn't available, actual is null and we keep the claim live.
    if (actual !== null && actual !== parsed.procStart) return false;
  }
  return true;
}

/**
 * Return true if any `.in_use/<pid>` claim file in `versionDir` references
 * a live process. Used by `planGc` to refuse-to-delete a plugin version
 * that some still-running session has pinned.
 *
 * Empty / missing `.in_use/` directory → false (no live claims).
 */
export function isVersionInUse(versionDir: string): boolean {
  const inUseDir = join(versionDir, IN_USE_DIR);
  let entries: string[];
  try { entries = readdirSync(inUseDir); } catch { return false; }
  for (const name of entries) {
    if (isInUseClaimLive(join(inUseDir, name))) return true;
  }
  return false;
}

export interface SnapshotHandle {
  pluginDir: string;
  snapshot: string;
}

/**
 * Copy `pluginDir` to `<pluginDir>.keep-<pid>` before the installer runs.
 * Returns null when the dir doesn't exist or the copy fails — callers
 * should still run the installer; the worst case is the existing bug
 * (installer wipes the dir, we can't restore).
 */
export function snapshotPluginDir(pluginDir: string, pid = process.pid): SnapshotHandle | null {
  if (!existsSync(pluginDir)) return null;
  const snapshot = snapshotPath(pluginDir, pid);
  try {
    rmSync(snapshot, { recursive: true, force: true });
    cpSync(pluginDir, snapshot, { recursive: true, dereference: false });
    return { pluginDir, snapshot };
  } catch {
    return null;
  }
}

export type RestoreOutcome = "restored" | "cleaned" | "noop" | "restore-failed";

/**
 * After the installer runs, restore the snapshot if the installer wiped
 * the versioned directory; otherwise remove the snapshot.
 *
 * Returns:
 *   - "restored"       snapshot renamed back into place
 *   - "cleaned"        plugin dir survived; snapshot removed
 *   - "noop"           nothing to do (dev layout or both pluginDir and snapshot already absent)
 *   - "restore-failed" fs operation threw — pluginDir may still be absent,
 *                      caller should treat this as a real failure. Also
 *                      writes to stderr so the broken state is observable
 *                      even if the log sink is unavailable.
 */
export function restoreOrCleanup(handle: SnapshotHandle | null): RestoreOutcome {
  if (!handle) return "noop";
  const { pluginDir, snapshot } = handle;
  try {
    if (!existsSync(pluginDir)) {
      if (existsSync(snapshot)) {
        renameSync(snapshot, pluginDir);
        return "restored";
      }
      return "noop";
    }
    rmSync(snapshot, { recursive: true, force: true });
    return "cleaned";
  } catch (e: any) {
    try { process.stderr.write(`[plugin-cache] restoreOrCleanup failed for ${pluginDir}: ${e?.message}\n`); } catch { /* ignore */ }
    return "restore-failed";
  }
}

/**
 * Read the currently-installed hivemind version from Claude's plugin
 * manifest. Null when the manifest is missing or malformed.
 */
export function readCurrentVersionFromManifest(manifestPath: string): string | null {
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    const entries = parsed?.plugins?.["hivemind@hivemind"];
    if (!Array.isArray(entries)) return null;
    for (const e of entries) {
      if (typeof e?.version === "string" && isSemver(e.version)) return e.version;
    }
    return null;
  } catch {
    return null;
  }
}

export interface GcPlan {
  keep: string[];
  deleteVersions: string[];
  deleteSnapshots: string[];
}

/**
 * Decide which entries to keep vs delete under the versions root.
 *
 * - Keeps the current version (from the manifest) plus the next-newest
 *   versions up to `keepCount` total.
 * - **Also keeps any older version that a live session still claims**
 *   via a `.in_use/<pid>` file (checked through `isInUse`). Without this,
 *   GC happily evicts the bundle dir a long-running session is pinned
 *   to, and every subsequent hook in that session ENOENTs on
 *   `${CLAUDE_PLUGIN_ROOT}/bundle/...`. See issue #188.
 * - Marks stale `.keep-<pid>` snapshots (dead PID) for deletion.
 * - Leaves unknown entries (non-semver, non-`.keep-*`) alone so we
 *   never touch files the installer or user put there for other reasons.
 */
export function planGc(
  versionsRoot: string,
  currentVersion: string | null,
  keepCount: number,
  isAlive: (pid: number) => boolean = isPidAlive,
  isInUse: (versionDir: string) => boolean = isVersionInUse,
): GcPlan {
  const entries = safeReaddir(versionsRoot);
  const versions = entries.filter(isSemver);
  const snapshots = entries.filter(e => KEEP_RE.test(e));

  const sorted = [...versions].sort(compareSemverDesc);
  const keep = new Set<string>();
  if (currentVersion && versions.includes(currentVersion)) keep.add(currentVersion);
  for (const v of sorted) {
    if (keep.size >= keepCount) break;
    keep.add(v);
  }

  const deleteVersions: string[] = [];
  if (currentVersion && versions.includes(currentVersion)) {
    for (const v of versions) {
      if (keep.has(v)) continue;
      // Refcount gate: refuse to delete a version that any live session
      // still claims via `.in_use/<pid>`. The cost of false-keep is one
      // unused bundle dir on disk; the cost of false-delete is "Plugin
      // directory does not exist" hook errors for the whole remaining
      // life of every pinned session.
      if (isInUse(join(versionsRoot, v))) {
        keep.add(v);
        continue;
      }
      deleteVersions.push(v);
    }
  }

  const deleteSnapshots: string[] = [];
  for (const s of snapshots) {
    const m = s.match(KEEP_RE);
    if (!m) continue;
    const pid = Number(m[1]);
    if (!Number.isFinite(pid) || !isAlive(pid)) deleteSnapshots.push(s);
  }

  return { keep: [...keep], deleteVersions, deleteSnapshots };
}

export interface GcResult {
  kept: string[];
  deletedVersions: string[];
  deletedSnapshots: string[];
  errors: string[];
}

export function executeGc(versionsRoot: string, plan: GcPlan): GcResult {
  const errors: string[] = [];
  const deletedVersions: string[] = [];
  const deletedSnapshots: string[] = [];
  for (const v of plan.deleteVersions) {
    const target = join(versionsRoot, v);
    try {
      rmSync(target, { recursive: true, force: true });
      deletedVersions.push(v);
    } catch (e: any) {
      errors.push(`${v}: ${e.message}`);
    }
  }
  for (const s of plan.deleteSnapshots) {
    const target = join(versionsRoot, s);
    try {
      rmSync(target, { recursive: true, force: true });
      deletedSnapshots.push(s);
    } catch (e: any) {
      errors.push(`${s}: ${e.message}`);
    }
  }
  return { kept: plan.keep, deletedVersions, deletedSnapshots, errors };
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir).filter(name => {
      try { return statSync(join(dir, name)).isDirectory(); } catch { return false; }
    });
  } catch {
    return [];
  }
}

export const DEFAULT_MANIFEST_PATH = join(homedir(), ".claude", "plugins", "installed_plugins.json");
export const DEFAULT_KEEP_COUNT = 3;
