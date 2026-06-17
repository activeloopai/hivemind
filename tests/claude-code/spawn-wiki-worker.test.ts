import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { spawnWikiWorker, bundleDirFromImportMeta, findClaudeBin } from "../../src/hooks/spawn-wiki-worker.js";
import {
  spawnCodexWikiWorker,
  findCodexBin,
  bundleDirFromImportMeta as codexBundleDir,
} from "../../src/hooks/codex/spawn-wiki-worker.js";
import {
  spawnCursorWikiWorker,
  findCursorBin,
  bundleDirFromImportMeta as cursorBundleDir,
} from "../../src/hooks/cursor/spawn-wiki-worker.js";
import {
  spawnHermesWikiWorker,
  findHermesBin,
  bundleDirFromImportMeta as hermesBundleDir,
} from "../../src/hooks/hermes/spawn-wiki-worker.js";
import type { Config } from "../../src/config.js";

/**
 * Per-agent guard for the spawn-wiki-worker helpers.
 *
 * Each spawn helper:
 *   1. Reads the installed plugin version via getInstalledVersion(bundleDir, manifestDir)
 *      — the manifest dir differs per agent (".claude-plugin" / ".codex-plugin").
 *   2. Writes a config.json the detached worker reads at startup.
 *   3. Spawns `<node> <worker.js> <config.json>` detached, via the shared
 *      spawnDetachedNodeWorker helper. Cross-platform: it invokes the node
 *      binary directly (process.execPath), NOT `nohup node ...` — `nohup` is
 *      absent on Windows and the old form crashed the hook there with an
 *      unhandled async ENOENT. See src/utils/spawn-detached.ts.
 *
 * The thing the e2e on test_plugin couldn't directly observe is whether
 * pluginVersion actually lands in config.json for every agent. A regression
 * here would silently ship "" through to the worker → "" in plugin_version
 * on every summary row, with the e2e only catching it if we check that
 * specific column for that specific agent's worker output.
 *
 * Tests mock the `child_process.spawn` boundary so no actual subprocess
 * launches; the config.json on disk is the assertion target.
 */

// Capture spawn calls so we can verify what the agent would have spawned
// without actually running it.
const spawnCalls: Array<{ cmd: string; args: readonly string[] }> = [];
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    // Delegate to the real execSync by default (the find*Bin "usable string"
    // tests rely on real `which` behavior); individual tests override per-call
    // with mock*Once to deterministically hit the resolve/fallback branches.
    execSync: vi.fn((...args: Parameters<typeof actual.execSync>) => actual.execSync(...args)),
    // find*Bin now delegates to resolveCliBin(), which probes the CLI via
    // execFileSync("which"/"where", [cli]). Delegate to the real impl by
    // default; per-agent resolver tests override per-call.
    execFileSync: vi.fn((...args: Parameters<typeof actual.execFileSync>) => actual.execFileSync(...args)),
    spawn: vi.fn((cmd: string, args: readonly string[]) => {
      spawnCalls.push({ cmd, args });
      // Match the surface the production code touches: a child object with
      // `.on("error", ...)` (the helper installs an async-ENOENT absorber
      // before unref'ing) and `.unref()`. `.on` returns the child for chaining.
      const child: { on: () => typeof child; unref: () => void } = {
        on: () => child,
        unref: () => {},
      };
      return child as unknown as ReturnType<typeof actual.spawn>;
    }),
  };
});

// Stub HOME so the helpers don't write into the developer's real ~/.claude.
let originalHome: string | undefined;
let fakeHome: string;
let scratchRoot: string;

beforeEach(() => {
  spawnCalls.length = 0;
  scratchRoot = mkdtempSync(join(tmpdir(), "hm-spawn-test-"));
  fakeHome = join(scratchRoot, "home");
  mkdirSync(fakeHome, { recursive: true });
  originalHome = process.env.HOME;
  process.env.HOME = fakeHome;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(scratchRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

interface PlantedBundle {
  bundleDir: string;
  pluginVersion: string;
}

/**
 * Place a bundle dir under a tmp PLUGIN_DIR with the right manifest layout
 * so getInstalledVersion(bundleDir, manifestDir) resolves to the planted
 * version via the first lookup branch (manifest plugin.json).
 */
function plantBundle(manifestDir: string, version = "9.9.9"): PlantedBundle {
  const pluginDir = join(scratchRoot, `plugin-${Math.random().toString(36).slice(2)}`);
  const bundleDir = join(pluginDir, "bundle");
  mkdirSync(bundleDir, { recursive: true });
  mkdirSync(join(pluginDir, manifestDir), { recursive: true });
  writeFileSync(join(pluginDir, manifestDir, "plugin.json"), JSON.stringify({ version }));
  return { bundleDir, pluginVersion: version };
}

function fakeConfig(): Config {
  return {
    token: "tok",
    orgId: "org-1",
    orgName: "acme",
    userName: "alice",
    workspaceId: "default",
    apiUrl: "https://api.example",
    tableName: "memory",
    sessionsTableName: "sessions",
    skillsTableName: "skills",
    rulesTableName: "hivemind_rules",
    goalsTableName: "hivemind_goals",
    kpisTableName: "hivemind_kpis",
    codebaseTableName: "codebase",
    memoryPath: "/tmp/fake-memory",
  };
}

function readSpawnedConfig(): Record<string, unknown> {
  expect(spawnCalls).toHaveLength(1);
  // argv is now [workerPath, configPath] (spawn(node, [worker, config])),
  // so the config path is index 1 — previously index 2 under `nohup node ...`.
  const [, configPath] = spawnCalls[0].args;
  return JSON.parse(readFileSync(configPath as string, "utf-8"));
}

describe("spawnWikiWorker (claude-code) — plugin_version threading", () => {
  it("writes the resolved plugin version into the spawn config", () => {
    const { bundleDir, pluginVersion } = plantBundle(".claude-plugin", "1.2.3");
    spawnWikiWorker({
      config: fakeConfig(),
      sessionId: "s-cc",
      cwd: "/work/repo",
      bundleDir,
      reason: "TestSpawn",
    });
    const cfg = readSpawnedConfig();
    expect(cfg.pluginVersion).toBe(pluginVersion);
    // Project name is derived from cwd basename.
    expect(cfg.project).toBe("repo");
    // Session id and table names propagate.
    expect(cfg.sessionId).toBe("s-cc");
    expect(cfg.memoryTable).toBe("memory");
    expect(cfg.sessionsTable).toBe("sessions");
  });

  it("falls back to '' when the bundle has no resolvable manifest (so the column gets DEFAULT '')", () => {
    // Empty bundle dir under scratchRoot — no .claude-plugin, no .hivemind_version,
    // and no parent package.json with a hivemind name within the walk budget.
    const bundleDir = join(scratchRoot, "orphan", "bundle");
    mkdirSync(bundleDir, { recursive: true });
    spawnWikiWorker({
      config: fakeConfig(),
      sessionId: "s-orphan",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    const cfg = readSpawnedConfig();
    expect(cfg.pluginVersion).toBe("");
  });

  // The spawn config.json carries the Activeloop token in cleartext and is
  // staged in the shared, predictable tmpdir. Its parent dir must be 0o700 and
  // the file itself 0o600 so no other user on the host can read the token.
  // POSIX-only: Windows ignores Unix mode bits.
  it.skipIf(process.platform === "win32")(
    "writes the token config 0o600 inside a 0o700 dir (no group/other access)",
    () => {
      const { bundleDir } = plantBundle(".claude-plugin");
      spawnWikiWorker({
        config: fakeConfig(),
        sessionId: "s-mode",
        cwd: "/work/x",
        bundleDir,
        reason: "TestSpawn",
      });
      expect(spawnCalls).toHaveLength(1);
      const configPath = spawnCalls[0].args[1] as string;

      const fileMode = statSync(configPath).mode & 0o777;
      expect(fileMode).toBe(0o600);
      // Defense-in-depth: explicitly assert no group/other bits leaked.
      expect(fileMode & 0o077).toBe(0);

      const dirMode = statSync(dirname(configPath)).mode & 0o777;
      expect(dirMode).toBe(0o700);
      expect(dirMode & 0o077).toBe(0);
    },
  );

  it("spawns the node binary directly (NOT nohup) with worker + config path", () => {
    const { bundleDir } = plantBundle(".claude-plugin");
    spawnWikiWorker({
      config: fakeConfig(),
      sessionId: "s-spawn",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    expect(spawnCalls).toHaveLength(1);
    const [{ cmd, args }] = spawnCalls;
    // Cross-platform fix: invoke node via process.execPath, never `nohup`
    // (which ENOENT-crashes the hook on Windows). argv = [worker, config].
    expect(cmd).toBe(process.execPath);
    expect(cmd).not.toBe("nohup");
    expect(args[0]).toBe(join(bundleDir, "wiki-worker.js"));
    expect((args[1] as string).endsWith("config.json")).toBe(true);
  });
});

describe("spawnCodexWikiWorker — uses .codex-plugin manifest", () => {
  it("resolves plugin version from .codex-plugin and threads it through", () => {
    const { bundleDir, pluginVersion } = plantBundle(".codex-plugin", "4.5.6");
    spawnCodexWikiWorker({
      config: fakeConfig(),
      sessionId: "s-codex",
      cwd: "/work/proj",
      bundleDir,
      reason: "TestSpawn",
    });
    const cfg = readSpawnedConfig();
    expect(cfg.pluginVersion).toBe(pluginVersion);
    // Codex config carries `codexBin` instead of claudeBin — sanity check the
    // surrounding shape didn't drift when threading pluginVersion.
    expect(typeof cfg.codexBin).toBe("string");
  });

  it("does NOT resolve from .claude-plugin (regression guard for manifest mix-up)", () => {
    // Plant .claude-plugin with a wrong version; codex must ignore it.
    const { bundleDir } = plantBundle(".claude-plugin", "0.0.1");
    spawnCodexWikiWorker({
      config: fakeConfig(),
      sessionId: "s-codex-wrong",
      cwd: "/work/proj",
      bundleDir,
      reason: "TestSpawn",
    });
    const cfg = readSpawnedConfig();
    // .codex-plugin missing → falls through to walk-up; the planted
    // claude-plugin manifest must NOT be picked up.
    expect(cfg.pluginVersion).not.toBe("0.0.1");
  });
});

describe("spawnCursorWikiWorker — plugin_version threading", () => {
  it("writes pluginVersion + cursor-specific fields into the spawn config", () => {
    const { bundleDir, pluginVersion } = plantBundle(".claude-plugin", "7.8.9");
    spawnCursorWikiWorker({
      config: fakeConfig(),
      sessionId: "s-cur",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    const cfg = readSpawnedConfig();
    expect(cfg.pluginVersion).toBe(pluginVersion);
    expect(typeof cfg.cursorBin).toBe("string");
    expect(typeof cfg.cursorModel).toBe("string");
  });
});

describe("spawnHermesWikiWorker — plugin_version threading", () => {
  it("writes pluginVersion + hermes-specific fields into the spawn config", () => {
    const { bundleDir, pluginVersion } = plantBundle(".claude-plugin", "3.3.3");
    spawnHermesWikiWorker({
      config: fakeConfig(),
      sessionId: "s-her",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    const cfg = readSpawnedConfig();
    expect(cfg.pluginVersion).toBe(pluginVersion);
    expect(typeof cfg.hermesBin).toBe("string");
    expect(typeof cfg.hermesProvider).toBe("string");
    expect(typeof cfg.hermesModel).toBe("string");
  });
});

describe("bundleDirFromImportMeta", () => {
  // Each agent ships its own copy of this helper; assert every copy resolves
  // the parent dir of the entry module (mirrors how each hook bootstrap calls
  // it) so no copy drifts or goes uncovered.
  const fakeUrl = "file:///path/to/some/bundle/capture.js";
  it.each([
    ["claude", bundleDirFromImportMeta],
    ["codex", codexBundleDir],
    ["cursor", cursorBundleDir],
    ["hermes", hermesBundleDir],
  ])("%s: returns the directory containing the entry module", (_agent, fn) => {
    expect(fn(fakeUrl)).toBe("/path/to/some/bundle");
  });
});

describe("findClaudeBin", () => {
  it("returns a non-empty string (resolved bin path or fallback)", () => {
    // findClaudeBin shells out to `which claude`; in CI / dev that may or
    // may not exist. Either way, the function must return a usable string
    // (the resolved path on success, the home-relative fallback on
    // failure). Asserting non-empty exercises both branches across
    // environments.
    const bin = findClaudeBin();
    expect(typeof bin).toBe("string");
    expect(bin.length).toBeGreaterThan(0);
  });
});

describe("per-agent bin resolvers", () => {
  // Each agent's find<Agent>Bin now delegates to resolveCliBin(cli, fallback),
  // which probes the CLI cross-platform via execFileSync("which"/"where", [cli])
  // — `which` on the (Linux) test host — and falls back to the literal CLI name.
  // [agent, resolver, literal-fallback, expected cli arg] — the last column
  // pins each resolver to the RIGHT CLI name so a copy probing the wrong binary
  // (e.g. cursor probing `codex`) is caught.
  const RESOLVERS: Array<[string, () => string, string, string]> = [
    ["codex", findCodexBin, "codex", "codex"],
    ["cursor", findCursorBin, "cursor-agent", "cursor-agent"],
    ["hermes", findHermesBin, "hermes", "hermes"],
  ];

  it.each(RESOLVERS)("find%sBin returns the resolved path when the lookup succeeds", (_n, fn, _fallback, cli) => {
    vi.mocked(execFileSync).mockReturnValueOnce("/usr/local/bin/the-cli\n");
    expect(fn()).toBe("/usr/local/bin/the-cli");
    expect(execFileSync).toHaveBeenCalledWith("which", [cli], { encoding: "utf-8" });
  });

  it.each(RESOLVERS)("find%sBin falls back to the literal name when the lookup fails", (_n, fn, fallback, cli) => {
    vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error("not found"); });
    expect(fn()).toBe(fallback);
    expect(execFileSync).toHaveBeenCalledWith("which", [cli], { encoding: "utf-8" });
  });

  it.each(RESOLVERS)(
    "find%sBin falls back to the literal name when the lookup prints no matches",
    (_n, fn, fallback) => {
      vi.mocked(execFileSync).mockReturnValueOnce("  \n");
      expect(fn()).toBe(fallback);
    },
  );
});

describe("per-agent plugin_version fallback to '' (orphan bundle)", () => {
  // Mirrors the claude-code orphan-bundle test for the forked copies: an
  // unresolvable manifest must thread "" so the DB column gets DEFAULT ''.
  // Covers the right-hand side of `getInstalledVersion(...) ?? ""`.
  it("cursor threads '' when the bundle has no resolvable manifest", () => {
    const bundleDir = join(scratchRoot, "orphan-cursor", "bundle");
    mkdirSync(bundleDir, { recursive: true });
    spawnCursorWikiWorker({
      config: fakeConfig(),
      sessionId: "s-cur-orphan",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    expect(readSpawnedConfig().pluginVersion).toBe("");
  });

  it("hermes threads '' when the bundle has no resolvable manifest", () => {
    const bundleDir = join(scratchRoot, "orphan-hermes", "bundle");
    mkdirSync(bundleDir, { recursive: true });
    spawnHermesWikiWorker({
      config: fakeConfig(),
      sessionId: "s-her-orphan",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    expect(readSpawnedConfig().pluginVersion).toBe("");
  });
});

describe("agent model/provider env-var overrides (non-default branch)", () => {
  // The default-branch (env unset → built-in default) is covered by the
  // spawn tests above; here we set the env vars so the `?? default` short-
  // circuits to the override side, covering the other branch.
  afterEach(() => {
    delete process.env.HIVEMIND_CURSOR_MODEL;
    delete process.env.HIVEMIND_HERMES_PROVIDER;
    delete process.env.HIVEMIND_HERMES_MODEL;
  });

  it("cursor threads HIVEMIND_CURSOR_MODEL into the spawn config", () => {
    process.env.HIVEMIND_CURSOR_MODEL = "gpt-5-codex";
    const { bundleDir } = plantBundle(".claude-plugin");
    spawnCursorWikiWorker({
      config: fakeConfig(),
      sessionId: "s-cur-env",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    expect(readSpawnedConfig().cursorModel).toBe("gpt-5-codex");
  });

  it("hermes threads HIVEMIND_HERMES_PROVIDER and HIVEMIND_HERMES_MODEL into the spawn config", () => {
    process.env.HIVEMIND_HERMES_PROVIDER = "anthropic";
    process.env.HIVEMIND_HERMES_MODEL = "claude-opus-4-8";
    const { bundleDir } = plantBundle(".claude-plugin");
    spawnHermesWikiWorker({
      config: fakeConfig(),
      sessionId: "s-her-env",
      cwd: "/work/x",
      bundleDir,
      reason: "TestSpawn",
    });
    const cfg = readSpawnedConfig();
    expect(cfg.hermesProvider).toBe("anthropic");
    expect(cfg.hermesModel).toBe("claude-opus-4-8");
  });
});
