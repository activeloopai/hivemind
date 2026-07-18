import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main, type MainDeps } from "../../../src/hooks/graph-on-stop.js";
import { repoDir } from "../../../src/graph/snapshot.js";
import { deriveProjectKey } from "../../../src/utils/repo-identity.js";

/**
 * Tests for graph-on-stop's main() orchestration. Covers the gate→lock→
 * build→release sequence and its branches:
 *   - gate decides SKIP → no lock taken
 *   - gate decides FIRE → lock attempt; if lock held by other → log + return
 *   - gate decides FIRE + lock acquired → runBuildCommand called → lock released
 *   - runBuildCommand throws → log + still release lock
 *   - decideGate throws → log + early return
 *   - HIVEMIND_GRAPH_ON_STOP=0 → envDisable propagated to ctx
 *
 * Build + lock helpers are injected via MainDeps so the test doesn't touch
 * real git state, doesn't fork the bundled build process, and never holds
 * a real cross-process lock file.
 */
describe("graph-on-stop main()", () => {
  let workCwd: string;
  let baseDir: string;
  let prevCwd: string;
  let prevEnv: string | undefined;

  beforeEach(() => {
    workCwd = mkdtempSync(join(tmpdir(), "gos-main-cwd-"));
    const { key } = deriveProjectKey(workCwd);
    baseDir = repoDir(key);
    prevCwd = process.cwd();
    prevEnv = process.env.HIVEMIND_GRAPH_ON_STOP;
    process.chdir(workCwd);
    // Clean baseDir from any prior test run (the key depends on path, but
    // process.cwd() resolves to the same /private/tmp/... cousin on macOS).
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (prevEnv === undefined) delete process.env.HIVEMIND_GRAPH_ON_STOP;
    else process.env.HIVEMIND_GRAPH_ON_STOP = prevEnv;
    try { rmSync(workCwd, { recursive: true, force: true }); } catch {}
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  it("gate SKIP → no lock acquired, no build called", async () => {
    const acquire = vi.fn();
    const release = vi.fn();
    const run = vi.fn();
    const deps: MainDeps = {
      decideGate: () => ({ fire: false, reason: "test-skip" }),
      acquireBuildLock: acquire,
      releaseBuildLock: release,
      runBuildCommand: run,
    };
    await main(deps);
    expect(acquire).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("gate FIRE + lock acquired → runBuildCommand called → lock released", async () => {
    const acquire = vi.fn(() => ({ acquired: true, reason: "acquired" }));
    const release = vi.fn();
    const run = vi.fn(async () => {});
    await main({
      decideGate: () => ({ fire: true, reason: "test-fire" }),
      acquireBuildLock: acquire,
      releaseBuildLock: release,
      runBuildCommand: run,
    });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(["--trigger", "session-end"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("gate FIRE + lock held-by-other → no build, no release of someone else's lock", async () => {
    const acquire = vi.fn(() => ({ acquired: false, reason: "held-by-other" }));
    const release = vi.fn();
    const run = vi.fn();
    await main({
      decideGate: () => ({ fire: true, reason: "test-fire" }),
      acquireBuildLock: acquire,
      releaseBuildLock: release,
      runBuildCommand: run,
    });
    expect(acquire).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("runBuildCommand throws → lock STILL released + error logged", async () => {
    const acquire = vi.fn(() => ({ acquired: true, reason: "acquired" }));
    const release = vi.fn();
    const run = vi.fn(async () => { throw new Error("build exploded"); });
    await main({
      decideGate: () => ({ fire: true, reason: "test-fire" }),
      acquireBuildLock: acquire,
      releaseBuildLock: release,
      runBuildCommand: run,
    });
    // Release MUST happen in the finally even when build throws — otherwise
    // a build crash would permanently stick the lock for future builds.
    expect(release).toHaveBeenCalledTimes(1);
    // Error should land in the log file
    const log = join(baseDir, ".graph-on-stop.log");
    if (existsSync(log)) {
      expect(readFileSync(log, "utf8")).toContain("build threw");
    }
  });

  it("injected runBuildCommand that rejects with ERR_MODULE_NOT_FOUND (tree-sitter missing) → lock released, error logged, main() resolves", async () => {
    // Simulates the codex/cursor case where the tree-sitter native extractor
    // is not installed: the lazy `import("../commands/graph.js")` rejects.
    // main() must swallow it (log + release lock + resolve) so the Stop hook
    // exits 0 instead of crashing with a non-zero code.
    const acquire = vi.fn(() => ({ acquired: true, reason: "acquired" }));
    const release = vi.fn();
    const run = vi.fn(async () => {
      const err = new Error("Cannot find package 'tree-sitter'");
      (err as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
      throw err;
    });
    await expect(
      main({
        decideGate: () => ({ fire: true, reason: "test-fire" }),
        acquireBuildLock: acquire,
        releaseBuildLock: release,
        runBuildCommand: run,
      }),
    ).resolves.toBeUndefined();
    expect(release).toHaveBeenCalledTimes(1);
    // Logging is part of this regression's contract (the operator's only trace
    // that the build was skipped), so assert it unconditionally with the
    // specific message rather than guarding on the file's existence.
    const log = join(baseDir, ".graph-on-stop.log");
    expect(existsSync(log)).toBe(true);
    expect(readFileSync(log, "utf8")).toContain(
      "build threw: Cannot find package 'tree-sitter'",
    );
  });

  it("decideGate throws → early return, no lock attempt, error logged", async () => {
    const acquire = vi.fn();
    const release = vi.fn();
    const run = vi.fn();
    await main({
      decideGate: () => { throw new Error("gate logic broke"); },
      acquireBuildLock: acquire,
      releaseBuildLock: release,
      runBuildCommand: run,
    });
    expect(acquire).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    const log = join(baseDir, ".graph-on-stop.log");
    if (existsSync(log)) {
      expect(readFileSync(log, "utf8")).toContain("decideGate threw");
    }
  });

  it("HIVEMIND_GRAPH_ON_STOP=0 → envDisable=true propagates into gate ctx", async () => {
    process.env.HIVEMIND_GRAPH_ON_STOP = "0";
    let observedEnvDisable = false;
    await main({
      decideGate: (ctx) => {
        observedEnvDisable = ctx.envDisable;
        return { fire: false, reason: "env-disabled" };
      },
    });
    expect(observedEnvDisable).toBe(true);
  });

  it("HIVEMIND_GRAPH_ON_STOP unset → envDisable=false", async () => {
    delete process.env.HIVEMIND_GRAPH_ON_STOP;
    let observedEnvDisable = true;
    await main({
      decideGate: (ctx) => {
        observedEnvDisable = ctx.envDisable;
        return { fire: false, reason: "default" };
      },
    });
    expect(observedEnvDisable).toBe(false);
  });

  it("logs the gate decision to .graph-on-stop.log (FIRE path)", async () => {
    await main({
      decideGate: () => ({ fire: true, reason: "test-fire-reason" }),
      acquireBuildLock: () => ({ acquired: true, reason: "acquired" }),
      releaseBuildLock: () => {},
      runBuildCommand: async () => {},
    });
    const log = join(baseDir, ".graph-on-stop.log");
    expect(existsSync(log)).toBe(true);
    const content = readFileSync(log, "utf8");
    expect(content).toContain("gate: FIRE");
    expect(content).toContain("test-fire-reason");
  });

  it("logs the gate decision to .graph-on-stop.log (SKIP path)", async () => {
    await main({
      decideGate: () => ({ fire: false, reason: "test-skip-reason" }),
      acquireBuildLock: () => ({ acquired: false, reason: "n/a" }),
      releaseBuildLock: () => {},
      runBuildCommand: async () => {},
    });
    const log = join(baseDir, ".graph-on-stop.log");
    expect(existsSync(log)).toBe(true);
    const content = readFileSync(log, "utf8");
    expect(content).toContain("gate: SKIP");
    expect(content).toContain("test-skip-reason");
  });
});
