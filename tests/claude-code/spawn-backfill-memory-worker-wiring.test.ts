/**
 * Coverage for the spawn worker's real I/O wiring: maybeAutoBackfillMemory's
 * dependency closures (fs probes, atomic lock, agent/launcher checks) and
 * realSpawn (detached child_process.spawn). node:fs and node:child_process
 * are mocked so nothing actually spawns or touches disk.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync, statSync, openSync, closeSync, unlinkSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

vi.mock("node:fs", async (orig) => ({
  ...(await orig<typeof import("node:fs")>()),
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  openSync: vi.fn(() => 7),
  closeSync: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ unref: vi.fn() })) }));
vi.mock("../../src/skillify/local-source.js", () => ({
  detectInstalledAgents: vi.fn(() => [{ agent: "claude_code", sessionRoot: "/x", encodeCwd: () => "x" }]),
}));
vi.mock("../../src/skillify/spawn-mine-local-worker.js", () => ({
  findHivemindLauncher: vi.fn(() => ({ kind: "bin", path: "/usr/bin/hivemind" })),
}));

import { maybeAutoBackfillMemory } from "../../src/skillify/spawn-backfill-memory-worker.js";
import { detectInstalledAgents } from "../../src/skillify/local-source.js";
import { findHivemindLauncher } from "../../src/skillify/spawn-mine-local-worker.js";

const LOCK_STALE = 31 * 60 * 1000;

beforeEach(() => {
  // mockReset clears prior implementations/return values (clearAllMocks does
  // NOT), so per-test overrides (throwing impls, null returns) don't leak.
  vi.mocked(existsSync).mockReset().mockReturnValue(false);
  vi.mocked(statSync).mockReset().mockReturnValue({ mtimeMs: 0 } as ReturnType<typeof statSync>);
  vi.mocked(openSync).mockReset().mockReturnValue(7 as ReturnType<typeof openSync>);
  vi.mocked(closeSync).mockReset();
  vi.mocked(unlinkSync).mockReset();
  vi.mocked(mkdirSync).mockReset();
  vi.mocked(spawn).mockReset().mockReturnValue({ unref: vi.fn() } as unknown as ReturnType<typeof spawn>);
  vi.mocked(detectInstalledAgents).mockReset().mockReturnValue([{ agent: "claude_code", sessionRoot: "/x", encodeCwd: () => "x" }]);
  vi.mocked(findHivemindLauncher).mockReset().mockReturnValue({ kind: "bin", path: "/usr/bin/hivemind" });
});

describe("maybeAutoBackfillMemory wiring", () => {
  it("triggers: runs acquireLock (openSync) + realSpawn (child_process.spawn)", () => {
    const r = maybeAutoBackfillMemory();
    expect(r).toEqual({ triggered: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [, args, options] = vi.mocked(spawn).mock.calls[0];
    expect(args).toEqual(["memory", "backfill"]);
    // The spawned process is marked as the lock owner so only it releases.
    expect((options as { env: Record<string, string> }).env.HIVEMIND_BACKFILL_LOCK_OWNED).toBe("1");
  });

  it("skips when the manifest already exists (manifestExists closure)", () => {
    // First existsSync call is manifestExists → true.
    vi.mocked(existsSync).mockReturnValueOnce(true);
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "manifest-exists" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("skips on a fresh lock (lockExists + lockAgeMs closures)", () => {
    // manifest absent (false), lock present (true).
    vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() } as ReturnType<typeof statSync>);
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "lock-exists" });
  });

  it("skips when no agents are installed (hasAgents closure)", () => {
    vi.mocked(detectInstalledAgents).mockReturnValue([]);
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "no-local-sessions" });
  });

  it("skips when no hivemind launcher is found (hasLauncher closure → null)", () => {
    vi.mocked(findHivemindLauncher).mockReturnValue(null);
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "no-hivemind-bin" });
  });

  it("rolls back when acquireLock throws (openSync wx fails)", () => {
    vi.mocked(openSync).mockImplementation(() => { throw new Error("EEXIST"); });
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "lock-acquire-failed" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("overrides a stale lock then triggers (removeLock unlinkSync path)", () => {
    // manifest absent, lock present + stale → removeLock(unlinkSync) → proceed.
    vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() - LOCK_STALE } as ReturnType<typeof statSync>);
    const r = maybeAutoBackfillMemory();
    expect(r).toEqual({ triggered: true });
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining("pending-memory.lock"));
  });

  it("stays skipped when a stale lock can't be removed (unlinkSync throws)", () => {
    vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() - LOCK_STALE } as ReturnType<typeof statSync>);
    vi.mocked(unlinkSync).mockImplementation(() => { throw new Error("EPERM"); });
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "lock-exists" });
  });

  it("treats an unreadable lock as fresh (lockAgeMs catch → 0)", () => {
    vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(statSync).mockImplementation(() => { throw new Error("EACCES"); });
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "lock-exists" });
  });

  it("uses the node-script launcher form (node <cli.js> memory backfill)", () => {
    vi.mocked(findHivemindLauncher).mockReturnValue({ kind: "node-script", path: "/bundle/cli.js" });
    const r = maybeAutoBackfillMemory();
    expect(r).toEqual({ triggered: true });
    const [cmd, args] = vi.mocked(spawn).mock.calls[0];
    expect(cmd).toBe(process.execPath);
    expect(args).toEqual(["/bundle/cli.js", "memory", "backfill"]);
  });

  it("returns spawn-failed if the launcher vanishes between the guard and realSpawn", () => {
    // hasLauncher() sees a launcher, but realSpawn()'s re-resolve returns null
    // → realSpawn returns false → spawn-failed (covers the defensive re-check).
    vi.mocked(findHivemindLauncher)
      .mockReturnValueOnce({ kind: "bin", path: "/usr/bin/hivemind" })
      .mockReturnValueOnce(null);
    expect(maybeAutoBackfillMemory()).toEqual({ triggered: false, reason: "spawn-failed" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns spawn-failed and rolls back the lock when realSpawn throws", () => {
    vi.mocked(spawn).mockImplementation(() => { throw new Error("spawn boom"); });
    const r = maybeAutoBackfillMemory();
    expect(r).toEqual({ triggered: false, reason: "spawn-failed" });
    // lock rolled back
    expect(unlinkSync).toHaveBeenCalled();
  });
});
