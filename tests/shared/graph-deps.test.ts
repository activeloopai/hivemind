import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock ONLY the process boundary (execFileSync) — the network/exec seam the
// repo's testing philosophy says to mock — so the default runNpm/runHeal
// wrappers can be exercised without spawning real npm or the heal compile.
// spawnSync (used by transitively-imported embeddings.ts) stays real.
vi.mock("node:child_process", async (orig) => ({
  ...(await orig<typeof import("node:child_process")>()),
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { treeSitterSpecs, isGraphDepsInstalled, ensureGraphDeps, graphDepsReadyKey, defaultRunHeal } from "../../src/cli/graph-deps.js";

/**
 * The code-graph auto-build hook resolves tree-sitter from the shared
 * embed-deps dir. `ensureGraphDeps` provisions it there; these tests cover its
 * two pure helpers — the version derivation (which must track package.json so
 * embed-deps never drifts from what the bundles were built against) and the
 * presence check. The full install flow is covered by the e2e in the PR.
 */
describe("graph-deps helpers", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graph-deps-"));
  });
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  describe("treeSitterSpecs", () => {
    it("returns only tree-sitter* optionalDependencies as name@range, sorted, skipping non-parsers", () => {
      const pkg = join(dir, "package.json");
      writeFileSync(pkg, JSON.stringify({
        optionalDependencies: {
          // deliberately unsorted + mixed with a non-parser native dep
          "tree-sitter-typescript": "^0.23.2",
          "@huggingface/transformers": "^3.0.0",
          "tree-sitter": "^0.21.1",
          "tree-sitter-python": "0.23.4",
        },
      }));
      expect(treeSitterSpecs(pkg)).toEqual([
        "tree-sitter@^0.21.1",
        "tree-sitter-python@0.23.4",
        "tree-sitter-typescript@^0.23.2",
      ]);
      // The 600MB transformers dep must NOT be dragged into the graph install.
      expect(treeSitterSpecs(pkg).join(" ")).not.toContain("transformers");
    });

    it("returns [] when the file is missing or has no optionalDependencies", () => {
      expect(treeSitterSpecs(join(dir, "does-not-exist.json"))).toEqual([]);
      const empty = join(dir, "empty.json");
      writeFileSync(empty, JSON.stringify({ dependencies: { foo: "1.0.0" } }));
      expect(treeSitterSpecs(empty)).toEqual([]);
    });

    it("does not match a package merely containing 'tree-sitter' mid-name", () => {
      const pkg = join(dir, "package.json");
      writeFileSync(pkg, JSON.stringify({
        optionalDependencies: { "not-tree-sitter-thing": "1.0.0", "tree-sitter": "^0.21.1" },
      }));
      // Only the real prefix/exact match — `tree-sitter-` or `tree-sitter`.
      expect(treeSitterSpecs(pkg)).toEqual(["tree-sitter@^0.21.1"]);
    });
  });

  describe("isGraphDepsInstalled", () => {
    const specs = ["tree-sitter@^0.21.1", "tree-sitter-python@0.23.4"];

    it("is true only when EVERY requested parser dir is present (partial install → false)", () => {
      const nm = join(dir, "node_modules");
      mkdirSync(nm, { recursive: true });
      expect(isGraphDepsInstalled(nm, specs)).toBe(false);
      // Partial install: one of the two parsers present → still not "installed".
      mkdirSync(join(nm, "tree-sitter"), { recursive: true });
      expect(isGraphDepsInstalled(nm, specs)).toBe(false);
      mkdirSync(join(nm, "tree-sitter-python"), { recursive: true });
      expect(isGraphDepsInstalled(nm, specs)).toBe(true);
    });

    it("is false when the spec set is empty (nothing to require)", () => {
      const nm = join(dir, "node_modules");
      mkdirSync(nm, { recursive: true });
      expect(isGraphDepsInstalled(nm, [])).toBe(false);
    });
  });

  describe("ensureGraphDeps", () => {
    const SPECS = ["tree-sitter@^0.21.1", "tree-sitter-python@0.23.4"];
    let nm: string;
    // A fake npm boundary that "installs" by creating the parser dirs, so the
    // presence check flips to true afterward (mirrors a successful install).
    const fakeInstall = (specs: string[]) => {
      for (const s of specs) mkdirSync(join(nm, s.slice(0, s.lastIndexOf("@"))), { recursive: true });
    };

    beforeEach(() => { nm = join(dir, "node_modules"); });

    function baseDeps(over: Record<string, unknown> = {}) {
      return {
        sharedDir: dir,
        sharedNodeModules: nm,
        specs: SPECS,
        logFn: () => {},
        warnFn: () => {},
        ...over,
      };
    }

    it("HIVEMIND_GRAPH_ON_STOP=0 → provisioning skipped (no npm, no heal, no lock)", () => {
      const prev = process.env.HIVEMIND_GRAPH_ON_STOP;
      process.env.HIVEMIND_GRAPH_ON_STOP = "0";
      try {
        const runNpm = vi.fn();
        const runHeal = vi.fn();
        const logFn = vi.fn();
        ensureGraphDeps(baseDeps({ runNpm, runHeal, logFn }));
        expect(runNpm).not.toHaveBeenCalled();
        expect(runHeal).not.toHaveBeenCalled();
        expect(existsSync(join(dir, ".graph-deps.lock"))).toBe(false);
        expect(logFn).toHaveBeenCalledWith(expect.stringContaining("HIVEMIND_GRAPH_ON_STOP=0"));
      } finally {
        if (prev === undefined) delete process.env.HIVEMIND_GRAPH_ON_STOP;
        else process.env.HIVEMIND_GRAPH_ON_STOP = prev;
      }
    });

    it("empty specs → warns and skips (no npm, no heal)", () => {
      const runNpm = vi.fn();
      const runHeal = vi.fn();
      const warnFn = vi.fn();
      ensureGraphDeps(baseDeps({ specs: [], runNpm, runHeal, warnFn }));
      expect(runNpm).not.toHaveBeenCalled();
      expect(runHeal).not.toHaveBeenCalled();
      expect(warnFn).toHaveBeenCalledWith(expect.stringContaining("no tree-sitter optionalDependencies"));
    });

    it("fresh → creates package.json, installs, heals, THEN writes the ready marker", () => {
      const order: string[] = [];
      const runNpm = vi.fn((s: string[]) => { order.push("npm"); fakeInstall(s); });
      const runHeal = vi.fn(() => { order.push("heal"); });
      ensureGraphDeps(baseDeps({ runNpm, runHeal }));
      expect(runNpm).toHaveBeenCalledTimes(1);
      expect(runNpm).toHaveBeenCalledWith(SPECS, dir);
      expect(existsSync(join(dir, "package.json"))).toBe(true);
      // Marker is the platform/arch/ABI-keyed ready key, not a bare spec join.
      expect(readFileSync(join(dir, ".graph-deps"), "utf8")).toBe(graphDepsReadyKey(SPECS));
      // Heal runs, and the install happens BEFORE the heal.
      expect(runHeal).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["npm", "heal"]);
    });

    it("satisfied path (ready marker matches + parsers present) → spawns NOTHING", () => {
      fakeInstall(SPECS);
      writeFileSync(join(dir, ".graph-deps"), graphDepsReadyKey(SPECS));
      const runNpm = vi.fn();
      const runHeal = vi.fn();
      // Also assert the real default boundaries never spawn: no runNpm/runHeal
      // injected AND execFileSync (the process seam) must stay untouched.
      vi.mocked(execFileSync).mockClear();
      ensureGraphDeps(baseDeps({ runNpm, runHeal }));
      expect(runNpm).not.toHaveBeenCalled();
      expect(runHeal).not.toHaveBeenCalled();
      // No lockdir was even created (we returned on the pre-lock fast path).
      expect(existsSync(join(dir, ".graph-deps.lock"))).toBe(false);
    });

    it("default satisfied path makes zero child_process calls", () => {
      fakeInstall(SPECS);
      writeFileSync(join(dir, ".graph-deps"), graphDepsReadyKey(SPECS));
      vi.mocked(execFileSync).mockClear();
      // No runNpm/runHeal injected → the real defaults would spawn via
      // execFileSync if reached. On the satisfied path they must NOT be.
      ensureGraphDeps({ sharedDir: dir, sharedNodeModules: nm, specs: SPECS, logFn: () => {}, warnFn: () => {} });
      expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
    });

    it("stale marker (spec set changed) → reinstalls even if the dirs exist", () => {
      fakeInstall(SPECS);
      writeFileSync(join(dir, ".graph-deps"), "tree-sitter@0.0.1"); // old key
      const runNpm = vi.fn((s: string[]) => fakeInstall(s));
      ensureGraphDeps(baseDeps({ runNpm, runHeal: () => {} }));
      expect(runNpm).toHaveBeenCalledTimes(1);
      expect(readFileSync(join(dir, ".graph-deps"), "utf8")).toBe(graphDepsReadyKey(SPECS));
    });

    it("ABI mismatch (marker for a different Node ABI) → reinstalls", () => {
      fakeInstall(SPECS);
      // A ready key built for a stale ABI: same specs/platform/arch but a
      // different module-ABI line. Simulates a Node major upgrade.
      const staleAbiKey = graphDepsReadyKey(SPECS).replace(/abi=\d+/, "abi=0");
      expect(staleAbiKey).not.toBe(graphDepsReadyKey(SPECS));
      writeFileSync(join(dir, ".graph-deps"), staleAbiKey);
      const runNpm = vi.fn((s: string[]) => fakeInstall(s));
      const runHeal = vi.fn();
      ensureGraphDeps(baseDeps({ runNpm, runHeal }));
      expect(runNpm).toHaveBeenCalledTimes(1);
      expect(runHeal).toHaveBeenCalledTimes(1);
      expect(readFileSync(join(dir, ".graph-deps"), "utf8")).toBe(graphDepsReadyKey(SPECS));
    });

    it("partial install (marker matches but a parser dir is missing) → reinstalls", () => {
      mkdirSync(join(nm, "tree-sitter"), { recursive: true }); // only one of two
      writeFileSync(join(dir, ".graph-deps"), graphDepsReadyKey(SPECS));
      const runNpm = vi.fn((s: string[]) => fakeInstall(s));
      ensureGraphDeps(baseDeps({ runNpm, runHeal: () => {} }));
      expect(runNpm).toHaveBeenCalledTimes(1);
    });

    it("lock contention: a second caller skips while the lock is held", () => {
      // Pre-create the lockdir to simulate a live in-flight installer.
      mkdirSync(join(dir, ".graph-deps.lock"), { recursive: true });
      const runNpm = vi.fn();
      const runHeal = vi.fn();
      const logFn = vi.fn();
      // Provisioning is needed (no marker) but the lock is held, so this
      // contender must skip without installing.
      ensureGraphDeps(baseDeps({ runNpm, runHeal, logFn }));
      expect(runNpm).not.toHaveBeenCalled();
      expect(runHeal).not.toHaveBeenCalled();
      expect(existsSync(join(dir, ".graph-deps"))).toBe(false);
      expect(logFn).toHaveBeenCalledWith(expect.stringContaining("another install holds the lock"));
    });

    it("stale lock (older than the reclaim window) → reclaimed and install proceeds", () => {
      const lockDir = join(dir, ".graph-deps.lock");
      mkdirSync(lockDir, { recursive: true });
      // Backdate the lockdir mtime well past the 30-min stale threshold.
      const old = new Date(Date.now() - 45 * 60 * 1000);
      utimesSync(lockDir, old, old);
      const runNpm = vi.fn((s: string[]) => fakeInstall(s));
      const runHeal = vi.fn();
      ensureGraphDeps(baseDeps({ runNpm, runHeal }));
      expect(runNpm).toHaveBeenCalledTimes(1);
      expect(runHeal).toHaveBeenCalledTimes(1);
      expect(readFileSync(join(dir, ".graph-deps"), "utf8")).toBe(graphDepsReadyKey(SPECS));
      // Lock released after a successful provision.
      expect(existsSync(lockDir)).toBe(false);
    });

    it("held lock just UNDER the 30-min window is NOT reclaimed (raised threshold)", () => {
      const lockDir = join(dir, ".graph-deps.lock");
      mkdirSync(lockDir, { recursive: true });
      // 20 min old: past the OLD 10-min threshold but under the new 30-min one,
      // so a genuinely long install is left alone rather than reclaimed.
      const t = new Date(Date.now() - 20 * 60 * 1000);
      utimesSync(lockDir, t, t);
      const runNpm = vi.fn();
      const runHeal = vi.fn();
      ensureGraphDeps(baseDeps({ runNpm, runHeal }));
      expect(runNpm).not.toHaveBeenCalled();
      expect(runHeal).not.toHaveBeenCalled();
      expect(existsSync(join(dir, ".graph-deps"))).toBe(false);
    });

    it("release is a no-op when the lockdir was reclaimed (owner token mismatch)", () => {
      // Simulate a stale-reclaim by another process WHILE we hold the lock:
      // during our runNpm, overwrite the owner token so it no longer matches
      // ours. releaseLock must then NOT delete the lockdir out from under the
      // new owner. We assert the lockdir + the foreign owner survive.
      const lockDir = join(dir, ".graph-deps.lock");
      const runNpm = vi.fn((s: string[]) => {
        fakeInstall(s);
        // Another reclaimer took the lock and stamped its own token.
        writeFileSync(join(lockDir, "owner"), "someone-else-99");
      });
      const runHeal = vi.fn();
      ensureGraphDeps(baseDeps({ runNpm, runHeal }));
      // Our provision still completed (marker written), but the lockdir is left
      // intact because its owner is no longer us.
      expect(readFileSync(join(dir, ".graph-deps"), "utf8")).toBe(graphDepsReadyKey(SPECS));
      expect(existsSync(lockDir)).toBe(true);
      expect(readFileSync(join(lockDir, "owner"), "utf8")).toBe("someone-else-99");
    });

    it("refreshes the lock mtime before heal so a long install isn't reclaimed mid-flight", () => {
      // Inside runNpm we backdate the lockdir to simulate a mid-flight long
      // install. The refresh BEFORE heal must bump it forward again — we read
      // the mtime inside runHeal (after that refresh ran) and assert it's fresh.
      const lockDir = join(dir, ".graph-deps.lock");
      let mtimeAfterBackdate = 0;
      let mtimeInsideHeal = 0;
      const runNpm = vi.fn((s: string[]) => {
        const past = new Date(Date.now() - 60 * 60 * 1000);
        utimesSync(lockDir, past, past);
        mtimeAfterBackdate = statSync(lockDir).mtimeMs;
        fakeInstall(s);
      });
      const runHeal = vi.fn(() => { mtimeInsideHeal = statSync(lockDir).mtimeMs; });
      ensureGraphDeps(baseDeps({ runNpm, runHeal }));
      // The pre-heal refresh moved the mtime forward from the backdated value.
      expect(mtimeInsideHeal).toBeGreaterThan(mtimeAfterBackdate);
      // And it's genuinely fresh (within the stale window), not still an hour old.
      expect(Date.now() - mtimeInsideHeal).toBeLessThan(30 * 60 * 1000);
    });

    it("npm failure is swallowed (best-effort) — never throws, no marker written, lock released", () => {
      const runNpm = vi.fn(() => { throw new Error("npm exploded"); });
      const warnFn = vi.fn();
      expect(() => ensureGraphDeps(baseDeps({ runNpm, runHeal: () => {}, warnFn }))).not.toThrow();
      expect(existsSync(join(dir, ".graph-deps"))).toBe(false);
      // The finally-block release must run even on failure.
      expect(existsSync(join(dir, ".graph-deps.lock"))).toBe(false);
      expect(warnFn).toHaveBeenCalledWith(expect.stringContaining("tree-sitter provisioning failed"));
    });

    it("heal failure is swallowed too — never throws AND no marker (heal must succeed first)", () => {
      const runHeal = vi.fn(() => { throw new Error("heal exploded"); });
      const warnFn = vi.fn();
      expect(() => ensureGraphDeps(baseDeps({ runNpm: (s: string[]) => fakeInstall(s), runHeal, warnFn }))).not.toThrow();
      // Marker is written ONLY after BOTH npm and heal succeed — heal blew up,
      // so no marker: next session re-provisions.
      expect(existsSync(join(dir, ".graph-deps"))).toBe(false);
      expect(existsSync(join(dir, ".graph-deps.lock"))).toBe(false);
      expect(warnFn).toHaveBeenCalledWith(expect.stringContaining("tree-sitter provisioning failed"));
    });

    it("default boundaries: runNpm/runHeal go through execFileSync (npm install + heal)", () => {
      vi.mocked(execFileSync).mockClear();
      // No runNpm/runHeal injected → the real default wrappers run, but
      // execFileSync is mocked so nothing spawns.
      ensureGraphDeps({ sharedDir: dir, sharedNodeModules: nm, specs: SPECS, logFn: () => {}, warnFn: () => {} });
      const calls = vi.mocked(execFileSync).mock.calls;
      // defaultRunNpm issued `npm install <specs> ...`.
      expect(calls.some((c) => c[0] === "npm" && Array.isArray(c[1]) && c[1][0] === "install")).toBe(true);
      // defaultRunHeal spawned the ensure-tree-sitter heal via node (the repo
      // ships scripts/ensure-tree-sitter.mjs, so the existsSync gate passes),
      // AND forced strict mode so a bindings-load failure exits non-zero
      // (otherwise the heal false-succeeds over an unloadable addon).
      const healCall = calls.find((c) => c[0] === process.execPath
        && Array.isArray(c[1]) && String(c[1][0]).endsWith("ensure-tree-sitter.mjs"));
      expect(healCall).toBeDefined();
      const healOpts = healCall![2] as { env?: Record<string, string> } | undefined;
      expect(healOpts?.env?.HIVEMIND_STRICT_POSTINSTALL).toBe("1");
    });

    it("deletes a MATCHING ready marker before repair, so a mid-repair crash leaves no marker", () => {
      // Marker matches the current key BUT a parser dir is missing → the
      // under-lock path runs the repair. It must DELETE the marker before
      // mutating, so a crash during npm/heal can't leave a stale "ready" marker
      // fast-pathing over a broken tree.
      mkdirSync(join(nm, "tree-sitter"), { recursive: true }); // only one of two present
      writeFileSync(join(dir, ".graph-deps"), graphDepsReadyKey(SPECS));
      let markerDuringNpm: string | null = null;
      const runNpm = vi.fn(() => {
        markerDuringNpm = existsSync(join(dir, ".graph-deps"))
          ? readFileSync(join(dir, ".graph-deps"), "utf8")
          : null;
        throw new Error("npm crashed mid-install");
      });
      ensureGraphDeps(baseDeps({ runNpm, runHeal: () => {}, warnFn: () => {} }));
      // The marker was already gone by the time npm ran (deleted before mutation).
      expect(markerDuringNpm).toBeNull();
      // And it stays absent after the crash → next session retries.
      expect(existsSync(join(dir, ".graph-deps"))).toBe(false);
    });

    it("records a failure attempt on failure, then backs off the NEXT call (no npm re-run)", () => {
      const attemptFile = join(dir, ".graph-deps.attempt");
      // First call fails → records the attempt.
      const runNpm1 = vi.fn(() => { throw new Error("offline"); });
      ensureGraphDeps(baseDeps({ runNpm: runNpm1, runHeal: () => {}, warnFn: () => {} }));
      expect(runNpm1).toHaveBeenCalledTimes(1);
      expect(existsSync(attemptFile)).toBe(true);
      const rec = JSON.parse(readFileSync(attemptFile, "utf8"));
      expect(typeof rec.lastAttemptAt).toBe("number");
      expect(rec.failures).toBe(1);

      // Second call within the backoff window → must SKIP without touching npm.
      const runNpm2 = vi.fn(() => { throw new Error("should not run"); });
      const logFn = vi.fn();
      ensureGraphDeps(baseDeps({ runNpm: runNpm2, runHeal: () => {}, logFn, warnFn: () => {} }));
      expect(runNpm2).not.toHaveBeenCalled();
      expect(logFn).toHaveBeenCalledWith(expect.stringContaining("a recent attempt failed"));
    });

    it("a stale failure attempt (older than the backoff) does NOT block a retry", () => {
      const attemptFile = join(dir, ".graph-deps.attempt");
      // Failure recorded 7h ago — past the 6h backoff.
      writeFileSync(attemptFile, JSON.stringify({ lastAttemptAt: Date.now() - 7 * 60 * 60 * 1000, failures: 3 }));
      const runNpm = vi.fn((s: string[]) => fakeInstall(s));
      ensureGraphDeps(baseDeps({ runNpm, runHeal: () => {} }));
      expect(runNpm).toHaveBeenCalledTimes(1);
    });

    it("a successful provision CLEARS the failure attempt file", () => {
      const attemptFile = join(dir, ".graph-deps.attempt");
      // A stale (past-backoff) failure exists so the retry proceeds.
      writeFileSync(attemptFile, JSON.stringify({ lastAttemptAt: Date.now() - 7 * 60 * 60 * 1000, failures: 2 }));
      ensureGraphDeps(baseDeps({ runNpm: (s: string[]) => fakeInstall(s), runHeal: () => {} }));
      expect(existsSync(join(dir, ".graph-deps"))).toBe(true); // marker written
      expect(existsSync(attemptFile)).toBe(false); // attempt cleared
    });

    it("the healthy fast path never touches the attempt file", () => {
      const attemptFile = join(dir, ".graph-deps.attempt");
      // A recent failure is on disk, but the install is already ready → the
      // fast path returns BEFORE the backoff check, so it must not be consulted
      // or cleared. (Proves the fast-path/marker check stays first.)
      writeFileSync(attemptFile, JSON.stringify({ lastAttemptAt: Date.now(), failures: 9 }));
      fakeInstall(SPECS);
      writeFileSync(join(dir, ".graph-deps"), graphDepsReadyKey(SPECS));
      const runNpm = vi.fn();
      ensureGraphDeps(baseDeps({ runNpm, runHeal: () => {} }));
      expect(runNpm).not.toHaveBeenCalled();
      // Attempt file left exactly as-is (not read, not cleared).
      expect(JSON.parse(readFileSync(attemptFile, "utf8")).failures).toBe(9);
    });

    it("does not clobber an existing package.json", () => {
      // Exercises the `if (!existsSync(pkgPath))` false arm: a prior embeddings
      // install may already have written transformers there.
      const pkgPath = join(dir, "package.json");
      writeFileSync(pkgPath, JSON.stringify({ dependencies: { "@huggingface/transformers": "^3.0.0" } }));
      fakeInstall(SPECS);
      writeFileSync(join(dir, ".graph-deps"), graphDepsReadyKey(SPECS));
      ensureGraphDeps(baseDeps({ runNpm: vi.fn(), runHeal: () => {} }));
      expect(JSON.parse(readFileSync(pkgPath, "utf8")).dependencies["@huggingface/transformers"]).toBe("^3.0.0");
    });
  });

  describe("defaultRunHeal", () => {
    it("throws when the heal script is missing (missing script = failure, not silent success)", () => {
      const missing = join(dir, "no-such-heal.mjs");
      expect(() => defaultRunHeal(dir, missing)).toThrow(/heal script missing/);
      // execFileSync must NOT have been reached — the throw happens on the
      // existsSync gate, before any spawn.
      vi.mocked(execFileSync).mockClear();
      expect(() => defaultRunHeal(dir, missing)).toThrow();
      expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
    });

    it("runs the heal with HIVEMIND_STRICT_POSTINSTALL=1 when the script exists", () => {
      // Use this test file itself as a stand-in "existing script" so the
      // existsSync gate passes; execFileSync is mocked so nothing really runs.
      const present = join(dir, "heal.mjs");
      writeFileSync(present, "// noop");
      vi.mocked(execFileSync).mockClear();
      defaultRunHeal(dir, present);
      const calls = vi.mocked(execFileSync).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe(process.execPath);
      expect(calls[0][1]).toEqual([present]);
      const opts = calls[0][2] as { env?: Record<string, string> };
      expect(opts.env?.HIVEMIND_STRICT_POSTINSTALL).toBe("1");
    });
  });
});
