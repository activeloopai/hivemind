/**
 * Covers the real `defaultEmbed` path of stageSession — the branch where
 * embeddings are ENABLED, so the stager computes a vector locally via
 * EmbedClient and persists it. The rest of the stage-memory suite runs with
 * embeddings disabled (no `@huggingface/transformers` in the dev tree), which
 * only exercises the early-return. Here we flip the gate via the disable.ts
 * test hooks and stub EmbedClient so no real daemon is spawned.
 *
 * Isolated file so the EmbedClient module mock doesn't leak into the suites
 * that assert the disabled (embedded:false) behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class {
    async embed(): Promise<number[]> {
      return [0.5, 0.25, 0.125];
    }
  },
}));

import { stageSession } from "../../src/skillify/stage-memory.js";
import {
  _setResolveForTesting,
  _setEnabledReaderForTesting,
  _resetForTesting,
} from "../../src/embeddings/disable.js";

let dir: string;
let stagingDir: string;
let manifestPath: string;
let jsonlPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stage-embed-"));
  stagingDir = join(dir, "staging");
  manifestPath = join(dir, "pending-memory.json");
  jsonlPath = join(dir, "session.jsonl");
  writeFileSync(jsonlPath, '{"type":"user"}\n');
  // Force embeddingsDisabled() === false: enabled in config AND the
  // transformers resolve "succeeds" (no throw).
  _setEnabledReaderForTesting(() => true);
  _setResolveForTesting(() => { /* resolvable */ });
});
afterEach(() => {
  _resetForTesting();
  rmSync(dir, { recursive: true, force: true });
});

describe("stageSession — default local embed path", () => {
  it("computes and persists an embedding when embeddings are enabled", async () => {
    const r = await stageSession(
      { sessionId: "s1", jsonlPath, agent: "claude_code", project: "proj" },
      {
        claudeBin: "/fake/claude",
        timeoutMs: 1000,
        skipEmbed: false,
        now: () => "2026-06-16T00:00:00.000Z",
        stagingDir,
        manifestPath,
        // Stub the agent so a summary lands; leave `embed` UNSET so the real
        // defaultEmbed (→ mocked EmbedClient) runs.
        runAgent: async (_bin, prompt) => {
          const m = prompt.match(/SUMMARY FILE to write: (\S+)/);
          if (m) writeFileSync(m[1], "# Session s1\n## What Happened\nreal content\n");
          return true;
        },
      },
    );
    expect(r).toMatchObject({ ok: true, embedded: true });
    const embPath = join(stagingDir, "claude_code-s1.embedding.json");
    expect(existsSync(embPath)).toBe(true);
    expect(JSON.parse(readFileSync(embPath, "utf-8"))).toEqual([0.5, 0.25, 0.125]);
  });

  it("skips embedding (embedded:false, no file) when the user opted out", async () => {
    // User-disabled → defaultEmbed early-returns null before touching EmbedClient.
    _setEnabledReaderForTesting(() => false);
    const r = await stageSession(
      { sessionId: "s2", jsonlPath, agent: "claude_code", project: "proj" },
      {
        claudeBin: "/fake/claude",
        timeoutMs: 1000,
        skipEmbed: false,
        now: () => "2026-06-16T00:00:00.000Z",
        stagingDir,
        manifestPath,
        runAgent: async (_bin, prompt) => {
          const m = prompt.match(/SUMMARY FILE to write: (\S+)/);
          if (m) writeFileSync(m[1], "# Session s2\n## What Happened\nreal content\n");
          return true;
        },
      },
    );
    expect(r).toMatchObject({ ok: true, embedded: false });
    expect(existsSync(join(stagingDir, "claude_code-s2.embedding.json"))).toBe(false);
  });
});
