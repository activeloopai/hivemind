import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { WIKI_PROMPT_TEMPLATE as CC } from "../../../src/hooks/spawn-wiki-worker.js";
import { WIKI_PROMPT_TEMPLATE as CODEX } from "../../../src/hooks/codex/spawn-wiki-worker.js";
import { WIKI_PROMPT_TEMPLATE as CURSOR } from "../../../src/hooks/cursor/spawn-wiki-worker.js";
import { WIKI_PROMPT_TEMPLATE as HERMES } from "../../../src/hooks/hermes/spawn-wiki-worker.js";

/** Contract checks for how local proactive recall is wired into Claude Code. */

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf-8"));
const mainHooks = readJson("harnesses/claude-code/hooks/hooks.json").hooks;
const failureHooks = readJson("harnesses/claude-code/hooks/hooks-tool-failure.json").hooks;
const manifest = readJson("harnesses/claude-code/.claude-plugin/plugin.json");
const hooks = { ...mainHooks, ...failureHooks };
const commands = (event: string) =>
  (hooks[event] ?? []).flatMap((g: { hooks: Array<{ command: string; timeout?: number; async?: boolean }> }) => g.hooks);

/**
 * Claude Code <= 2.0.55 validates hooks files with a closed enum of event
 * names (this exact list, from its cli.js). A hooks.json naming any other
 * event fails to parse and EVERY hook of the plugin is dropped. Verified
 * 2026-11-04 by running 2.0.55 against both layouts.
 */
const EVENTS_KNOWN_TO_CC_2_0_55 = [
  "PreToolUse", "PostToolUse", "Notification", "UserPromptSubmit", "SessionStart",
  "SessionEnd", "Stop", "SubagentStart", "SubagentStop", "PreCompact", "PermissionRequest",
];

describe("old Claude Code compatibility guard", () => {
  it("main hooks.json only uses events every supported Claude Code version knows", () => {
    for (const ev of Object.keys(mainHooks)) expect(EVENTS_KNOWN_TO_CC_2_0_55).toContain(ev);
  });

  it("newer events live in a separate file that the manifest lists (loaded per file, skipped on old versions)", () => {
    expect(manifest.hooks).toEqual(["./hooks/hooks-tool-failure.json"]);
    expect(Object.keys(failureHooks)).toEqual(["PostToolUseFailure"]);
  });
});

describe("hooks.json", () => {
  it("runs recall-on-failure synchronously (its output must reach the model) with a short timeout", () => {
    const h = commands("PostToolUseFailure").find((c: { command: string }) => c.command.includes("recall-on-failure.js"));
    expect(h).toBeDefined();
    expect(h.async).toBeUndefined();
    expect(h.timeout).toBeLessThanOrEqual(5);
  });

  it("also runs recall-on-failure synchronously on successful Bash calls (piped failures exit 0)", () => {
    const g = mainHooks.PostToolUse.find((x: { matcher?: string }) => x.matcher === "Bash");
    expect(g.hooks).toEqual([expect.objectContaining({ command: expect.stringContaining("recall-on-failure.js"), timeout: 3 })]);
    expect(g.hooks[0].async).toBeUndefined();
  });

  it("captures failed tool calls asynchronously", () => {
    const h = commands("PostToolUseFailure").find((c: { command: string }) => c.command.includes("capture.js"));
    expect(h?.async).toBe(true);
  });

  it("runs recall-on-prompt synchronously on UserPromptSubmit with a short timeout", () => {
    const h = commands("UserPromptSubmit").find((c: { command: string }) => c.command.includes("recall-on-prompt.js"));
    expect(h).toBeDefined();
    expect(h.async).toBeUndefined();
    expect(h.timeout).toBeLessThanOrEqual(5);
  });
});

describe("esbuild entries", () => {
  const cfg = readFileSync("esbuild.config.mjs", "utf-8");
  it.each(["recall-on-prompt", "recall-on-failure", "recall-sync-worker"])("bundles %s", (name) => {
    expect(cfg).toContain(`{ entry: "dist/src/hooks/${name}.js", out: "${name}" }`);
  });
});

describe("wiki summary prompt", () => {
  it.each([["claude-code", CC], ["codex", CODEX], ["cursor", CURSOR], ["hermes", HERMES]])(
    "%s asks for a verbatim Errors & Fixes section before Files Modified",
    (_name, tpl) => {
      const i = tpl.indexOf("## Errors & Fixes");
      expect(i).toBeGreaterThan(tpl.indexOf("## Key Facts"));
      expect(i).toBeLessThan(tpl.indexOf("## Files Modified"));
      const section = tpl.slice(i, tpl.indexOf("## Files Modified"));
      expect(section).toContain("VERBATIM");
      expect(section).toContain("if none, write: none");
    },
  );
});
