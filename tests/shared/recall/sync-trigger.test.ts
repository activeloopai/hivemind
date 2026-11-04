import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recallSyncDue, maybeRefreshRecallCache } from "../../../src/recall/sync-trigger.js";
import { cacheDir } from "../../../src/recall/cache.js";

const key = { orgId: "o", workspaceId: "w", table: "memory" };
const MIN = 60_000;
let root = "";
let dir = "";
const touch = (f: string, ageMs: number) => {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, f);
  writeFileSync(p, "x");
  const t = (Date.now() - ageMs) / 1000;
  utimesSync(p, t, t);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "recall-trigger-"));
  process.env.HIVEMIND_RECALL_CACHE_DIR = root;
  process.env.HOME = root;
  delete process.env.HIVEMIND_PROACTIVE_RECALL;
  dir = cacheDir(key, root);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); delete process.env.HIVEMIND_RECALL_CACHE_DIR; });

describe("recallSyncDue", () => {
  it("is due when there is no cache yet", () => {
    expect(recallSyncDue(key, Date.now(), 15 * MIN, root)).toBe(true);
  });
  it("is not due while the cache is fresh, due once it is older than the interval", () => {
    touch("store.json", 5 * MIN);
    expect(recallSyncDue(key, Date.now(), 15 * MIN, root)).toBe(false);
    touch("store.json", 16 * MIN);
    expect(recallSyncDue(key, Date.now(), 15 * MIN, root)).toBe(true);
  });
  it("is not due while another sync holds a live lock, due again once the lock is stale", () => {
    touch("store.json", 60 * MIN);
    touch("sync.lock", 1 * MIN);
    expect(recallSyncDue(key, Date.now(), 15 * MIN, root)).toBe(false);
    touch("sync.lock", 11 * MIN);
    expect(recallSyncDue(key, Date.now(), 15 * MIN, root)).toBe(true);
  });
  it("is never due when recall is off", () => {
    process.env.HIVEMIND_PROACTIVE_RECALL = "off";
    expect(recallSyncDue(key, Date.now(), 15 * MIN, root)).toBe(false);
  });
});

describe("maybeRefreshRecallCache", () => {
  it("spawns the sync worker from the bundle dir with the session cwd when due", () => {
    const spawn = vi.fn();
    expect(maybeRefreshRecallCache(key, "/repo", "/bundle", spawn)).toBe(true);
    expect(spawn).toHaveBeenCalledWith("/bundle/recall-sync-worker.js", ["/repo"]);
  });
  it("does nothing when not due, and swallows spawn errors", () => {
    touch("store.json", 1 * MIN);
    const spawn = vi.fn();
    expect(maybeRefreshRecallCache(key, "/repo", "/bundle", spawn)).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    rmSync(join(dir, "store.json"));
    expect(maybeRefreshRecallCache(key, "/repo", "/bundle", () => { throw new Error("EPERM"); })).toBe(false);
  });
});
