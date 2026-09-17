import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Update-path coverage for the installers: what a previous version wrote
 * and the current package no longer ships must be gone after install,
 * while everything hivemind does not own in the same directories survives.
 *
 * Observed on a real machine after 0.7.155 -> 0.7.156: hashed esbuild
 * chunks from the old build lingered under bundle/graph-chunks/, a hermes
 * `hivemind-goals` skill written by an old installer kept describing CLI
 * commands that no longer exist, and pi kept a `skilify-worker.js` from
 * before the skillify rename.
 */

let tmpRoot: string;
let tmpHome: string;
let tmpPkg: string;
const execFileSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: (...a: unknown[]) => execFileSyncMock(...a),
}));

function seedPackage(): void {
  const h = join(tmpPkg, "harnesses");
  mkdirSync(join(h, "codex", "bundle", "graph-chunks"), { recursive: true });
  writeFileSync(join(h, "codex", "bundle", "session-start.js"), "// new session-start");
  writeFileSync(join(h, "codex", "bundle", "capture.js"), "// new capture");
  writeFileSync(join(h, "codex", "bundle", "graph-chunks", "graph-NEW.js"), "// new chunk");
  mkdirSync(join(h, "codex", "skills", "deeplake-memory"), { recursive: true });
  writeFileSync(join(h, "codex", "skills", "deeplake-memory", "SKILL.md"), "memory skill");

  mkdirSync(join(h, "hermes", "bundle"), { recursive: true });
  writeFileSync(join(h, "hermes", "bundle", "session-start.js"), "// new session-start");
  mkdirSync(join(h, "hermes", "skills", "hivemind-goals"), { recursive: true });
  writeFileSync(join(h, "hermes", "skills", "hivemind-goals", "SKILL.md"), "goals via `hivemind goal add`");
  mkdirSync(join(tmpPkg, "mcp", "bundle"), { recursive: true });
  writeFileSync(join(tmpPkg, "mcp", "bundle", "server.js"), "// mcp server");

  mkdirSync(join(h, "pi", "extension-source"), { recursive: true });
  writeFileSync(join(h, "pi", "extension-source", "hivemind.ts"), "// extension");
  mkdirSync(join(h, "pi", "bundle"), { recursive: true });
  writeFileSync(join(h, "pi", "bundle", "wiki-worker.js"), "// wiki worker");
  writeFileSync(join(h, "pi", "bundle", "skillify-worker.js"), "// skillify worker");

  writeFileSync(join(tmpPkg, "package.json"), JSON.stringify({ version: "9.9.9" }));
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "hm-prune-"));
  tmpHome = join(tmpRoot, "home");
  tmpPkg = join(tmpRoot, "pkg");
  mkdirSync(join(tmpHome, ".codex"), { recursive: true });
  mkdirSync(join(tmpHome, ".hermes"), { recursive: true });
  seedPackage();
  setFakeHome(tmpHome);
  execFileSyncMock.mockReset();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  clearFakeHome();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importInstaller<T>(mod: string): Promise<T> {
  vi.resetModules();
  vi.doMock("../../src/cli/util.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/cli/util.js")>();
    return { ...actual, pkgRoot: () => tmpPkg };
  });
  return await import(mod) as T;
}

describe("installCodex — update over a previous version", () => {
  it("removes stale hashed chunks and a dropped skill, keeps the live bundle", async () => {
    const pluginDir = join(tmpHome, ".codex", "hivemind");
    mkdirSync(join(pluginDir, "bundle", "graph-chunks"), { recursive: true });
    writeFileSync(join(pluginDir, "bundle", "graph-chunks", "graph-OLD1.js"), "KPIS_COLUMNS");
    writeFileSync(join(pluginDir, "bundle", "graph-chunks", "graph-OLD2.js"), "KPIS_COLUMNS");
    writeFileSync(join(pluginDir, "bundle", "capture.js"), "// old capture");
    mkdirSync(join(pluginDir, "skills", "hivemind-goals"), { recursive: true });
    writeFileSync(join(pluginDir, "skills", "hivemind-goals", "SKILL.md"), "hivemind kpi add");

    const { installCodex } = await importInstaller<typeof import("../../src/cli/install-codex.js")>("../../src/cli/install-codex.js");
    installCodex();

    expect(readdirSync(join(pluginDir, "bundle", "graph-chunks"))).toEqual(["graph-NEW.js"]);
    expect(readFileSync(join(pluginDir, "bundle", "capture.js"), "utf-8")).toBe("// new capture");
    expect(existsSync(join(pluginDir, "bundle", "session-start.js"))).toBe(true);
    expect(readdirSync(join(pluginDir, "skills"))).toEqual(["deeplake-memory"]);
    expect(readFileSync(join(pluginDir, ".hivemind_version"), "utf-8")).toBe("9.9.9");
  });

  it("fresh install produces the same layout as an update", async () => {
    const { installCodex } = await importInstaller<typeof import("../../src/cli/install-codex.js")>("../../src/cli/install-codex.js");
    installCodex();
    const pluginDir = join(tmpHome, ".codex", "hivemind");
    expect(readdirSync(join(pluginDir, "bundle")).sort()).toEqual(["capture.js", "graph-chunks", "session-start.js"]);
    expect(readdirSync(join(pluginDir, "bundle", "graph-chunks"))).toEqual(["graph-NEW.js"]);
    expect(lstatSync(join(tmpHome, ".agents", "skills", "hivemind-memory")).isSymbolicLink()).toBe(true);
  });
});

describe("installHermes — update over a previous version", () => {
  const skillsRoot = () => join(tmpHome, ".hermes", "skills");

  it("replaces the stale hivemind-goals skill with the shipped one and prunes the old templates/ dir", async () => {
    mkdirSync(join(skillsRoot(), "hivemind-goals"), { recursive: true });
    writeFileSync(join(skillsRoot(), "hivemind-goals", "SKILL.md"), "goals + KPIs: hivemind kpi add|list|bump");
    mkdirSync(join(skillsRoot(), "hivemind-memory", "templates"), { recursive: true });
    writeFileSync(join(skillsRoot(), "hivemind-memory", "templates", "kpi.md"), "# {{KPI_NAME}}");
    writeFileSync(join(skillsRoot(), "hivemind-memory", "SKILL.md"), "old body");

    const { installHermes } = await importInstaller<typeof import("../../src/cli/install-hermes.js")>("../../src/cli/install-hermes.js");
    installHermes();

    expect(readFileSync(join(skillsRoot(), "hivemind-goals", "SKILL.md"), "utf-8")).toBe("goals via `hivemind goal add`");
    expect(readFileSync(join(skillsRoot(), "hivemind-goals", "SKILL.md"), "utf-8")).not.toContain("kpi");
    expect(readdirSync(join(skillsRoot(), "hivemind-memory")).sort()).toEqual([".hivemind_version", "SKILL.md"]);
    expect(readFileSync(join(skillsRoot(), "hivemind-memory", "SKILL.md"), "utf-8")).toContain("name: hivemind-memory");
  });

  it("leaves user skills alone: a skillify symlink, a plain user dir and a symlink at a hivemind skill name", async () => {
    const userSkill = join(tmpRoot, "user-skill");
    mkdirSync(userSkill);
    writeFileSync(join(userSkill, "SKILL.md"), "user content");
    mkdirSync(skillsRoot(), { recursive: true });
    symlinkSync(userSkill, join(skillsRoot(), "deploy-notes--alice"));
    mkdirSync(join(skillsRoot(), "my-own-skill"));
    writeFileSync(join(skillsRoot(), "my-own-skill", "SKILL.md"), "mine");
    // A user pointed the hivemind-goals name at their own dir: not ours to rewrite.
    symlinkSync(userSkill, join(skillsRoot(), "hivemind-goals"));

    const { installHermes } = await importInstaller<typeof import("../../src/cli/install-hermes.js")>("../../src/cli/install-hermes.js");
    installHermes();

    expect(lstatSync(join(skillsRoot(), "deploy-notes--alice")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(skillsRoot(), "my-own-skill", "SKILL.md"), "utf-8")).toBe("mine");
    expect(lstatSync(join(skillsRoot(), "hivemind-goals")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(userSkill, "SKILL.md"), "utf-8")).toBe("user content");
    expect(readdirSync(userSkill)).toEqual(["SKILL.md"]);
  });

  it("uninstall removes the shipped skill dirs and nothing else", async () => {
    mkdirSync(join(skillsRoot(), "my-own-skill"), { recursive: true });
    const { installHermes, uninstallHermes } = await importInstaller<typeof import("../../src/cli/install-hermes.js")>("../../src/cli/install-hermes.js");
    installHermes();
    expect(readdirSync(skillsRoot()).sort()).toEqual(["hivemind-goals", "hivemind-memory", "my-own-skill"]);
    uninstallHermes();
    expect(readdirSync(skillsRoot())).toEqual(["my-own-skill"]);
  });
});

describe("installPi — update over a previous version", () => {
  it("removes a worker the current bundle no longer ships", async () => {
    const workersDir = join(tmpHome, ".pi", "agent", "hivemind");
    mkdirSync(workersDir, { recursive: true });
    writeFileSync(join(workersDir, "skilify-worker.js"), "// pre-rename worker");
    writeFileSync(join(workersDir, "wiki-worker.js"), "// old wiki worker");

    const { installPi } = await importInstaller<typeof import("../../src/cli/install-pi.js")>("../../src/cli/install-pi.js");
    installPi();

    expect(readdirSync(workersDir).sort()).toEqual(["skillify-worker.js", "wiki-worker.js"]);
    expect(readFileSync(join(workersDir, "wiki-worker.js"), "utf-8")).toBe("// wiki worker");
  });
});
