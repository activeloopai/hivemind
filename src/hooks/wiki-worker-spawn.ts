import type { ExecFileSyncOptions } from "node:child_process";
import { binNeedsShell } from "../utils/resolve-cli-bin.js";

/** Fixed flags for the summary-generation `claude -p` call (no user input).
 *
 * The summarizer takes its inputs inline (session transcript + any existing
 * summary are embedded in the prompt) and emits the summary to STDOUT, so it
 * needs NO tools at all. We therefore grant none and drop bypassPermissions:
 * in `-p` (print) mode an unapproved tool call is auto-denied rather than
 * prompting, so the agent simply cannot read files, write files, or run
 * commands. This collapses the prompt-injection blast radius of the
 * attacker-influenceable captured session content to "produce summary text",
 * which the worker further bounds with output validation before storing.
 */
const CLAUDE_FLAGS = [
  "--no-session-persistence",
  "--model",
  "haiku",
] as const;

export interface ClaudeInvocation {
  file: string;
  args: string[];
  options: ExecFileSyncOptions;
}

/**
 * Build the `execFileSync` descriptor for the summary-generation claude call.
 *
 * The prompt now carries the full session transcript inline, so it must NEVER
 * ride the command line: on macOS `ARG_MAX` is ~256 KB and a real transcript
 * blows past that, and on a Windows `.cmd` shim cmd.exe would expand
 * `%VAR%`/metacharacters in it. So on every platform the prompt is delivered
 * over stdin (`input`) and only the fixed flags — never session text — are
 * passed as args. stdout is piped so the worker can capture the summary the
 * agent emits there (it no longer writes a file). Windows `.cmd`/`.bat` shims
 * still need a shell to spawn; everything else runs shell-less.
 */
export function buildClaudeInvocation(claudeBin: string, prompt: string): ClaudeInvocation {
  return {
    file: claudeBin,
    args: ["-p", ...CLAUDE_FLAGS],
    options: {
      input: prompt,
      stdio: ["pipe", "pipe", "pipe"],
      shell: binNeedsShell(claudeBin),
    },
  };
}

/**
 * Build an `execFileSync` descriptor for an agent CLI that takes its prompt as
 * the LAST positional arg (codex `exec … <prompt>`, cursor `--print … <prompt>`,
 * pi `--print … <prompt>`). `flags` are everything BEFORE the prompt.
 *
 * Same Windows `.cmd` handling as {@link buildClaudeInvocation}: route the
 * prompt over stdin under a shell so it never hits the command line. Unix (and
 * Windows `.exe`) keep the prompt as the trailing arg — unchanged behavior.
 *
 * Regression-proof by construction: the non-shell branch is byte-identical to
 * the original call, and the shell branch only ever replaces a path that is
 * already unrunnable (a `.cmd` under the old no-shell `execFileSync`).
 */
export function buildTrailingPromptInvocation(bin: string, flags: string[], prompt: string): ClaudeInvocation {
  if (binNeedsShell(bin)) {
    return {
      file: bin,
      args: [...flags],
      options: { input: prompt, stdio: ["pipe", "pipe", "pipe"], shell: true },
    };
  }
  return {
    file: bin,
    args: [...flags, prompt],
    options: { stdio: ["ignore", "pipe", "pipe"] },
  };
}
