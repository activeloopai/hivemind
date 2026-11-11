/**
 * Claude Code transcript → capture events (pure).
 *
 * Rebuilds the rows the capture hook WOULD have written for a stretch of a
 * session whose hooks stopped running (e.g. Claude Code deleted the plugin
 * version a long-running session was pinned to). The output mirrors
 * src/hooks/capture.ts entry shapes:
 *
 *   user prompt            → user_message      (UserPromptSubmit)
 *   tool_use + tool_result → tool_call         (PostToolUse / PostToolUseFailure)
 *   final reply of a turn  → assistant_message (Stop)
 *
 * Every event gets a deterministic id derived from the session and the
 * transcript record it came from, so recovering the same stretch twice
 * produces the same ids — and the sessions INSERT skips existing ids.
 */

import { createHash } from "node:crypto";

export interface RecoveredEvent {
  /** Deterministic row id. */
  id: string;
  /** ISO timestamp of the moment the hook would have fired. */
  ts: string;
  hookEvent: "UserPromptSubmit" | "PostToolUse" | "PostToolUseFailure" | "Stop";
  /** Capture entry fields that follow the shared meta (type, content, …). */
  body: Record<string, unknown>;
  cwd?: string;
}

/** Stable UUID-shaped id for (session, record key). */
export function recoveredEventId(sessionId: string, key: string): string {
  const h = createHash("sha256").update(`hivemind-recovery:${sessionId}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

interface Rec {
  type?: string;
  uuid?: string;
  timestamp?: string;
  cwd?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  toolUseResult?: unknown;
  attachment?: { type?: string; command?: string };
  message?: {
    id?: string;
    model?: string;
    stop_reason?: string | null;
    content?: unknown;
  };
}

interface Block {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

const blocks = (c: unknown): Block[] => (Array.isArray(c) ? (c as Block[]) : []);

function blockText(c: unknown): string {
  if (typeof c === "string") return c;
  return blocks(c)
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

/** Text the user typed, or null for tool results / injected / command records. */
function promptText(r: Rec): string | null {
  if (r.isMeta || r.isCompactSummary || r.isSidechain) return null;
  const c = r.message?.content;
  if (Array.isArray(c) && blocks(c).some((b) => b?.type === "tool_result")) return null;
  const text = blockText(c).trim();
  if (!text) return null;
  // Slash-command plumbing Claude Code writes as user records; never typed.
  if (/^<(local-command-|command-name>|command-message>|bash-(input|stdout|stderr)>)/.test(text)) return null;
  return text;
}

function toolResponse(r: Rec, b: Block): { failed: boolean; response: unknown } {
  const failed = b.is_error === true;
  const tur = r.toolUseResult;
  if (tur && typeof tur === "object") return { failed, response: tur };
  const text = typeof tur === "string" ? tur : blockText(b.content) || (typeof b.content === "string" ? b.content : "");
  return { failed, response: failed ? { error: text } : { content: text } };
}

interface PendingTool { name: string; input: unknown; ts: string; cwd?: string }

export interface TranscriptGap {
  events: RecoveredEvent[];
  /**
   * Claude Code recorded a failed run of Hivemind's capture hook after
   * `sinceMs` (e.g. "Plugin directory does not exist"). Capture's own errors
   * exit 0 and are never recorded, so this means the hook could not run at
   * all — the only situation recovery is for. Without it, a missing stretch
   * is deliberate (directory opted out, plugin disabled, capture turned off)
   * or print mode skipping the async Stop hook, and must stay uncaptured.
   */
  captureHookFailed: boolean;
}

const isCaptureHookFailure = (r: Rec) =>
  r.type === "attachment" &&
  /hook.*error/i.test(r.attachment?.type ?? "") &&
  /bundle[\\/]capture\.js/.test(r.attachment?.command ?? "");

/**
 * Convert transcript lines to the events that happened strictly after
 * `sinceMs`. A tool call counts at its RESULT time (that is when
 * PostToolUse fires); a turn's reply counts once the turn has ended.
 * Unparseable lines are skipped.
 */
export function transcriptEvents(lines: Iterable<string>, sessionId: string, sinceMs: number): TranscriptGap {
  let captureHookFailed = false;
  const out: RecoveredEvent[] = [];
  const pending = new Map<string, PendingTool>();
  // Assistant replies arrive as one record per content block, all sharing
  // message.id; collect a message's text and emit it when it ends the turn.
  const replies = new Map<string, { text: string[]; ts: string; model?: string; cwd?: string; ended: boolean }>();
  const after = (ts: string | undefined) => {
    const t = ts ? Date.parse(ts) : NaN;
    return Number.isFinite(t) && t > sinceMs;
  };

  for (const line of lines) {
    if (!line || line.charCodeAt(0) !== 123 /* { */) continue;
    let r: Rec;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.isSidechain) continue;
    if (isCaptureHookFailure(r) && after(r.timestamp)) { captureHookFailed = true; continue; }

    if (r.type === "assistant") {
      const m = r.message;
      for (const b of blocks(m?.content)) {
        if (b?.type === "tool_use" && b.id && b.name) {
          pending.set(b.id, { name: b.name, input: b.input, ts: r.timestamp ?? "", cwd: r.cwd });
        }
      }
      const mid = m?.id ?? r.uuid;
      if (!mid) continue;
      const text = blockText(m?.content);
      const cur = replies.get(mid) ?? { text: [], ts: r.timestamp ?? "", model: m?.model, cwd: r.cwd, ended: false };
      if (text) cur.text.push(text);
      if (r.timestamp) cur.ts = r.timestamp;
      if (m?.stop_reason === "end_turn") cur.ended = true;
      replies.set(mid, cur);
      if (cur.ended && cur.text.length && after(cur.ts)) {
        // Emitted once: later blocks of the same message only add text, so
        // re-emit under the same id (the last write wins in `byId`).
        out.push({
          id: recoveredEventId(sessionId, `reply:${mid}`),
          ts: cur.ts,
          hookEvent: "Stop",
          cwd: cur.cwd,
          body: { type: "assistant_message", content: cur.text.join("\n"), ...(cur.model ? { model: cur.model } : {}) },
        });
      }
      continue;
    }

    if (r.type !== "user") continue;
    const c = r.message?.content;
    for (const b of blocks(c)) {
      if (b?.type !== "tool_result" || !b.tool_use_id) continue;
      const call = pending.get(b.tool_use_id);
      pending.delete(b.tool_use_id);
      if (!call || !after(r.timestamp)) continue;
      const { failed, response } = toolResponse(r, b);
      out.push({
        id: recoveredEventId(sessionId, `tool:${b.tool_use_id}`),
        ts: r.timestamp as string,
        hookEvent: failed ? "PostToolUseFailure" : "PostToolUse",
        cwd: r.cwd ?? call.cwd,
        body: {
          type: "tool_call",
          tool_name: call.name,
          tool_use_id: b.tool_use_id,
          tool_input: JSON.stringify(call.input),
          tool_response: JSON.stringify(response),
        },
      });
    }
    const prompt = promptText(r);
    if (prompt !== null && after(r.timestamp)) {
      out.push({
        id: recoveredEventId(sessionId, `prompt:${r.uuid ?? r.timestamp}`),
        ts: r.timestamp as string,
        hookEvent: "UserPromptSubmit",
        cwd: r.cwd,
        body: { type: "user_message", content: prompt },
      });
    }
  }

  // Keep the last version of each id (a reply re-emitted as more blocks
  // arrived), in time order.
  const byId = new Map<string, RecoveredEvent>();
  for (const e of out) byId.set(e.id, e);
  return { events: [...byId.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)), captureHookFailed };
}
