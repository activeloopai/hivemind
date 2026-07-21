import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Tests for src/cli/install-cowork.ts — the Claude Cowork integration.
 *
 * Cowork reads MCP connectors from Claude Desktop's claude_desktop_config.json
 * (`mcpServers` key). The installer must MERGE non-destructively: a user may
 * already have hand-added connectors and unrelated top-level config. The
 * critical regressions to guard are (a) clobbering that file and (b) leaving
 * a stale hivemind entry on uninstall.
 */

let tmpRoot: string;
let tmpHome: string;
let tmpPkg: string;
let configPath: string;

beforeEach(() => {
  // mkdtempSync atomically creates a uniquely-named dir under the OS temp dir.
  // Using it (rather than join(tmpdir(), <handmade name>)) is the pattern CodeQL
  // accepts — it sanitizes the predictable-path taint, clearing the "insecure
  // temporary file" alerts for every path derived from this root.
  tmpRoot = mkdtempSync(join(tmpdir(), "hm-cowork-"));
  tmpHome = join(tmpRoot, "home");
  tmpPkg = join(tmpRoot, "pkg");
  mkdirSync(tmpHome, { recursive: true });
  mkdirSync(join(tmpPkg, "mcp", "bundle"), { recursive: true });
  writeFileSync(join(tmpPkg, "mcp", "bundle", "server.js"), "// fake server");
  writeFileSync(join(tmpPkg, "package.json"), JSON.stringify({ version: "5.5.5" }));

  setFakeHome(tmpHome);
  // Linux/macOS test runners: config dir is ~/.config/Claude. (On Windows CI
  // os.homedir() + the helper keep this under tmpHome too.)
  configPath = join(tmpHome, ".config", "Claude", "claude_desktop_config.json");
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  clearFakeHome();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importCowork(): Promise<typeof import("../../src/cli/install-cowork.js")> {
  vi.resetModules();
  vi.doMock("../../src/cli/util.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/cli/util.js")>();
    return { ...actual, pkgRoot: () => tmpPkg };
  });
  return await import("../../src/cli/install-cowork.js");
}

function readConfig(): Record<string, any> {
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

describe("installCowork", () => {
  it("creates the config and registers the hivemind stdio MCP server", async () => {
    const { installCowork } = await importCowork();
    // Only run on platforms where the path math matches our assertion. On the
    // POSIX CI runner process.platform is linux/darwin → ~/.config|Library.
    if (process.platform === "win32") return;

    installCowork();

    expect(existsSync(configPath)).toBe(true);
    const cfg = readConfig();
    expect(cfg.mcpServers.hivemind).toEqual({
      command: "node",
      args: [join(tmpHome, ".hivemind", "mcp", "server.js")],
    });
    // The shared MCP server binary must also have been installed.
    expect(existsSync(join(tmpHome, ".hivemind", "mcp", "server.js"))).toBe(true);
  });

  it("merges non-destructively — preserves other servers and top-level keys", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".config", "Claude"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: { other: { command: "other-bin", args: ["--x"] } },
        globalShortcut: "Cmd+Shift+Space",
      }),
    );

    const { installCowork } = await importCowork();
    installCowork();

    const cfg = readConfig();
    expect(cfg.mcpServers.other).toEqual({ command: "other-bin", args: ["--x"] });
    expect(cfg.mcpServers.hivemind.command).toBe("node");
    expect(cfg.globalShortcut).toBe("Cmd+Shift+Space");
  });

  it("is idempotent — twice yields exactly one hivemind entry", async () => {
    if (process.platform === "win32") return;
    const { installCowork } = await importCowork();
    installCowork();
    const first = readConfig();
    installCowork();
    const second = readConfig();
    expect(second).toEqual(first);
    expect(Object.keys(second.mcpServers)).toEqual(["hivemind"]);
  });

  it("refuses to clobber a malformed config and surfaces a clear error", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".config", "Claude"), { recursive: true });
    writeFileSync(configPath, "{ not valid json ");

    const { installCowork } = await importCowork();
    // Assert the full actionable message (path included), not just a substring —
    // so a regression in the path-bearing guidance is caught too.
    expect(() => installCowork()).toThrow(
      `claude_desktop_config.json at ${configPath} is not valid JSON. Fix or remove it, then rerun.`,
    );
    // The user's file is left untouched.
    expect(readFileSync(configPath, "utf-8")).toBe("{ not valid json ");
  });
});

describe("uninstallCowork", () => {
  it("removes only the hivemind entry, preserving other servers", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".config", "Claude"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          hivemind: { command: "node", args: ["/x/server.js"] },
          other: { command: "other-bin", args: [] },
        },
        theme: "dark",
      }),
    );

    const { uninstallCowork } = await importCowork();
    uninstallCowork();

    const cfg = readConfig();
    expect(cfg.mcpServers.hivemind).toBeUndefined();
    expect(cfg.mcpServers.other).toEqual({ command: "other-bin", args: [] });
    expect(cfg.theme).toBe("dark");
  });

  it("deletes the file when hivemind was its only content", async () => {
    if (process.platform === "win32") return;
    mkdirSync(join(tmpHome, ".config", "Claude"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { hivemind: { command: "node", args: ["/x"] } } }),
    );

    const { uninstallCowork } = await importCowork();
    uninstallCowork();
    expect(existsSync(configPath)).toBe(false);
  });

  it("is a no-op when no config file exists", async () => {
    const { uninstallCowork } = await importCowork();
    expect(() => uninstallCowork()).not.toThrow();
  });
});
