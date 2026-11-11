/**
 * When to run the capture-recovery worker.
 *
 * SessionStart always spawns it. Live capture spawns it at most once per
 * interval, so a broken long-running session is also recovered on days the
 * user never starts a new session but keeps working in another one. Cheap:
 * one stat per captured event, a spawn at most every 30 minutes.
 */

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const RECOVERY_INTERVAL_MS = 30 * 60_000;

export function recoveryStateDir(): string {
  return process.env.HIVEMIND_CAPTURE_RECOVERY_STATE_DIR ?? join(homedir(), ".deeplake", "state", "capture-recovery");
}

export function captureRecoveryDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HIVEMIND_CAPTURE_RECOVERY === "false" || env.HIVEMIND_CAPTURE === "false";
}

/**
 * Spawn the recovery worker unless it ran within `intervalMs` (0 = always).
 * Stamps the run marker before spawning so concurrent hooks don't pile up
 * workers; the worker's own lock covers the rest. Never throws.
 */
export function maybeSpawnCaptureRecovery(
  bundleDir: string,
  currentSessionId: string,
  spawnWorker: (workerPath: string, args: readonly string[]) => void,
  opts: { intervalMs?: number; now?: number; stateDir?: string } = {},
): boolean {
  try {
    if (captureRecoveryDisabled()) return false;
    const dir = opts.stateDir ?? recoveryStateDir();
    const marker = join(dir, "last-run");
    const now = opts.now ?? Date.now();
    const interval = opts.intervalMs ?? RECOVERY_INTERVAL_MS;
    if (interval > 0) {
      try {
        if (now - statSync(marker).mtimeMs < interval) return false;
      } catch { /* never ran */ }
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(marker, String(now));
    spawnWorker(join(bundleDir, "capture-recovery-worker.js"), [currentSessionId]);
    return true;
  } catch {
    return false;
  }
}
