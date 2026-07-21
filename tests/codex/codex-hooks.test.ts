import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const codexRoot = join(process.cwd(), "harnesses", "codex");

describe("codex hooks.json", () => {
  const hooks = JSON.parse(readFileSync(join(codexRoot, "hooks", "hooks.json"), "utf-8"));

  it("has the expected 5 lifecycle events", () => {
    const events = Object.keys(hooks.hooks);
    expect(events).toContain("SessionStart");
    expect(events).toContain("UserPromptSubmit");
    expect(events).toContain("PreToolUse");
    expect(events).toContain("PostToolUse");
    expect(events).toContain("Stop");
    expect(events).toHaveLength(5);
  });

  it("does NOT have Claude Code-specific events", () => {
    const events = Object.keys(hooks.hooks);
    expect(events).not.toContain("SubagentStop");
    expect(events).not.toContain("SessionEnd");
  });

  it("PreToolUse matcher is Bash only", () => {
    const preToolUse = hooks.hooks.PreToolUse;
    expect(preToolUse).toHaveLength(1);
    expect(preToolUse[0].matcher).toBe("Bash");
  });

  it("PostToolUse has no matcher (captures all tools)", () => {
    const postToolUse = hooks.hooks.PostToolUse;
    expect(postToolUse).toHaveLength(1);
    expect(postToolUse[0].matcher).toBeUndefined();
  });

  it("SessionStart matcher includes startup and resume", () => {
    const sessionStart = hooks.hooks.SessionStart;
    expect(sessionStart[0].matcher).toBe("startup|resume");
  });

  it("SessionStart timeout is <= 15s (regression: was 120s)", () => {
    const sessionStart = hooks.hooks.SessionStart;
    for (const hook of sessionStart[0].hooks) {
      expect(hook.timeout).toBeLessThanOrEqual(15);
    }
  });

  it("no hooks use the async flag (not supported in Codex)", () => {
    for (const [, entries] of Object.entries(hooks.hooks) as [string, any[]][]) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook).not.toHaveProperty("async");
        }
      }
    }
  });

  it("hook commands reference $PLUGIN_ROOT, never the unset $CODEX_PLUGIN_ROOT", () => {
    // Codex injects PLUGIN_ROOT / CLAUDE_PLUGIN_ROOT into hook commands, NOT
    // CODEX_PLUGIN_ROOT. A directory (Codex-managed) install runs this file
    // verbatim, so referencing the unset var would expand to `/bundle/...`
    // and every hook would ENOENT silently. Our npm installer bakes absolute
    // paths and is unaffected — this guard protects the directory channel.
    const raw = readFileSync(join(codexRoot, "hooks", "hooks.json"), "utf-8");
    expect(raw).not.toContain("CODEX_PLUGIN_ROOT");
    expect(raw).toContain("$PLUGIN_ROOT/bundle/");
  });

  it("Stop hook uses a separate stop.js (not capture.js)", () => {
    const stop = hooks.hooks.Stop;
    expect(stop[0].hooks[0].command).toContain("stop.js");
    expect(stop[0].hooks[0].command).not.toContain("capture.js");
  });
});

describe("codex plugin.json", () => {
  const plugin = JSON.parse(readFileSync(join(codexRoot, ".codex-plugin", "plugin.json"), "utf-8"));

  it("has required fields", () => {
    expect(plugin.name).toBe("hivemind");
    expect(plugin.version).toBeTruthy();
    expect(plugin.description).toBeTruthy();
  });

  it("has Codex-specific interface block", () => {
    expect(plugin.interface).toBeDefined();
    expect(plugin.interface.displayName).toBeTruthy();
    expect(plugin.interface.developerName).toBe("Activeloop");
    expect(plugin.interface.category).toBeTruthy();
  });

  it("points skills at the bundled skills dir (official schema is a path, not an array)", () => {
    // The official Codex plugin schema expects `skills` to be a string path
    // to the skills directory (e.g. "./skills/"), NOT an array. An empty
    // array — the previous value — exported zero skills to the directory.
    expect(plugin.skills).toBe("./skills/");
  });

  it("omits mcpServers/apps (skills-only plugin — no empty-array pointers)", () => {
    // Component pointers are only declared for components we ship. This is a
    // skills-only plugin, so mcpServers/apps must be absent, not `[]`.
    expect(plugin.mcpServers).toBeUndefined();
    expect(plugin.apps).toBeUndefined();
  });
});

describe("codex bundle output", () => {
  const bundleDir = join(codexRoot, "bundle");

  const expectedFiles = [
    "session-start.js",
    "session-start-setup.js",
    "capture.js",
    "pre-tool-use.js",
    "stop.js",
    "wiki-worker.js",
    "shell/deeplake-shell.js",
    "commands/auth-login.js",
  ];

  for (const file of expectedFiles) {
    it(`bundle contains ${file}`, () => {
      const content = readFileSync(join(bundleDir, file), "utf-8");
      expect(content.length).toBeGreaterThan(0);
    });
  }
});
