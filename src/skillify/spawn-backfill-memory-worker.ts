/**
 * Auto-trigger `hivemind memory backfill` in the background at install time.
 *
 * This is the memory analogue of spawn-mine-local-worker.ts. Where that one
 * seeds local *skills*, this stages *memory* summaries from the user's past
 * agent sessions (claude_code, codex, …) into ~/.claude/hivemind/pending-memory/
 * so a later `hivemind memory flush` (post-login) can upload them.
 *
 * Design constraints (same ordering as the mine-local spawner):
 *   1. Never block the caller (install / SessionStart). Detached spawn, no wait.
 *   2. Never run more than once per user. Skip when the staging manifest exists.
 *   3. Never compete with a running backfill. Skip when the lock exists
 *      (unless stale).
 *   4. Never run when there's nothing to mine. Skip when no agent session
 *      directory is present.
 *
 * Unlike mine-local, the EXTRACT phase needs NO auth (it stages locally), so
 * this is safe to fire at `hivemind install` before the user signs in. The
 * auth-bound upload happens separately in the flush phase.
 *
 * The lock is a courtesy sentinel, not a hard mutex — the manifest sentinel
 * + the orchestrator's own per-session dedup make a double-fire benign.
 */

import { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { detectInstalledAgents } from "./local-source.js";
import { findHivemindLauncher } from "./spawn-mine-local-worker.js";
import {
  PENDING_MEMORY_MANIFEST_PATH,
  PENDING_MEMORY_LOCK_PATH,
} from "./pending-memory-manifest.js";
import { runBackfillGuards, LOCK_STALE_MS, type AutoBackfillGuardReport } from "./backfill-guards.js";

const HOME = homedir();
const HIVEMIND_DIR = join(HOME, ".claude", "hivemind");
const LOG_PATH = join(HOME, ".claude", "hooks", "backfill-memory.log");

function realSpawn(): boolean {
  const launcher = findHivemindLauncher();
  if (!launcher) return false;
  mkdirSync(join(HOME, ".claude", "hooks"), { recursive: true });
  const out = openSync(LOG_PATH, "a");
  const [cmd, cmdArgs] = launcher.kind === "node-script"
    ? [process.execPath, [launcher.path, "memory", "backfill"]]
    : [launcher.path, ["memory", "backfill"]];
  const child = spawn(cmd, cmdArgs as string[], {
    detached: true,
    stdio: ["ignore", out, out],
    // Mark the spawned process as the lock owner so it (and only it) releases
    // the lock on exit — a manual `hivemind memory backfill` won't clear it.
    env: { ...process.env, HIVEMIND_BACKFILL_LOCK_OWNED: "1" },
  });
  closeSync(out);
  child.unref();
  return true;
}

/**
 * Spawn `hivemind memory backfill` in the background iff every guard passes.
 * Returns immediately; the staging manifest + the "N summaries staged, sign
 * in to push" hint surface on a later session.
 */
export function maybeAutoBackfillMemory(): AutoBackfillGuardReport {
  return runBackfillGuards({
    manifestExists: () => existsSync(PENDING_MEMORY_MANIFEST_PATH),
    lockExists: () => existsSync(PENDING_MEMORY_LOCK_PATH),
    lockAgeMs: () => {
      try { return Date.now() - statSync(PENDING_MEMORY_LOCK_PATH).mtimeMs; }
      catch { return 0; } // unreadable → treat as fresh (not stale)
    },
    removeLock: () => {
      try { unlinkSync(PENDING_MEMORY_LOCK_PATH); return true; }
      catch { return false; }
    },
    hasAgents: () => detectInstalledAgents().length > 0,
    hasLauncher: () => findHivemindLauncher() !== null,
    acquireLock: () => {
      try {
        mkdirSync(HIVEMIND_DIR, { recursive: true });
        closeSync(openSync(PENDING_MEMORY_LOCK_PATH, "wx"));
        return true;
      } catch { return false; }
    },
    spawn: () => {
      try { return realSpawn(); }
      catch { return false; }
    },
  });
}
