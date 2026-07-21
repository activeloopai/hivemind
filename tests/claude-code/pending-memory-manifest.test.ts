/**
 * Unit tests for the memory-backfill staging manifest (the collect-now /
 * upload-after-signup ledger). All accessors take an injectable path so we
 * test against a tmp file without touching the developer's HOME.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  upsertPendingMemoryEntry,
  markUploaded,
  stagedSessionIds,
  countPendingUploads,
  readPendingMemoryManifest,
  type PendingMemoryEntry,
} from "../../src/skillify/pending-memory-manifest.js";

let dir: string;
let manifestPath: string;

const NOW = "2026-06-16T00:00:00.000Z";

function entry(id: string, over: Partial<PendingMemoryEntry> = {}): PendingMemoryEntry {
  return {
    session_id: id,
    source_agent: "claude_code",
    project: "proj",
    source_session_path: `/sessions/${id}.jsonl`,
    summary_path: `/staged/${id}.md`,
    embedded: false,
    extracted_at: NOW,
    uploaded: false,
    ...over,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pmm-"));
  manifestPath = join(dir, "pending-memory.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("pending-memory-manifest", () => {
  it("missing manifest reads as empty (0 staged, 0 pending)", () => {
    expect(readPendingMemoryManifest(manifestPath)).toBeNull();
    expect(stagedSessionIds(manifestPath).size).toBe(0);
    expect(countPendingUploads(manifestPath)).toBe(0);
  });

  it("upsert appends new rows and dedups by session_id", () => {
    upsertPendingMemoryEntry(entry("a"), NOW, manifestPath);
    upsertPendingMemoryEntry(entry("b"), NOW, manifestPath);
    // Re-stage 'a' with a different summary path → replace, not duplicate.
    upsertPendingMemoryEntry(entry("a", { summary_path: "/staged/a-v2.md" }), NOW, manifestPath);

    const ids = stagedSessionIds(manifestPath);
    expect([...ids].sort()).toEqual(["a", "b"]);
    const m = readPendingMemoryManifest(manifestPath)!;
    expect(m.entries).toHaveLength(2);
    expect(m.entries.find((e) => e.session_id === "a")!.summary_path).toBe("/staged/a-v2.md");
  });

  it("countPendingUploads counts only un-uploaded rows", () => {
    upsertPendingMemoryEntry(entry("a"), NOW, manifestPath);
    upsertPendingMemoryEntry(entry("b"), NOW, manifestPath);
    expect(countPendingUploads(manifestPath)).toBe(2);

    expect(markUploaded("a", "org1", NOW, manifestPath)).toBe(true);
    expect(countPendingUploads(manifestPath)).toBe(1);

    const a = readPendingMemoryManifest(manifestPath)!.entries.find((e) => e.session_id === "a")!;
    expect(a.uploaded).toBe(true);
    expect(a.uploaded_org).toBe("org1");
    expect(a.uploaded_at).toBe(NOW);
  });

  it("markUploaded on an unknown id is a no-op returning false", () => {
    upsertPendingMemoryEntry(entry("a"), NOW, manifestPath);
    expect(markUploaded("missing", "org1", NOW, manifestPath)).toBe(false);
    expect(countPendingUploads(manifestPath)).toBe(1);
  });

  it("malformed manifest degrades safely to empty", () => {
    rmSync(manifestPath, { force: true });
    // write garbage
    const { writeFileSync } = require("node:fs");
    writeFileSync(manifestPath, "not json");
    expect(readPendingMemoryManifest(manifestPath)).toBeNull();
    expect(stagedSessionIds(manifestPath).size).toBe(0);
    expect(countPendingUploads(manifestPath)).toBe(0);
  });
});
