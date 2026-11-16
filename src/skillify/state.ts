/**
 * Per-project state for the skillify worker.
 *
 * File: ~/.deeplake/state/skillify/<projectKey>.json
 *   {
 *     project: string,           // human-readable project name
 *     projectKey: string,        // stable id derived from git remote or cwd hash
 *     counter: number,           // Stop events since last worker fire
 *     lastUuid: string | null,   // most recent session uuid mined
 *     lastDate: string | null,   // ISO timestamp of most recent session mined
 *     skillsGenerated: string[], // skill names this worker has produced
 *     updatedAt: number,         // epoch ms
 *   }
 *
 * Survives across sessions; never deleted. All mutations go through
 * withRmwLock so concurrent processes don't lose updates.
 */

import {
  readFileSync, writeFileSync, writeSync, mkdirSync, renameSync, rmdirSync,
  existsSync, fstatSync, lstatSync, unlinkSync, openSync, closeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { log as _log } from "../utils/debug.js";
import { normalizeGitRemoteUrl, deriveProjectKey } from "../utils/repo-identity.js";
import { migrateLegacyStateDir } from "./legacy-migration.js";
import { getStateDir } from "./state-dir.js";

// Re-export for backward compatibility with skillify/triggers.ts + tests that
// import these helpers from "./state.js". They actually live in utils/repo-identity.ts
// (extracted when the codebase-graph feature needed the same identity logic).
export { getStateDir, normalizeGitRemoteUrl, deriveProjectKey };

const dlog = (msg: string) => _log("skillify-state", msg);

export interface SkillifyState {
  project: string;
  projectKey: string;
  counter: number;
  lastUuid: string | null;
  lastDate: string | null;
  skillsGenerated: string[];
  updatedAt: number;
}

const YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));

export const TRIGGER_THRESHOLD = (() => {
  const n = Number(process.env.HIVEMIND_SKILLIFY_EVERY_N_TURNS ?? "");
  return Number.isInteger(n) && n > 0 ? n : 20;
})();

export function statePath(projectKey: string): string {
  return join(getStateDir(), `${projectKey}.json`);
}

function lockPath(projectKey: string): string {
  return join(getStateDir(), `${projectKey}.lock`);
}

interface LockObservation {
  marker: string;
  dev: number;
  ino: number;
}

type LockOwner =
  | { state: "alive"; pid: number }
  | { state: "dead"; pid: number }
  | { state: "unknown"; pid?: number };

function observeLock(path: string): LockObservation | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const stat = fstatSync(fd);
    return { marker: readFileSync(fd, "utf-8"), dev: stat.dev, ino: stat.ino };
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function sameObservedLock(path: string, observed: LockObservation): boolean {
  try {
    const stat = lstatSync(path);
    return stat.dev === observed.dev
      && stat.ino === observed.ino
      && readFileSync(path, "utf-8") === observed.marker;
  } catch {
    return false;
  }
}

function lockOwner(observed: LockObservation): LockOwner {
  // Accept PID-only markers written by the first ownership-aware release and
  // PID + UUID markers written by this release. Anything else is unknown.
  const match = observed.marker.match(
    /^([1-9]\d*)(?: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?(?:\r?\n)?$/i,
  );
  if (!match) return { state: "unknown" };
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid)) return { state: "unknown" };
  try {
    process.kill(pid, 0);
    return { state: "alive", pid };
  } catch (e: any) {
    // Only ESRCH proves that the recorded owner is gone. EPERM and every
    // other failure leave ownership unknown and must fail closed.
    return e?.code === "ESRCH"
      ? { state: "dead", pid }
      : { state: "unknown", pid };
  }
}

export function readState(projectKey: string): SkillifyState | null {
  // Workers call readState() first to find the session watermark. Without
  // migration here, a post-rename run sees an empty `skillify/` dir while
  // the data still lives at `skilify/<key>.json` — and the worker would
  // re-mine sessions it has already processed.
  migrateLegacyStateDir();
  const p = statePath(projectKey);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as SkillifyState;
  } catch {
    return null;
  }
}

export function writeState(projectKey: string, state: SkillifyState): void {
  migrateLegacyStateDir();
  mkdirSync(getStateDir(), { recursive: true });
  const p = statePath(projectKey);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, p);
}

export function withRmwLock<T>(projectKey: string, fn: () => T): T {
  migrateLegacyStateDir();
  mkdirSync(getStateDir(), { recursive: true });
  const rmw = lockPath(projectKey) + ".rmw";
  const deadline = Date.now() + 2000;
  const marker = `${process.pid} ${randomUUID()}\n`;
  let fd: number | null = null;
  let held: LockObservation | null = null;
  let recoveryAttempted = false;
  while (fd === null) {
    try {
      const opened = openSync(rmw, "wx");
      let identity: Pick<LockObservation, "dev" | "ino"> | null = null;
      try {
        const stat = fstatSync(opened);
        identity = { dev: stat.dev, ino: stat.ino };
        writeFileSync(opened, marker);
        held = { marker, ...identity };
      } catch (e) {
        closeSync(opened);
        try {
          const current = lstatSync(rmw);
          if (identity && current.dev === identity.dev && current.ino === identity.ino) unlinkSync(rmw);
        } catch { /* best effort */ }
        throw e;
      }
      fd = opened;
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      if (Date.now() > deadline) {
        if (recoveryAttempted) {
          throw new Error(`timed out acquiring RMW lock for ${projectKey}; lock changed during stale recovery`);
        }
        recoveryAttempted = true;
        const observed = observeLock(rmw);
        if (!observed) {
          throw new Error(`timed out acquiring RMW lock for ${projectKey}; owner could not be determined`);
        }
        const owner = lockOwner(observed);
        if (owner.state === "alive") {
          throw new Error(`timed out acquiring RMW lock for ${projectKey}; owner ${owner.pid} is still running`);
        }
        if (owner.state === "unknown") {
          const detail = owner.pid === undefined ? "owner could not be determined" : `owner ${owner.pid} could not be proven dead`;
          throw new Error(`timed out acquiring RMW lock for ${projectKey}; ${detail}`);
        }
        if (!sameObservedLock(rmw, observed)) {
          throw new Error(`timed out acquiring RMW lock for ${projectKey}; lock changed during stale recovery`);
        }
        dlog(`rmw lock deadline exceeded for ${projectKey}, reclaiming dead owner ${owner.pid}`);
        try { unlinkSync(rmw); } catch (unlinkErr: any) {
          if (unlinkErr?.code === "ENOENT") continue;
          dlog(`stale rmw lock unlink failed for ${projectKey}: ${unlinkErr.message}`);
          throw new Error(`timed out acquiring RMW lock for ${projectKey}; stale lock could not be reclaimed`);
        }
        continue;
      }
      Atomics.wait(YIELD_BUF, 0, 0, 10);
    }
  }
  try { return fn(); }
  finally {
    closeSync(fd);
    if (held && sameObservedLock(rmw, held)) {
      try { unlinkSync(rmw); } catch (unlinkErr: any) {
        dlog(`rmw lock cleanup failed for ${projectKey}: ${unlinkErr.message}`);
      }
    } else {
      dlog(`rmw lock marker changed before cleanup for ${projectKey}; leaving successor intact`);
    }
  }
}

/**
 * Increment the Stop counter for a project. Initializes state on first call.
 * Returns the resulting state.
 */
export function bumpStopCounter(cwd: string): SkillifyState {
  const { key, project } = deriveProjectKey(cwd);
  return withRmwLock(key, () => {
    const existing = readState(key);
    const next: SkillifyState = existing
      ? { ...existing, counter: existing.counter + 1, updatedAt: Date.now() }
      : {
          project,
          projectKey: key,
          counter: 1,
          lastUuid: null,
          lastDate: null,
          skillsGenerated: [],
          updatedAt: Date.now(),
        };
    writeState(key, next);
    return next;
  });
}

/** Reset the counter after a worker fire. */
export function resetCounter(projectKey: string): void {
  withRmwLock(projectKey, () => {
    const s = readState(projectKey);
    if (!s) return;
    writeState(projectKey, { ...s, counter: 0, updatedAt: Date.now() });
  });
}

/** Record that a worker produced a skill (KEEP or MERGE). */
export function recordSkill(
  projectKey: string,
  skillName: string,
  newestSessionUuid: string,
  newestSessionDate: string,
): void {
  withRmwLock(projectKey, () => {
    const s = readState(projectKey);
    if (!s) return;
    const skills = s.skillsGenerated.includes(skillName)
      ? s.skillsGenerated
      : [...s.skillsGenerated, skillName];
    writeState(projectKey, {
      ...s,
      skillsGenerated: skills,
      lastUuid: newestSessionUuid,
      lastDate: newestSessionDate,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Advance the watermark even when no skill was created (SKIP verdict).
 * Stops the worker from re-mining the same range next time.
 */
export function advanceWatermark(
  projectKey: string,
  newestSessionUuid: string,
  newestSessionDate: string,
): void {
  withRmwLock(projectKey, () => {
    const s = readState(projectKey);
    if (!s) return;
    writeState(projectKey, {
      ...s,
      lastUuid: newestSessionUuid,
      lastDate: newestSessionDate,
      updatedAt: Date.now(),
    });
  });
}

/** Cross-project lock so a single worker fires at a time per project. */
export function tryAcquireWorkerLock(projectKey: string, maxAgeMs = 10 * 60 * 1000): boolean {
  migrateLegacyStateDir();
  mkdirSync(getStateDir(), { recursive: true });
  const p = lockPath(projectKey);
  if (existsSync(p)) {
    try {
      const ageMs = Date.now() - parseInt(readFileSync(p, "utf-8"), 10);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMs) return false;
    } catch (readErr: any) {
      dlog(`worker lock unreadable for ${projectKey}, treating as stale: ${readErr.message}`);
    }
    try { unlinkSync(p); } catch (unlinkErr: any) {
      // Self-heal for stale lock-as-directory: an interrupted run of
      // tests/claude-code/skillify-state.test.ts ("treats an unreadable
      // lock file as stale") used to leave `<key>.lock` as an empty
      // directory when its `rmdirSync` cleanup was killed before
      // firing. Once that happens, every subsequent `unlinkSync` fails
      // (POSIX: EISDIR, Windows: EPERM) and the project's Stop-counter
      // trigger silently no-ops forever.
      //
      // TOCTOU defense: we use `rmdirSync(p)` for the recovery instead
      // of `rmSync(p, { recursive: true, force: true })`. A concurrent
      // process may have already cleared the stale dir and
      // `openSync(p, "wx")`-ed a fresh lock file in the same path
      // while we sat between the failed `unlinkSync` and the recovery.
      // `rmSync` with `force/recursive` would happily unlink that
      // racing process's live lock, letting both processes' subsequent
      // `openSync(wx)` succeed and double-acquire the worker slot.
      // `rmdirSync` is shape-aware:
      //   - regular file at the path → ENOTDIR (POSIX) / ENOENT (Win)
      //   - non-empty directory      → ENOTEMPTY
      //   - path gone                → ENOENT
      //   - empty directory          → removes it (the actual recovery)
      // Every error case is safe to ignore — the final `openSync(p,
      // "wx")` arbitrates atomically: exactly one process wins.
      //
      // We accept EISDIR (POSIX unlink-on-directory), EPERM (Windows
      // surfaces this for the same operation), and ENOENT (a racing
      // process already cleaned the stale path between our `existsSync`
      // check and the `unlinkSync` call — perfect, the atomic
      // `openSync(p, "wx")` below will win or lose as appropriate).
      // `lstat` errors are NOT terminal either: a missing file means
      // the race already cleared the path; a permission error means
      // we can't tell, so we let `openSync` arbitrate instead of
      // returning false eagerly.
      if (unlinkErr?.code !== "EISDIR"
          && unlinkErr?.code !== "EPERM"
          && unlinkErr?.code !== "ENOENT") {
        dlog(`could not unlink stale worker lock for ${projectKey}: ${unlinkErr.message}`);
        return false;
      }
      let isDir = false;
      try { isDir = lstatSync(p).isDirectory(); } catch { /* stat unavailable — let openSync arbitrate */ }
      if (isDir) {
        try { rmdirSync(p); } catch (rmErr: any) {
          // ENOTDIR / ENOTEMPTY / ENOENT / EACCES — all safe to ignore.
          // openSync(p, "wx") below is the atomic arbiter.
          dlog(`rmdir stale lock skipped for ${projectKey}: ${rmErr.message}`);
        }
      }
    }
  }
  try {
    const fd = openSync(p, "wx");
    try { writeSync(fd, String(Date.now())); } finally { closeSync(fd); }
    return true;
  } catch {
    return false;
  }
}

export function releaseWorkerLock(projectKey: string): void {
  const p = lockPath(projectKey);
  try { unlinkSync(p); } catch { /* may already be gone */ }
}
