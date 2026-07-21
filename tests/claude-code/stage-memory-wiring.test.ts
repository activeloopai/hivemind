/**
 * Coverage for stage-memory's REAL default wiring: defaultEmbed →
 * EmbedClient (mocked), and the runClaude spawn-error branch (real spawn of
 * a non-existent binary → 'error' event).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../src/embeddings/disable.js", () => ({ embeddingsDisabled: () => false }));
vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class {
    constructor(..._a: unknown[]) {}
    async embed(_t: string) { return [1, 2, 3]; }
  },
}));

import { stageSession } from "../../src/skillify/stage-memory.js";

let dir: string;
let stagingDir: string;
let manifestPath: string;
let jsonlPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stagewire-"));
  stagingDir = join(dir, "staging");
  manifestPath = join(dir, "pending-memory.json");
  jsonlPath = join(dir, "session.jsonl");
  writeFileSync(jsonlPath, '{"type":"user"}\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = { sessionId: "s1", jsonlPath: "", agent: "claude_code", project: "p" };

describe("stage default wiring", () => {
  it("uses the real defaultEmbed → EmbedClient (no embed injection)", async () => {
    const r = await stageSession(
      { ...input, jsonlPath },
      {
        claudeBin: "/fake", timeoutMs: 5000, skipEmbed: false,
        now: () => "2026-06-16T00:00:00.000Z", stagingDir, manifestPath,
        // No `embed` → defaultEmbed runs (embeddingsDisabled mocked false,
        // EmbedClient mocked → [1,2,3]).
        runAgent: async (_b, prompt) => {
          const m = prompt.match(/SUMMARY FILE to write: (\S+)/);
          if (m) writeFileSync(m[1], "# s1\n## What Happened\nx\n");
          return true;
        },
      },
    );
    expect(r.embedded).toBe(true);
    expect(JSON.parse(readFileSync(join(stagingDir, "claude_code-s1.embedding.json"), "utf-8"))).toEqual([1, 2, 3]);
  });

  it("real runClaude resolves false when the binary does not exist (spawn 'error')", async () => {
    const r = await stageSession(
      { ...input, jsonlPath },
      {
        claudeBin: join(dir, "no-such-bin"), timeoutMs: 5000, skipEmbed: true,
        now: () => "2026-06-16T00:00:00.000Z", stagingDir, manifestPath,
        // No runAgent → real runClaude spawns the missing bin → 'error'.
      },
    );
    expect(r).toMatchObject({ ok: false, reason: "claude-failed" });
    expect(existsSync(join(stagingDir, "claude_code-s1.md"))).toBe(false);
  });
});
