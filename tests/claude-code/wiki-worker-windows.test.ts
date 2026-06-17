import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Windows regression guard for the wiki-worker summary generation path.
 *
 * Root cause (confirmed against a real Windows user whose memory table held
 * 54/54 empty placeholder summaries):
 *   1. The CLI resolver shelled out to `which claude 2>/dev/null` — `which`
 *      does not exist on Windows (it's `where`) — and fell back to an
 *      extensionless `~/.claude/local/claude`, which is not a runnable
 *      Windows program.
 *   2. The worker then ran `execFileSync(claudeBin, ["-p", prompt, ...])` with
 *      no shell. Node cannot launch a `.cmd`/`.bat` shim without a shell, so
 *      the spawn threw ENOENT, the worker swallowed it, the summary file was
 *      never written, and the SessionStart placeholder was never replaced.
 *
 * These tests pin the cross-platform resolution + the shell/stdin spawn shape
 * without launching any real process.
 */

const execFileSyncMock = vi.fn();
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, execFileSync: (...a: unknown[]) => execFileSyncMock(...a) };
});
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => "/home/tester" };
});

import { resolveCliBin, binNeedsShell } from "../../src/utils/resolve-cli-bin.js";
import { buildClaudeInvocation, buildTrailingPromptInvocation } from "../../src/hooks/wiki-worker-spawn.js";

const realPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
  execFileSyncMock.mockReset();
});

const CLAUDE_FLAGS = [
  "--no-session-persistence",
  "--model",
  "haiku",
];

describe("resolveCliBin — Windows", () => {
  it("locates the CLI with `where` (not `which`)", () => {
    setPlatform("win32");
    execFileSyncMock.mockReturnValue("C:\\npm\\claude.cmd\r\n");
    resolveCliBin("claude");
    expect(execFileSyncMock).toHaveBeenCalledWith("where", ["claude"], { encoding: "utf-8" });
  });

  it("prefers a .exe over a .cmd shim when both are on PATH", () => {
    setPlatform("win32");
    execFileSyncMock.mockReturnValue(
      ["C:\\npm\\claude", "C:\\npm\\claude.ps1", "C:\\npm\\claude.cmd", "C:\\pf\\claude.exe"].join("\r\n") + "\r\n",
    );
    expect(resolveCliBin("claude")).toBe("C:\\pf\\claude.exe");
  });

  it("prefers a .cmd shim when no .exe is present", () => {
    setPlatform("win32");
    execFileSyncMock.mockReturnValue(["C:\\npm\\claude", "C:\\npm\\claude.cmd", "C:\\npm\\claude.ps1"].join("\r\n"));
    expect(resolveCliBin("claude")).toBe("C:\\npm\\claude.cmd");
  });

  it("returns the first match when `where` lists no .exe/.cmd (e.g. only .ps1)", () => {
    setPlatform("win32");
    execFileSyncMock.mockReturnValue(["C:\\npm\\claude.ps1", "C:\\npm\\claude"].join("\r\n"));
    expect(resolveCliBin("claude")).toBe("C:\\npm\\claude.ps1");
  });

  it("falls back to ~/.claude/local/<cli>.cmd when `where` finds nothing", () => {
    setPlatform("win32");
    execFileSyncMock.mockImplementation(() => { throw new Error("INFO: Could not find files"); });
    const bin = resolveCliBin("claude");
    expect(bin.endsWith("claude.cmd")).toBe(true);
    expect(bin.includes("local")).toBe(true);
  });

  it("falls back when `where` prints no usable matches", () => {
    setPlatform("win32");
    execFileSyncMock.mockReturnValue("\r\n  \r\n");
    expect(resolveCliBin("claude").endsWith("claude.cmd")).toBe(true);
  });
});

describe("resolveCliBin — Unix (unchanged behavior)", () => {
  it("locates the CLI with `which` and returns the first match", () => {
    setPlatform("linux");
    execFileSyncMock.mockReturnValue("/usr/local/bin/claude\n");
    expect(resolveCliBin("claude")).toBe("/usr/local/bin/claude");
    expect(execFileSyncMock).toHaveBeenCalledWith("which", ["claude"], { encoding: "utf-8" });
  });

  it("falls back to an extensionless ~/.claude/local/<cli> when not found", () => {
    setPlatform("linux");
    execFileSyncMock.mockImplementation(() => { throw new Error("not found"); });
    const bin = resolveCliBin("claude");
    expect(bin.endsWith("claude")).toBe(true);
    expect(bin.endsWith(".cmd")).toBe(false);
  });
});

describe("binNeedsShell", () => {
  it("is true only for Windows .cmd/.bat shims", () => {
    setPlatform("win32");
    expect(binNeedsShell("C:\\x\\claude.cmd")).toBe(true);
    expect(binNeedsShell("C:\\x\\claude.BAT")).toBe(true);
    expect(binNeedsShell("C:\\x\\claude.exe")).toBe(false);
  });

  it("is false on Unix even for a .cmd-looking name", () => {
    setPlatform("linux");
    expect(binNeedsShell("/x/claude.cmd")).toBe(false);
  });
});

describe("buildClaudeInvocation", () => {
  // The prompt carries the full session transcript inline, so it always goes
  // over stdin (never the command line) on every platform, and the agent is
  // granted no tools / no bypassPermissions.
  it("Windows .cmd: spawns through a shell with the prompt over stdin, never on the command line", () => {
    setPlatform("win32");
    const inv = buildClaudeInvocation("C:\\npm\\claude.cmd", "PROMPT-TEXT");
    expect(inv.file).toBe("C:\\npm\\claude.cmd");
    expect(inv.options.shell).toBe(true);
    expect(inv.options.input).toBe("PROMPT-TEXT");
    expect(inv.args).toEqual(["-p", ...CLAUDE_FLAGS]);
    expect(inv.args).not.toContain("PROMPT-TEXT");
  });

  it("Unix: prompt over stdin, no shell, never on the command line", () => {
    setPlatform("linux");
    const inv = buildClaudeInvocation("/usr/local/bin/claude", "PROMPT-TEXT");
    expect(inv.options.shell).toBeFalsy();
    expect(inv.options.input).toBe("PROMPT-TEXT");
    expect(inv.args).toEqual(["-p", ...CLAUDE_FLAGS]);
    expect(inv.args).not.toContain("PROMPT-TEXT");
  });

  it("Windows .exe: spawns directly (no shell), prompt over stdin", () => {
    setPlatform("win32");
    const inv = buildClaudeInvocation("C:\\pf\\claude.exe", "PROMPT-TEXT");
    expect(inv.options.shell).toBeFalsy();
    expect(inv.options.input).toBe("PROMPT-TEXT");
    expect(inv.args).not.toContain("PROMPT-TEXT");
  });

  it("grants no tools and does not bypass permissions (collapsed blast radius)", () => {
    setPlatform("linux");
    const inv = buildClaudeInvocation("/usr/local/bin/claude", "PROMPT-TEXT");
    expect(inv.args).not.toContain("bypassPermissions");
    expect(inv.args).not.toContain("--allowedTools");
    expect(inv.args).not.toContain("--permission-mode");
  });
});

describe("buildTrailingPromptInvocation (codex / cursor / pi)", () => {
  // Prompt is the LAST positional arg; `flags` are everything before it.
  const FLAGS = ["exec", "--dangerously-bypass-approvals-and-sandbox"];

  it("Windows .cmd: shell + prompt over stdin; flags only on the command line", () => {
    setPlatform("win32");
    const inv = buildTrailingPromptInvocation("C:\\npm\\codex.cmd", FLAGS, "PROMPT-TEXT");
    expect(inv.file).toBe("C:\\npm\\codex.cmd");
    expect(inv.options.shell).toBe(true);
    expect(inv.options.input).toBe("PROMPT-TEXT");
    expect(inv.args).toEqual(FLAGS);
    expect(inv.args).not.toContain("PROMPT-TEXT");
  });

  it("Unix: prompt is the trailing arg, no shell, no stdin (byte-identical to the original)", () => {
    setPlatform("linux");
    const inv = buildTrailingPromptInvocation("/usr/local/bin/codex", FLAGS, "PROMPT-TEXT");
    expect(inv.options.shell).toBeFalsy();
    expect(inv.options.input).toBeUndefined();
    expect(inv.args).toEqual([...FLAGS, "PROMPT-TEXT"]);
  });
});
