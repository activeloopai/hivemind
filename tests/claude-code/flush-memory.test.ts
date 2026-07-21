/**
 * Unit tests for the post-login flush (runFlushMemory). Config, query,
 * upload and embed are injected; the manifest + summary files live in a
 * tmp dir, so no auth/network/$HOME is touched.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFlushMemory, type FlushDeps } from "../../src/commands/flush-memory.js";
import {
  upsertPendingMemoryEntry,
  readPendingMemoryManifest,
  type PendingMemoryEntry,
} from "../../src/skillify/pending-memory-manifest.js";
import type { Config } from "../../src/config.js";
import type { UploadParams } from "../../src/hooks/upload-summary.js";

let dir: string;
let manifestPath: string;

const NOW = "2026-06-16T00:00:00.000Z";

const fakeConfig: Config = {
  token: "t", orgId: "o", orgName: "OrgName", userName: "user", workspaceId: "w",
  apiUrl: "http://x", tableName: "memtable", sessionsTableName: "s", skillsTableName: "sk",
  rulesTableName: "r", goalsTableName: "g", kpisTableName: "k", docsTableName: "d", codebaseTableName: "c",
  memoryPath: "/m",
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flush-"));
  manifestPath = join(dir, "pending-memory.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function stage(id: string, over: Partial<PendingMemoryEntry> = {}): PendingMemoryEntry {
  const summaryPath = join(dir, `${id}.md`);
  if (over.summary_path === undefined) writeFileSync(summaryPath, `# Session ${id}\n## What Happened\nstuff\n`);
  const e: PendingMemoryEntry = {
    session_id: id, source_agent: "claude_code", project: "p",
    source_session_path: `/s/${id}.jsonl`, summary_path: summaryPath,
    embedded: false, extracted_at: NOW, uploaded: false, ...over,
  };
  upsertPendingMemoryEntry(e, NOW, manifestPath);
  return e;
}

function deps(over: Partial<FlushDeps> = {}): FlushDeps {
  return {
    loadConfig: () => fakeConfig,
    makeQuery: () => async () => [],
    upload: async () => ({ path: "insert", sql: "", descLength: 1, summaryLength: 1 }),
    embed: async () => null,
    manifestPath,
    ...over,
  };
}

describe("runFlushMemory", () => {
  it("returns not-logged-in when no config", async () => {
    const r = await runFlushMemory(deps({ loadConfig: () => null }));
    expect(r.reason).toBe("not-logged-in");
  });

  it("default deps (no injection) no-op without network", async () => {
    // Exercises the real defaultDeps()/loadConfig() wiring. Robust to login
    // state: with no creds it returns not-logged-in; with creds but no
    // pending manifest it returns 0 pending. Either way no upload/network
    // happens — the point is to cover the default-construction path.
    const r = await runFlushMemory();
    expect(r.uploaded).toBe(0);
    expect(r.reason === "not-logged-in" || r.pending === 0).toBe(true);
  });

  it("no-op when nothing pending", async () => {
    const r = await runFlushMemory(deps());
    expect(r).toMatchObject({ pending: 0, uploaded: 0, failed: 0 });
  });

  it("uploads pending rows and marks them uploaded", async () => {
    stage("a");
    stage("b");
    const uploaded: UploadParams[] = [];
    const r = await runFlushMemory(deps({ upload: async (_q, p) => { uploaded.push(p); return { path: "insert", sql: "", descLength: 1, summaryLength: 1 }; } }));
    expect(r).toMatchObject({ pending: 2, uploaded: 2, failed: 0 });
    expect(uploaded.map((p) => p.sessionId).sort()).toEqual(["a", "b"]);
    // vpath + memory table wired from config
    expect(uploaded[0].tableName).toBe("memtable");
    expect(uploaded[0].vpath).toMatch(/^\/summaries\/user\//);
    // manifest rows flipped
    const m = readPendingMemoryManifest(manifestPath)!;
    expect(m.entries.every((e) => e.uploaded)).toBe(true);
    expect(m.entries[0].uploaded_org).toBe("OrgName");
  });

  it("counts an empty/whitespace summary as failed", async () => {
    stage("blank", { summary_path: join(dir, "blank.md") });
    writeFileSync(join(dir, "blank.md"), "   \n\t\n");
    const r = await runFlushMemory(deps());
    expect(r).toMatchObject({ pending: 1, uploaded: 0, failed: 1 });
  });

  it("counts an unreadable summary path (a directory) as failed", async () => {
    const asDir = join(dir, "iam-a-dir");
    mkdirSync(asDir);
    stage("dir", { summary_path: asDir });
    const r = await runFlushMemory(deps());
    expect(r).toMatchObject({ pending: 1, uploaded: 0, failed: 1 });
  });

  it("counts a row with a missing summary file as failed, leaves it un-uploaded", async () => {
    stage("gone", { summary_path: join(dir, "does-not-exist.md") });
    const r = await runFlushMemory(deps());
    expect(r).toMatchObject({ pending: 1, uploaded: 0, failed: 1 });
    const m = readPendingMemoryManifest(manifestPath)!;
    expect(m.entries[0].uploaded).toBe(false);
  });

  it("an upload throwing counts as failed without aborting the rest", async () => {
    stage("a");
    stage("b");
    let n = 0;
    const r = await runFlushMemory(deps({
      upload: async () => {
        if (n++ === 0) throw new Error("boom");
        return { path: "insert", sql: "", descLength: 1, summaryLength: 1 };
      },
    }));
    expect(r).toMatchObject({ pending: 2, uploaded: 1, failed: 1 });
  });

  it("computes an embedding only when none was staged", async () => {
    stage("noemb"); // embedded:false, no embedding_path
    let embedCalls = 0;
    await runFlushMemory(deps({ embed: async () => { embedCalls++; return [0.1, 0.2]; } }));
    expect(embedCalls).toBe(1);
  });

  it("falls back to recompute when the staged embedding file is malformed", async () => {
    const embPath = join(dir, "bad.embedding.json");
    writeFileSync(embPath, "not json{");
    stage("bad", { embedded: true, embedding_path: embPath });
    let embedCalls = 0;
    await runFlushMemory(deps({ embed: async () => { embedCalls++; return [0.1]; } }));
    expect(embedCalls).toBe(1); // loadEmbedding catch → null → recompute
  });

  it("falls back to recompute when the staged embedding is not an array", async () => {
    const embPath = join(dir, "obj.embedding.json");
    writeFileSync(embPath, '{"not":"an array"}');
    stage("obj", { embedded: true, embedding_path: embPath });
    let embedCalls = 0;
    await runFlushMemory(deps({ embed: async () => { embedCalls++; return [0.2]; } }));
    expect(embedCalls).toBe(1); // Array.isArray false → null → recompute
  });

  it("reuses a staged embedding from disk instead of recomputing", async () => {
    const embPath = join(dir, "withemb.embedding.json");
    writeFileSync(embPath, JSON.stringify([0.5, 0.6]));
    stage("withemb", { embedded: true, embedding_path: embPath });
    let embedCalls = 0;
    let uploadedVec: number[] | null | undefined;
    await runFlushMemory(deps({
      embed: async () => { embedCalls++; return null; },
      upload: async (_q, p) => { uploadedVec = p.embedding; return { path: "insert", sql: "", descLength: 1, summaryLength: 1 }; },
    }));
    expect(embedCalls).toBe(0); // staged vector used, no recompute
    expect(uploadedVec).toEqual([0.5, 0.6]);
  });
});
