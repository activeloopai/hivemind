import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  entriesForLine,
  extractText,
  coworkDataNoticeOnce,
  summarizeIdleSessions,
  COWORK_AGENT,
  type IngestState,
} from "../../src/mcp/cowork-ingest.js";

const fakeConfig = {} as Parameters<typeof summarizeIdleSessions>[0];

type Line = Parameters<typeof entriesForLine>[0];
const firstEntry = (line: Line) => entriesForLine(line)[0] ?? null;

describe("extractText", () => {
  it("returns a plain string unchanged", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("joins text blocks and ignores thinking/tool_use", () => {
    const content = [
      { type: "thinking", thinking: "hmm", signature: "x" },
      { type: "text", text: "first" },
      { type: "tool_use", name: "hivemind_search", input: {} },
      { type: "text", text: "second" },
    ];
    expect(extractText(content)).toBe("first\nsecond");
  });

  it("returns empty string for non-text content", () => {
    expect(extractText(undefined)).toBe("");
    expect(extractText([{ type: "thinking", thinking: "x" }])).toBe("");
  });
});

describe("entriesForLine", () => {
  const base = {
    sessionId: "b27efa59-a8bc-4ea3-8b02-18cbc608ae17",
    timestamp: "2026-06-26T15:02:13.529Z",
    cwd: "/some/cowork/outputs",
  };

  it("maps a user line to a user_message entry tagged as Cowork", () => {
    expect(firstEntry({ ...base, type: "user", message: { content: "ciao" } })).toMatchObject({
      session_id: base.sessionId,
      timestamp: base.timestamp,
      type: "user_message",
      content: "ciao",
      agent: COWORK_AGENT,
    });
  });

  it("maps an assistant line with text blocks to an assistant_message entry", () => {
    expect(firstEntry({
      ...base,
      type: "assistant",
      message: { content: [{ type: "text", text: "risposta" }] },
    })).toMatchObject({ type: "assistant_message", content: "risposta", agent: COWORK_AGENT });
  });

  it("emits a tool_call entry for each assistant tool_use block", () => {
    const entries = entriesForLine({
      ...base,
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "let me search" },
          { type: "tool_use", id: "toolu_1", name: "hivemind_search", input: { query: "x" } },
        ],
      },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ type: "assistant_message", content: "let me search" });
    expect(entries[1]).toMatchObject({
      type: "tool_call",
      tool_name: "hivemind_search",
      tool_use_id: "toolu_1",
      tool_input: JSON.stringify({ query: "x" }),
      agent: COWORK_AGENT,
    });
  });

  it("emits a tool_result entry for a user tool_result block", () => {
    const entries = entriesForLine({
      ...base,
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "rows=5" }] },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_1",
      tool_response: JSON.stringify("rows=5"),
      agent: COWORK_AGENT,
    });
  });

  it("skips assistant turns that carry no text and no tool calls (pure thinking)", () => {
    expect(entriesForLine({
      ...base,
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "x" }] },
    })).toEqual([]);
  });

  it("skips empty user messages and non-message line types", () => {
    expect(entriesForLine({ ...base, type: "user", message: { content: "   " } })).toEqual([]);
    expect(entriesForLine({ ...base, type: "queue-operation" })).toEqual([]);
    expect(entriesForLine({ ...base, type: "attachment" })).toEqual([]);
  });

  it("skips lines without a sessionId", () => {
    expect(entriesForLine({ type: "user", message: { content: "hi" } })).toEqual([]);
  });
});

describe("summarizeIdleSessions", () => {
  const now = 10_000_000;
  const idleMtimeSec = (now - 6 * 60_000) / 1000; // older than the 5-min idle window
  const freshMtimeSec = (now - 60_000) / 1000; // 1 min ago — still active

  function transcript(mtimeSec: number): string {
    const dir = mkdtempSync(join(tmpdir(), "cowork-idle-"));
    const p = join(dir, "11111111-1111-1111-1111-111111111111.jsonl");
    writeFileSync(p, "{}\n");
    utimesSync(p, mtimeSec, mtimeSec);
    return p;
  }

  it("spawns a summary for an idle session with un-summarized content", () => {
    const p = transcript(idleMtimeSec);
    const state: IngestState = { processedLines: { [p]: 5 }, summarizedLines: {} };
    const spawned: string[] = [];
    summarizeIdleSessions(fakeConfig, state, (sid) => spawned.push(sid), now);
    expect(spawned).toEqual(["11111111-1111-1111-1111-111111111111"]);
    expect(state.summarizedLines![p]).toBe(5);
  });

  it("does not re-spawn when there is no new content since the last summary", () => {
    const p = transcript(idleMtimeSec);
    const state: IngestState = { processedLines: { [p]: 5 }, summarizedLines: { [p]: 5 } };
    const spawned: string[] = [];
    summarizeIdleSessions(fakeConfig, state, (sid) => spawned.push(sid), now);
    expect(spawned).toEqual([]);
  });

  it("does not summarize a session still being written (not idle)", () => {
    const p = transcript(freshMtimeSec);
    const state: IngestState = { processedLines: { [p]: 5 }, summarizedLines: {} };
    const spawned: string[] = [];
    summarizeIdleSessions(fakeConfig, state, (sid) => spawned.push(sid), now);
    expect(spawned).toEqual([]);
  });
});

describe("coworkDataNoticeOnce", () => {
  it("returns empty string when capture is disabled (no fs side effects)", () => {
    const prev = process.env.HIVEMIND_CAPTURE;
    process.env.HIVEMIND_CAPTURE = "false";
    try {
      expect(coworkDataNoticeOnce()).toBe("");
    } finally {
      if (prev === undefined) delete process.env.HIVEMIND_CAPTURE;
      else process.env.HIVEMIND_CAPTURE = prev;
    }
  });
});
