import { describe, it, expect } from "vitest";
import { transcriptEvents, recoveredEventId } from "../../../src/capture-recovery/transcript.js";

const S = "sess-1";
const t = (min: number) => new Date(Date.UTC(2026, 9, 29, 6, 0) + min * 60_000).toISOString();
const SINCE = Date.parse(t(0));
const evs = (lines: string[], sid: string, since: number) => transcriptEvents(lines, sid, since).events;

const j = (o: unknown) => JSON.stringify(o);
const prompt = (min: number, text: string, extra: Record<string, unknown> = {}) =>
  j({ type: "user", uuid: `u-${min}`, timestamp: t(min), cwd: "/w/game", message: { role: "user", content: text }, ...extra });
const toolUse = (min: number, id: string, name = "Bash", input: unknown = { command: "ls" }) =>
  j({ type: "assistant", uuid: `a-${id}`, timestamp: t(min), cwd: "/w/game", message: { id: `m-${id}`, model: "claude-x", stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }] } });
const toolResult = (min: number, id: string, opts: { isError?: boolean; tur?: unknown; text?: string } = {}) =>
  j({
    type: "user", uuid: `r-${id}`, timestamp: t(min), cwd: "/w/game",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: opts.isError ?? false, content: opts.text ?? "out" }] },
    ...(opts.tur !== undefined ? { toolUseResult: opts.tur } : {}),
  });
const reply = (min: number, mid: string, block: Record<string, unknown>, stop: string | null = "end_turn") =>
  j({ type: "assistant", uuid: `a-${mid}-${min}`, timestamp: t(min), cwd: "/w/game", message: { id: mid, model: "claude-x", stop_reason: stop, content: [block] } });

describe("transcriptEvents", () => {
  it("rebuilds prompt, tool call and final reply after the cutoff, in time order", () => {
    const ev = evs([
      prompt(1, "fix the build"),
      toolUse(2, "tu1"),
      toolResult(3, "tu1", { tur: { stdout: "ok", stderr: "", interrupted: false } }),
      reply(4, "m-final", { type: "thinking", thinking: "…" }),
      reply(4.1, "m-final", { type: "text", text: "Fixed it." }),
    ], S, SINCE);
    expect(ev.map((e) => [e.hookEvent, e.body.type])).toEqual([
      ["UserPromptSubmit", "user_message"],
      ["PostToolUse", "tool_call"],
      ["Stop", "assistant_message"],
    ]);
    expect(ev[0].body.content).toBe("fix the build");
    expect(ev[1].body).toMatchObject({ tool_name: "Bash", tool_use_id: "tu1", tool_input: '{"command":"ls"}' });
    expect(JSON.parse(ev[1].body.tool_response as string)).toEqual({ stdout: "ok", stderr: "", interrupted: false });
    expect(ev[1].ts).toBe(t(3)); // PostToolUse fires at result time
    expect(ev[2].body).toMatchObject({ content: "Fixed it.", model: "claude-x" });
    expect(ev[0].cwd).toBe("/w/game");
  });

  it("drops everything at or before the last capture", () => {
    const ev = evs([prompt(-5, "old"), prompt(0, "same instant"), prompt(1, "new")], S, SINCE);
    expect(ev.map((e) => e.body.content)).toEqual(["new"]);
  });

  it("counts a tool call started before the cutoff whose result came after", () => {
    const ev = evs([toolUse(-1, "long"), toolResult(2, "long")], S, SINCE);
    expect(ev).toHaveLength(1);
    expect(ev[0].body.tool_use_id).toBe("long");
  });

  it("marks failed tool calls and keeps the error text", () => {
    const ev = evs([toolUse(1, "f1"), toolResult(2, "f1", { isError: true, tur: "Error: Exit code 1\nboom" })], S, SINCE);
    expect(ev[0].hookEvent).toBe("PostToolUseFailure");
    expect(JSON.parse(ev[0].body.tool_response as string)).toEqual({ error: "Error: Exit code 1\nboom" });
  });

  it("falls back to the tool_result text when there is no structured result", () => {
    const ev = evs([toolUse(1, "x"), toolResult(2, "x", { text: "plain output" })], S, SINCE);
    expect(JSON.parse(ev[0].body.tool_response as string)).toEqual({ content: "plain output" });
  });

  it("skips a tool call still running (no result yet) and replies of unfinished turns", () => {
    const ev = evs([toolUse(1, "running"), reply(2, "mid", { type: "text", text: "working…" }, "tool_use")], S, SINCE);
    expect(ev).toEqual([]);
  });

  it("ignores subagent, injected, compaction and command records", () => {
    const ev = evs([
      prompt(1, "sub", { isSidechain: true }),
      prompt(2, "reminder", { isMeta: true }),
      prompt(3, "This session is being continued…", { isCompactSummary: true }),
      prompt(4, "<local-command-stdout>done</local-command-stdout>"),
      prompt(5, "<command-name>/clear</command-name>"),
      "not json", "", "{broken",
      j({ type: "attachment", timestamp: t(6) }),
    ], S, SINCE);
    expect(ev).toEqual([]);
  });

  it("takes a prompt typed with an image as its text blocks", () => {
    const ev = evs([
      j({ type: "user", uuid: "img", timestamp: t(1), message: { content: [{ type: "image", source: {} }, { type: "text", text: "what is this" }] } }),
    ], S, SINCE);
    expect(ev[0].body.content).toBe("what is this");
  });

  it("flags a failed run of the capture hook after the cutoff, and only that", () => {
    const hookErr = (min: number, command: string) =>
      j({ type: "attachment", timestamp: t(min), attachment: { type: "hook_non_blocking_error", hookEvent: "Stop", command, stderr: "Failed to run: Plugin directory does not exist: /x" } });
    const cap = 'node "${CLAUDE_PLUGIN_ROOT}/bundle/capture.js"';
    expect(transcriptEvents([hookErr(1, cap)], S, SINCE).captureHookFailed).toBe(true);
    expect(transcriptEvents([hookErr(-1, cap)], S, SINCE).captureHookFailed).toBe(false);
    expect(transcriptEvents([hookErr(1, 'node "${CLAUDE_PLUGIN_ROOT}/bundle/graph-on-stop.js"')], S, SINCE).captureHookFailed).toBe(false);
    expect(transcriptEvents([j({ type: "attachment", timestamp: t(1), attachment: { type: "hook_success", command: cap } })], S, SINCE).captureHookFailed).toBe(false);
    expect(transcriptEvents([prompt(1, "x")], S, SINCE).captureHookFailed).toBe(false);
  });

  it("produces the same ids every time and different ids per session", () => {
    const lines = [prompt(1, "a"), toolUse(2, "t"), toolResult(3, "t"), reply(4, "m", { type: "text", text: "b" })];
    const a = evs(lines, S, SINCE).map((e) => e.id);
    expect(evs(lines, S, SINCE).map((e) => e.id)).toEqual(a);
    expect(new Set(a).size).toBe(3);
    expect(evs(lines, "other", SINCE).map((e) => e.id)).not.toEqual(a);
    expect(a[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(recoveredEventId(S, "k")).toBe(recoveredEventId(S, "k"));
  });
});
