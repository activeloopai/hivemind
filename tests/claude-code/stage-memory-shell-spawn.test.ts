/**
 * Covers the Windows `.cmd`-shim spawn branch of the default `runClaude`,
 * where the prompt rides STDIN instead of argv. `binNeedsShell` only returns
 * true on win32, so we can't reach this path on a Linux CI by passing a
 * `.cmd` path — instead we mock `buildClaudeInvocation` to return the exact
 * shell-style invocation it produces for a shim (shell:true + input), and
 * assert the prompt is delivered over stdin to a real child process.
 *
 * Isolated in its own file so the module mock doesn't leak into the
 * argv-path spawn tests in stage-memory.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A real node program that reads the prompt from STDIN, pulls the summary
// path out of it, and writes the summary file — exactly what the prompt asks
// a claude `.cmd` shim to do, but deterministic and offline. Written to disk
// in vi.hoisted so the path is available to the (hoisted) vi.mock factory.
const { reader } = vi.hoisted(() => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shellclaude-"));
  const p = path.join(dir, "reader.mjs");
  fs.writeFileSync(
    p,
    [
      'import { writeFileSync } from "node:fs";',
      'let buf = "";',
      'process.stdin.setEncoding("utf-8");',
      'process.stdin.on("data", (c) => { buf += c; });',
      'process.stdin.on("end", () => {',
      '  const m = buf.match(/SUMMARY FILE to write: (\\S+)/);',
      '  if (m) writeFileSync(m[1], "# Session s1\\n## What Happened\\nfrom stdin\\n");',
      "  process.exit(0);",
      "});",
    ].join("\n"),
  );
  return { reader: p };
});

vi.mock("../../src/hooks/wiki-worker-spawn.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/hooks/wiki-worker-spawn.js")>();
  return {
    ...actual,
    // Mirror the shell branch of the real builder: prompt over stdin, shell on.
    buildClaudeInvocation: (_bin: string, prompt: string) => ({
      file: "node",
      args: [reader],
      options: { input: prompt, stdio: ["pipe", "pipe", "pipe"], shell: true },
    }),
  };
});

import { stageSession } from "../../src/skillify/stage-memory.js";

let dir: string;
let stagingDir: string;
let manifestPath: string;
let jsonlPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stage-shell-"));
  stagingDir = join(dir, "staging");
  manifestPath = join(dir, "pending-memory.json");
  jsonlPath = join(dir, "session.jsonl");
  mkdirSync(stagingDir, { recursive: true });
  writeFileSync(jsonlPath, '{"type":"user"}\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("default runClaude — shell/stdin (Windows .cmd) branch", () => {
  it("delivers the prompt over stdin and stages the summary it writes", async () => {
    const r = await stageSession(
      { sessionId: "s1", jsonlPath, agent: "claude_code", project: "proj" },
      {
        claudeBin: "claude.cmd",
        timeoutMs: 10_000,
        skipEmbed: true,
        now: () => "2026-06-16T00:00:00.000Z",
        stagingDir,
        manifestPath,
      },
    );
    expect(r.ok).toBe(true);
    expect(existsSync(join(stagingDir, "claude_code-s1.md"))).toBe(true);
    expect(readFileSync(join(stagingDir, "claude_code-s1.md"), "utf-8")).toBe(
      "# Session s1\n## What Happened\nfrom stdin\n",
    );
  });
});
