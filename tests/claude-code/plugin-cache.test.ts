import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chmodSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir, homedir, platform } from "node:os";
import {
  compareSemverDesc,
  executeGc,
  isSemver,
  isVersionInUse,
  planGc,
  readCurrentVersionFromManifest,
  resolveVersionedPluginDir,
  restoreOrCleanup,
  snapshotPluginDir,
} from "../../src/utils/plugin-cache.js";

function mkRoot(): string {
  const root = join(tmpdir(), `hivemind-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
}

describe("isSemver", () => {
  it("accepts three-segment numeric", () => {
    expect(isSemver("0.6.39")).toBe(true);
    expect(isSemver("10.0.1")).toBe(true);
  });
  it("rejects non-semver", () => {
    expect(isSemver("0.6")).toBe(false);
    expect(isSemver("0.6.39-rc1")).toBe(false);
    expect(isSemver("latest")).toBe(false);
    expect(isSemver(".keep-1234")).toBe(false);
  });
});

describe("compareSemverDesc", () => {
  it("sorts newest first", () => {
    const vs = ["0.6.38", "0.6.40", "0.5.9", "0.6.39"];
    expect([...vs].sort(compareSemverDesc)).toEqual(["0.6.40", "0.6.39", "0.6.38", "0.5.9"]);
  });
  it("handles multi-digit segments", () => {
    const vs = ["0.6.9", "0.6.10"];
    expect([...vs].sort(compareSemverDesc)).toEqual(["0.6.10", "0.6.9"]);
  });
});

describe("resolveVersionedPluginDir", () => {
  // We can't write to ~/.claude safely in tests, so the positive case uses a
  // manual path-assembly and the validator only checks the shape. Confirm
  // that anything outside the real cache prefix returns null.
  it("rejects a local --plugin-dir layout", () => {
    const root = mkRoot();
    try {
      const bundle = join(root, "harnesses", "claude-code", "bundle");
      mkdirSync(bundle, { recursive: true });
      expect(resolveVersionedPluginDir(bundle)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects when version segment isn't semver", () => {
    const root = mkRoot();
    try {
      const bundle = join(root, "plugins", "cache", "hivemind", "hivemind", "latest", "bundle");
      mkdirSync(bundle, { recursive: true });
      expect(resolveVersionedPluginDir(bundle)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the real cache layout", () => {
    const fakeHome = join(homedir(), ".claude", "plugins", "cache", "hivemind", "hivemind", "9.99.99", "bundle");
    const resolved = resolveVersionedPluginDir(fakeHome);
    expect(resolved).not.toBeNull();
    expect(resolved?.version).toBe("9.99.99");
  });
});

describe("snapshotPluginDir + restoreOrCleanup", () => {
  let root: string;
  beforeEach(() => { root = mkRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("returns null when the plugin dir doesn't exist", () => {
    const handle = snapshotPluginDir(join(root, "missing"), 1234);
    expect(handle).toBeNull();
  });

  it("creates a PID-scoped snapshot with same contents", () => {
    const plugin = join(root, "0.6.38");
    mkdirSync(join(plugin, "bundle"), { recursive: true });
    writeFileSync(join(plugin, "bundle", "capture.js"), "console.log('v38');");
    const handle = snapshotPluginDir(plugin, 1234);
    expect(handle).not.toBeNull();
    expect(handle!.snapshot).toBe(`${plugin}.keep-1234`);
    expect(readFileSync(join(handle!.snapshot, "bundle", "capture.js"), "utf-8")).toBe("console.log('v38');");
  });

  it("overwrites a stale same-PID snapshot", () => {
    const plugin = join(root, "0.6.38");
    mkdirSync(plugin, { recursive: true });
    writeFileSync(join(plugin, "marker"), "new");
    const stale = `${plugin}.keep-1234`;
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, "old-marker"), "old");
    const handle = snapshotPluginDir(plugin, 1234);
    expect(handle).not.toBeNull();
    expect(existsSync(join(handle!.snapshot, "old-marker"))).toBe(false);
    expect(readFileSync(join(handle!.snapshot, "marker"), "utf-8")).toBe("new");
  });

  it("restores the snapshot when the installer wiped the plugin dir", () => {
    const plugin = join(root, "0.6.38");
    mkdirSync(plugin, { recursive: true });
    writeFileSync(join(plugin, "marker"), "preserved");
    const handle = snapshotPluginDir(plugin, 1234);
    rmSync(plugin, { recursive: true, force: true });
    const outcome = restoreOrCleanup(handle);
    expect(outcome).toBe("restored");
    expect(readFileSync(join(plugin, "marker"), "utf-8")).toBe("preserved");
    expect(existsSync(handle!.snapshot)).toBe(false);
  });

  it("removes the snapshot when the plugin dir still exists", () => {
    const plugin = join(root, "0.6.38");
    mkdirSync(plugin, { recursive: true });
    writeFileSync(join(plugin, "marker"), "x");
    const handle = snapshotPluginDir(plugin, 1234);
    const outcome = restoreOrCleanup(handle);
    expect(outcome).toBe("cleaned");
    expect(existsSync(handle!.snapshot)).toBe(false);
    expect(existsSync(plugin)).toBe(true);
  });

  it("restoreOrCleanup is a no-op when handle is null", () => {
    expect(restoreOrCleanup(null)).toBe("noop");
  });

  // Windows-skip: this test forces renameSync to fail by chmod-ing the parent
  // dir to 0o500 (read+execute, no write). POSIX honours that and the rename
  // throws EACCES; Windows ignores Unix mode bits on directories, so the
  // rename succeeds and no error is injected. The product code path
  // (restoreOrCleanup's catch → "restore-failed") is platform-agnostic and
  // fully covered on Linux/macOS. node:fs named imports are non-configurable
  // so a spy-based injection isn't possible here.
  it.skipIf(process.platform === "win32")("returns 'restore-failed' and writes to stderr when rename throws", () => {
    const root = mkRoot();
    const stderrChunks: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: any) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as any);
    try {
      const plugin = join(root, "0.6.38");
      mkdirSync(plugin, { recursive: true });
      writeFileSync(join(plugin, "marker"), "x");
      const handle = snapshotPluginDir(plugin, 1234)!;
      // Remove the live plugin dir so restoreOrCleanup goes through the
      // rename path. Then chmod the parent so rename fails with EACCES —
      // exercising the catch branch in restoreOrCleanup. The new contract
      // returns "restore-failed" (not "noop") so the caller / log line can
      // tell a genuine fs failure apart from the no-op cases.
      rmSync(plugin, { recursive: true, force: true });
      chmodSync(root, 0o500);
      try {
        expect(restoreOrCleanup(handle)).toBe("restore-failed");
        expect(stderrChunks.join("")).toMatch(/restoreOrCleanup failed/);
      } finally {
        chmodSync(root, 0o700);
      }
    } finally {
      stderrSpy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("readCurrentVersionFromManifest", () => {
  let root: string;
  beforeEach(() => { root = mkRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("returns null when the file doesn't exist", () => {
    expect(readCurrentVersionFromManifest(join(root, "nope.json"))).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    const p = join(root, "installed_plugins.json");
    writeFileSync(p, "{ not json");
    expect(readCurrentVersionFromManifest(p)).toBeNull();
  });

  it("returns null when hivemind@hivemind entry is missing", () => {
    const p = join(root, "installed_plugins.json");
    writeFileSync(p, JSON.stringify({ plugins: { "other@scope": [{ version: "1.0.0" }] } }));
    expect(readCurrentVersionFromManifest(p)).toBeNull();
  });

  it("returns the first valid semver version", () => {
    const p = join(root, "installed_plugins.json");
    writeFileSync(p, JSON.stringify({
      plugins: { "hivemind@hivemind": [{ version: "0.6.39", installPath: "/x" }] },
    }));
    expect(readCurrentVersionFromManifest(p)).toBe("0.6.39");
  });

  it("skips entries with non-semver versions", () => {
    const p = join(root, "installed_plugins.json");
    writeFileSync(p, JSON.stringify({
      plugins: { "hivemind@hivemind": [{ version: "latest" }, { version: "0.6.40" }] },
    }));
    expect(readCurrentVersionFromManifest(p)).toBe("0.6.40");
  });

  it("returns null when every entry has a non-semver version", () => {
    const p = join(root, "installed_plugins.json");
    writeFileSync(p, JSON.stringify({
      plugins: { "hivemind@hivemind": [{ version: "latest" }, { version: "unknown" }, {}] },
    }));
    expect(readCurrentVersionFromManifest(p)).toBeNull();
  });
});

describe("planGc", () => {
  let root: string;
  beforeEach(() => { root = mkRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const mk = (...names: string[]) => names.forEach(n => mkdirSync(join(root, n), { recursive: true }));

  it("keeps current + N-1 newest, deletes the rest", () => {
    mk("0.6.37", "0.6.38", "0.6.39", "0.6.40");
    const plan = planGc(root, "0.6.40", 2, () => false);
    expect(new Set(plan.keep)).toEqual(new Set(["0.6.40", "0.6.39"]));
    expect(new Set(plan.deleteVersions)).toEqual(new Set(["0.6.37", "0.6.38"]));
  });

  it("deletes nothing when current version is not on disk (bail-safe)", () => {
    // current version missing from disk means installer state is weird;
    // we shouldn't GC in that case.
    mk("0.6.37", "0.6.38");
    const plan = planGc(root, "0.6.40", 2, () => false);
    expect(plan.deleteVersions).toEqual([]);
  });

  it("deletes nothing when manifest version is null", () => {
    mk("0.6.37", "0.6.38", "0.6.39");
    const plan = planGc(root, null, 2, () => false);
    expect(plan.deleteVersions).toEqual([]);
  });

  it("leaves unknown entries untouched (non-semver, non-.keep)", () => {
    mk("0.6.39", "0.6.38", "tmp", "node_modules");
    const plan = planGc(root, "0.6.39", 1, () => false);
    expect(plan.deleteVersions).toEqual(["0.6.38"]);
    // "tmp" and "node_modules" must not appear anywhere in the plan.
    expect(plan.deleteSnapshots).toEqual([]);
    expect(plan.keep.some(k => k === "tmp" || k === "node_modules")).toBe(false);
  });

  it("schedules dead-PID snapshots for deletion", () => {
    mk("0.6.39", "0.6.38.keep-1111", "0.6.39.keep-2222");
    const plan = planGc(root, "0.6.39", 2, (pid) => pid === 2222);
    expect(new Set(plan.deleteSnapshots)).toEqual(new Set(["0.6.38.keep-1111"]));
  });

  it("preserves live-PID snapshots", () => {
    mk("0.6.39", "0.6.39.keep-2222");
    const plan = planGc(root, "0.6.39", 2, () => true);
    expect(plan.deleteSnapshots).toEqual([]);
  });

  it("handles missing versionsRoot gracefully", () => {
    const plan = planGc(join(root, "does-not-exist"), "0.6.39", 2, () => false);
    expect(plan).toEqual({ keep: [], deleteVersions: [], deleteSnapshots: [] });
  });

  // -- In-use refcounting (issue #188) -----------------------------------
  // Without this, GC happily evicts an old version that a long-running
  // session is still pinned to → every hook in that session ENOENTs on
  // ${CLAUDE_PLUGIN_ROOT}/bundle/... afterwards.

  it("keeps an old version when isInUse claims it's still in use", () => {
    mk("0.6.37", "0.6.38", "0.6.39", "0.6.40");
    // 0.6.37 is well below the keep-2 cutoff but a live session claims it.
    const isInUse = (versionDir: string) => basename(versionDir) === "0.6.37";
    const plan = planGc(root, "0.6.40", 2, () => false, isInUse);
    expect(plan.keep).toContain("0.6.37");
    expect(plan.deleteVersions).not.toContain("0.6.37");
    // 0.6.38 has no in-use claim, so it's still deleted.
    expect(plan.deleteVersions).toContain("0.6.38");
  });

  it("still deletes old versions with no in-use claim", () => {
    mk("0.6.37", "0.6.38", "0.6.39", "0.6.40");
    const plan = planGc(root, "0.6.40", 2, () => false, () => false);
    expect(new Set(plan.deleteVersions)).toEqual(new Set(["0.6.37", "0.6.38"]));
  });

  it("does NOT consult isInUse for versions already inside the keep window", () => {
    // CLAUDE.md rule 6: assert count, not just presence. A correct impl
    // short-circuits the refcount check for kept versions — calling
    // isInUse on them would waste time and tempt buggy impls into
    // double-keep paths.
    mk("0.6.37", "0.6.38", "0.6.39", "0.6.40");
    const calls: string[] = [];
    const isInUse = (versionDir: string) => { calls.push(versionDir); return false; };
    planGc(root, "0.6.40", 2, () => false, isInUse);
    // Only 0.6.37 and 0.6.38 are deletion candidates; 0.6.39 and 0.6.40
    // are auto-kept and must not be queried.
    expect(calls.map(c => basename(c))).toEqual(["0.6.37", "0.6.38"]);
  });

  it("default isInUse (real disk) returns false when no .in_use dirs exist", () => {
    // Old planGc tests don't pass an isInUse arg → they use the real one
    // backed by readdirSync(.in_use). On these tmpdirs without .in_use/
    // subdirs, the real impl must return false so behavior is unchanged.
    mk("0.6.37", "0.6.39", "0.6.40");
    const plan = planGc(root, "0.6.40", 2, () => false);
    expect(plan.deleteVersions).toContain("0.6.37");
  });
});

describe("isVersionInUse", () => {
  let root: string;
  beforeEach(() => { root = mkRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("returns false when the version dir has no .in_use subdirectory", () => {
    const v = join(root, "0.6.39");
    mkdirSync(v, { recursive: true });
    expect(isVersionInUse(v)).toBe(false);
  });

  it("returns false when .in_use is empty", () => {
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    expect(isVersionInUse(v)).toBe(false);
  });

  it("returns true when .in_use holds a live process's claim with matching procStart", () => {
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    // Use *this* process as the live PID. On Linux we read its real
    // procStart so the match succeeds. On macOS readProcStart returns
    // null and the procStart check is skipped — also a match.
    const pid = process.pid;
    let procStart = "0";
    if (platform() === "linux") {
      const raw = readFileSync(`/proc/${pid}/stat`, "utf-8");
      const tail = raw.slice(raw.lastIndexOf(")") + 1).trim();
      procStart = tail.split(/\s+/)[19] ?? "0";
    }
    writeFileSync(join(v, ".in_use", String(pid)), JSON.stringify({ pid, procStart }));
    expect(isVersionInUse(v)).toBe(true);
  });

  it("returns false when the only claim's PID is dead", () => {
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    // 0x7FFFFFFF is above /proc/sys/kernel/pid_max on Linux and reserved
    // on macOS → guaranteed not-alive.
    writeFileSync(join(v, ".in_use", "2147483647"), JSON.stringify({ pid: 2147483647, procStart: "1" }));
    expect(isVersionInUse(v)).toBe(false);
  });

  it("returns false on Linux when procStart doesn't match the live PID (PID reuse case)", () => {
    if (platform() !== "linux") return;
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    // Live PID (this test process), but with a procStart that can't
    // match the kernel's actual start time. CLAUDE.md rule 1: cross-
    // process state (PID-reuse) is one of the bugs that ship past
    // single-instance tests; pin it explicitly.
    writeFileSync(
      join(v, ".in_use", String(process.pid)),
      JSON.stringify({ pid: process.pid, procStart: "0" }),
    );
    expect(isVersionInUse(v)).toBe(false);
  });

  it("ignores claim files with malformed JSON", () => {
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    writeFileSync(join(v, ".in_use", "garbage"), "not json {");
    expect(isVersionInUse(v)).toBe(false);
  });

  it("ignores claim files missing or with non-numeric pid", () => {
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    writeFileSync(join(v, ".in_use", "no-pid"), JSON.stringify({ procStart: "1" }));
    writeFileSync(join(v, ".in_use", "bad-pid"), JSON.stringify({ pid: "not-a-number" }));
    expect(isVersionInUse(v)).toBe(false);
  });

  it("returns true if ANY of multiple claim files is live (one alive among dead ones)", () => {
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    writeFileSync(join(v, ".in_use", "2147483647"), JSON.stringify({ pid: 2147483647, procStart: "1" }));
    writeFileSync(join(v, ".in_use", "garbage"), "definitely not json");
    // Our own PID — guaranteed live. Same Linux/macOS handling as the
    // matching-procStart test above.
    const pid = process.pid;
    let procStart = "0";
    if (platform() === "linux") {
      const raw = readFileSync(`/proc/${pid}/stat`, "utf-8");
      const tail = raw.slice(raw.lastIndexOf(")") + 1).trim();
      procStart = tail.split(/\s+/)[19] ?? "0";
    }
    writeFileSync(join(v, ".in_use", String(pid)), JSON.stringify({ pid, procStart }));
    expect(isVersionInUse(v)).toBe(true);
  });

  it("treats a claim without procStart as live when the PID is alive (legacy claim format)", () => {
    const v = join(root, "0.6.39");
    mkdirSync(join(v, ".in_use"), { recursive: true });
    // Forwards-compat: older Claude Code versions may have written
    // claim files with just {pid}. Without procStart, we trust kill(pid, 0)
    // alone — preferable to false-deleting a still-live session's bundle.
    writeFileSync(join(v, ".in_use", String(process.pid)), JSON.stringify({ pid: process.pid }));
    expect(isVersionInUse(v)).toBe(true);
  });
});

describe("executeGc", () => {
  let root: string;
  beforeEach(() => { root = mkRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("deletes the planned version dirs and snapshots", () => {
    mkdirSync(join(root, "0.6.37"), { recursive: true });
    mkdirSync(join(root, "0.6.38.keep-1111"), { recursive: true });
    const result = executeGc(root, {
      keep: ["0.6.39"],
      deleteVersions: ["0.6.37"],
      deleteSnapshots: ["0.6.38.keep-1111"],
    });
    expect(result.deletedVersions).toEqual(["0.6.37"]);
    expect(result.deletedSnapshots).toEqual(["0.6.38.keep-1111"]);
    expect(result.errors).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
  });

  it("reports but swallows rm errors", () => {
    // Passing a path that doesn't exist with `force: true` won't error,
    // so exercise the normal happy path and assert the empty-errors
    // contract the hook relies on.
    const result = executeGc(root, {
      keep: [],
      deleteVersions: ["nonexistent-version"],
      deleteSnapshots: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.deletedVersions).toEqual(["nonexistent-version"]);
  });

  // Windows-skip: forces rmSync to fail via chmod(parent, 0o500). POSIX-only —
  // Windows ignores Unix dir mode bits, so the rm succeeds and no EACCES is
  // injected. executeGc's two catch blocks are platform-agnostic and covered
  // on Linux/macOS. node:fs named imports are non-configurable, ruling out a
  // spy-based throw here.
  it.skipIf(process.platform === "win32")("collects errors from both rmSync catch blocks without throwing", () => {
    const versionDir = join(root, "0.6.38");
    mkdirSync(versionDir, { recursive: true });
    const snapshotDir = join(root, "0.6.38.keep-9999");
    mkdirSync(snapshotDir, { recursive: true });
    // chmod 0500 on the parent makes unlink of its children fail EACCES.
    chmodSync(root, 0o500);
    try {
      const result = executeGc(root, {
        keep: ["0.6.39"],
        deleteVersions: ["0.6.38"],
        deleteSnapshots: ["0.6.38.keep-9999"],
      });
      expect(result.deletedVersions).toEqual([]);
      expect(result.deletedSnapshots).toEqual([]);
      expect(result.errors.length).toBe(2);
      expect(result.errors[0]).toContain("0.6.38");
      expect(result.errors[1]).toContain("0.6.38.keep-9999");
    } finally {
      chmodSync(root, 0o700);
    }
  });
});
