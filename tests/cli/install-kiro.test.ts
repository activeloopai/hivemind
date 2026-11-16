import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Tests for src/cli/install-kiro.ts.
 *
 * Kiro reads MCP connectors from ~/.kiro/settings/mcp.json.
 * The installer must merge non-destructively: a user may already have other
 * MCP servers registered (bettervibe, supabase, posthog, etc.).
 * Critical regressions to guard: (a) clobbering the file, (b) leaving a
 * stale hivemind entry on uninstall.
 */

let tmpRoot: string;
let tmpHome: string;
let tmpPkg: string;
let configPath: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "hm-kiro-"));
  tmpHome = join(tmpRoot, "home");
  tmpPkg = join(tmpRoot, "pkg");
  mkdirSync(tmpHome, { recursive: true });
  mkdirSync(join(tmpPkg, "mcp", "bundle"), { recursive: true });
  writeFileSync(join(tmpPkg, "mcp", "bundle", "server.js"), "// fake server");
  writeFileSync(join(tmpPkg, "package.json"), JSON.stringify({ version: "5.5.5" }));

  setFakeHome(tmpHome);
  configPath = join(tmpHome, ".kiro", "settings", "mcp.json");
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  clearFakeHome();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importKiro(): Promise<typeof import("../../src/cli/install-kiro.js")> {
  vi.resetModules();
  vi.doMock("../../src/cli/util.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/cli/util.js")>();
    return { ...actual, pkgRoot: () => tmpPkg };
  });
  return await import("../../src/cli/install-kiro.js");
}

function readConfig(): Record<string, any> {
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

describe("installKiro", () => {
  it("creates the config and registers the hivemind stdio MCP server", async () => {
    const { installKiro } = await importKiro();
    if (process.platform === "win32") return;

    installKiro();

    expect(existsSync(configPath)).toBe(true);
    const cfg = readConfig();
    expect(cfg.mcpServers.hivemind).toEqual({
      command: "node",
      args: [join(tmpHome, ".hivemind", "mcp", "server.js")],
    });
    expect(existsSync(join(tmpHome, ".hivemind", "mcp", "server.js"))).toBe(true);
  });

  it("merges non-destructively — preserves other MCP servers", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".kiro", "settings"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          bettervibe: { command: "npx", args: ["-y", "bettervibe"] },
          supabase: { command: "npx", args: ["-y", "@supabase/mcp-server"] },
        },
      }),
    );

    const { installKiro } = await importKiro();
    installKiro();

    const cfg = readConfig();
    expect(cfg.mcpServers.bettervibe).toEqual({ command: "npx", args: ["-y", "bettervibe"] });
    expect(cfg.mcpServers.supabase).toEqual({ command: "npx", args: ["-y", "@supabase/mcp-server"] });
    expect(cfg.mcpServers.hivemind.command).toBe("node");
  });

  it("is idempotent — running twice yields exactly one hivemind entry", async () => {
    if (process.platform === "win32") return;
    const { installKiro } = await importKiro();
    installKiro();
    const first = readConfig();
    installKiro();
    const second = readConfig();
    expect(second).toEqual(first);
    expect(Object.keys(second.mcpServers).filter((k: string) => k === "hivemind")).toHaveLength(1);
  });

  it("refuses to clobber a malformed config and surfaces a clear error", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".kiro", "settings"), { recursive: true });
    writeFileSync(configPath, "{ not valid json ");

    const { installKiro } = await importKiro();
    expect(() => installKiro()).toThrow(
      `mcp.json at ${configPath} is not valid JSON. Fix or remove it, then rerun.`,
    );
    expect(readFileSync(configPath, "utf-8")).toBe("{ not valid json ");
  });
});

describe("uninstallKiro", () => {
  it("removes only the hivemind entry, preserving other servers", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".kiro", "settings"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          hivemind: { command: "node", args: ["/x/server.js"] },
          bettervibe: { command: "npx", args: ["-y", "bettervibe"] },
        },
      }),
    );

    const { uninstallKiro } = await importKiro();
    uninstallKiro();

    const cfg = readConfig();
    expect(cfg.mcpServers.hivemind).toBeUndefined();
    expect(cfg.mcpServers.bettervibe).toEqual({ command: "npx", args: ["-y", "bettervibe"] });
  });

  it("deletes the file when hivemind was its only content", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".kiro", "settings"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { hivemind: { command: "node", args: ["/x"] } } }),
    );

    const { uninstallKiro } = await importKiro();
    uninstallKiro();
    expect(existsSync(configPath)).toBe(false);
  });

  it("is a no-op when no config file exists", async () => {
    const { uninstallKiro } = await importKiro();
    expect(() => uninstallKiro()).not.toThrow();
  });

  it("is a no-op when hivemind is not in the config", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".kiro", "settings"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { bettervibe: { command: "npx", args: [] } } }),
    );

    const { uninstallKiro } = await importKiro();
    uninstallKiro();

    const cfg = readConfig();
    expect(cfg.mcpServers.bettervibe).toBeDefined();
  });
});
