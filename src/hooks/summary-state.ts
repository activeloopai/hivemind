/**
 * Sidecar state for periodic summary triggering.
 *
 * File: ~/.claude/hooks/summary-state/<session_id>.json
 *   { lastSummaryAt: epoch_ms, lastSummaryCount: number, totalCount: number }
 *
 * Never deleted (so --resume picks up where it left off).
 * All mutations go through withRmwLock so concurrent processes don't lose updates.
 */

import {
  readFileSync, writeFileSync, writeSync, mkdirSync,
  existsSync, unlinkSync, openSync, closeSync, statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { log as _log } from "../utils/debug.js";
import { renameAtomic } from "../utils/atomic-write.js";

const dlog = (msg: string) => _log("summary-state", msg);

export interface SummaryState {
  lastSummaryAt: number;
  lastSummaryCount: number;
  totalCount: number;
}

const STATE_DIR = join(homedir(), ".claude", "hooks", "summary-state");
const YIELD_BUF = new Int32Array(new SharedArrayBuffer(4));

export function statePath(sessionId: string): string {
  return join(STATE_DIR, `${sessionId}.json`);
}

export function lockPath(sessionId: string): string {
  return join(STATE_DIR, `${sessionId}.lock`);
}

export function endedMarkerPath(sessionId: string): string {
  return join(STATE_DIR, `${sessionId}.ended`);
}

export function ownerPath(sessionId: string): string {
  return join(STATE_DIR, `${sessionId}.owner`);
}

/** Minimal /proc/<pid>/stat read: process name + parent pid + start time.
 *  Linux-only; returns null when /proc is unavailable or the pid is gone.
 *  `comm` is wrapped in parens by the kernel and may itself contain parens,
 *  so the closing paren is found with lastIndexOf. */
export function procInfo(pid: number): { comm: string; ppid: number; starttime: string } | null {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const open = s.indexOf("(");
    const close = s.lastIndexOf(")");
    if (open < 0 || close < 0) return null;
    const comm = s.slice(open + 1, close);
    const rest = s.slice(close + 2).split(" ");
    // After comm the fields start at `state` (stat field 3), so field N is
    // rest[N-3]; ppid is field 4 (rest[1]), starttime is field 22 (rest[19]).
    return { comm, ppid: Number(rest[1]), starttime: rest[19] ?? "" };
  } catch {
    return null;
  }
}

export interface SessionOwner {
  pid: number;
  comm: string;
  starttime: string;
}

/** Walk the /proc ppid chain from `startPid` up to the owning agent process
 *  (a process whose name is in `agentComms`). This is the long-lived process
 *  that stays alive while the session is open — even when it's idle waiting on
 *  the user, which is exactly when the event heartbeat goes stale. Linux-only:
 *  returns null when /proc is unavailable or no matching ancestor is found. */
export function findSessionOwner(
  agentComms: string[] = ["claude"],
  startPid: number = process.pid,
): SessionOwner | null {
  let pid = startPid;
  let depth = 0;
  while (pid > 1 && depth++ < 40) {
    const st = procInfo(pid);
    if (!st) return null;
    if (agentComms.includes(st.comm)) return { pid, comm: st.comm, starttime: st.starttime };
    pid = st.ppid;
  }
  return null;
}

/** Record this session's owning agent process so other sessions can tell —
 *  precisely — whether it's still running. No-op on platforms without /proc
 *  (callers then degrade to the event-heartbeat window). */
export function recordSessionOwner(sessionId: string, agentComms: string[] = ["claude"], startPid: number = process.pid): void {
  try {
    const owner = findSessionOwner(agentComms, startPid);
    if (!owner) return;
    mkdirSync(STATE_DIR, { recursive: true });
    const p = ownerPath(sessionId);
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(owner));
    renameAtomic(tmp, p);
  } catch (e: any) {
    dlog(`recordSessionOwner failed for ${sessionId}: ${e.message}`);
  }
}

/** Record the owner only if one isn't recorded yet — lets a session that was
 *  already running before this shipped self-heal on its next captured event,
 *  without waiting for a restart. */
export function ensureSessionOwner(sessionId: string, agentComms: string[] = ["claude"], startPid: number = process.pid): void {
  if (existsSync(ownerPath(sessionId))) return;
  recordSessionOwner(sessionId, agentComms, startPid);
}

function readOwner(sessionId: string): SessionOwner | null {
  try {
    return JSON.parse(readFileSync(ownerPath(sessionId), "utf-8")) as SessionOwner;
  } catch {
    return null;
  }
}

/**
 * Liveness of a session's owning process, from its recorded owner:
 *   - "alive"   — the process is still running (same comm + start time).
 *   - "dead"    — the process is gone, or its pid was reused by a different
 *                 process (comm or start time changed). Catches crashes too.
 *   - "unknown" — no owner was recorded (session predates this, runs on
 *                 another machine, or the platform has no /proc).
 */
export function ownerLiveness(sessionId: string): "alive" | "dead" | "unknown" {
  const owner = readOwner(sessionId);
  if (!owner) return "unknown";
  const st = procInfo(owner.pid);
  if (!st) return "dead";
  if (st.comm !== owner.comm) return "dead";
  if (owner.starttime && st.starttime && owner.starttime !== st.starttime) return "dead";
  return "alive";
}

/**
 * How long after the last captured event a session is still treated as
 * "live" (and therefore ineligible for another session's resume brief).
 * Default 10 min — matches the stale-lock reclaim window. The capture hook
 * touches the state file on every event via bumpTotalCount, so an actively
 * used session refreshes this well inside the window. Only a hard crash (no
 * SessionEnd marker, no further events) lets the window lapse.
 */
export function activeWindowMs(): number {
  const v = Number(process.env.HIVEMIND_ACTIVE_SESSION_WINDOW_MS ?? "");
  return Number.isFinite(v) && v > 0 ? v : 10 * 60 * 1000;
}

/** Mark a session cleanly ended so a later session's resume brief may surface
 *  it immediately, without waiting for the activity window to lapse. */
export function markSessionEnded(sessionId: string): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(endedMarkerPath(sessionId), String(Date.now()));
  } catch (e: any) {
    dlog(`markSessionEnded failed for ${sessionId}: ${e.message}`);
  }
}

/** Clear the ended marker — used on SessionStart so a --resume'd session is
 *  treated as live again (its events will refresh the heartbeat). */
export function clearSessionEnded(sessionId: string): void {
  try {
    unlinkSync(endedMarkerPath(sessionId));
  } catch (e: any) {
    if (e?.code !== "ENOENT") dlog(`clearSessionEnded failed for ${sessionId}: ${e.message}`);
  }
}

/**
 * Is this session currently live (open in some terminal right now)?
 *
 * A cleanly-ended session (ended marker present) is never live. Otherwise we
 * prefer the OWNING-PROCESS signal: if we recorded the session's agent process
 * and it's still running, the session is live even when it's been idle for
 * hours — which the event heartbeat alone cannot tell from an exit. If the
 * process is gone, it's not live (covers crashes immediately).
 *
 * Only when there's no owner record (session predates this, runs on another
 * machine, or no /proc) do we fall back to the event heartbeat: the state-file
 * mtime, bumped on every captured event, within the activity window.
 */
export function isSessionLive(sessionId: string, withinMs = activeWindowMs()): boolean {
  if (existsSync(endedMarkerPath(sessionId))) return false;
  const owner = ownerLiveness(sessionId);
  if (owner === "alive") return true;
  if (owner === "dead") return false;
  try {
    const mtimeMs = statSync(statePath(sessionId)).mtimeMs;
    return Date.now() - mtimeMs < withinMs;
  } catch {
    return false;
  }
}

export function readState(sessionId: string): SummaryState | null {
  const p = statePath(sessionId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as SummaryState;
  } catch {
    return null;
  }
}

export function writeState(sessionId: string, state: SummaryState): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const p = statePath(sessionId);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameAtomic(tmp, p);
}

export function withRmwLock<T>(sessionId: string, fn: () => T): T {
  mkdirSync(STATE_DIR, { recursive: true });
  const rmwLock = statePath(sessionId) + ".rmw";
  const deadline = Date.now() + 2000;
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = openSync(rmwLock, "wx");
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      if (Date.now() > deadline) {
        dlog(`rmw lock deadline exceeded for ${sessionId}, reclaiming stale lock`);
        try {
          unlinkSync(rmwLock);
        } catch (unlinkErr: any) {
          dlog(`stale rmw lock unlink failed for ${sessionId}: ${unlinkErr.message}`);
        }
        continue;
      }
      Atomics.wait(YIELD_BUF, 0, 0, 10);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(rmwLock);
    } catch (unlinkErr: any) {
      dlog(`rmw lock cleanup failed for ${sessionId}: ${unlinkErr.message}`);
    }
  }
}

export function bumpTotalCount(sessionId: string): SummaryState {
  return withRmwLock(sessionId, () => {
    const now = Date.now();
    const existing = readState(sessionId);
    const next: SummaryState = existing
      ? { ...existing, totalCount: existing.totalCount + 1 }
      : { lastSummaryAt: now, lastSummaryCount: 0, totalCount: 1 };
    writeState(sessionId, next);
    return next;
  });
}

/**
 * Bump the session's heartbeat (state-file mtime) WITHOUT changing its
 * counters. SessionStart calls this so isSessionLive()'s non-Linux mtime
 * fallback marks a freshly started/resumed session live immediately — before
 * its first captured event. On Linux the owner record already covers this, so
 * it's a harmless refresh there. Seeds an empty state when none exists yet
 * (totalCount 0, so the periodic-summary cadence is unaffected).
 */
export function touchSessionActivity(sessionId: string): void {
  try {
    withRmwLock(sessionId, () => {
      const existing = readState(sessionId);
      writeState(sessionId, existing ?? { lastSummaryAt: Date.now(), lastSummaryCount: 0, totalCount: 0 });
    });
  } catch (e: any) {
    dlog(`touchSessionActivity failed for ${sessionId}: ${e.message}`);
  }
}

export function finalizeSummary(sessionId: string, jsonlLines: number): void {
  withRmwLock(sessionId, () => {
    const prev = readState(sessionId);
    writeState(sessionId, {
      lastSummaryAt: Date.now(),
      lastSummaryCount: jsonlLines,
      totalCount: Math.max(prev?.totalCount ?? 0, jsonlLines),
    });
  });
}

export interface TriggerConfig {
  everyNMessages: number;
  everyHours: number;
}

export function loadTriggerConfig(): TriggerConfig {
  const n = Number(process.env.HIVEMIND_SUMMARY_EVERY_N_MSGS ?? "");
  const h = Number(process.env.HIVEMIND_SUMMARY_EVERY_HOURS ?? "");
  return {
    everyNMessages: Number.isInteger(n) && n > 0 ? n : 50,
    everyHours: Number.isFinite(h) && h > 0 ? h : 2,
  };
}

const FIRST_SUMMARY_AT = 10;

export function shouldTrigger(state: SummaryState, cfg: TriggerConfig, now = Date.now()): boolean {
  const msgsSince = state.totalCount - state.lastSummaryCount;
  if (state.lastSummaryCount === 0 && state.totalCount >= FIRST_SUMMARY_AT) return true;
  if (msgsSince >= cfg.everyNMessages) return true;
  if (msgsSince > 0 && now - state.lastSummaryAt >= cfg.everyHours * 3600 * 1000) return true;
  return false;
}

export function tryAcquireLock(sessionId: string, maxAgeMs = 10 * 60 * 1000): boolean {
  mkdirSync(STATE_DIR, { recursive: true });
  const p = lockPath(sessionId);
  if (existsSync(p)) {
    try {
      const ageMs = Date.now() - parseInt(readFileSync(p, "utf-8"), 10);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMs) return false;
    } catch (readErr: any) {
      // Unreadable lock content: treat as stale and log for visibility
      // (HIVEMIND_DEBUG-gated) so we know why stale reclaim fired.
      dlog(`lock file unreadable for ${sessionId}, treating as stale: ${readErr.message}`);
    }
    try {
      unlinkSync(p);
    } catch (unlinkErr: any) {
      dlog(`could not unlink stale lock for ${sessionId}: ${unlinkErr.message}`);
      return false;
    }
  }
  try {
    const fd = openSync(p, "wx");
    try { writeSync(fd, String(Date.now())); } finally { closeSync(fd); }
    return true;
  } catch (e: any) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
}

export function releaseLock(sessionId: string): void {
  try {
    unlinkSync(lockPath(sessionId));
  } catch (e: any) {
    // ENOENT is normal (lock wasn't held); everything else is worth
    // seeing in debug mode.
    if (e?.code !== "ENOENT") {
      dlog(`releaseLock unlink failed for ${sessionId}: ${e.message}`);
    }
  }
}
