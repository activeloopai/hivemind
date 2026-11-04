/**
 * Per-session recall memory: which summaries were already injected and which
 * failures were already looked up, so one session never sees the same
 * teammate summary twice and a retried command doesn't re-query.
 *
 * File: ~/.deeplake/state/recall/sessions/<session_id>.json
 * Files older than two days are pruned opportunistically.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface RecallSessionState {
  injected: string[];
  lookedUp: string[];
  injections: number;
}

/** Hard cap on injections per session, across both triggers. */
export const MAX_INJECTIONS_PER_SESSION = 5;
const MAX_KEYS = 200;
const PRUNE_AFTER_MS = 2 * 86_400_000;

export function sessionStateDir(): string {
  return process.env.HIVEMIND_RECALL_STATE_DIR || join(homedir(), ".deeplake", "state", "recall", "sessions");
}

function file(sessionId: string, dir: string): string {
  return join(dir, `${sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "_"}.json`);
}

export function loadSessionState(sessionId: string, dir: string = sessionStateDir()): RecallSessionState {
  try {
    const s = JSON.parse(readFileSync(file(sessionId, dir), "utf-8")) as Partial<RecallSessionState>;
    return {
      injected: Array.isArray(s.injected) ? s.injected : [],
      lookedUp: Array.isArray(s.lookedUp) ? s.lookedUp : [],
      injections: Number(s.injections) || 0,
    };
  } catch {
    return { injected: [], lookedUp: [], injections: 0 };
  }
}

export function saveSessionState(sessionId: string, s: RecallSessionState, dir: string = sessionStateDir(), now: number = Date.now()): void {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const trimmed: RecallSessionState = {
      injected: s.injected.slice(-MAX_KEYS),
      lookedUp: s.lookedUp.slice(-MAX_KEYS),
      injections: s.injections,
    };
    writeFileSync(file(sessionId, dir), JSON.stringify(trimmed), { mode: 0o600 });
    pruneOld(dir, now);
  } catch { /* best-effort */ }
}

function pruneOld(dir: string, now: number): void {
  // Cheap: only scan ~1 in 20 writes.
  if (Math.random() > 0.05) return;
  try {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (now - statSync(p).mtimeMs > PRUNE_AFTER_MS) rmSync(p, { force: true });
    }
  } catch { /* best-effort */ }
}
