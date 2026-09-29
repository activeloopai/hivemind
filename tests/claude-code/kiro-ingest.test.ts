import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  entriesForLine,
  extractText,
  summarizeIdleSessions,
  buildKiroQueueRow,
  KIRO_AGENT,
  type IngestState,
  type KiroLine,
} from "../../src/kiro/kiro-ingest.js";

// Build fixture secrets from split literals so this file never contains a
// scannable vendor token (GitHub secret scanning would block it).
const j = (...parts: string[]): string => parts.join("");
const MASK = "********";

const fakeSessionConfig = { userName: "test-user", orgName: "test-org", workspaceId: "test-ws" };
const fakeConfig = {} as Parameters<typeof summarizeIdleSessions>[0];

const SESSION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const TIMESTAMP = "2026-09-21T07:00:00.000Z";

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------

describe("extractText", () => {
  it("returns empty string for undefined", () => {
    expect(extractText(undefined)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });

  it("extracts text from a single text block", () => {
    expect(extractText([{ kind: "text", data: "hello" }])).toBe("hello");
  });

  it("joins multiple text blocks with newlines", () => {
    expect(extractText([
      { kind: "text", data: "first" },
      { kind: "text", data: "second" },
    ])).toBe("first\nsecond");
  });

  it("ignores toolUse and toolResult blocks", () => {
    expect(extractText([
      { kind: "toolUse", data: { toolUseId: "t1", name: "bash", input: {} } },
      { kind: "text", data: "only this" },
      { kind: "toolResult", data: { toolUseId: "t1", content: "ok" } },
    ] as any)).toBe("only this");
  });
});

// ---------------------------------------------------------------------------
// entriesForLine — kind mapping
// ---------------------------------------------------------------------------

describe("entriesForLine", () => {
  it("maps Prompt kind to a user_message entry", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "Prompt",
      data: { content: [{ kind: "text", data: "hello kiro" }] },
    };
    const entries = entriesForLine(line, SESSION_ID, TIMESTAMP);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      session_id: SESSION_ID,
      timestamp: TIMESTAMP,
      type: "user_message",
      content: "hello kiro",
      agent: KIRO_AGENT,
    });
  });

  it("maps AssistantMessage text to an assistant_message entry", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "AssistantMessage",
      data: { content: [{ kind: "text", data: "here is my answer" }] },
    };
    const entries = entriesForLine(line, SESSION_ID, TIMESTAMP);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "assistant_message",
      content: "here is my answer",
      agent: KIRO_AGENT,
    });
  });

  it("maps AssistantMessage toolUse to a tool_call entry", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "AssistantMessage",
      data: {
        content: [
          { kind: "text", data: "let me search" },
          { kind: "toolUse", data: { toolUseId: "tu-001", name: "bash", input: { cmd: "ls" } } },
        ],
      },
    };
    const entries = entriesForLine(line, SESSION_ID, TIMESTAMP);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ type: "assistant_message", content: "let me search" });
    expect(entries[1]).toMatchObject({
      type: "tool_call",
      tool_name: "bash",
      tool_use_id: "tu-001",
      tool_input: JSON.stringify({ cmd: "ls" }),
      agent: KIRO_AGENT,
    });
  });

  it("maps AssistantMessage with only toolUse (no text) to a single tool_call entry", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "AssistantMessage",
      data: {
        content: [
          { kind: "toolUse", data: { toolUseId: "tu-002", name: "read_file", input: { path: "/x" } } },
        ],
      },
    };
    const entries = entriesForLine(line, SESSION_ID, TIMESTAMP);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "tool_call", tool_name: "read_file" });
  });

  it("maps ToolResults kind to tool_result entries", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "ToolResults",
      data: {
        content: [
          { kind: "toolResult", data: { toolUseId: "tu-001", content: "exit 0" } },
        ],
      },
    };
    const entries = entriesForLine(line, SESSION_ID, TIMESTAMP);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "tu-001",
      tool_response: JSON.stringify("exit 0"),
      agent: KIRO_AGENT,
    });
  });

  it("emits multiple tool_result entries when ToolResults carries multiple blocks", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "ToolResults",
      data: {
        content: [
          { kind: "toolResult", data: { toolUseId: "tu-001", content: "a" } },
          { kind: "toolResult", data: { toolUseId: "tu-002", content: "b" } },
        ],
      },
    };
    const entries = entriesForLine(line, SESSION_ID, TIMESTAMP);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.tool_use_id).toBe("tu-001");
    expect(entries[1]!.tool_use_id).toBe("tu-002");
  });

  it("returns empty array for unknown kind", () => {
    const line: KiroLine = { version: "v1", kind: "SystemMessage", data: { content: [] } };
    expect(entriesForLine(line, SESSION_ID, TIMESTAMP)).toEqual([]);
  });

  it("returns empty array for a Prompt with only whitespace", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "Prompt",
      data: { content: [{ kind: "text", data: "   " }] },
    };
    expect(entriesForLine(line, SESSION_ID, TIMESTAMP)).toEqual([]);
  });

  it("returns empty array for a line with missing data", () => {
    const line: KiroLine = { version: "v1", kind: "Prompt" };
    expect(entriesForLine(line, SESSION_ID, TIMESTAMP)).toEqual([]);
  });

  it("each entry carries a unique UUID id", () => {
    const line: KiroLine = {
      version: "v1",
      kind: "Prompt",
      data: { content: [{ kind: "text", data: "hi" }] },
    };
    const a = entriesForLine(line, SESSION_ID, TIMESTAMP)[0]!.id as string;
    const b = entriesForLine(line, SESSION_ID, TIMESTAMP)[0]!.id as string;
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Secret redaction on the Kiro ingest path
// ---------------------------------------------------------------------------

describe("secret redaction on the Kiro ingest path", () => {
  function queuedMessageFromLine(line: KiroLine): Record<string, unknown> {
    const entries = entriesForLine(line, SESSION_ID, TIMESTAMP);
    expect(entries.length).toBeGreaterThan(0);
    return JSON.parse(buildKiroQueueRow(entries[0]!, fakeSessionConfig).message) as Record<string, unknown>;
  }

  it("masks an OpenAI API key in a Prompt (user_message) content field", () => {
    const secret = j("sk-", "ABCDEFGHIJKLMNOPQRSTUVWX");
    const msg = queuedMessageFromLine({
      version: "v1",
      kind: "Prompt",
      data: { content: [{ kind: "text", data: `my key is ${secret}` }] },
    });
    expect(msg.content).toBe("my key is sk-********");
  });

  it("masks a GitHub PAT in a tool_input field", () => {
    const secret = j("ghp_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    const cmd = `curl -H "Authorization: token ${secret}" https://api.github.com`;
    const entries = entriesForLine(
      {
        version: "v1",
        kind: "AssistantMessage",
        data: {
          content: [
            { kind: "toolUse", data: { toolUseId: "tu-gh", name: "bash", input: { cmd } } },
          ],
        },
      },
      SESSION_ID,
      TIMESTAMP,
    );
    const toolCallEntry = entries.find(e => e.type === "tool_call");
    expect(toolCallEntry).toBeDefined();
    const msg = JSON.parse(buildKiroQueueRow(toolCallEntry!, fakeSessionConfig).message) as Record<string, unknown>;
    const toolInput = JSON.parse(String(msg.tool_input)) as { cmd: string };
    expect(toolInput.cmd).toBe(`curl -H "Authorization: token ghp_********" https://api.github.com`);
  });

  it("masks an Anthropic API key in a tool_response field", () => {
    const secret = j("sk-", "ant-api03-ABCDEFGHIJKLMNOPQRSTUV_wx");
    const entries = entriesForLine(
      {
        version: "v1",
        kind: "ToolResults",
        data: {
          content: [
            { kind: "toolResult", data: { toolUseId: "tu-ant", content: { api_key: secret } } },
          ],
        },
      },
      SESSION_ID,
      TIMESTAMP,
    );
    const toolResultEntry = entries.find(e => e.type === "tool_result");
    expect(toolResultEntry).toBeDefined();
    const msg = JSON.parse(buildKiroQueueRow(toolResultEntry!, fakeSessionConfig).message) as Record<string, unknown>;
    const toolResponse = JSON.parse(String(msg.tool_response)) as { api_key: string };
    expect(toolResponse.api_key).toBe(MASK);
    expect(String(msg.tool_response)).not.toContain(secret);
  });

  it("leaves non-secret content untouched", () => {
    const msg = queuedMessageFromLine({
      version: "v1",
      kind: "Prompt",
      data: { content: [{ kind: "text", data: "what is the weather in Tokyo?" }] },
    });
    expect(msg.content).toBe("what is the weather in Tokyo?");
  });
});

// ---------------------------------------------------------------------------
// summarizeIdleSessions
// ---------------------------------------------------------------------------

describe("summarizeIdleSessions", () => {
  const now = 10_000_000;
  const idleMtimeSec = (now - 6 * 60_000) / 1000;
  const freshMtimeSec = (now - 60_000) / 1000;

  function transcript(mtimeSec: number): string {
    const dir = mkdtempSync(join(tmpdir(), "kiro-idle-"));
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
