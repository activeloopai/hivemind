/**
 * Pure guard ordering for the install-time memory backfill trigger.
 *
 * Split out of spawn-backfill-memory-worker.ts so the decision logic is
 * unit-testable in isolation, while the spawn wiring (child_process,
 * fs locks) stays in the worker module — which, like its sibling
 * spawn-skillify-worker.ts, is excluded from coverage because it can only
 * be exercised by forking real subprocesses.
 */

export interface AutoBackfillGuardReport {
  triggered: boolean;
  reason?:
    | "manifest-exists"
    | "lock-exists"
    | "no-local-sessions"
    | "no-hivemind-bin"
    | "lock-acquire-failed"
    | "spawn-failed";
}

/**
 * Injectable guard predicates — the spawn decision logic, isolated from the
 * filesystem/process side-effects so its ordering is unit-testable.
 */
export interface GuardDeps {
  manifestExists: () => boolean;
  lockExists: () => boolean;
  /** Age of the lock file in ms (only consulted when lockExists). */
  lockAgeMs: () => number;
  /** Remove a stale lock; return success. */
  removeLock: () => boolean;
  hasAgents: () => boolean;
  hasLauncher: () => boolean;
  /** Atomic exclusive lock create; return success. */
  acquireLock: () => boolean;
  /** Perform the detached spawn; return success. */
  spawn: () => boolean;
}

/** A run that hasn't produced a manifest after this window is presumed crashed. */
export const LOCK_STALE_MS = 30 * 60 * 1000;

/**
 * Pure guard ordering. Each guard, in priority order, can short-circuit with
 * a skip reason; only when all pass do we acquire + spawn. A failed spawn
 * rolls back the lock.
 */
export function runBackfillGuards(deps: GuardDeps): AutoBackfillGuardReport {
  if (deps.manifestExists()) return { triggered: false, reason: "manifest-exists" };

  if (deps.lockExists()) {
    if (deps.lockAgeMs() <= LOCK_STALE_MS) return { triggered: false, reason: "lock-exists" };
    if (!deps.removeLock()) return { triggered: false, reason: "lock-exists" };
  }

  if (!deps.hasAgents()) return { triggered: false, reason: "no-local-sessions" };
  if (!deps.hasLauncher()) return { triggered: false, reason: "no-hivemind-bin" };
  if (!deps.acquireLock()) return { triggered: false, reason: "lock-acquire-failed" };

  if (!deps.spawn()) {
    deps.removeLock();
    return { triggered: false, reason: "spawn-failed" };
  }
  return { triggered: true };
}
