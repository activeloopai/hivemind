import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

const fsFault = vi.hoisted(() => ({
  path: "",
  error: null as NodeJS.ErrnoException | null,
}));
const graphDeps = vi.hoisted(() => ({ ensureGraphDeps: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (path: unknown, ...args: unknown[]) => {
      if (path === fsFault.path && fsFault.error) throw fsFault.error;
      return (actual.readFileSync as (...inner: unknown[]) => unknown)(path, ...args);
    },
  };
});

vi.mock("../../src/cli/graph-deps.js", () => graphDeps);

const HOME_DIR = mkdtempSync(join(tmpdir(), "emb-config-preflight-home-"));
let mod: typeof import("../../src/cli/embeddings.js");
let cfg: typeof import("../../src/user-config.js");
let processKill: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  setFakeHome(HOME_DIR);
  mod = await import("../../src/cli/embeddings.js");
  cfg = await import("../../src/user-config.js");
});

beforeEach(() => {
  for (const sub of [".hivemind", ".deeplake", ".codex", ".cursor", ".hermes", ".claude"]) {
    rmSync(join(HOME_DIR, sub), { recursive: true, force: true });
  }
  cfg._resetUserConfigForTesting();
  cfg._setConfigPathForTesting(() => join(HOME_DIR, ".deeplake", "config.json"));
  mkdirSync(join(HOME_DIR, ".deeplake"), { recursive: true });
  fsFault.path = "";
  fsFault.error = null;
  graphDeps.ensureGraphDeps.mockClear();
  vi.mocked(execFileSync).mockClear();
  processKill = vi.spyOn(process, "kill").mockImplementation(() => true);
});

afterEach(() => {
  processKill.mockRestore();
});

afterAll(() => {
  cfg._resetUserConfigForTesting();
  clearFakeHome();
  rmSync(HOME_DIR, { recursive: true, force: true });
  vi.resetModules();
});

function seedFixture(configBytes: string): { configPath: string; linkPath: string; sharedPayloadPath: string; linkInode: number } {
  const configPath = join(HOME_DIR, ".deeplake", "config.json");
  writeFileSync(configPath, configBytes);
  const sharedPayloadPath = join(mod.SHARED_DIR, "fixture-payload.bin");
  mkdirSync(join(mod.SHARED_NODE_MODULES, mod.TRANSFORMERS_PKG), { recursive: true });
  writeFileSync(sharedPayloadPath, "shared payload stays byte-for-byte");
  const pluginDir = join(HOME_DIR, ".codex", "hivemind");
  mkdirSync(join(pluginDir, "bundle"), { recursive: true });
  const linkPath = join(pluginDir, "node_modules");
  symlinkSync(mod.SHARED_NODE_MODULES, linkPath);
  return { configPath, linkPath, sharedPayloadPath, linkInode: lstatSync(linkPath).ino };
}

describe("heavy embeddings config preflight", () => {
  it.each([
    ["install", "{ malformed"],
    ["uninstall", "{ malformed"],
  ])("rejects malformed config before %s mutation", (operation, configBytes) => {
    const fixture = seedFixture(configBytes);

    expect(() => operation === "install"
      ? mod.installEmbeddings()
      : mod.uninstallEmbeddings({ prune: true })).toThrow(/not valid JSON/);
    expect(readFileSync(fixture.configPath, "utf-8")).toBe(configBytes);
    expect(readFileSync(fixture.sharedPayloadPath, "utf-8")).toBe("shared payload stays byte-for-byte");
    expect(existsSync(mod.SHARED_DIR)).toBe(true);
    expect(lstatSync(fixture.linkPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(fixture.linkPath)).toBe(mod.SHARED_NODE_MODULES);
    expect(lstatSync(fixture.linkPath).ino).toBe(fixture.linkInode);
    expect(graphDeps.ensureGraphDeps).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
    expect(processKill).not.toHaveBeenCalled();
  });

  it.each(["install", "uninstall"])("rejects injected config read errors before %s mutation", (operation) => {
    const fixture = seedFixture(JSON.stringify({ embeddings: { enabled: true } }));
    fsFault.path = fixture.configPath;
    fsFault.error = Object.assign(new Error("injected config read failure"), { code: "EIO" });

    expect(() => operation === "install"
      ? mod.installEmbeddings()
      : mod.uninstallEmbeddings({ prune: true })).toThrow(/could not be read.*injected config read failure/);
    fsFault.error = null;
    expect(readFileSync(fixture.configPath, "utf-8")).toBe(JSON.stringify({ embeddings: { enabled: true } }));
    expect(readFileSync(fixture.sharedPayloadPath, "utf-8")).toBe("shared payload stays byte-for-byte");
    expect(existsSync(mod.SHARED_DIR)).toBe(true);
    expect(lstatSync(fixture.linkPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(fixture.linkPath)).toBe(mod.SHARED_NODE_MODULES);
    expect(lstatSync(fixture.linkPath).ino).toBe(fixture.linkInode);
    expect(graphDeps.ensureGraphDeps).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
    expect(processKill).not.toHaveBeenCalled();
  });

  it("allows install with a valid config and existing payload/link", () => {
    const config = { docs: { llmAgent: "codex" }, embeddings: { enabled: false } };
    const fixture = seedFixture(JSON.stringify(config));

    mod.installEmbeddings();

    expect(JSON.parse(readFileSync(fixture.configPath, "utf-8"))).toEqual({
      docs: { llmAgent: "codex" },
      embeddings: { enabled: true },
    });
    expect(readFileSync(fixture.sharedPayloadPath, "utf-8")).toBe("shared payload stays byte-for-byte");
    expect(lstatSync(fixture.linkPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(fixture.linkPath)).toBe(mod.SHARED_NODE_MODULES);
    expect(graphDeps.ensureGraphDeps).toHaveBeenCalledTimes(1);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("allows prune-uninstall with a valid config and existing payload/link", () => {
    const config = { docs: { llmAgent: "codex" }, embeddings: { enabled: true } };
    const fixture = seedFixture(JSON.stringify(config));

    mod.uninstallEmbeddings({ prune: true });

    expect(JSON.parse(readFileSync(fixture.configPath, "utf-8"))).toEqual({
      docs: { llmAgent: "codex" },
      embeddings: { enabled: false },
    });
    expect(existsSync(fixture.linkPath)).toBe(false);
    expect(existsSync(fixture.sharedPayloadPath)).toBe(false);
    expect(existsSync(mod.SHARED_DIR)).toBe(false);
    expect(graphDeps.ensureGraphDeps).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
