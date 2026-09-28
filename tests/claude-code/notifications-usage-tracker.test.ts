import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendUsageRecord,
  readUsageRecords,
  statsFilePath,
  sumMetric,
  type UsageRecord,
} from "../../src/notifications/usage-tracker.js";
import { parseTranscript } from "../../src/notifications/transcript-parser.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;

function rec(over: Partial<UsageRecord> = {}): UsageRecord {
  return {
    endedAt: "2026-05-13T00:00:00Z",
    sessionId: "s-1",
    memorySearchBytes: 6000,
    memorySearchCount: 3,
    ...over,
  };
}

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-usage-test-"));
  ORIGINAL_HOME = process.env.HOME;
  setFakeHome(TEMP_HOME);
});

afterEach(() => {
  clearFakeHome();
  rmSync(TEMP_HOME, { recursive: true, force: true });
});

describe("usage-tracker — append/read", () => {
  it("appendUsageRecord creates ~/.deeplake/usage-stats.jsonl with one JSONL line", () => {
    appendUsageRecord(rec({ sessionId: "s-1", memorySearchBytes: 6000 }));
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/"sessionId":"s-1"/);
    expect(content).toMatch(/"memorySearchBytes":6000/);
    expect(content.endsWith("\n")).toBe(true);
  });

  it("appendUsageRecord appends rather than truncates across calls", () => {
    appendUsageRecord(rec({ sessionId: "s-1" }));
    appendUsageRecord(rec({ sessionId: "s-2" }));
    appendUsageRecord(rec({ sessionId: "s-3" }));
    const all = readUsageRecords();
    expect(all.map(r => r.sessionId)).toEqual(["s-1", "s-2", "s-3"]);
  });

  it("appendUsageRecord creates the parent directory if missing", () => {
    expect(existsSync(join(TEMP_HOME, ".deeplake"))).toBe(false);
    appendUsageRecord(rec());
    expect(existsSync(join(TEMP_HOME, ".deeplake"))).toBe(true);
  });

  it("appendUsageRecord swallows errors when HOME points at a non-directory", () => {
    const sentinel = join(TEMP_HOME, "sentinel-file");
    writeFileSync(sentinel, "x", "utf-8");
    setFakeHome(sentinel);
    expect(() => appendUsageRecord(rec())).not.toThrow();
  });

  it("readUsageRecords returns [] when the stats file does not exist", () => {
    expect(readUsageRecords()).toEqual([]);
  });

  it("readUsageRecords skips malformed lines individually", () => {
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    mkdirSync(join(TEMP_HOME, ".deeplake"));
    const goodLine = JSON.stringify(rec({ sessionId: "good" }));
    writeFileSync(
      file,
      `${goodLine}\nnot-json\n{"sessionId":"missing-fields"}\n${JSON.stringify(rec({ sessionId: "good-2" }))}\n`,
      "utf-8",
    );
    const records = readUsageRecords();
    expect(records.map(r => r.sessionId)).toEqual(["good", "good-2"]);
  });

  it("readUsageRecords backward-compat: accepts records missing memorySearchCount (defaults to 0)", () => {
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    mkdirSync(join(TEMP_HOME, ".deeplake"));
    // Simulate a record written by a prior parser version: no memorySearchCount.
    const legacy = JSON.stringify({
      endedAt: "2026-05-12T18:09:18Z",
      sessionId: "legacy-record",
      memorySearchBytes: 0,
      // memorySearchCount intentionally missing
    });
    writeFileSync(file, legacy + "\n", "utf-8");
    const records = readUsageRecords();
    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toBe("legacy-record");
    expect(records[0].memorySearchCount).toBe(0);
  });

  it("readUsageRecords backward-compat: accepts records missing memorySearchBytes (defaults to 0)", () => {
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    mkdirSync(join(TEMP_HOME, ".deeplake"));
    const legacy = JSON.stringify({
      endedAt: "2026-05-12T18:09:18Z",
      sessionId: "legacy-record",
      // memorySearchBytes intentionally missing
      memorySearchCount: 0,
    });
    writeFileSync(file, legacy + "\n", "utf-8");
    const records = readUsageRecords();
    expect(records).toHaveLength(1);
    expect(records[0].memorySearchBytes).toBe(0);
  });

  it("readUsageRecords still drops records missing the strict minimum (endedAt or sessionId)", () => {
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    mkdirSync(join(TEMP_HOME, ".deeplake"));
    const noEnded = JSON.stringify({ sessionId: "x", memorySearchBytes: 0, memorySearchCount: 0 });
    const noSession = JSON.stringify({ endedAt: "2026-05-12T00:00:00Z", memorySearchBytes: 0, memorySearchCount: 0 });
    const good = JSON.stringify(rec({ sessionId: "valid" }));
    writeFileSync(file, `${noEnded}\n${noSession}\n${good}\n`, "utf-8");
    expect(readUsageRecords().map(r => r.sessionId)).toEqual(["valid"]);
  });

  it("readUsageRecords ignores blank lines without warning", () => {
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    mkdirSync(join(TEMP_HOME, ".deeplake"));
    writeFileSync(
      file,
      `\n\n${JSON.stringify(rec({ sessionId: "only-real" }))}\n\n`,
      "utf-8",
    );
    expect(readUsageRecords().map(r => r.sessionId)).toEqual(["only-real"]);
  });
});

describe("usage-tracker — resumed sessions (one cumulative record per session)", () => {
  it("keeps only the last record for a repeated nonempty sessionId", () => {
    appendUsageRecord(rec({ sessionId: "resumed", endedAt: "2026-05-13T01:00:00Z", memorySearchBytes: 1000, memorySearchCount: 1 }));
    appendUsageRecord(rec({ sessionId: "resumed", endedAt: "2026-05-13T02:00:00Z", memorySearchBytes: 2500, memorySearchCount: 3 }));
    const records = readUsageRecords();
    expect(records).toEqual([
      { endedAt: "2026-05-13T02:00:00Z", sessionId: "resumed", memorySearchBytes: 2500, memorySearchCount: 3 },
    ]);
    expect(sumMetric(records, "memorySearchBytes")).toBe(2500);
    expect(sumMetric(records, "memorySearchCount")).toBe(3);
  });

  it("storage stays append-only: every snapshot line is still on disk", () => {
    appendUsageRecord(rec({ sessionId: "resumed", memorySearchBytes: 1000 }));
    appendUsageRecord(rec({ sessionId: "resumed", memorySearchBytes: 2500 }));
    const lines = readFileSync(statsFilePath(), "utf-8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it("preserves distinct sessions and orders by each session's last record", () => {
    appendUsageRecord(rec({ sessionId: "a", memorySearchBytes: 100, memorySearchCount: 1 }));
    appendUsageRecord(rec({ sessionId: "b", memorySearchBytes: 200, memorySearchCount: 2 }));
    appendUsageRecord(rec({ sessionId: "a", memorySearchBytes: 300, memorySearchCount: 4 }));
    const records = readUsageRecords();
    expect(records.map(r => [r.sessionId, r.memorySearchBytes])).toEqual([["b", 200], ["a", 300]]);
    expect(sumMetric(records, "memorySearchBytes")).toBe(500);
    expect(sumMetric(records, "memorySearchCount")).toBe(6);
  });

  it("keeps records with an empty sessionId independently (unknown sessions are not conflated)", () => {
    appendUsageRecord(rec({ sessionId: "", memorySearchBytes: 10, memorySearchCount: 1 }));
    appendUsageRecord(rec({ sessionId: "", memorySearchBytes: 20, memorySearchCount: 1 }));
    appendUsageRecord(rec({ sessionId: "known", memorySearchBytes: 30, memorySearchCount: 1 }));
    const records = readUsageRecords();
    expect(records.map(r => [r.sessionId, r.memorySearchBytes])).toEqual([["", 10], ["", 20], ["known", 30]]);
  });

  it("an invalid later line does not displace the last valid record for the session", () => {
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    mkdirSync(join(TEMP_HOME, ".deeplake"));
    const first = JSON.stringify(rec({ sessionId: "resumed", memorySearchBytes: 1000 }));
    const second = JSON.stringify(rec({ sessionId: "resumed", memorySearchBytes: 2500 }));
    const invalid = JSON.stringify({ sessionId: "resumed", memorySearchBytes: 99999 }); // no endedAt
    writeFileSync(file, `${first}\n${second}\n${invalid}\nnot-json\n`, "utf-8");
    const records = readUsageRecords();
    expect(records).toHaveLength(1);
    expect(records[0].memorySearchBytes).toBe(2500);
  });

  it("dedup keeps missing-counter compatibility for the last legacy snapshot", () => {
    const file = join(TEMP_HOME, ".deeplake", "usage-stats.jsonl");
    mkdirSync(join(TEMP_HOME, ".deeplake"));
    const first = JSON.stringify(rec({ sessionId: "legacy", memorySearchBytes: 1000, memorySearchCount: 2 }));
    const legacy = JSON.stringify({ endedAt: "2026-05-14T00:00:00Z", sessionId: "legacy", memorySearchBytes: 1500 });
    writeFileSync(file, `${first}\n${legacy}\n`, "utf-8");
    expect(readUsageRecords()).toEqual([
      { endedAt: "2026-05-14T00:00:00Z", sessionId: "legacy", memorySearchBytes: 1500, memorySearchCount: 0 },
    ]);
  });

  it("lifecycle: parseTranscript → appendUsageRecord across two SessionEnds → readUsageRecords counts once", () => {
    const transcript = join(TEMP_HOME, "transcript.jsonl");
    const toolUse = (id: string, ts: string) => ({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id, name: "Bash", input: { command: "grep -r foo ~/.deeplake/memory/" } }],
      },
      timestamp: ts,
      sessionId: "real-session",
    });
    const toolResult = (id: string, content: string, ts: string) => ({
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] },
      timestamp: ts,
      sessionId: "real-session",
    });
    const toJsonl = (lines: object[]) => lines.map(l => JSON.stringify(l)).join("\n") + "\n";

    // First SessionEnd: one memory lookup returning 100 bytes.
    writeFileSync(transcript, toJsonl([
      toolUse("t1", "2026-05-13T10:00:00Z"),
      toolResult("t1", "a".repeat(100), "2026-05-13T10:00:05Z"),
    ]), "utf-8");
    appendUsageRecord(parseTranscript(transcript, "fallback"));

    // Resume: the transcript grows, and SessionEnd re-parses the whole file.
    appendFileSync(transcript, toJsonl([
      toolUse("t2", "2026-05-13T11:00:00Z"),
      toolResult("t2", "b".repeat(250), "2026-05-13T11:00:05Z"),
    ]), "utf-8");
    appendUsageRecord(parseTranscript(transcript, "fallback"));

    const records = readUsageRecords();
    expect(records).toEqual([
      { endedAt: "2026-05-13T11:00:05Z", sessionId: "real-session", memorySearchBytes: 350, memorySearchCount: 2 },
    ]);
    expect(sumMetric(records, "memorySearchBytes")).toBe(350);
    expect(sumMetric(records, "memorySearchCount")).toBe(2);
  });
});

describe("usage-tracker — sumMetric", () => {
  const records: UsageRecord[] = [
    rec({ memorySearchBytes: 1000, memorySearchCount: 2 }),
    rec({ memorySearchBytes: 2000, memorySearchCount: 5 }),
    rec({ memorySearchBytes: 3000, memorySearchCount: 1 }),
  ];

  it("sums numeric fields", () => {
    expect(sumMetric(records, "memorySearchBytes")).toBe(6000);
    expect(sumMetric(records, "memorySearchCount")).toBe(8);
  });

  it("returns 0 for empty records list", () => {
    expect(sumMetric([], "memorySearchBytes")).toBe(0);
  });

  it("treats non-numeric entries as 0 — sumMetric is robust", () => {
    const broken = [...records, { ...rec(), memorySearchBytes: NaN as unknown as number }];
    expect(sumMetric(broken, "memorySearchBytes")).toBe(6000);
  });
});

describe("usage-tracker — statsFilePath", () => {
  it("resolves lazily under the current HOME", () => {
    expect(statsFilePath().startsWith(TEMP_HOME)).toBe(true);
  });

  it("re-resolves when HOME changes between calls", () => {
    const first = statsFilePath();
    const otherHome = mkdtempSync(join(tmpdir(), "hivemind-usage-test-other-"));
    try {
      setFakeHome(otherHome);
      const second = statsFilePath();
      expect(second).not.toBe(first);
      expect(second.startsWith(otherHome)).toBe(true);
    } finally {
      setFakeHome(TEMP_HOME);
      rmSync(otherHome, { recursive: true, force: true });
    }
  });
});

describe("countUserGeneratedSkills", () => {
  it("returns 0 when userName is undefined", async () => {
    const { countUserGeneratedSkills } = await import("../../src/notifications/usage-tracker.js");
    expect(countUserGeneratedSkills(undefined)).toBe(0);
  });

  it("returns 0 when ~/.claude/skills/ does not exist", async () => {
    const { countUserGeneratedSkills } = await import("../../src/notifications/usage-tracker.js");
    expect(countUserGeneratedSkills("kamo.aghbalyan")).toBe(0);
  });

  it("counts dirs whose suffix matches --<userName>", async () => {
    const dir = join(TEMP_HOME, ".claude", "skills");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "skill-one--kamo.aghbalyan"));
    mkdirSync(join(dir, "skill-two--kamo.aghbalyan"));
    mkdirSync(join(dir, "skill-three--kamo.aghbalyan"));
    mkdirSync(join(dir, "other-skill--levon"));         // different author
    mkdirSync(join(dir, "hivemind-openclaw-capture"));  // no author suffix
    const { countUserGeneratedSkills } = await import("../../src/notifications/usage-tracker.js");
    expect(countUserGeneratedSkills("kamo.aghbalyan")).toBe(3);
  });

  it("does not match a userName that's a prefix of another author", async () => {
    const dir = join(TEMP_HOME, ".claude", "skills");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "skill-a--kamo"));
    mkdirSync(join(dir, "skill-b--kamo.aghbalyan"));
    const { countUserGeneratedSkills } = await import("../../src/notifications/usage-tracker.js");
    // "kamo" as userName must match only "skill-a--kamo", NOT "skill-b--kamo.aghbalyan"
    expect(countUserGeneratedSkills("kamo")).toBe(1);
    // "kamo.aghbalyan" as userName must match only the longer one
    expect(countUserGeneratedSkills("kamo.aghbalyan")).toBe(1);
  });

  it("requires content before the `--<userName>` suffix (no bare matches)", async () => {
    const dir = join(TEMP_HOME, ".claude", "skills");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "--kamo"));      // pathological / empty name
    mkdirSync(join(dir, "real--kamo"));
    const { countUserGeneratedSkills } = await import("../../src/notifications/usage-tracker.js");
    expect(countUserGeneratedSkills("kamo")).toBe(1);
  });

  it("returns 0 when no dirs match the userName suffix", async () => {
    const dir = join(TEMP_HOME, ".claude", "skills");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "skill-x--levon"));
    mkdirSync(join(dir, "skill-y--emanuele.fenocchi"));
    const { countUserGeneratedSkills } = await import("../../src/notifications/usage-tracker.js");
    expect(countUserGeneratedSkills("kamo")).toBe(0);
  });
});
