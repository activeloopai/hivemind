import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscript } from "../../src/notifications/transcript-parser.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "transcript-records-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** Write synthetic JSONL records without executing their illustrative tool commands. */
function transcript(records: unknown[]): string {
  const path = join(dir, "session.jsonl");
  writeFileSync(path, records.map(record => JSON.stringify(record)).join("\n") + "\n");
  return path;
}

const use = { sessionId: "session", timestamp: "2026-09-01T10:00:00Z",
  message: { role: "assistant", content: [{ type: "tool_use", id: "lookup", name: "Bash",
    input: { command: "cat ~/.deeplake/memory/index.md" } }] } };
const result = { timestamp: "2026-09-01T10:00:01Z",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: "lookup", content: "café\n" }] } };

describe("transcript non-record JSON recovery", () => {
  it.each([0, 1, 2])("retains valid usage with a null record at position %i", position => {
    const records: unknown[] = [use, result];
    records.splice(position, 0, null);
    expect(parseTranscript(transcript(records), "fallback")).toEqual({
      sessionId: "session", endedAt: result.timestamp,
      memorySearchCount: 1, memorySearchBytes: Buffer.byteLength("café\n"),
    });
  });

  it("ignores scalar and array records while preserving the fallback for an empty session", () => {
    const now = new Date("2026-09-01T11:00:00Z");
    expect(parseTranscript(transcript([null, false, 17, "text", [], [use]]), "fallback", now)).toEqual({
      sessionId: "fallback", endedAt: now.toISOString(), memorySearchCount: 0, memorySearchBytes: 0,
    });
  });
});
