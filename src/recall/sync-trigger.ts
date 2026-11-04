/**
 * Mid-session refresh of the proactive-recall cache.
 *
 * SessionStart spawns the sync worker, but sessions often stay open all day
 * while teammates' summaries keep changing (the wiki worker rewrites a
 * summary every ~50 events / 2 h and at session end). The capture hook runs
 * asynchronously on every prompt / tool call, so it calls this to spawn the
 * worker again once the cache is older than the sync interval.
 *
 * Cheap by design: one or two stat() calls per event; a spawn at most once
 * per interval (the store file's mtime moves on every sync attempt, success
 * or not, and a live lock suppresses spawns while a sync runs). The worker
 * re-checks the throttle and lock itself, so a rare double spawn is harmless.
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, type CacheKey } from "./cache.js";
import { recallMode } from "./policy.js";
import { DEFAULT_SYNC_INTERVAL_MS } from "./sync.js";

/** A lock younger than this means a sync is in flight (matches cache.ts). */
const LOCK_LIVE_MS = 10 * 60_000;

function mtimeMs(path: string): number | null {
  try { return statSync(path).mtimeMs; } catch { return null; }
}

export function recallSyncDue(
  key: CacheKey,
  now: number = Date.now(),
  intervalMs: number = DEFAULT_SYNC_INTERVAL_MS,
  root?: string,
): boolean {
  if (recallMode("failure") === "off" && recallMode("prompt") === "off") return false;
  const dir = cacheDir(key, root);
  const lock = mtimeMs(join(dir, "sync.lock"));
  if (lock !== null && now - lock < LOCK_LIVE_MS) return false;
  const store = mtimeMs(join(dir, "store.json"));
  return store === null || now - store >= intervalMs;
}

/** Spawn the detached sync worker when due. Never throws. */
export function maybeRefreshRecallCache(
  key: CacheKey,
  cwd: string,
  bundleDir: string,
  spawnWorker: (workerPath: string, args: readonly string[]) => void,
): boolean {
  try {
    if (!recallSyncDue(key)) return false;
    spawnWorker(join(bundleDir, "recall-sync-worker.js"), [cwd]);
    return true;
  } catch {
    return false;
  }
}
