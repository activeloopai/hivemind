import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGate, buildArgs, findAgentBin, type Agent } from "../../src/skillify/gate-runner.js";

// runGate's actual spawn path needs a real executable that exits 0/non-zero
// regardless of the agent flags it's handed. A shebang shell script is the
// simplest such fixture, so this block is POSIX-only — on Windows the spawn
// path is exercised by the install/wiki-worker suites, and the argv contract
// is covered cross-platform by the buildArgs tests below.
describe.skipIf(process.platform === "win32")("runGate spawn (POSIX)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "gate-spawn-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("captures stdout and reports success when the agent exits 0", () => {
    const bin = join(dir, "ok.sh");
    writeFileSync(bin, "#!/bin/sh\necho gate-ok\nexit 0\n");
    chmodSync(bin, 0o755);
    const r = runGate({ agent: "claude_code", prompt: "p", bin });
    expect(r.errored).toBe(false);
    expect(r.stdout).toContain("gate-ok");
  });

  it("reports errored (with captured streams) when the agent exits non-zero", () => {
    const bin = join(dir, "fail.sh");
    writeFileSync(bin, "#!/bin/sh\necho oops 1>&2\nexit 3\n");
    chmodSync(bin, 0o755);
    const r = runGate({ agent: "claude_code", prompt: "p", bin });
    expect(r.errored).toBe(true);
    expect(r.errorMessage).toMatch(/CLI failed/);
  });
});

describe("findAgentBin", () => {
  it("returns a path for each known agent (PATH lookup or fallback)", () => {
    for (const agent of ["claude_code", "codex", "cursor", "hermes", "pi"] as Agent[]) {
      const p = findAgentBin(agent);
      expect(p).toBeTruthy();
      expect(typeof p).toBe("string");
      expect(p).toMatch(/[/\\]/); // looks like a path
    }
  });
});

describe("runGate dispatch", () => {
  it("returns errored when bin path does not exist (no exception)", () => {
    const r = runGate({
      agent: "claude_code",
      prompt: "test",
      bin: "/nonexistent/path/to/missing-binary",
    });
    expect(r.errored).toBe(true);
    expect(r.errorMessage).toMatch(/not found/i);
    // Should not throw — returns a clean error structure
    expect(r.stdout).toBe("");
  });

  // Per-agent argv shape — assert directly on the argv that buildArgs()
  // produces. (Previously these spawned `/usr/bin/echo` and grepped stdout,
  // which only works on POSIX; buildArgs is the deterministic, cross-platform
  // seam for the same contract.)
  it("constructs claude_code invocation with --model haiku + bypassPermissions", () => {
    const args = buildArgs("claude_code", "PROMPT_MARKER", { agent: "claude_code", prompt: "PROMPT_MARKER" });
    expect(args).toContain("PROMPT_MARKER");
    expect(args).toContain("--model");
    expect(args).toContain("haiku");
    expect(args).toContain("bypassPermissions");
  });

  it("constructs codex invocation with exec + --dangerously-bypass-approvals-and-sandbox", () => {
    const args = buildArgs("codex", "PROMPT_MARKER", { agent: "codex", prompt: "PROMPT_MARKER" });
    expect(args).toContain("PROMPT_MARKER");
    expect(args).toContain("exec");
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("constructs cursor-agent invocation with --print + --model + --force", () => {
    const args = buildArgs("cursor", "PROMPT_MARKER", {
      agent: "cursor",
      prompt: "PROMPT_MARKER",
      cursorModel: "claude-sonnet-4-5",
    });
    expect(args).toContain("--print");
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-5");
    expect(args).toContain("--force");
    expect(args).toContain("PROMPT_MARKER");
  });

  it("constructs pi invocation with --print + --provider + --model", () => {
    const args = buildArgs("pi", "PROMPT_MARKER", {
      agent: "pi",
      prompt: "PROMPT_MARKER",
      piProvider: "google",
      piModel: "gemini-2.5-flash",
    });
    expect(args).toContain("--print");
    expect(args).toContain("--provider");
    expect(args).toContain("google");
    expect(args).toContain("--model");
    expect(args).toContain("gemini-2.5-flash");
    expect(args).toContain("PROMPT_MARKER");
  });

  it("pi falls back to env var defaults for provider + model when explicit override absent", () => {
    const original = {
      provider: process.env.HIVEMIND_PI_PROVIDER,
      model: process.env.HIVEMIND_PI_MODEL,
    };
    try {
      process.env.HIVEMIND_PI_PROVIDER = "test-pi-provider";
      process.env.HIVEMIND_PI_MODEL = "test-pi-model";
      const args = buildArgs("pi", "p", { agent: "pi", prompt: "p" });
      expect(args).toContain("test-pi-provider");
      expect(args).toContain("test-pi-model");
    } finally {
      if (original.provider === undefined) delete process.env.HIVEMIND_PI_PROVIDER;
      else process.env.HIVEMIND_PI_PROVIDER = original.provider;
      if (original.model === undefined) delete process.env.HIVEMIND_PI_MODEL;
      else process.env.HIVEMIND_PI_MODEL = original.model;
    }
  });

  it("pi uses google + gemini-2.5-flash defaults when neither opts nor env are set", () => {
    const original = {
      provider: process.env.HIVEMIND_PI_PROVIDER,
      model: process.env.HIVEMIND_PI_MODEL,
    };
    try {
      delete process.env.HIVEMIND_PI_PROVIDER;
      delete process.env.HIVEMIND_PI_MODEL;
      const args = buildArgs("pi", "p", { agent: "pi", prompt: "p" });
      expect(args).toContain("google");
      expect(args).toContain("gemini-2.5-flash");
    } finally {
      if (original.provider !== undefined) process.env.HIVEMIND_PI_PROVIDER = original.provider;
      if (original.model !== undefined) process.env.HIVEMIND_PI_MODEL = original.model;
    }
  });

  it("constructs hermes invocation with -z + --provider + -m + --yolo", () => {
    const args = buildArgs("hermes", "PROMPT_MARKER", {
      agent: "hermes",
      prompt: "PROMPT_MARKER",
      hermesProvider: "openrouter",
      hermesModel: "anthropic/claude-haiku-4-5",
    });
    expect(args).toContain("-z");
    expect(args).toContain("PROMPT_MARKER");
    expect(args).toContain("--provider");
    expect(args).toContain("openrouter");
    expect(args).toContain("-m");
    expect(args).toContain("anthropic/claude-haiku-4-5");
    expect(args).toContain("--yolo");
    expect(args).toContain("--ignore-user-config");
  });

  it("falls back to env var defaults for cursor/hermes model when explicit override absent", () => {
    const original = {
      cursor: process.env.HIVEMIND_CURSOR_MODEL,
      hermesProv: process.env.HIVEMIND_HERMES_PROVIDER,
      hermesModel: process.env.HIVEMIND_HERMES_MODEL,
    };
    try {
      process.env.HIVEMIND_CURSOR_MODEL = "test-cursor-model";
      process.env.HIVEMIND_HERMES_PROVIDER = "test-provider";
      process.env.HIVEMIND_HERMES_MODEL = "test-hermes-model";
      const c = buildArgs("cursor", "p", { agent: "cursor", prompt: "p" });
      expect(c).toContain("test-cursor-model");
      const h = buildArgs("hermes", "p", { agent: "hermes", prompt: "p" });
      expect(h).toContain("test-provider");
      expect(h).toContain("test-hermes-model");
    } finally {
      // Restore (delete if originally undefined to avoid pollution)
      if (original.cursor === undefined) delete process.env.HIVEMIND_CURSOR_MODEL;
      else process.env.HIVEMIND_CURSOR_MODEL = original.cursor;
      if (original.hermesProv === undefined) delete process.env.HIVEMIND_HERMES_PROVIDER;
      else process.env.HIVEMIND_HERMES_PROVIDER = original.hermesProv;
      if (original.hermesModel === undefined) delete process.env.HIVEMIND_HERMES_MODEL;
      else process.env.HIVEMIND_HERMES_MODEL = original.hermesModel;
    }
  });
});
