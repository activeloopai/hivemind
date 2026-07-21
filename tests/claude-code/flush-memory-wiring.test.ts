/**
 * Coverage for flush-memory's REAL default wiring (defaultDeps / makeQuery →
 * DeeplakeApi / defaultEmbed → EmbedClient). The heavy constructors are
 * vi.mock'd so the actual factory code executes without auth/network, while
 * the manifest + summary files live in a tmp dir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const queryCalls: string[] = [];

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor(..._args: unknown[]) {}
    async query(sql: string) { queryCalls.push(sql); return []; }
  },
}));
// NOTE: uploadSummary is NOT mocked — we want the real SELECT+INSERT so the
// makeQuery→DeeplakeApi closure is actually invoked (and thus covered).
vi.mock("../../src/embeddings/disable.js", () => ({ embeddingsDisabled: () => false }));
vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class {
    constructor(..._args: unknown[]) {}
    async embed(_t: string) { return [0.9, 0.8]; }
  },
}));

import { runFlushMemory, defaultDeps } from "../../src/commands/flush-memory.js";
import { upsertPendingMemoryEntry, readPendingMemoryManifest } from "../../src/skillify/pending-memory-manifest.js";
import type { Config } from "../../src/config.js";

let dir: string;
let manifestPath: string;
const NOW = "2026-06-16T00:00:00.000Z";

const cfg: Config = {
  token: "t", orgId: "o", orgName: "Org", userName: "u", workspaceId: "w", apiUrl: "http://x",
  tableName: "mem", sessionsTableName: "s", skillsTableName: "sk", rulesTableName: "r",
  goalsTableName: "g", kpisTableName: "k", docsTableName: "d", codebaseTableName: "c", memoryPath: "/m",
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flushwire-"));
  manifestPath = join(dir, "pending-memory.json");
  queryCalls.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("flush default wiring", () => {
  it("runs makeQuery→DeeplakeApi + defaultEmbed→EmbedClient through the real defaultDeps", async () => {
    const summaryPath = join(dir, "a.md");
    writeFileSync(summaryPath, "# Session a\n## What Happened\nstuff\n");
    upsertPendingMemoryEntry(
      { session_id: "a", source_agent: "claude_code", project: "p", source_session_path: "/s/a.jsonl",
        summary_path: summaryPath, embedded: false, extracted_at: NOW, uploaded: false },
      NOW, manifestPath,
    );

    // Real defaultDeps wiring, only the manifest path swapped to tmp.
    const r = await runFlushMemory({ ...defaultDeps("9.9.9"), loadConfig: () => cfg, manifestPath });

    expect(r).toMatchObject({ pending: 1, uploaded: 1, failed: 0 });
    // makeQuery constructed + called DeeplakeApi.query: real uploadSummary
    // issues an existence SELECT then an INSERT, both against the configured
    // memory table and the exact summary vpath.
    const vpath = "/summaries/u/a.md";
    const sel = queryCalls.find((s) => /^select/i.test(s.trim()));
    const ins = queryCalls.find((s) => /^insert/i.test(s.trim()));
    expect(sel).toContain('"mem"');
    expect(sel).toContain(vpath);
    expect(ins).toContain('"mem"');
    expect(ins).toContain(vpath);
    // defaultEmbed (mocked EmbedClient → [0.9,0.8]) flowed into the INSERT.
    expect(ins).toContain("0.9");
    expect(readPendingMemoryManifest(manifestPath)!.entries[0].uploaded).toBe(true);
  });
});
