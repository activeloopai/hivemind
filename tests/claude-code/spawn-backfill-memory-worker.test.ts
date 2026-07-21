/**
 * Unit tests for the install-time trigger guard ordering (runBackfillGuards).
 * All side-effects (fs probes, lock, spawn) are injected, so we pin the
 * priority order and the lock-rollback-on-spawn-failure behavior.
 */

import { describe, it, expect } from "vitest";
import { runBackfillGuards, type GuardDeps } from "../../src/skillify/backfill-guards.js";

const FRESH = 60 * 1000; // within the 30-min stale window
const STALE = 31 * 60 * 1000;

function deps(over: Partial<GuardDeps> = {}): GuardDeps {
  return {
    manifestExists: () => false,
    lockExists: () => false,
    lockAgeMs: () => FRESH,
    removeLock: () => true,
    hasAgents: () => true,
    hasLauncher: () => true,
    acquireLock: () => true,
    spawn: () => true,
    ...over,
  };
}

describe("runBackfillGuards", () => {
  it("triggers when all guards pass", () => {
    expect(runBackfillGuards(deps())).toEqual({ triggered: true });
  });

  it("skips when the manifest already exists (one-shot)", () => {
    expect(runBackfillGuards(deps({ manifestExists: () => true }))).toEqual({ triggered: false, reason: "manifest-exists" });
  });

  it("skips on a fresh lock", () => {
    expect(runBackfillGuards(deps({ lockExists: () => true, lockAgeMs: () => FRESH }))).toEqual({ triggered: false, reason: "lock-exists" });
  });

  it("overrides a stale lock and proceeds", () => {
    let removed = false;
    const r = runBackfillGuards(deps({ lockExists: () => true, lockAgeMs: () => STALE, removeLock: () => { removed = true; return true; } }));
    expect(r).toEqual({ triggered: true });
    expect(removed).toBe(true);
  });

  it("keeps skipping if a stale lock can't be removed", () => {
    expect(runBackfillGuards(deps({ lockExists: () => true, lockAgeMs: () => STALE, removeLock: () => false })))
      .toEqual({ triggered: false, reason: "lock-exists" });
  });

  it("skips when no agents are installed", () => {
    expect(runBackfillGuards(deps({ hasAgents: () => false }))).toEqual({ triggered: false, reason: "no-local-sessions" });
  });

  it("skips when the hivemind launcher is missing", () => {
    expect(runBackfillGuards(deps({ hasLauncher: () => false }))).toEqual({ triggered: false, reason: "no-hivemind-bin" });
  });

  it("skips when the lock can't be acquired (lost the race)", () => {
    expect(runBackfillGuards(deps({ acquireLock: () => false }))).toEqual({ triggered: false, reason: "lock-acquire-failed" });
  });

  it("rolls back the lock when the spawn fails", () => {
    let removed = false;
    const r = runBackfillGuards(deps({ spawn: () => false, removeLock: () => { removed = true; return true; } }));
    expect(r).toEqual({ triggered: false, reason: "spawn-failed" });
    expect(removed).toBe(true);
  });
});
