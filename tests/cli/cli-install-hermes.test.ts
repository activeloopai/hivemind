import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as yaml from "js-yaml";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Tests for src/cli/install-hermes.ts. This is the most surface-area-rich
 * installer: skill + bundle + MCP server registration + hooks block + the
 * hooks_auto_accept toggle, all driven through ~/.hermes/config.yaml.
 *
 * We exercise the full path against a tmp ~/.hermes and assert SHAPE and
 * COUNT (CLAUDE.md rule 6) on the merged config, plus the round-trip and
 * the user-content preservation contract.
 */

let tmpRoot: string;
let tmpHome: string;
let tmpPkg: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `hm-hermes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpHome = join(tmpRoot, "home");
  tmpPkg = join(tmpRoot, "pkg");
  mkdirSync(tmpHome, { recursive: true });

  mkdirSync(join(tmpPkg, "harnesses", "hermes", "bundle"), { recursive: true });
  writeFileSync(join(tmpPkg, "harnesses", "hermes", "bundle", "session-start.js"), "// fake bundle");
  writeFileSync(join(tmpPkg, "harnesses", "hermes", "bundle", "capture.js"), "// fake bundle");
  writeFileSync(join(tmpPkg, "harnesses", "hermes", "bundle", "pre-tool-use.js"), "// fake bundle");
  writeFileSync(join(tmpPkg, "harnesses", "hermes", "bundle", "session-end.js"), "// fake bundle");

  mkdirSync(join(tmpPkg, "mcp", "bundle"), { recursive: true });
  writeFileSync(join(tmpPkg, "mcp", "bundle", "server.js"), "// fake mcp server");

  writeFileSync(join(tmpPkg, "package.json"), JSON.stringify({ version: "3.4.5" }));

  setFakeHome(tmpHome);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  clearFakeHome();
  vi.doUnmock("node:fs");
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importInstaller(configReadError?: NodeJS.ErrnoException): Promise<typeof import("../../src/cli/install-hermes.js")> {
  vi.resetModules();
  if (configReadError) {
    const configPath = join(tmpHome, ".hermes", "config.yaml");
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        readFileSync: (path: unknown, ...args: unknown[]) => {
          if (path === configPath) throw configReadError;
          return (actual.readFileSync as (...inner: unknown[]) => unknown)(path, ...args);
        },
      };
    });
  } else {
    vi.doUnmock("node:fs");
  }
  vi.doMock("../../src/cli/util.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/cli/util.js")>();
    return { ...actual, pkgRoot: () => tmpPkg };
  });
  return await import("../../src/cli/install-hermes.js");
}

function readConfig(): any {
  return yaml.load(readFileSync(join(tmpHome, ".hermes", "config.yaml"), "utf-8"));
}

describe("installHermes — cold install", () => {
  it("writes the SKILL.md, copies the hook bundle, installs the MCP server, and stamps versions", async () => {
    const { installHermes } = await importInstaller();
    installHermes();

    expect(existsSync(join(tmpHome, ".hermes", "skills", "hivemind-memory", "SKILL.md"))).toBe(true);
    expect(existsSync(join(tmpHome, ".hermes", "hivemind", "bundle", "capture.js"))).toBe(true);
    expect(existsSync(join(tmpHome, ".hivemind", "mcp", "server.js"))).toBe(true);
    expect(readFileSync(join(tmpHome, ".hermes", "skills", "hivemind-memory", ".hivemind_version"), "utf-8")).toBe("3.4.5");
    expect(readFileSync(join(tmpHome, ".hermes", "hivemind", ".hivemind_version"), "utf-8")).toBe("3.4.5");
  });

  it("config.yaml has hivemind under mcp_servers AND hooks AND hooks_auto_accept=true", async () => {
    const { installHermes } = await importInstaller();
    installHermes();
    const cfg = readConfig();
    expect(cfg.mcp_servers.hivemind.command).toBe("node");
    expect(cfg.mcp_servers.hivemind.args[0]).toBe(join(tmpHome, ".hivemind", "mcp", "server.js"));
    expect(cfg.hooks_auto_accept).toBe(true);
  });

  it("hooks block contains exactly the 6 hivemind events (count + names) and pre_tool_call has the terminal matcher", async () => {
    const { installHermes } = await importInstaller();
    installHermes();
    const cfg = readConfig();
    expect(Object.keys(cfg.hooks).sort()).toEqual([
      "on_session_end",
      "on_session_start",
      "post_llm_call",
      "post_tool_call",
      "pre_llm_call",
      "pre_tool_call",
    ]);
    for (const event of Object.keys(cfg.hooks)) {
      // on_session_end carries TWO hooks: session-end capture + graph-on-stop
      // (G3 code-graph auto-build parity). Every other event has exactly one.
      expect(cfg.hooks[event]).toHaveLength(event === "on_session_end" ? 2 : 1);
    }
    expect(cfg.hooks.pre_tool_call[0].matcher).toBe("terminal");
    // graph-on-stop is the second on_session_end hook (G3).
    expect(cfg.hooks.on_session_end.some((h: { command: string }) => h.command.includes("graph-on-stop.js"))).toBe(true);
  });

  it("preserves a user-defined hook on a non-hivemind event", async () => {
    mkdirSync(join(tmpHome, ".hermes"), { recursive: true });
    writeFileSync(join(tmpHome, ".hermes", "config.yaml"), yaml.dump({
      hooks: { on_message_received: [{ command: "/usr/local/bin/audit.sh", timeout: 5 }] },
      preserved_field: "stay",
    }));

    const { installHermes } = await importInstaller();
    installHermes();
    const cfg = readConfig();
    expect(cfg.hooks.on_message_received).toHaveLength(1);
    expect(cfg.hooks.on_message_received[0].command).toBe("/usr/local/bin/audit.sh");
    expect(cfg.preserved_field).toBe("stay");
  });

  it.each([
    "",
    "   \n\t",
    "# user comment only\n  # another comment\n",
    "---\n",
    "--- # comment\n",
    "...\n",
    "---\n# comment before the document end\n... # end\n",
    "\ufeff---\n",
    "%YAML 1.2\n---\n...\n",
    "%TAG !e! tag:example.com,2026:\n---\n...\n",
  ])(
    "accepts an empty YAML document without treating it as malformed (%j)",
    async (raw) => {
      mkdirSync(join(tmpHome, ".hermes"), { recursive: true });
      writeFileSync(join(tmpHome, ".hermes", "config.yaml"), raw);

      const { installHermes } = await importInstaller();
      expect(() => installHermes()).not.toThrow();
      expect(readConfig().mcp_servers.hivemind.command).toBe("node");
    },
  );

  it.each(["plain scalar\n", "- array item\n", "null\n", "~\n", "!!null\n", "&empty\n"])(
    "rejects a non-mapping YAML root without touching payloads (%j)",
    async (raw) => {
      mkdirSync(join(tmpHome, ".hermes"), { recursive: true });
      const configPath = join(tmpHome, ".hermes", "config.yaml");
      writeFileSync(configPath, raw);

      const { installHermes } = await importInstaller();
      expect(() => installHermes()).toThrow(/must contain a YAML mapping/);
      expect(readFileSync(configPath, "utf-8")).toBe(raw);
      expect(existsSync(join(tmpHome, ".hermes", "hivemind"))).toBe(false);
      expect(existsSync(join(tmpHome, ".hivemind", "mcp"))).toBe(false);
    },
  );

  it("refuses a malformed config.yaml without overwriting it or touching payloads", async () => {
    mkdirSync(join(tmpHome, ".hermes"), { recursive: true });
    const configPath = join(tmpHome, ".hermes", "config.yaml");
    writeFileSync(configPath, "::: not yaml :::");
    chmodSync(configPath, 0o640);
    const originalMode = statSync(configPath).mode & 0o777;
    const { installHermes } = await importInstaller();
    expect(() => installHermes()).toThrow(/not valid YAML/);
    expect(readFileSync(configPath, "utf-8")).toBe("::: not yaml :::");
    expect(statSync(configPath).mode & 0o777).toBe(originalMode);
    expect(existsSync(join(tmpHome, ".hermes", "hivemind"))).toBe(false);
    expect(existsSync(join(tmpHome, ".hivemind", "mcp"))).toBe(false);
  });

  it("re-install replaces stale hivemind hooks (no duplication after N re-runs)", async () => {
    const { installHermes } = await importInstaller();
    for (let i = 0; i < 4; i++) installHermes();
    const cfg = readConfig();
    for (const event of Object.keys(cfg.hooks)) {
      expect(cfg.hooks[event]).toHaveLength(event === "on_session_end" ? 2 : 1);
    }
  });

  it("throws when the hermes hook bundle source is missing (build hasn't run)", async () => {
    rmSync(join(tmpPkg, "harnesses", "hermes", "bundle"), { recursive: true, force: true });
    const { installHermes } = await importInstaller();
    expect(() => installHermes()).toThrow(/Hermes bundle missing/);
  });
});

describe("uninstallHermes", () => {
  it("removes the skill dir, the bundle dir, AND strips hivemind from config.yaml", async () => {
    const { installHermes, uninstallHermes } = await importInstaller();
    installHermes();
    uninstallHermes();
    expect(existsSync(join(tmpHome, ".hermes", "skills", "hivemind-memory"))).toBe(false);
    expect(existsSync(join(tmpHome, ".hermes", "hivemind"))).toBe(false);
    // After uninstall: every hivemind-written field is stripped, including
    // hooks_auto_accept (installer set it to true so the hivemind hooks
    // fire silently — leaving it set after uninstall would silently
    // auto-accept any unrelated hooks the user adds later). With nothing
    // left in cfg, the uninstaller deletes config.yaml entirely.
    if (existsSync(join(tmpHome, ".hermes", "config.yaml"))) {
      const cfg = readConfig() ?? {};
      expect(cfg.mcp_servers).toBeUndefined();
      expect(cfg.hooks).toBeUndefined();
      expect(cfg.hooks_auto_accept).toBeUndefined();
    }
  });

  it("preserves user hooks while stripping hivemind hooks (mixed config)", async () => {
    const { installHermes, uninstallHermes } = await importInstaller();
    mkdirSync(join(tmpHome, ".hermes"), { recursive: true });
    writeFileSync(join(tmpHome, ".hermes", "config.yaml"), yaml.dump({
      hooks: { on_message_received: [{ command: "/usr/local/bin/audit.sh", timeout: 5 }] },
    }));
    installHermes();
    uninstallHermes();

    const cfg = readConfig();
    expect(cfg.mcp_servers).toBeUndefined();
    expect(cfg.hooks.on_message_received).toHaveLength(1);
    expect(cfg.hooks.on_message_received[0].command).toBe("/usr/local/bin/audit.sh");
    // Hivemind hook events are gone.
    expect(cfg.hooks.pre_llm_call).toBeUndefined();
  });

  it("preserves an unrelated mcp_server entry while removing the hivemind one", async () => {
    const { installHermes, uninstallHermes } = await importInstaller();
    mkdirSync(join(tmpHome, ".hermes"), { recursive: true });
    writeFileSync(join(tmpHome, ".hermes", "config.yaml"), yaml.dump({
      mcp_servers: { other: { command: "node", args: ["/tmp/other.js"] } },
    }));
    installHermes();
    uninstallHermes();
    const cfg = readConfig();
    expect(cfg.mcp_servers.other).toEqual({ command: "node", args: ["/tmp/other.js"] });
    expect(cfg.mcp_servers.hivemind).toBeUndefined();
  });

  it("validates malformed config before removing any payload and propagates failure", async () => {
    const { installHermes, uninstallHermes } = await importInstaller();
    installHermes();
    const configPath = join(tmpHome, ".hermes", "config.yaml");
    const original = "hooks: [unterminated";
    writeFileSync(configPath, original);
    chmodSync(configPath, 0o640);
    const originalMode = statSync(configPath).mode & 0o777;

    expect(() => uninstallHermes()).toThrow(/not valid YAML/);
    expect(readFileSync(configPath, "utf-8")).toBe(original);
    expect(statSync(configPath).mode & 0o777).toBe(originalMode);
    expect(existsSync(join(tmpHome, ".hermes", "skills", "hivemind-memory", "SKILL.md"))).toBe(true);
    expect(existsSync(join(tmpHome, ".hermes", "hivemind", "bundle", "capture.js"))).toBe(true);
  });

  it("does not remove payload when config reading fails at the filesystem boundary", async () => {
    const { installHermes } = await importInstaller();
    installHermes();
    const configPath = join(tmpHome, ".hermes", "config.yaml");
    const original = readFileSync(configPath, "utf-8");
    const readError = Object.assign(new Error("injected config read failure"), { code: "EIO" });
    const { uninstallHermes } = await importInstaller(readError);

    expect(() => uninstallHermes()).toThrow(/could not be read/);
    expect(readFileSync(configPath, "utf-8")).toBe(original);
    expect(existsSync(join(tmpHome, ".hermes", "skills", "hivemind-memory", "SKILL.md"))).toBe(true);
    expect(existsSync(join(tmpHome, ".hermes", "hivemind", "bundle", "capture.js"))).toBe(true);
  });

  it("is a no-op (no throw) when nothing has been installed", async () => {
    const { uninstallHermes } = await importInstaller();
    expect(() => uninstallHermes()).not.toThrow();
  });
});
