import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatGraphVfsResult,
  resetGraphPullSpawnedForTests,
  resolveGraphCwd,
  spawnOpenclawGraphOnStop,
  spawnOpenclawGraphPullWorker,
} from "../../harnesses/openclaw/src/graph-lifecycle.js";

describe("openclaw graph-lifecycle", () => {
  beforeEach(() => {
    resetGraphPullSpawnedForTests();
    delete (globalThis as Record<string, unknown>).__hivemind_tuning__;
    delete process.env.HIVEMIND_GRAPH_CWD;
    delete process.env.HIVEMIND_GRAPH_ON_STOP;
    delete process.env.HIVEMIND_GRAPH_PULL;
  });

  it("resolveGraphCwd prefers tuning dispatch over process.cwd()", () => {
    (globalThis as Record<string, unknown>).__hivemind_tuning__ = {
      HIVEMIND_GRAPH_CWD: "/repo/from/tuning",
    };
    expect(resolveGraphCwd()).toBe("/repo/from/tuning");
  });

  it("formatGraphVfsResult returns body for ok results", () => {
    expect(formatGraphVfsResult({ kind: "ok", body: "nodes: 3" })).toBe("nodes: 3");
    expect(formatGraphVfsResult({ kind: "no-graph", message: "no graph" })).toBe("no graph");
  });

  it("spawnOpenclawGraphOnStop runs node graph-on-stop with cwd option", () => {
    const spawn = vi.fn().mockReturnValue({ on: vi.fn(), unref: vi.fn() });
    const exists = vi.fn().mockReturnValue(true);
    spawnOpenclawGraphOnStop("/dist/graph-on-stop.js", "/my/repo", { spawn, exists });
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ["/dist/graph-on-stop.js"],
      expect.objectContaining({ cwd: "/my/repo", detached: true }),
    );
  });

  it("spawnOpenclawGraphOnStop is a no-op when HIVEMIND_GRAPH_ON_STOP=0", () => {
    process.env.HIVEMIND_GRAPH_ON_STOP = "0";
    const spawn = vi.fn();
    spawnOpenclawGraphOnStop("/dist/graph-on-stop.js", "/my/repo", {
      spawn,
      exists: () => true,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawnOpenclawGraphPullWorker fires once per runtime", () => {
    const spawn = vi.fn().mockReturnValue({ on: vi.fn(), unref: vi.fn() });
    const exists = () => true;
    spawnOpenclawGraphPullWorker("/dist/graph-pull-worker.js", "/my/repo", { spawn, exists });
    spawnOpenclawGraphPullWorker("/dist/graph-pull-worker.js", "/my/repo", { spawn, exists });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      "nohup",
      ["node", "/dist/graph-pull-worker.js", "--cwd", "/my/repo"],
      expect.objectContaining({ detached: true }),
    );
  });

  it("spawnOpenclawGraphPullWorker is a no-op when HIVEMIND_GRAPH_PULL=0", () => {
    process.env.HIVEMIND_GRAPH_PULL = "0";
    const spawn = vi.fn();
    spawnOpenclawGraphPullWorker("/dist/graph-pull-worker.js", "/my/repo", {
      spawn,
      exists: () => true,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawnOpenclawGraphPullWorker clears graphPullSpawned on child error so a later call can retry", () => {
    const onHandlers: Array<() => void> = [];
    const spawn = vi.fn().mockReturnValue({
      on: (_event: string, fn: () => void) => { onHandlers.push(fn); },
      unref: vi.fn(),
    });
    spawnOpenclawGraphPullWorker("/dist/graph-pull-worker.js", "/my/repo", { spawn, exists: () => true });
    expect(spawn).toHaveBeenCalledTimes(1);
    spawnOpenclawGraphPullWorker("/dist/graph-pull-worker.js", "/my/repo", { spawn, exists: () => true });
    expect(spawn).toHaveBeenCalledTimes(1);
    onHandlers[0]!();
    spawnOpenclawGraphPullWorker("/dist/graph-pull-worker.js", "/my/repo", { spawn, exists: () => true });
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
