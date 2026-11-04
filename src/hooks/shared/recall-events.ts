/**
 * Always-on recall telemetry sink.
 *
 * Appends one JSON line per recall lookup to `~/.deeplake/recall-events.jsonl`
 * — INDEPENDENT of HIVEMIND_DEBUG, so "did recall fire / how often / hit-rate /
 * what would shadow mode have injected" is a one-line `jq` over the file (or
 * `hivemind recall stats`) rather than detective work across logs.
 * Failure-isolated: telemetry must never throw or block the hook.
 *
 * Funnel events (one per lookup that PASSED the cheap gate):
 *   injected | shadow | below | none | no-index | no-config | unattributable | error
 * (Gate-rejected acks / noisy failures are intentionally NOT recorded.)
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export type RecallEventKind =
  | "injected" | "shadow" | "below" | "none" | "no-index" | "no-config" | "unattributable" | "error";

export interface RecallEvent {
  event: RecallEventKind;
  trigger?: "prompt" | "failure";
  gate?: string;
  mode?: "lexical";
  score?: number;
  matched?: number;
  coverage?: number;
  phrases?: number;
  path?: string;
  author?: string;
  teammate?: boolean;
  project?: string;
  session?: string;
  ms?: number;
  /** First characters of the distilled query — enough to label shadow hits. */
  query?: string;
}

export function recallEventsPath(): string {
  return process.env.HIVEMIND_RECALL_EVENTS_PATH || join(homedir(), ".deeplake", "recall-events.jsonl");
}

/** Append one recall event as a JSONL line. Never throws. */
export function recordRecallEvent(
  ev: RecallEvent,
  nowIso: string = new Date().toISOString(),
): void {
  try {
    const path = recallEventsPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({ ts: nowIso, ...ev }) + "\n");
  } catch {
    // Telemetry must never break the hook.
  }
}
