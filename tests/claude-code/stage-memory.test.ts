/**
 * Unit tests for the stage-only extractor (stageSession). The agent run and
 * the local embed are injected, so we test the orchestration — prompt-driven
 * summary handling, embedding persistence, and manifest row writing — without
 * spawning claude or the embed daemon. Summary + manifest live in a tmp dir.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageSession, resolveClaudeBin, planClaudeSpawn, type StageOptions } from "../../src/skillify/stage-memory.js";
import { readPendingMemoryManifest } from "../../src/skillify/pending-memory-manifest.js";

let dir: string;
let stagingDir: string;
let manifestPath: string;
let jsonlPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stage-"));
  stagingDir = join(dir, "staging");
  manifestPath = join(dir, "pending-memory.json");
  jsonlPath = join(dir, "session.jsonl");
  writeFileSync(jsonlPath, '{"type":"user"}\n{"type":"assistant"}\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = (id = "s1") => ({ sessionId: id, jsonlPath, agent: "claude_code", project: "proj" });

function opts(over: Partial<StageOptions> = {}): StageOptions {
  return {
    claudeBin: "/fake/claude",
    timeoutMs: 1000,
    skipEmbed: false,
    now: () => "2026-06-16T00:00:00.000Z",
    stagingDir,
    manifestPath,
    // Default agent: writes the summary file named in the prompt.
    runAgent: async (_bin, prompt) => {
      const m = prompt.match(/SUMMARY FILE to write: (\S+)/);
      if (m) writeFileSync(m[1], "# Session s1\n## What Happened\nreal content\n");
      return true;
    },
    embed: async () => null,
    ...over,
  };
}

describe("stageSession", () => {
  it("stages summary + manifest row on success", async () => {
    const r = await stageSession(input(), opts());
    expect(r).toMatchObject({ ok: true, embedded: false });
    expect(existsSync(join(stagingDir, "claude_code-s1.md"))).toBe(true);
    const m = readPendingMemoryManifest(manifestPath)!;
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0]).toMatchObject({ session_id: "claude_code-s1", uploaded: false, embedded: false, source_agent: "claude_code" });
  });

  it("writes an embedding file and sets embedded when embed returns a vector", async () => {
    const r = await stageSession(input(), opts({ embed: async () => [0.1, 0.2, 0.3] }));
    expect(r.embedded).toBe(true);
    const embPath = join(stagingDir, "claude_code-s1.embedding.json");
    expect(JSON.parse(readFileSync(embPath, "utf-8"))).toEqual([0.1, 0.2, 0.3]);
    const m = readPendingMemoryManifest(manifestPath)!;
    expect(m.entries[0].embedded).toBe(true);
    expect(m.entries[0].embedding_path).toBe(embPath);
  });

  it("fails when the agent writes no summary", async () => {
    const r = await stageSession(input(), opts({ runAgent: async () => true }));
    expect(r).toMatchObject({ ok: false, reason: "no-summary" });
    expect(readPendingMemoryManifest(manifestPath)).toBeNull();
  });

  it("does not count a pre-existing stale summary as success when the agent writes nothing", async () => {
    mkdirSync(stagingDir, { recursive: true });
    writeFileSync(join(stagingDir, "claude_code-s1.md"), "# stale\n## What Happened\nold run\n");
    // runAgent writes nothing → the stale file must be deleted first, so the
    // result is no-summary rather than a false success on stale content.
    const r = await stageSession(input(), opts({ runAgent: async () => true }));
    expect(r).toMatchObject({ ok: false, reason: "no-summary" });
    expect(existsSync(join(stagingDir, "claude_code-s1.md"))).toBe(false);
  });

  it("reports claude-failed when the agent run returns false and writes nothing", async () => {
    const r = await stageSession(input(), opts({ runAgent: async () => false }));
    expect(r).toMatchObject({ ok: false, reason: "claude-failed" });
  });

  it("fails on an empty summary", async () => {
    const r = await stageSession(input(), opts({
      runAgent: async (_b, prompt) => {
        const m = prompt.match(/SUMMARY FILE to write: (\S+)/);
        if (m) writeFileSync(m[1], "   \n");
        return true;
      },
    }));
    expect(r).toMatchObject({ ok: false, reason: "empty-summary" });
  });

  it("fails when the source JSONL is missing", async () => {
    const r = await stageSession({ ...input(), jsonlPath: join(dir, "nope.jsonl") }, opts());
    expect(r).toMatchObject({ ok: false, reason: "jsonl-missing" });
  });

  it("tolerates an unreadable JSONL (a directory) — countLines catch → 0 lines", async () => {
    const jsonlDir = join(dir, "jsonl-as-dir");
    mkdirSync(jsonlDir);
    // existsSync passes (it's a dir); countLines' readFileSync throws → caught.
    const r = await stageSession({ ...input(), jsonlPath: jsonlDir }, opts());
    expect(r.ok).toBe(true); // summary still written by the fake agent
  });

  it("treats an embed that throws as non-fatal (embedded:false)", async () => {
    const r = await stageSession(input(), opts({ embed: async () => { throw new Error("embed boom"); } }));
    expect(r).toMatchObject({ ok: true, embedded: false });
  });

  it("handles an empty JSONL (countLines !buf → 0) without trailing newline", async () => {
    writeFileSync(jsonlPath, ""); // empty
    const r1 = await stageSession(input(), opts());
    expect(r1.ok).toBe(true);
    writeFileSync(jsonlPath, '{"a":1}'); // no trailing newline
    const r2 = await stageSession({ ...input(), sessionId: "s2" }, opts());
    expect(r2.ok).toBe(true);
  });

  it("fails with mkdir-failed when the staging dir can't be created", async () => {
    const filePath = join(dir, "a-file");
    writeFileSync(filePath, "x");
    // stagingDir under a regular file → mkdirSync throws ENOTDIR.
    const r = await stageSession(input(), opts({ stagingDir: join(filePath, "sub") }));
    expect(r).toMatchObject({ ok: false, reason: "mkdir-failed" });
  });

  it("skipEmbed leaves embedded false even if embed would return a vector", async () => {
    const r = await stageSession(input(), opts({ skipEmbed: true, embed: async () => [1, 2] }));
    expect(r.embedded).toBe(false);
    expect(existsSync(join(stagingDir, "claude_code-s1.embedding.json"))).toBe(false);
  });

  it("resolveClaudeBin returns a non-empty path", () => {
    expect(typeof resolveClaudeBin()).toBe("string");
    expect(resolveClaudeBin().length).toBeGreaterThan(0);
  });

  describe("planClaudeSpawn", () => {
    it("Unix (prompt-as-arg): prompt rides argv, stdin ignored, no shell", () => {
      // What buildClaudeInvocation returns on Unix / a Windows .exe.
      const plan = planClaudeSpawn({
        file: "/usr/bin/claude",
        args: ["-p", "PROMPT", "--model", "haiku"],
        options: { stdio: ["ignore", "pipe", "pipe"] },
      });
      expect(plan).toMatchObject({
        file: "/usr/bin/claude",
        args: ["-p", "PROMPT", "--model", "haiku"],
        stdio: ["ignore", "ignore", "ignore"],
        shell: false,
        stdinInput: null,
      });
    });

    it("Windows (.cmd shim): prompt rides stdin, stdin piped, shell on", () => {
      // What buildClaudeInvocation returns for a `.cmd`/`.bat` shim.
      const plan = planClaudeSpawn({
        file: "C:/claude.cmd",
        args: ["-p", "--model", "haiku"],
        options: { input: "PROMPT", stdio: ["pipe", "pipe", "pipe"], shell: true },
      });
      expect(plan).toMatchObject({
        file: "C:/claude.cmd",
        stdio: ["pipe", "ignore", "ignore"],
        shell: true,
        stdinInput: "PROMPT",
      });
    });

    it("shell with a non-string input keeps stdin ignored (no prompt to pipe)", () => {
      const plan = planClaudeSpawn({
        file: "claude.cmd",
        args: [],
        options: { stdio: ["pipe", "pipe", "pipe"], shell: true },
      });
      expect(plan.stdinInput).toBeNull();
      expect(plan.stdio[0]).toBe("ignore");
    });
  });

  // Exercise the REAL default runClaude (spawn path) via a fake executable
  // that mimics `claude -p`: it finds the SUMMARY path in the prompt argv and
  // writes the file, then exits 0. No claude fork, fully deterministic.
  //
  // Skipped on Windows: these two tests spawn a `.mjs` file DIRECTLY as the
  // claudeBin (relying on the `#!/usr/bin/env node` shebang), which Windows
  // cannot exec (spawn EFTYPE). The cross-platform `.cmd` shim spawn path —
  // how the real resolver hands claudeBin to runClaude on Windows — is
  // covered by tests/claude-code/stage-memory-shell-spawn.test.ts. The
  // injected-runAgent tests above and the planClaudeSpawn unit tests below
  // still run on every platform.
  it.skipIf(process.platform === "win32")("default runClaude spawn path writes the summary (fake claude bin)", async () => {
    const fakeBin = join(dir, "fake-claude.mjs");
    writeFileSync(
      fakeBin,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const prompt = process.argv[process.argv.indexOf("-p") + 1] ?? "";
const m = prompt.match(/SUMMARY FILE to write: (\\S+)/);
if (m) writeFileSync(m[1], "# Session s1\\n## What Happened\\nfrom fake bin\\n");
process.exit(0);
`,
    );
    chmodSync(fakeBin, 0o755);
    // No runAgent / embed injection → real runClaude + real defaultEmbed
    // (embeddings are disabled in the test env → embedded:false).
    const r = await stageSession(input(), {
      claudeBin: fakeBin, timeoutMs: 10_000, skipEmbed: false,
      now: () => "2026-06-16T00:00:00.000Z", stagingDir, manifestPath,
    });
    expect(r.ok).toBe(true);
    expect(readFileSync(join(stagingDir, "claude_code-s1.md"), "utf-8")).toBe("# Session s1\n## What Happened\nfrom fake bin\n");
  });

  // Skipped on Windows for the same reason as the test above: spawning a
  // `.mjs` directly hits EFTYPE. Windows `.cmd`-shim coverage lives in
  // tests/claude-code/stage-memory-shell-spawn.test.ts.
  it.skipIf(process.platform === "win32")("default runClaude reports failure when the bin exits non-zero", async () => {
    const fakeBin = join(dir, "fail-claude.mjs");
    writeFileSync(fakeBin, `#!/usr/bin/env node\nprocess.exit(3);\n`);
    chmodSync(fakeBin, 0o755);
    const r = await stageSession(input(), {
      claudeBin: fakeBin, timeoutMs: 10_000, skipEmbed: true,
      now: () => "2026-06-16T00:00:00.000Z", stagingDir, manifestPath,
    });
    expect(r).toMatchObject({ ok: false, reason: "claude-failed" });
  });
});
