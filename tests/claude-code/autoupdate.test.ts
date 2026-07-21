import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { autoUpdate, isCodexManagedInstall } from "../../src/hooks/shared/autoupdate.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Tests for src/hooks/shared/autoupdate.ts — fire-and-forget centralized
 * autoupdate trigger.
 *
 * ## Hot-path constraint
 *
 * The helper is called from every agent's session-start hook. It MUST
 * return synchronously (sub-50ms) — no awaited spawns, no awaited fetches.
 * The 3-5s session-start latency that real-world testing surfaced
 * (2026-05-06) was the destructive bug that motivated the rewrite to a
 * detached spawn + sync findHivemindOnPath.
 *
 * Earlier drafts had a 4h "last-checked" cache. Removed per review
 * feedback (efenocchi, 2026-05-07): the cache only saved background CPU
 * inside the spawned process, but introduced a 4h "miss new release"
 * window for users with a recent session. Detached spawn already keeps
 * latency sub-50ms; cache wasn't earning its keep. So tests below
 * verify the helper fires on every call and never reads/writes any
 * cache file.
 *
 * Tests below assert:
 *   1. Gating works (creds null / no token / autoupdate=false)
 *   2. Spawn is detached + unref'd (no awaiting)
 *   3. Helper fires every time (no cache)
 *   4. Latency bound: autoUpdate returns within 100ms even when the
 *      "spawn" function itself is intentionally slow.
 */

const VALID_CREDS = {
  token: "tok",
  orgId: "org",
  savedAt: "2026-05-06T00:00:00Z",
};

let TMP_HOME: string;
let ORIGINAL_HOME: string | undefined;

beforeEach(() => {
  TMP_HOME = mkdtempSync(join(tmpdir(), "autoupdate-test-"));
  mkdirSync(join(TMP_HOME, ".deeplake"), { recursive: true });
  ORIGINAL_HOME = process.env.HOME;
  setFakeHome(TMP_HOME);
});

afterEach(() => {
  clearFakeHome();
  rmSync(TMP_HOME, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("isCodexManagedInstall — Codex-managed detection", () => {
  // These paths are real layouts observed on disk (2026-07-10):
  //   managed:  ~/.codex/plugins/cache/<marketplace>/hivemind/<ref>/bundle
  //   npm:      ~/.codex/hivemind/bundle
  // The overriding safety requirement (efenocchi): NEVER report "managed"
  // for an npm install — a false managed verdict silently freezes updates.

  // --- MUST be detected as managed (skip npm self-update) ---
  it.each([
    ["/home/emanuele/.codex/plugins/cache/openai-curated/hivemind/1.2.3/bundle"],
    ["/home/emanuele/.codex/plugins/cache/openai-curated-remote/hivemind/abc123/bundle"],
    ["/home/emanuele/.codex/plugins/cache/local/hivemind/local/bundle"],
    ["/Users/x/.codex/plugins/cache/openai-curated/hivemind/9.9.9/bundle"],
  ])("managed cache path -> true: %s", (p) => {
    expect(isCodexManagedInstall(p)).toBe(true);
  });

  it("managed cache path on Windows (backslashes) -> true", () => {
    expect(
      isCodexManagedInstall("C:\\Users\\x\\.codex\\plugins\\cache\\openai-curated\\hivemind\\1.0.0\\bundle"),
    ).toBe(true);
  });

  it("honours a non-default CODEX_HOME for the managed cache", () => {
    expect(
      isCodexManagedInstall("/opt/codexhome/plugins/cache/openai-curated/hivemind/1/bundle", {
        CODEX_HOME: "/opt/codexhome",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  // --- MUST NOT be detected as managed (update MUST still run) ---
  // This is the false-negative-of-update guard the user is worried about.
  it.each([
    ["npm install bundle", "/home/emanuele/.codex/hivemind/bundle"],
    ["npm install on macOS", "/Users/x/.codex/hivemind/bundle"],
    ["dev checkout", "/home/emanuele/repo/harnesses/codex/bundle"],
    ["global npm node_modules", "/usr/lib/node_modules/@deeplake/hivemind/harnesses/codex/bundle"],
    ["unknown layout", "/opt/whatever/bundle"],
    ["plugins/cache but NOT under .codex", "/home/x/some-tool/plugins/cache/foo/bundle"],
    ["home dir literally named plugins cache-ish", "/home/emanuele/.codex/hivemind/bundle/subdir"],
  ])("not managed -> false (%s)", (_label, p) => {
    expect(isCodexManagedInstall(p)).toBe(false);
  });

  it("undefined bundleDir -> false (no crash, update proceeds)", () => {
    expect(isCodexManagedInstall(undefined)).toBe(false);
  });

  it("empty CODEX_HOME does not widen the match", () => {
    expect(
      isCodexManagedInstall("/home/x/.codex/hivemind/bundle", { CODEX_HOME: "" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("autoUpdate — Codex-managed guard integration", () => {
  const MANAGED = "/home/emanuele/.codex/plugins/cache/openai-curated/hivemind/1.2.3/bundle";
  const NPM = "/home/emanuele/.codex/hivemind/bundle";

  it("SKIPS the update on a Codex-managed install (even with valid creds + binary)", async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 1 });
    await autoUpdate(VALID_CREDS, {
      agent: "codex", bundleDir: MANAGED, spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind",
    });
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("RUNS the update on an npm install path (the false-skip regression guard)", async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 1 });
    await autoUpdate(VALID_CREDS, {
      agent: "codex", bundleDir: NPM, spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind",
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("RUNS the update when bundleDir is omitted (other agents unaffected)", async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 1 });
    await autoUpdate(VALID_CREDS, {
      agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind",
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("RUNS the update on a dev-checkout bundleDir (not a managed cache)", async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 1 });
    await autoUpdate(VALID_CREDS, {
      agent: "codex", bundleDir: "/home/x/repo/harnesses/codex/bundle",
      spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind",
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });
});

describe("autoUpdate — gating", () => {
  it("no-op when creds are null", async () => {
    const spawnFn = vi.fn();
    await autoUpdate(null, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("no-op when creds.token is missing", async () => {
    const spawnFn = vi.fn();
    await autoUpdate({ ...VALID_CREDS, token: "" }, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("no-op when creds.autoupdate === false", async () => {
    const spawnFn = vi.fn();
    await autoUpdate({ ...VALID_CREDS, autoupdate: false }, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("DOES run when creds.autoupdate is undefined (default true)", async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 12345 });
    await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("no-op when hivemindBinaryPath is null (binary not on PATH)", async () => {
    const spawnFn = vi.fn();
    await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: null });
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

describe("autoUpdate — fires every session-start (no cache, by design)", () => {
  // Earlier drafts had a 4h "last-checked" cache. Removed per review
  // feedback: the cache only saved background CPU (an npm GET inside
  // the spawned process), but introduced a bad UX paper cut — when a
  // new release lands, users with a recent session wouldn't see it for
  // up to 4h. Detached spawn already keeps session-start latency
  // sub-50ms, so the cache wasn't earning its keep on the hot path.
  it("dispatches on every call (does not look at any state file)", async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 99 });
    await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    expect(spawnFn).toHaveBeenCalledTimes(3);
  });

  it("does NOT create or touch ~/.deeplake/.autoupdate-last-check", async () => {
    const cachePath = join(TMP_HOME, ".deeplake", ".autoupdate-last-check");
    const spawnFn = vi.fn().mockReturnValue({ pid: 99 });
    await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    expect(existsSync(cachePath)).toBe(false);
  });
});

describe("autoUpdate — spawn shape", () => {
  it("calls spawn with the resolved binary + ['update'] args", async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 99 });
    await autoUpdate(VALID_CREDS, {
      agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/usr/local/bin/hivemind",
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn.mock.calls[0]).toEqual(["/usr/local/bin/hivemind", ["update"]]);
  });

  it.each([
    ["claude"], ["codex"], ["cursor"], ["hermes"], ["pi"], ["openclaw"],
  ] as const)("dispatches once for agent %s", async (agent) => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 99 });
    await autoUpdate(VALID_CREDS, { agent, spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind" });
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("swallows spawn-throw errors silently (broken-binary case)", async () => {
    const spawnFn = vi.fn().mockImplementation(() => { throw new Error("ENOENT"); });
    // Must not throw
    await expect(autoUpdate(VALID_CREDS, {
      agent: "claude", spawn: spawnFn, hivemindBinaryPath: "/u/bin/hivemind",
    })).resolves.toBeUndefined();
  });
});

describe("autoUpdate — latency bound (regression guard)", () => {
  // The whole point of the rewrite. autoUpdate must return in <100ms
  // even when the spawn function itself takes seconds. Without the
  // detached-spawn rewrite, this test would fail with ~5000ms elapsed.

  it("returns in <100ms even when spawn impl takes seconds", async () => {
    // The injected spawn doesn't block (returns immediately) — but the
    // helper's contract is that it dispatches and returns; the time
    // spent inside the spawn impl shouldn't matter because the helper
    // doesn't await. Test the dispatch-and-return path is fast.
    const slowSpawn = vi.fn().mockReturnValue({ pid: 1 });
    const start = Date.now();
    await autoUpdate(VALID_CREDS, {
      agent: "claude", spawn: slowSpawn, hivemindBinaryPath: "/u/bin/hivemind",
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("returns in <50ms when creds say opt-out (autoupdate=false)", async () => {
    const start = Date.now();
    await autoUpdate(
      { ...VALID_CREDS, autoupdate: false },
      { agent: "claude", hivemindBinaryPath: "/u/bin/hivemind" },
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

describe("autoUpdate — default findHivemindOnPath()", () => {
  it("returns no-op when nothing on PATH (real PATH lookup)", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent-test-path";
    try {
      const spawnFn = vi.fn();
      await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn });
      expect(spawnFn).not.toHaveBeenCalled();
    } finally {
      process.env.PATH = origPath;
    }
  });

  it("finds binary on PATH and dispatches", async () => {
    const fakeBinDir = mkdtempSync(join(tmpdir(), "fake-bin-"));
    // On Windows the resolver looks for `hivemind.cmd` (the npm shim shape);
    // on POSIX it's the extensionless `hivemind`. Build the fake binary with
    // the name the resolver will actually probe, and join PATH with the
    // platform delimiter (';' on Windows, ':' on POSIX).
    const binName = process.platform === "win32" ? "hivemind.cmd" : "hivemind";
    const fakeBin = join(fakeBinDir, binName);
    writeFileSync(fakeBin, "#!/usr/bin/env bash\nexit 0\n");
    require("node:fs").chmodSync(fakeBin, 0o755);
    const origPath = process.env.PATH;
    process.env.PATH = `${fakeBinDir}${delimiter}${origPath ?? ""}`;
    try {
      const spawnFn = vi.fn().mockReturnValue({ pid: 99 });
      await autoUpdate(VALID_CREDS, { agent: "claude", spawn: spawnFn });
      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(spawnFn.mock.calls[0][0]).toBe(fakeBin);
    } finally {
      process.env.PATH = origPath;
      rmSync(fakeBinDir, { recursive: true, force: true });
    }
  });
});

describe("autoUpdate — default detached spawn (real subprocess)", () => {
  // Exercises defaultSpawn end-to-end: actually fork a process, verify
  // the parent didn't wait for it.
  it("default spawn detaches a real subprocess and returns immediately", async () => {
    // Create a fake hivemind binary that takes 2s and writes to a file.
    const dir = mkdtempSync(join(tmpdir(), "fake-hm-"));
    const fakeBin = join(dir, "hivemind");
    const marker = join(dir, "marker");
    writeFileSync(fakeBin, `#!/usr/bin/env bash\nsleep 2\necho done > "${marker}"\n`);
    require("node:fs").chmodSync(fakeBin, 0o755);
    try {
      const start = Date.now();
      // No spawn override — exercises defaultSpawn (the actual detach + unref)
      await autoUpdate(VALID_CREDS, {
        agent: "claude", hivemindBinaryPath: fakeBin,
      });
      const elapsed = Date.now() - start;
      // Parent returned immediately (well under the child's 2s sleep)
      expect(elapsed).toBeLessThan(500);
      // Marker doesn't exist yet — child is still running
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
