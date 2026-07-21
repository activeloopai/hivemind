/**
 * Always-on recall telemetry sink.
 *
 * Appends one JSON line per recall-worthy invocation to
 * `~/.deeplake/recall-events.jsonl` — INDEPENDENT of HIVEMIND_DEBUG, so
 * "did recall fire / how often / hit-rate / score distribution" is a one-line
 * `jq` over the file rather than detective work across logs. Failure-isolated:
 * telemetry must never throw or block the hook.
 *
 * Funnel events (one per prompt that PASSED the gate):
 *   injected | below | none | timeout | no-config | unattributable
 * (Gate-rejected acks/short prompts are intentionally NOT recorded — they're
 * noise; the denominator of total prompts lives in the sessions table.)
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export type RecallEventKind =
  | "injected" | "below" | "none" | "timeout" | "error" | "no-config" | "unattributable";

export interface RecallEvent {
  event: RecallEventKind;
  gate?: string;
  mode?: "semantic" | "lexical";
  score?: number;
  author?: string;
  teammate?: boolean;
  project?: string;
  session?: string;
}

function eventsPath(): string {
  return join(homedir(), ".deeplake", "recall-events.jsonl");
}

/** Append one recall event as a JSONL line. Never throws. */
export function recordRecallEvent(
  ev: RecallEvent,
  nowIso: string = new Date().toISOString(),
): void {
  try {
    const path = eventsPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({ ts: nowIso, ...ev }) + "\n");
  } catch {
    // Telemetry must never break the hook.
  }
}
