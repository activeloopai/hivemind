import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mkdirSync } from "node:fs";
import {
  parseClaudeTurnMeta,
  parseClaudeTurnMetaLive,
  parseCodexTurnMeta,
  normalizeSdkUsage,
  scanClaudeTurnForCapture,
  sdkTurnMeta,
  readClaudeEffortLevel,
  readTailLines,
} from "../../src/notifications/model-usage.js";

let TEMP_DIR = "";

beforeEach(() => {
  TEMP_DIR = mkdtempSync(join(tmpdir(), "hivemind-model-usage-test-"));
});

afterEach(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

function writeTranscript(lines: object[]): string {
  const file = join(TEMP_DIR, "transcript.jsonl");
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
  return file;
}

// Real Claude Code assistant line shape (see transcript sample in model-usage.ts docstring).
function claudeAssistantLine(model: string, usage: Record<string, number>) {
  return {
    type: "assistant",
    message: { model, role: "assistant", content: [], usage },
  };
}

// Real Codex rollout line shapes.
function codexTurnContext(model: string, effort: string) {
  return { type: "turn_context", payload: { model, effort } };
}
function codexTokenCount(last: Record<string, number>, total: Record<string, number>) {
  return {
    type: "event_msg",
    payload: { type: "token_count", info: { last_token_usage: last, total_token_usage: total } },
  };
}

describe("parseClaudeTurnMeta", () => {
  it("returns null for missing path / no path", () => {
    expect(parseClaudeTurnMeta(undefined)).toBeNull();
    expect(parseClaudeTurnMeta("/tmp/does-not-exist-hivemind.jsonl")).toBeNull();
  });

  it("extracts model + normalized usage from the last assistant turn", () => {
    const file = writeTranscript([
      claudeAssistantLine("claude-sonnet-4-6", {
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 7,
      }),
      { type: "user", message: { role: "user", content: [] } },
      claudeAssistantLine("claude-opus-4-8", {
        input_tokens: 19088,
        output_tokens: 404,
        cache_read_input_tokens: 15547,
        cache_creation_input_tokens: 18853,
      }),
    ]);
    const meta = parseClaudeTurnMeta(file);
    // Last assistant turn wins (reverse scan), not the first.
    expect(meta?.model).toBe("claude-opus-4-8");
    // reasoning_effort is read from settings (null when unset); this token-focused
    // test stays hermetic by only asserting the shape, not an ambient value.
    expect(meta?.reasoning_effort === null || typeof meta?.reasoning_effort === "string").toBe(true);
    expect(meta?.token_usage).toEqual({
      input_tokens: 19088,
      output_tokens: 404,
      cache_read_tokens: 15547,
      cache_creation_tokens: 18853,
    });
  });

  it("omits absent usage fields rather than defaulting them to 0", () => {
    const file = writeTranscript([
      claudeAssistantLine("claude-opus-4-8", { input_tokens: 50, output_tokens: 3 }),
    ]);
    const meta = parseClaudeTurnMeta(file);
    expect(meta?.token_usage).toEqual({ input_tokens: 50, output_tokens: 3 });
    expect(meta?.token_usage).not.toHaveProperty("cache_read_tokens");
  });

  it("skips malformed lines and assistant lines without usage", () => {
    // First line is not JSON; second is an assistant line missing usage; third
    // is the valid one the reverse scan should return.
    const file = join(TEMP_DIR, "transcript.jsonl");
    const lines = [
      "not json",
      "null", // valid JSON but not an object — must not throw
      JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", role: "assistant" } }),
      JSON.stringify(claudeAssistantLine("claude-opus-4-8", { input_tokens: 1, output_tokens: 1 })),
    ];
    writeFileSync(file, lines.join("\n") + "\n", "utf-8");
    const meta = parseClaudeTurnMeta(file);
    expect(meta?.token_usage).toEqual({ input_tokens: 1, output_tokens: 1 });
  });
});

describe("parseCodexTurnMeta", () => {
  it("falls back to payload model when the transcript is missing", () => {
    const meta = parseCodexTurnMeta(undefined, "gpt-5.6-sol");
    expect(meta?.model).toBe("gpt-5.6-sol");
    expect(meta?.token_usage).toBeUndefined();
  });

  it("returns null when nothing is available", () => {
    expect(parseCodexTurnMeta(undefined, undefined)).toBeNull();
  });

  it("extracts model, reasoning effort, last + total usage from the rollout", () => {
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "medium"),
      codexTokenCount(
        { input_tokens: 20131, cached_input_tokens: 9984, output_tokens: 154, reasoning_output_tokens: 0, total_tokens: 20285 },
        { input_tokens: 20131, cached_input_tokens: 9984, output_tokens: 154, reasoning_output_tokens: 0, total_tokens: 20285 },
      ),
      codexTokenCount(
        { input_tokens: 32758, cached_input_tokens: 32128, output_tokens: 79, reasoning_output_tokens: 0, total_tokens: 32837 },
        { input_tokens: 212981, cached_input_tokens: 196736, output_tokens: 3427, reasoning_output_tokens: 160, total_tokens: 216408 },
      ),
    ]);
    const meta = parseCodexTurnMeta(file, "payload-model");
    // turn_context model overrides the payload fallback.
    expect(meta?.model).toBe("gpt-5.5");
    expect(meta?.reasoning_effort).toBe("medium");
    // Latest token_count wins for both per-turn and cumulative.
    expect(meta?.token_usage).toEqual({
      input_tokens: 32758,
      output_tokens: 79,
      cache_read_tokens: 32128,
      reasoning_output_tokens: 0,
      total_tokens: 32837,
    });
    expect(meta?.token_usage_total).toEqual({
      input_tokens: 212981,
      output_tokens: 3427,
      cache_read_tokens: 196736,
      reasoning_output_tokens: 160,
      total_tokens: 216408,
    });
  });

  it("does not attach a prior turn's usage to a new turn_context (model change)", () => {
    // Turn A completes with a token_count, then turn B opens with a new model
    // BEFORE its own token_count arrives (the UserPromptSubmit at turn start).
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "medium"),
      codexTokenCount(
        { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
        { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      ),
      codexTurnContext("gpt-5.6-sol", "high"),
    ]);
    const meta = parseCodexTurnMeta(file, "fb");
    expect(meta?.model).toBe("gpt-5.6-sol");
    expect(meta?.reasoning_effort).toBe("high");
    // Turn A's tokens must NOT be attributed to turn B's model.
    expect(meta?.token_usage).toBeUndefined();
    // Session cumulative is preserved across the turn boundary.
    expect(meta?.token_usage_total).toEqual({ input_tokens: 100, output_tokens: 10, total_tokens: 110 });
  });

  it("resets model + effort per turn, falling back to the hook model when a context omits them", () => {
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "medium"),
      codexTokenCount({ input_tokens: 9, output_tokens: 1, total_tokens: 10 }, { input_tokens: 9, output_tokens: 1, total_tokens: 10 }),
      { type: "turn_context", payload: {} }, // new turn with no model/effort
    ]);
    const meta = parseCodexTurnMeta(file, "hook-model");
    expect(meta?.model).toBe("hook-model"); // not the stale gpt-5.5
    expect(meta?.reasoning_effort).toBeUndefined(); // not the stale "medium"
  });

  it("rejects negative / fractional token counts", () => {
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "low"),
      codexTokenCount(
        { input_tokens: -5, output_tokens: 3.5, total_tokens: 10 },
        { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      ),
    ]);
    const meta = parseCodexTurnMeta(file, "fb");
    // input_tokens (negative) and output_tokens (fractional) dropped; total kept.
    expect(meta?.token_usage).toEqual({ total_tokens: 10 });
  });

  it("survives a bare null JSONL line (best-effort contract)", () => {
    const file = join(TEMP_DIR, "transcript.jsonl");
    const lines = [
      "null",
      JSON.stringify(codexTurnContext("gpt-5.5", "low")),
      JSON.stringify(codexTokenCount({ input_tokens: 3, output_tokens: 1, total_tokens: 4 }, { input_tokens: 3, output_tokens: 1, total_tokens: 4 })),
    ];
    writeFileSync(file, lines.join("\n") + "\n", "utf-8");
    const meta = parseCodexTurnMeta(file, "fb");
    expect(meta?.model).toBe("gpt-5.5");
    expect(meta?.token_usage?.total_tokens).toBe(4);
  });

  it("keeps payload model when the rollout has token counts but no turn_context", () => {
    const file = writeTranscript([
      codexTokenCount(
        { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
        { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      ),
    ]);
    const meta = parseCodexTurnMeta(file, "gpt-5.6-sol");
    expect(meta?.model).toBe("gpt-5.6-sol");
    expect(meta?.reasoning_effort).toBeUndefined();
    expect(meta?.token_usage?.total_tokens).toBe(7);
  });
});

describe("normalizeSdkUsage / sdkTurnMeta (Pi + OpenClaw)", () => {
  it("normalizes the real Pi usage shape incl. fractional cost", () => {
    // From a real ~/.pi transcript: {input, output, cacheRead, cacheWrite, totalTokens, cost}.
    const u = { input: 12456, output: 15, cacheRead: 0, cacheWrite: 0, totalTokens: 12471, cost: { input: 0.06228, output: 0.00045, cacheRead: 0, cacheWrite: 0, total: 0.06273 } };
    expect(normalizeSdkUsage(u)).toEqual({
      input_tokens: 12456,
      output_tokens: 15,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      total_tokens: 12471,
      cost: { input: 0.06228, output: 0.00045, cache_read: 0, cache_creation: 0, total: 0.06273 },
    });
  });

  it("normalizes the real OpenClaw usage shape and maps cacheWrite -> cache_creation", () => {
    const u = { input: 28621, output: 806, cacheRead: 4, cacheWrite: 9, totalTokens: 29427 };
    expect(normalizeSdkUsage(u)).toEqual({
      input_tokens: 28621,
      output_tokens: 806,
      cache_read_tokens: 4,
      cache_creation_tokens: 9,
      total_tokens: 29427,
    });
  });

  it("returns undefined for empty / invalid usage", () => {
    expect(normalizeSdkUsage(undefined)).toBeUndefined();
    expect(normalizeSdkUsage({})).toBeUndefined();
    // Negative + fractional both rejected -> no valid keys -> undefined.
    expect(normalizeSdkUsage({ input: -1, output: 2.5 })).toBeUndefined();
  });

  it("builds sdkTurnMeta with model + token_usage, no reasoning effort", () => {
    const meta = sdkTurnMeta("gpt-5.5", { input: 10, output: 3, totalTokens: 13 });
    expect(meta).toEqual({ model: "gpt-5.5", token_usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } });
    expect(meta).not.toHaveProperty("reasoning_effort");
  });

  it("returns undefined when neither model nor usage is present", () => {
    expect(sdkTurnMeta(undefined, undefined)).toBeUndefined();
    expect(sdkTurnMeta("", {})).toBeUndefined();
  });

  it("keeps model even when usage is absent", () => {
    expect(sdkTurnMeta("claude-via-openclaw", null)).toEqual({ model: "claude-via-openclaw" });
  });

  it("carries stop_reason and rejects a fractional token count but keeps fractional cost", () => {
    const meta = sdkTurnMeta("gpt-5.5", { input: 10, output: 3, totalTokens: 13, cost: { total: 0.0627 } }, "stop");
    expect(meta).toEqual({
      model: "gpt-5.5",
      stop_reason: "stop",
      token_usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13, cost: { total: 0.0627 } },
    });
  });

  it("emits stop_reason alone when only it is present", () => {
    expect(sdkTurnMeta(undefined, undefined, "toolUse")).toEqual({ stop_reason: "toolUse" });
  });
});

describe("parseClaudeTurnMeta — stop_reason + usage_extra", () => {
  const tmp = () => join(TEMP_DIR, "transcript.jsonl");
  it("extracts stop_reason and Claude billing extras (tier/speed/cache-ttl/server-tools)", () => {
    const line = {
      type: "assistant",
      message: {
        model: "claude-opus-4-8",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100, output_tokens: 20,
          cache_read_input_tokens: 5, cache_creation_input_tokens: 7,
          service_tier: "standard", speed: "standard", inference_geo: "not_available",
          cache_creation: { ephemeral_1h_input_tokens: 7, ephemeral_5m_input_tokens: 0 },
          server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 },
        },
      },
    };
    writeFileSync(tmp(), JSON.stringify(line) + "\n", "utf-8");
    const meta = parseClaudeTurnMeta(tmp());
    expect(meta?.stop_reason).toBe("end_turn");
    expect(meta?.token_usage).toEqual({ input_tokens: 100, output_tokens: 20, cache_read_tokens: 5, cache_creation_tokens: 7 });
    expect(meta?.usage_extra).toEqual({
      service_tier: "standard",
      speed: "standard",
      inference_geo: "not_available",
      cache_creation_ttl: { ephemeral_1h: 7, ephemeral_5m: 0 },
      server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 },
    });
  });

  it("omits usage_extra when the assistant turn has no extra billing fields", () => {
    const line = { type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 1, output_tokens: 1 } } };
    writeFileSync(tmp(), JSON.stringify(line) + "\n", "utf-8");
    const meta = parseClaudeTurnMeta(tmp());
    expect(meta).not.toHaveProperty("usage_extra");
    expect(meta).not.toHaveProperty("stop_reason");
  });
});

describe("readTailLines", () => {
  const f = () => join(TEMP_DIR, "tail.jsonl");
  it("returns all lines when the file fits in the window", () => {
    writeFileSync(f(), "a\nb\nc\n", "utf-8");
    expect(readTailLines(f(), 1024)).toEqual(["a", "b", "c", ""]);
  });

  it("reads only the tail and drops the partial first line when over the window", () => {
    // 5 lines; a small window that starts mid-file. The first surviving line
    // must be a WHOLE line (partial leading line dropped).
    writeFileSync(f(), "L1-oldest\nL2\nL3\nL4\nL5-newest\n", "utf-8");
    const lines = readTailLines(f(), 12); // ~last 12 bytes -> mid "L4"/"L5"
    expect(lines).not.toBeNull();
    // No partial line: every returned non-empty line is one of the originals.
    for (const ln of lines!.filter(Boolean)) {
      expect(["L1-oldest", "L2", "L3", "L4", "L5-newest"]).toContain(ln);
    }
    // The newest line is always present (it's at the very end).
    expect(lines).toContain("L5-newest");
    // The oldest is NOT in a 12-byte tail.
    expect(lines).not.toContain("L1-oldest");
  });

  it("returns null for a missing file", () => {
    expect(readTailLines(join(TEMP_DIR, "nope.jsonl"))).toBeNull();
  });

  it("keeps a COMPLETE line when the window starts exactly at a line boundary", () => {
    // "AAAA\nBBBB\n" is 10 bytes; a 5-byte window starts exactly at "BBBB".
    // The boundary byte before the window is "\n", so BBBB is whole and kept.
    writeFileSync(f(), "AAAA\nBBBB\n", "utf-8");
    expect(readTailLines(f(), 5)).toEqual(["BBBB", ""]);
  });

  it("still extracts from a real-shaped transcript whose relevant line is in the tail", () => {
    // Big filler older turn, then the assistant turn with usage at the very end.
    const filler = Array.from({ length: 50 }, (_, i) => JSON.stringify({ type: "user", n: i, pad: "x".repeat(200) })).join("\n");
    const last = JSON.stringify(claudeAssistantLine("claude-opus-4-8", { input_tokens: 7, output_tokens: 8 }));
    writeFileSync(f(), filler + "\n" + last + "\n", "utf-8");
    const meta = parseClaudeTurnMeta(f()); // default 1 MiB window covers it
    expect(meta?.token_usage).toEqual({ input_tokens: 7, output_tokens: 8 });
  });

  it("falls back to the whole file when the assistant record exceeds the tail window", () => {
    // A single assistant record larger than the 1 MiB tail: its start (with the
    // usage) is outside the window, so the tail scan finds a partial/nothing and
    // parseClaudeTurnMeta must re-read the whole file to recover the usage.
    const huge = { type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 11, output_tokens: 22 }, content: "y".repeat(1_200_000) } };
    writeFileSync(f(), JSON.stringify(huge) + "\n", "utf-8");
    const meta = parseClaudeTurnMeta(f());
    expect(meta?.model).toBe("claude-opus-4-8");
    expect(meta?.token_usage).toEqual({ input_tokens: 11, output_tokens: 22 });
  });
});

describe("readClaudeEffortLevel", () => {
  it("reads effortLevel from a project settings file, project overriding", () => {
    const proj = join(TEMP_DIR, "proj");
    mkdirSync(join(proj, ".claude"), { recursive: true });
    writeFileSync(join(proj, ".claude", "settings.json"), JSON.stringify({ effortLevel: "high" }), "utf-8");
    expect(readClaudeEffortLevel(proj)).toBe("high");
    // settings.local.json wins over settings.json
    writeFileSync(join(proj, ".claude", "settings.local.json"), JSON.stringify({ effortLevel: "low" }), "utf-8");
    expect(readClaudeEffortLevel(proj)).toBe("low");
  });

  it("returns undefined when no settings file has effortLevel", () => {
    const empty = join(TEMP_DIR, "empty");
    mkdirSync(empty, { recursive: true });
    // A cwd with no .claude dir — only the (possibly absent) user settings apply.
    const r = readClaudeEffortLevel(empty);
    expect(r === undefined || typeof r === "string").toBe(true); // never throws
  });

  it("ignores malformed settings JSON and falls through", () => {
    const bad = join(TEMP_DIR, "bad");
    mkdirSync(join(bad, ".claude"), { recursive: true });
    writeFileSync(join(bad, ".claude", "settings.json"), "{ not valid json", "utf-8");
    expect(() => readClaudeEffortLevel(bad)).not.toThrow();
  });

  it("rejects an effortLevel outside Claude's supported levels", () => {
    const evil = join(TEMP_DIR, "evil");
    mkdirSync(join(evil, ".claude"), { recursive: true });
    // Only this settings file on the path (project), and its value is bogus →
    // must NOT be returned (falls through; user settings may still apply, but
    // the bogus project value itself is never accepted).
    writeFileSync(join(evil, ".claude", "settings.json"), JSON.stringify({ effortLevel: "A".repeat(5000) }), "utf-8");
    const r = readClaudeEffortLevel(evil);
    expect(r).not.toBe("A".repeat(5000));
    expect(r === undefined || CLAUDE_LEVELS.has(r)).toBe(true);
  });

  it("normalizes case to a supported level", () => {
    const up = join(TEMP_DIR, "up");
    mkdirSync(join(up, ".claude"), { recursive: true });
    writeFileSync(join(up, ".claude", "settings.local.json"), JSON.stringify({ effortLevel: "HIGH" }), "utf-8");
    expect(readClaudeEffortLevel(up)).toBe("high");
  });
});

const CLAUDE_LEVELS = new Set(["low", "medium", "high", "xhigh"]);

describe("parseCodexTurnMeta — usage_extra quota", () => {
  it("extracts model_context_window and rate_limits from the latest token_count", () => {
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "medium"),
      {
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
            total_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
            model_context_window: 258400,
          },
          rate_limits: {
            primary: { used_percent: 11.0, window_minutes: 10080, resets_at: 1784782051 },
            secondary: { used_percent: 2.0, window_minutes: 300, resets_at: 1779231430 },
          },
        },
      },
    ]);
    const meta = parseCodexTurnMeta(file, "fb");
    expect(meta?.usage_extra).toEqual({
      model_context_window: 258400,
      rate_limits: {
        primary: { used_percent: 11.0, window_minutes: 10080, resets_at: 1784782051 },
        secondary: { used_percent: 2.0, window_minutes: 300, resets_at: 1779231430 },
      },
    });
  });

  it("drops invalid quota values (negative / fractional) but keeps valid ones", () => {
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "medium"),
      {
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            model_context_window: 3.5, // fractional -> dropped
          },
          rate_limits: {
            primary: { used_percent: -5, window_minutes: 1.5, resets_at: 100 }, // only resets_at valid
            secondary: { used_percent: 2, window_minutes: 300, resets_at: 1 }, // all valid
          },
        },
      },
    ]);
    const meta = parseCodexTurnMeta(file, "fb");
    expect(meta?.usage_extra).toEqual({
      rate_limits: {
        primary: { resets_at: 100 },
        secondary: { used_percent: 2, window_minutes: 300, resets_at: 1 },
      },
    });
    expect(meta?.usage_extra).not.toHaveProperty("model_context_window");
  });

  it("falls back to the whole file when turn_context is pushed out of the tail by a huge record", () => {
    // turn_context (model/effort) ... >1 MiB event ... token_count (usage) at end.
    // The 1 MiB tail catches only the token_count, so parseCodexTurnMeta must
    // re-read the whole file to recover the model/effort from turn_context.
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "high"),
      { type: "event_msg", payload: { type: "note", pad: "z".repeat(1_200_000) } },
      codexTokenCount(
        { input_tokens: 9, output_tokens: 1, total_tokens: 10 },
        { input_tokens: 9, output_tokens: 1, total_tokens: 10 },
      ),
    ]);
    const meta = parseCodexTurnMeta(file, "payload-fallback");
    expect(meta?.model).toBe("gpt-5.5"); // recovered from turn_context, not the payload fallback
    expect(meta?.reasoning_effort).toBe("high");
    expect(meta?.token_usage?.total_tokens).toBe(10);
  });

  it("recovers a cumulative total set before the tail window via the whole-file scan", () => {
    // First token_count carries total; a >1 MiB record follows; then a new turn
    // whose token_count OMITS total. The tail sees both signals but no total, so
    // parseCodexTurnMeta must widen to recover token_usage_total from the file.
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "medium"),
      codexTokenCount(
        { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        { input_tokens: 5, output_tokens: 5, total_tokens: 500 },
      ),
      { type: "event_msg", payload: { type: "note", pad: "q".repeat(1_200_000) } },
      codexTurnContext("gpt-5.5", "medium"),
      // token_count WITHOUT total_token_usage
      { type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } } },
    ]);
    const meta = parseCodexTurnMeta(file, "fb");
    expect(meta?.token_usage_total?.total_tokens).toBe(500); // preserved from the first token_count
  });

  it("does not carry a prior turn's quota into a new turn_context (model change)", () => {
    const file = writeTranscript([
      codexTurnContext("gpt-5.5", "medium"),
      {
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, model_context_window: 258400 },
          rate_limits: { primary: { used_percent: 11, window_minutes: 10080, resets_at: 1 } },
        },
      },
      codexTurnContext("gpt-5.6-sol", "high"), // new turn, no token_count after it
    ]);
    const meta = parseCodexTurnMeta(file, "fb");
    expect(meta?.model).toBe("gpt-5.6-sol");
    // Quota from gpt-5.5's turn must NOT attach to gpt-5.6-sol.
    expect(meta).not.toHaveProperty("usage_extra");
  });
});

// ---------------------------------------------------------------------------
// Stop-capture race: scanClaudeTurnForCapture / parseClaudeTurnMetaLive
// ---------------------------------------------------------------------------

const USAGE = { input_tokens: 10, output_tokens: 42 };

function claudeAssistantText(model: string, usage: Record<string, number> | undefined, text: string, extra: object = {}) {
  return {
    type: "assistant",
    message: { model, role: "assistant", content: [{ type: "text", text }], ...(usage ? { usage } : {}) },
    ...extra,
  };
}

describe("scanClaudeTurnForCapture", () => {
  it("matches the newest assistant record when it carries usage and the expected text", () => {
    const file = writeTranscript([
      { type: "user" },
      claudeAssistantText("claude-fable-5", USAGE, "final answer"),
    ]);
    const scan = scanClaudeTurnForCapture(file, "final answer");
    expect(scan.status).toBe("match");
    expect(scan.meta?.model).toBe("claude-fable-5");
    expect(scan.meta?.token_usage).toEqual({ input_tokens: 10, output_tokens: 42 });
  });

  it("retries instead of falling back to the PREVIOUS turn when the current record is absent", () => {
    // Only turn 1 is on disk; the Stop being captured is turn 2.
    const file = writeTranscript([
      claudeAssistantText("claude-fable-5", { input_tokens: 1, output_tokens: 1 }, "turn one answer"),
    ]);
    const scan = scanClaudeTurnForCapture(file, "turn two answer");
    expect(scan.status).toBe("retry");
    expect(scan.meta).toBeUndefined();
  });

  it("retries when the newest assistant record has no usage yet", () => {
    const file = writeTranscript([
      claudeAssistantText("claude-fable-5", undefined, "final answer"),
    ]);
    expect(scanClaudeTurnForCapture(file, "final answer").status).toBe("retry");
  });

  it("retries on a trailing partial JSONL record", () => {
    const file = writeTranscript([claudeAssistantText("claude-fable-5", USAGE, "final answer")]);
    writeFileSync(file, '{"type":"assistant","message":{"mod', { flag: "a" });
    expect(scanClaudeTurnForCapture(file, "final answer").status).toBe("retry");
  });

  it("retries on a missing file and on an empty transcript", () => {
    expect(scanClaudeTurnForCapture(join(TEMP_DIR, "absent.jsonl")).status).toBe("retry");
    const empty = join(TEMP_DIR, "empty.jsonl");
    writeFileSync(empty, "");
    expect(scanClaudeTurnForCapture(empty).status).toBe("retry");
  });

  it("skips sidechain records on a main-session Stop but not on SubagentStop", () => {
    const file = writeTranscript([
      claudeAssistantText("claude-fable-5", USAGE, "main answer"),
      claudeAssistantText("claude-haiku-4-5", { input_tokens: 2, output_tokens: 3 }, "subagent answer", { isSidechain: true }),
    ]);
    const main = scanClaudeTurnForCapture(file, "main answer", false);
    expect(main.status).toBe("match");
    expect(main.meta?.model).toBe("claude-fable-5");
    const sub = scanClaudeTurnForCapture(file, "subagent answer", true);
    expect(sub.status).toBe("match");
    expect(sub.meta?.model).toBe("claude-haiku-4-5");
  });

  it("matches without text correlation when no expected text is given", () => {
    const file = writeTranscript([claudeAssistantText("claude-fable-5", USAGE, "whatever")]);
    expect(scanClaudeTurnForCapture(file).status).toBe("match");
  });

  it("tolerates one-sided truncation of the expected text only with an anchored, long-enough prefix", () => {
    const long = "a sufficiently long final answer that exceeds the anchored-prefix minimum length";
    const file = writeTranscript([claudeAssistantText("claude-fable-5", USAGE, long + " with extra tail detail")]);
    expect(scanClaudeTurnForCapture(file, long).status).toBe("match");
    // A SHORT shared prefix is not evidence of identity — "Done" must not
    // match the previous turn's "Done — details…" (the off-by-one guard).
    const file2 = writeTranscript([claudeAssistantText("claude-fable-5", USAGE, "Done — full details follow here")]);
    expect(scanClaudeTurnForCapture(file2, "Done").status).toBe("retry");
    // Unanchored containment must not match either.
    const file3 = writeTranscript([claudeAssistantText("claude-fable-5", USAGE, "prefix junk then a sufficiently long final answer that exceeds the anchored-prefix minimum length")]);
    expect(scanClaudeTurnForCapture(file3, long).status).toBe("retry");
  });

  it("skips textless trailing records (tool_use) when correlating, without falling back across turns", () => {
    // The turn's final flush order can put a textless record last; the
    // text-bearing record of the SAME turn must still match…
    const file = writeTranscript([
      claudeAssistantText("claude-fable-5", USAGE, "the actual final answer text here padded long"),
      { type: "assistant", message: { model: "claude-fable-5", role: "assistant", content: [{ type: "tool_use", id: "t1" }], usage: USAGE } },
    ]);
    expect(scanClaudeTurnForCapture(file, "the actual final answer text here padded long").status).toBe("match");
    // …but a PREVIOUS turn's text must not satisfy the current turn.
    expect(scanClaudeTurnForCapture(file, "a different current-turn reply").status).toBe("retry");
  });
});

describe("parseClaudeTurnMetaLive", () => {
  it("recovers the turn's meta when the record lands between reads (the real flush race)", async () => {
    const file = join(TEMP_DIR, "grow.jsonl");
    writeFileSync(file, JSON.stringify({ type: "user" }) + "\n");
    const pending = parseClaudeTurnMetaLive(file, "late answer", false, [10, 10, 200]);
    setTimeout(() => {
      writeFileSync(file, JSON.stringify(claudeAssistantText("claude-fable-5", USAGE, "late answer")) + "\n", { flag: "a" });
    }, 15);
    const meta = await pending;
    expect(meta?.model).toBe("claude-fable-5");
    expect(meta?.token_usage).toEqual({ input_tokens: 10, output_tokens: 42 });
  });

  it("returns null (unenriched) instead of the previous turn's usage when the record never lands", async () => {
    const file = writeTranscript([
      claudeAssistantText("claude-fable-5", { input_tokens: 999, output_tokens: 999 }, "turn one answer"),
    ]);
    const meta = await parseClaudeTurnMetaLive(file, "turn two answer", false, [1, 1, 1]);
    expect(meta).toBeNull();
  });

  it("resolves immediately on first read when the record is already complete", async () => {
    const file = writeTranscript([claudeAssistantText("claude-fable-5", USAGE, "done")]);
    const started = Date.now();
    const meta = await parseClaudeTurnMetaLive(file, "done", false, [500, 500, 500]);
    expect(meta?.model).toBe("claude-fable-5");
    expect(Date.now() - started).toBeLessThan(400);
  });
});
