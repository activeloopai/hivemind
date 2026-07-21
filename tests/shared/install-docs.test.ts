import { describe, expect, it, vi } from "vitest";
import { runInstallDocsOnboarding, type InstallDocsDeps } from "../../src/docs/install-docs.js";
import type { OnboardingResult } from "../../src/docs/onboarding.js";

// A fully-injected, in-memory harness — no git, no graph, no network, no pty.
// Every effect is a spy so we assert the EXACT decision and worker spawn.
function harness(over: Partial<InstallDocsDeps> = {}) {
  const calls: string[] = [];
  const spawned: string[][] = [];
  const onboardResult: { value: OnboardingResult } = { value: { generate: true, auto: false, asked: true } };
  const deps: InstallDocsDeps = {
    cwd: "/work/repo",
    interactive: true,
    loggedIn: true,
    home: "/home/user",
    gitTopLevel: (cwd) => cwd === "/nope" ? null : "/work/repo",
    loadCfg: () => ({ orgId: "org-1", orgName: "Acme" }),
    autoEnabled: () => false,
    buildGraph: async () => { calls.push("build"); },
    onboard: async () => { calls.push("onboard"); return onboardResult.value; },
    spawn: (args) => { calls.push("spawn"); spawned.push(args); return true; },
    showHint: () => { calls.push("hint"); },
    log: () => {},
    warn: () => {},
    ...over,
  };
  return { deps, calls, spawned, onboardResult };
}

describe("runInstallDocsOnboarding — install docs decision + detached spawn", () => {
  it("consent → builds graph THEN spawns the detached wiki worker with the git root", async () => {
    const h = harness();
    const action = await runInstallDocsOnboarding(h.deps);

    expect(action).toEqual({ kind: "spawned", root: "/work/repo" });
    // Order matters: the wiki worker needs the freshly-built snapshot.
    expect(h.calls).toEqual(["build", "onboard", "spawn"]);
    // Spawns the DETACHED wiki worker (async), not inline sync — same as graph init.
    expect(h.spawned).toEqual([["docs", "wiki", "--cwd", "/work/repo"]]);
    expect(h.calls).not.toContain("hint");
  });

  it("auto already enabled → builds (its refresh covers an empty corpus), never re-prompts or double-spawns", async () => {
    const h = harness({ autoEnabled: () => true });
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "already-enabled", root: "/work/repo" });
    // Build runs (its post-build auto-refresh regenerates) but we never ask
    // again or spawn the onboarding workers ourselves.
    expect(h.calls).toEqual(["build"]);
    expect(h.calls).not.toContain("onboard");
    expect(h.spawned).toEqual([]);
  });

  it("decline generate → no graph-blocking generation, nothing spawned", async () => {
    const h = harness();
    h.onboardResult.value = { generate: false, auto: false, asked: true };
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "declined" });
    expect(h.calls).toEqual(["build", "onboard"]); // asked, but never spawned
    expect(h.spawned).toEqual([]);
  });

  it("home-repo guard: git root === $HOME → hint, never prompts/builds/spawns", async () => {
    const h = harness({ gitTopLevel: () => "/home/user" }); // dotfiles repo
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "hint" });
    expect(h.calls).toEqual(["hint"]);
    expect(h.spawned).toEqual([]);
  });

  // (Windows slash-equivalence of the home guard is a property of isHomeRoot's
  // path.resolve normalization; it can't be asserted meaningfully on a POSIX
  // runner, so it's not faked here — see isHomeRoot's own unit test.)

  it("not a git repo → hint, nothing spawned", async () => {
    const h = harness({ cwd: "/nope" });
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "hint" });
    expect(h.spawned).toEqual([]);
  });

  it("not signed in → hint", async () => {
    const h = harness({ loggedIn: false });
    expect((await runInstallDocsOnboarding(h.deps)).kind).toBe("hint");
    expect(h.spawned).toEqual([]);
  });

  it("non-interactive (no TTY) → hint, never asks", async () => {
    const h = harness({ interactive: false });
    expect((await runInstallDocsOnboarding(h.deps)).kind).toBe("hint");
    expect(h.calls).not.toContain("onboard");
  });

  it("consent but no CLI entry to spawn → no-entry, no worker spawned", async () => {
    const h = harness({ spawn: () => false });
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "no-entry", root: "/work/repo" });
    expect(h.spawned).toEqual([]);
  });

  it("no org config → noop (doesn't build or spawn)", async () => {
    const h = harness({ loadCfg: () => null });
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "noop" });
    expect(h.calls).not.toContain("build");
  });

  it("a build/onboarding failure never breaks install — guarded → noop", async () => {
    const warn = vi.fn();
    const h = harness({ buildGraph: async () => { throw new Error("graph boom"); }, warn });
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "noop" });
    expect(warn).toHaveBeenCalledWith("docs setup skipped: graph boom");
    expect(h.spawned).toEqual([]);
  });

  it("a throwing git probe is treated as not-a-repo → hint", async () => {
    const h = harness({ gitTopLevel: () => { throw new Error("git missing"); } });
    const action = await runInstallDocsOnboarding(h.deps);
    expect(action).toEqual({ kind: "hint" });
  });
});
