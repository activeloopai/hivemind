/**
 * Shared body of the two local proactive-recall hooks (recall-on-failure,
 * recall-on-prompt): mode check → routed config → per-session dedupe →
 * local lookup → telemetry → (shadow: record only | on: inject).
 *
 * Never touches the backend: the lookup reads the index the background sync
 * worker keeps under ~/.deeplake/recall-cache/. Never throws.
 */

import { loadConfig } from "../../config.js";
import { resolveDirConfig } from "../../dir-config.js";
import { lookupTeamRecall } from "../../recall/lookup.js";
import type { SearchHit } from "../../recall/lexical-index.js";
import { recallMode, type RecallTrigger } from "../../recall/policy.js";
import {
  loadSessionState, saveSessionState, MAX_INJECTIONS_PER_SESSION,
} from "../../recall/session-state.js";
import { recordRecallEvent, type RecallEvent } from "./recall-events.js";

export interface RecallRunInput {
  trigger: RecallTrigger;
  sessionId?: string;
  cwd?: string;
  query: string | readonly string[];
  /** Skip the lookup when this key was already looked up this session. */
  dedupeKey?: string;
  /** Short reason the cheap gate passed (telemetry only). */
  gate?: string;
  now?: number;
}

/** Returns the additionalContext to inject, or null. */
export function runRecall(input: RecallRunInput, log: (m: string) => void): string | null {
  const { trigger } = input;
  const mode = recallMode(trigger);
  if (mode === "off") return null;

  const base = loadConfig();
  const session = input.sessionId;
  const queryPreview = (Array.isArray(input.query) ? input.query.join(" ") : String(input.query)).slice(0, 120);
  const ev = (e: Omit<RecallEvent, "trigger" | "session" | "gate">) =>
    recordRecallEvent({ trigger, session, gate: input.gate, ...e });
  if (!base?.token) { ev({ event: "no-config" }); return null; }
  const config = resolveDirConfig(base, input.cwd ?? process.cwd()).config;

  const state = session ? loadSessionState(session) : { injected: [], lookedUp: [], injections: 0 };
  if (input.dedupeKey && state.lookedUp.includes(input.dedupeKey)) { log("skip already-looked-up"); return null; }
  if (state.injections >= MAX_INJECTIONS_PER_SESSION) { log("skip session-cap"); return null; }
  if (input.dedupeKey) state.lookedUp.push(input.dedupeKey);

  const t0 = Date.now();
  let res;
  try {
    res = lookupTeamRecall({
      trigger, query: input.query, config, cwd: input.cwd,
      exclude: new Set(state.injected), now: input.now,
    });
  } catch (e) {
    log(`lookup error: ${(e as Error)?.message ?? e}`);
    ev({ event: "error", ms: Date.now() - t0 });
    return null;
  }
  const ms = Date.now() - t0;
  const meta = (h: SearchHit) => ({
    mode: "lexical" as const,
    path: h.doc.p, author: h.doc.a, project: h.doc.pr, teammate: h.doc.a !== config.userName,
    score: Number(h.score.toFixed(3)), matched: h.matched, coverage: Number(h.coverage.toFixed(3)),
    phrases: h.phrases,
  });

  let out: string | null = null;
  switch (res.kind) {
    case "no-index": ev({ event: "no-index", ms }); break;
    case "none": ev({ event: "none", ms, query: queryPreview }); break;
    case "below": ev({ event: "below", ms, query: queryPreview, ...meta(res.best) }); break;
    case "unattributable": ev({ event: "unattributable", ms, ...meta(res.best) }); break;
    case "hit": {
      state.injected.push(res.best.doc.p);
      state.injections++;
      ev({ event: mode === "on" ? "injected" : "shadow", ms, query: queryPreview, ...meta(res.best) });
      log(`${mode === "on" ? "injected" : "shadow"} ${res.best.doc.p} matched=${res.best.matched} cov=${res.best.coverage.toFixed(2)}`);
      if (mode === "on") out = res.context;
      break;
    }
  }
  if (session) saveSessionState(session, state);
  return out;
}

/** Print the Claude Code hook output that injects `ctx` into the model context. */
export function emitAdditionalContext(hookEventName: string, ctx: string): void {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: ctx } }));
}
