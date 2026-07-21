import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveDocLlmSpec,
  detectAvailableAgents,
  knownDocsAgents,
} from "../../src/docs/refresh-llm.js";
import {
  getDocsLlmAgent,
  setDocsLlmAgent,
  setEmbeddingsEnabled,
  readUserConfig,
  _setConfigPathForTesting,
  _resetUserConfigForTesting,
} from "../../src/user-config.js";
import { runDocsOnboarding, type OnboardingIo } from "../../src/docs/onboarding.js";
import { runDocsCommand } from "../../src/commands/docs.js";

// ── Resolution precedence: env > config > auto-detect ────────────────────────

describe("resolveDocLlmSpec — config.json slots between env and auto-detect", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-agent-"));
    _setConfigPathForTesting(() => join(dir, "config.json"));
  });
  afterEach(() => {
    _resetUserConfigForTesting();
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses the persisted config agent when no env override is set", () => {
    setDocsLlmAgent("codex");
    // Empty env → must NOT fall through to auto-detect (which needs a real CLI).
    const spec = resolveDocLlmSpec({});
    expect(spec.label).toBe("codex");
  });

  it("env HIVEMIND_DOCS_LLM_AGENT wins over the config agent", () => {
    setDocsLlmAgent("codex");
    const spec = resolveDocLlmSpec({ HIVEMIND_DOCS_LLM_AGENT: "cursor" });
    expect(spec.label).toBe("cursor");
  });

  it("HIVEMIND_DOCS_LLM_BIN wins over both env agent and config", () => {
    setDocsLlmAgent("codex");
    const spec = resolveDocLlmSpec({
      HIVEMIND_DOCS_LLM_AGENT: "cursor",
      HIVEMIND_DOCS_LLM_BIN: "/opt/mytool",
    });
    expect(spec.label).toBe("custom:/opt/mytool");
  });
});

// ── Persistence ──────────────────────────────────────────────────────────────

describe("getDocsLlmAgent / setDocsLlmAgent persistence", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-agent-"));
    _setConfigPathForTesting(() => join(dir, "config.json"));
  });
  afterEach(() => {
    _resetUserConfigForTesting();
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips through config.json", () => {
    expect(getDocsLlmAgent()).toBeUndefined();
    setDocsLlmAgent("cursor");
    expect(getDocsLlmAgent()).toBe("cursor");
  });

  it("does not clobber an existing embeddings setting", () => {
    setEmbeddingsEnabled(true);
    setDocsLlmAgent("codex");
    const cfg = readUserConfig();
    expect(cfg.embeddings?.enabled).toBe(true);
    expect(cfg.docs?.llmAgent).toBe("codex");
  });

  it("treats blank/whitespace as unset", () => {
    setDocsLlmAgent("   ");
    expect(getDocsLlmAgent()).toBeUndefined();
  });
});

// ── Detection helpers ────────────────────────────────────────────────────────

describe("detectAvailableAgents / knownDocsAgents", () => {
  it("knownDocsAgents lists the registry in priority order", () => {
    expect(knownDocsAgents()).toEqual(["claude", "codex", "pi", "cursor"]);
  });

  it("returns only installed agents, in priority order", () => {
    // Simulate: codex + cursor installed, claude + pi absent.
    const installed = new Set(["codex", "cursor-agent"]);
    const got = detectAvailableAgents((bin) => (installed.has(bin) ? `/usr/bin/${bin}` : null));
    expect(got).toEqual(["codex", "cursor"]);
  });

  it("returns [] when nothing is installed", () => {
    expect(detectAvailableAgents(() => null)).toEqual([]);
  });
});

// ── Onboarding: ask the agent question only when it makes sense ──────────────

function scriptedIo(answers: string[]): { io: OnboardingIo; asked: string[] } {
  const asked: string[] = [];
  const queue = [...answers];
  const io: OnboardingIo = {
    interactive: true,
    say: () => {},
    ask: async (q: string) => {
      asked.push(q);
      return queue.shift() ?? "";
    },
  };
  return { io, asked };
}

const baseArgs = {
  root: "/repo",
  isGitRepo: true,
  orgId: "org",
  orgName: "org",
  project: "proj",
  snap: null,
};

describe("runDocsOnboarding — agent question gate", () => {
  it("asks which agent when >1 installed and none pinned, then persists the choice", async () => {
    const setAgent = vi.fn();
    const { io, asked } = scriptedIo(["y", "codex", "n"]); // generate, agent, auto
    const res = await runDocsOnboarding({
      ...baseArgs,
      io,
      detectAgents: () => ["claude", "codex"],
      getAgent: () => undefined,
      setAgent,
    });
    expect(res.generate).toBe(true);
    expect(asked.some((q) => /Which agent should write the docs/.test(q))).toBe(true);
    expect(setAgent).toHaveBeenCalledWith("codex");
  });

  it("falls back to the default (first available) on a blank answer", async () => {
    const setAgent = vi.fn();
    const { io } = scriptedIo(["y", "", "n"]);
    await runDocsOnboarding({
      ...baseArgs,
      io,
      detectAgents: () => ["claude", "codex"],
      getAgent: () => undefined,
      setAgent,
    });
    expect(setAgent).toHaveBeenCalledWith("claude");
  });

  it("does NOT ask when only one agent is installed", async () => {
    const setAgent = vi.fn();
    const { io, asked } = scriptedIo(["y", "n"]); // generate, auto — no agent Q
    await runDocsOnboarding({
      ...baseArgs,
      io,
      detectAgents: () => ["claude"],
      getAgent: () => undefined,
      setAgent,
    });
    expect(asked.some((q) => /Which agent/.test(q))).toBe(false);
    expect(setAgent).not.toHaveBeenCalled();
  });

  it("does NOT ask when an agent is already pinned", async () => {
    const setAgent = vi.fn();
    const { io, asked } = scriptedIo(["y", "n"]);
    await runDocsOnboarding({
      ...baseArgs,
      io,
      detectAgents: () => ["claude", "codex"],
      getAgent: () => "claude",
      setAgent,
    });
    expect(asked.some((q) => /Which agent/.test(q))).toBe(false);
    expect(setAgent).not.toHaveBeenCalled();
  });

  it("never asks the agent question when the user declines generation", async () => {
    const setAgent = vi.fn();
    const { io, asked } = scriptedIo(["n"]); // decline generate → stop
    await runDocsOnboarding({
      ...baseArgs,
      io,
      detectAgents: () => ["claude", "codex"],
      getAgent: () => undefined,
      setAgent,
    });
    expect(asked.some((q) => /Which agent/.test(q))).toBe(false);
    expect(setAgent).not.toHaveBeenCalled();
  });
});

// ── `hivemind docs agent` command (runs before requireConfig — no creds) ─────

describe("runDocsCommand agent — show / set / validate", () => {
  let dir: string;
  let logs: string[];
  let errs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-agent-cmd-"));
    _setConfigPathForTesting(() => join(dir, "config.json"));
    logs = [];
    errs = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((m?: unknown) => { logs.push(String(m)); });
    errSpy = vi.spyOn(console, "error").mockImplementation((m?: unknown) => { errs.push(String(m)); });
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => { throw new Error("process.exit"); }) as never);
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
    _resetUserConfigForTesting();
    rmSync(dir, { recursive: true, force: true });
  });

  it("no arg → shows current (auto when unset) + installed + how to set", async () => {
    await runDocsCommand(["agent"]);
    expect(logs.join("\n")).toMatch(/Docs LLM agent:/);
    expect(logs.join("\n")).toMatch(/Set with: hivemind docs agent/);
  });

  it("no arg after a pin → shows the pinned agent", async () => {
    setDocsLlmAgent("codex");
    await runDocsCommand(["agent"]);
    expect(logs.join("\n")).toContain("Docs LLM agent: codex");
  });

  it("set a known agent → persists it", async () => {
    await runDocsCommand(["agent", "Codex"]); // case-insensitive
    expect(getDocsLlmAgent()).toBe("codex");
    expect(logs.join("\n")).toContain("Docs LLM agent set to: codex");
  });

  it("unknown agent → error + non-zero exit, nothing persisted", async () => {
    await expect(runDocsCommand(["agent", "bogus"])).rejects.toThrow("process.exit");
    expect(errs.join("\n")).toMatch(/Unknown agent/);
    expect(getDocsLlmAgent()).toBeUndefined();
  });
});
