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
import { redactSecrets } from "../../src/hooks/shared/redact.js";
import { buildQueuedSessionRow, buildSessionPath } from "../../src/hooks/session-queue.js";

// Build fixture secrets from split literals at runtime so the source file never
// contains a scannable vendor token (GitHub secret scanning would block this file).
const j = (...parts: string[]): string => parts.join("");

const fakeSessionConfig = { userName: "test-user", orgName: "test-org", workspaceId: "test-ws" };

/**
 * Simulate the exact serialization + redaction that ingestCoworkSessions does
 * for each entry: redactSecrets(JSON.stringify(entry)).
 * Returns the parsed message field from the resulting QueuedSessionRow so tests
 * can assert on the stored payload without wiring up the full ingest loop.
 */
function queuedMessageFor(entry: Record<string, unknown>): Record<string, unknown> {
  const row = buildQueuedSessionRow({
    sessionPath: buildSessionPath(fakeSessionConfig, String(entry.session_id ?? "test-sid")),
    line: redactSecrets(JSON.stringify(entry)),
    userName: fakeSessionConfig.userName,
    projectName: "claude_cowork",
    description: String(entry.type ?? ""),
    agent: COWORK_AGENT,
    pluginVersion: "0.0.0-test",
    timestamp: String(entry.timestamp ?? new Date().toISOString()),
  });
  return JSON.parse(row.message) as Record<string, unknown>;
}

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

describe("secret redaction on the Cowork ingest path (#308)", () => {
  const base = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    session_id: "b27efa59-a8bc-4ea3-8b02-18cbc608ae17",
    timestamp: "2026-06-26T15:02:13.529Z",
    cwd: "/some/cowork/outputs",
    agent: COWORK_AGENT,
  };

  it("masks an OpenAI API key in a user_message content field", () => {
    const secret = j("sk-", "ABCDEFGHIJKLMNOPQRSTUVWX");
    const entry = { ...base, type: "user_message", content: `my key is ${secret}` };
    const msg = queuedMessageFor(entry);
    expect(msg.content).not.toContain(secret);
    expect(String(msg.content)).toContain("sk-");    // scheme prefix kept as a hint
    expect(String(msg.content)).toContain("********");
  });

  it("masks a GitHub PAT in a tool_input field (e.g. curl auth header)", () => {
    const secret = j("ghp_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    const entry = {
      ...base,
      type: "tool_call",
      tool_name: "bash",
      tool_use_id: "toolu_1",
      tool_input: JSON.stringify({ cmd: `curl -H "Authorization: token ${secret}" https://api.github.com` }),
    };
    const msg = queuedMessageFor(entry);
    expect(msg.tool_input).not.toContain(secret);
    expect(String(msg.tool_input)).toContain("ghp_");
    expect(String(msg.tool_input)).toContain("********");
  });

  it("masks a secret in a tool_response field", () => {
    const secret = j("sk-", "ant-api03-ABCDEFGHIJKLMNOPQRSTUV_wx");
    const entry = {
      ...base,
      type: "tool_result",
      tool_use_id: "toolu_2",
      tool_response: JSON.stringify({ api_key: secret }),
    };
    const msg = queuedMessageFor(entry);
    expect(msg.tool_response).not.toContain(secret);
    expect(String(msg.tool_response)).toContain("sk-ant-");
    expect(String(msg.tool_response)).toContain("********");
  });

  it("leaves non-secret content untouched", () => {
    const entry = { ...base, type: "user_message", content: "what is the weather in Tokyo?" };
    const msg = queuedMessageFor(entry);
    expect(msg.content).toBe("what is the weather in Tokyo?");
  });
});
