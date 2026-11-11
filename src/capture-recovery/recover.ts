/**
 * Capture-gap recovery for Claude Code sessions.
 *
 * Why: Claude Code deletes an orphaned plugin version a few days after an
 * update, even while a long-running session still points its hooks at it.
 * From then on every hook of that session fails (ENOENT), so capture stops
 * silently while the session — and its local transcript — keep going.
 *
 * How: capture already appends every event it writes to a local per-session
 * cache (~/.claude/hooks/session-cache/<id>.jsonl); its last line records
 * the session's transcript path and when capture last succeeded. A session
 * whose cache has been quiet for a while but whose transcript has newer
 * prompts / tool calls / replies has a gap. Those events are rebuilt from
 * the transcript and written exactly like capture would have:
 *   - same session path, original timestamps, deterministic ids (the
 *     sessions INSERT is idempotent per id, so re-runs never duplicate);
 *   - appended to the local cache, so the cache stays the record of what
 *     was captured and the wiki worker's next summary includes them.
 *
 * Runs in a detached worker (SessionStart, and from live capture at most
 * every 30 min), never on a hook's hot path.
 */

import { createReadStream, readdirSync, statSync, openSync, readSync, closeSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { transcriptEvents, type RecoveredEvent, type TranscriptGap } from "./transcript.js";

/** Hook events only Claude Code's capture writes (Cursor/Hermes use other names). */
const CLAUDE_EVENTS = new Set(["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop", "SubagentStop"]);

/** A cache written within this window belongs to a session that is still capturing. */
export const DEFAULT_MIN_IDLE_MS = 20 * 60_000;
/** Matches the session cache's own 14-day pruning. */
export const DEFAULT_MAX_AGE_MS = 14 * 86_400_000;
/** Per session per run; the rest is picked up by the next run. */
export const DEFAULT_MAX_EVENTS = 3_000;

export interface CaptureGap {
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  /** When capture last wrote an event for this session. */
  lastCapturedMs: number;
}

/** Read the last non-empty line of a file without loading all of it. */
export function readLastLine(path: string, chunk = 64 * 1024): string | null {
  let fd: number;
  try { fd = openSync(path, "r"); } catch { return null; }
  try {
    const size = statSyncSafe(path)?.size ?? 0;
    let pos = size;
    let tail = "";
    while (pos > 0) {
      const len = Math.min(chunk, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, pos);
      tail = buf.toString("utf-8") + tail;
      const trimmed = tail.replace(/\n+$/, "");
      const nl = trimmed.lastIndexOf("\n");
      if (nl >= 0) return trimmed.slice(nl + 1);
      if (pos === 0) return trimmed || null;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

function statSyncSafe(path: string) {
  try { return statSync(path); } catch { return null; }
}

/** Claude Code config roots whose `projects/` hold session transcripts. */
export function claudeConfigRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = [env.CLAUDE_CONFIG_DIR, join(homedir(), ".claude")].filter((r): r is string => !!r);
  return [...new Set(roots)];
}

/**
 * Map session id → transcript path across `<root>/projects/<project>/<id>.jsonl`.
 * Needed because the cached `transcript_path` is unusable: capture runs each
 * line through the secret redactor, which masks the path's project and file
 * segments.
 */
export function indexTranscripts(roots: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const root of roots) {
    const projects = join(root, "projects");
    let dirs: string[];
    try { dirs = readdirSync(projects); } catch { continue; }
    for (const d of dirs) {
      let files: string[];
      try { files = readdirSync(join(projects, d)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const id = f.slice(0, -".jsonl".length);
        if (!out.has(id)) out.set(id, join(projects, d, f));
      }
    }
  }
  return out;
}

/**
 * Sessions whose capture stopped while their transcript kept growing.
 * Cheap: one readdir, a stat per cache, a tail read only for idle caches
 * whose transcript changed after the last capture.
 */
export function findCaptureGaps(opts: {
  cacheDir: string;
  now?: number;
  minIdleMs?: number;
  maxAgeMs?: number;
  skipSessionId?: string;
  /** Session id → transcript path; defaults to scanning the Claude config roots. */
  transcripts?: Map<string, string>;
  /** Session id → ms up to which events were deliberately skipped (opt-out). */
  floors?: Record<string, number>;
}): CaptureGap[] {
  const now = opts.now ?? Date.now();
  const minIdle = opts.minIdleMs ?? DEFAULT_MIN_IDLE_MS;
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  let names: string[];
  try { names = readdirSync(opts.cacheDir); } catch { return []; }
  const gaps: CaptureGap[] = [];
  let transcripts = opts.transcripts;
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const sessionId = name.slice(0, -".jsonl".length);
    if (sessionId === opts.skipSessionId) continue;
    const cachePath = join(opts.cacheDir, name);
    const st = statSyncSafe(cachePath);
    if (!st) continue;
    const idle = now - st.mtimeMs;
    if (idle < minIdle || idle > maxAge) continue;

    const last = readLastLine(cachePath);
    if (!last) continue;
    let e: Record<string, unknown>;
    try { e = JSON.parse(last); } catch { continue; }
    if (!CLAUDE_EVENTS.has(String(e.hook_event_name ?? ""))) continue;
    const capturedMs = Date.parse(String(e.timestamp ?? ""));
    if (!Number.isFinite(capturedMs)) continue;
    const lastCapturedMs = Math.max(capturedMs, opts.floors?.[sessionId] ?? 0);
    transcripts ??= indexTranscripts(claudeConfigRoots());
    const hinted = typeof e.transcript_path === "string" && !e.transcript_path.includes("*") ? e.transcript_path : "";
    const transcriptPath = transcripts.get(sessionId) ?? hinted;
    if (!transcriptPath) continue;
    const tst = statSyncSafe(transcriptPath);
    // Transcript untouched since the last capture: nothing can be missing.
    if (!tst || tst.mtimeMs <= lastCapturedMs + 1_000) continue;
    const cwd = typeof e.cwd === "string" && !e.cwd.includes("*") ? e.cwd : "";
    gaps.push({ sessionId, transcriptPath, cwd, lastCapturedMs });
  }
  return gaps;
}

/** The capture entry for a recovered event (same shape capture.ts writes). */
export function recoveredEntry(sessionId: string, gap: CaptureGap, ev: RecoveredEvent): Record<string, unknown> {
  return {
    id: ev.id,
    session_id: sessionId,
    transcript_path: gap.transcriptPath,
    cwd: ev.cwd ?? gap.cwd,
    hook_event_name: ev.hookEvent,
    timestamp: ev.ts,
    ...ev.body,
    recovered: true,
  };
}

/** Stream a transcript and return the events after the last capture. */
export async function readGapEvents(gap: CaptureGap): Promise<TranscriptGap> {
  if (!existsSync(gap.transcriptPath)) return { events: [], captureHookFailed: false };
  const rl = createInterface({ input: createReadStream(gap.transcriptPath, { encoding: "utf-8" }), crlfDelay: Infinity });
  const lines: string[] = [];
  for await (const line of rl) lines.push(line);
  return transcriptEvents(lines, gap.sessionId, gap.lastCapturedMs);
}

export interface RecoveryDeps {
  /**
   * Decide whether a session may be recovered, once its events are known
   * (e.g. the directory's capture opt-out). May update `gap.cwd`.
   */
  accept?: (gap: CaptureGap, events: RecoveredEvent[]) => boolean;
  /** Write one event (INSERT + local cache append). Throws on failure. */
  writeEvent: (gap: CaptureGap, ev: RecoveredEvent) => Promise<void>;
  /** Called when `accept` rejected a session, with its newest event time. */
  onSkipped?: (gap: CaptureGap, uptoMs: number) => void;
  /** Called once per session that got events back. */
  onRecovered?: (gap: CaptureGap, count: number) => void;
  log?: (msg: string) => void;
  maxEvents?: number;
}

export interface RecoveryResult {
  sessions: number;
  events: number;
  failed: number;
  bySession: Array<{ sessionId: string; events: number }>;
}

/**
 * Recover every gap. Events are written in time order and the run stops at
 * a session's first failed write, so the local cache (the "last captured"
 * marker) never moves past an event that didn't reach the backend.
 */
export async function recoverCaptureGaps(gaps: CaptureGap[], deps: RecoveryDeps): Promise<RecoveryResult> {
  const log = deps.log ?? (() => {});
  const max = deps.maxEvents ?? DEFAULT_MAX_EVENTS;
  const res: RecoveryResult = { sessions: 0, events: 0, failed: 0, bySession: [] };
  for (const gap of gaps) {
    let found: TranscriptGap;
    try { found = await readGapEvents(gap); } catch (e: any) {
      log(`read failed session=${gap.sessionId}: ${e?.message ?? e}`);
      res.failed++;
      continue;
    }
    const { events } = found;
    if (events.length === 0) continue;
    if (!found.captureHookFailed) {
      log(`skipped session=${gap.sessionId}: ${events.length} uncaptured events but no failed capture hook (left as is)`);
      continue;
    }
    if (deps.accept && !deps.accept(gap, events)) {
      log(`skipped session=${gap.sessionId} (capture not allowed for its directory)`);
      deps.onSkipped?.(gap, Date.parse(events[events.length - 1].ts));
      continue;
    }
    let written = 0;
    for (const ev of events.slice(0, max)) {
      try {
        await deps.writeEvent(gap, ev);
        written++;
      } catch (e: any) {
        log(`write failed session=${gap.sessionId} after ${written}: ${e?.message ?? e}`);
        res.failed++;
        break;
      }
    }
    if (written > 0) {
      res.sessions++;
      res.events += written;
      res.bySession.push({ sessionId: gap.sessionId, events: written });
      deps.onRecovered?.(gap, written);
    }
    log(`session=${gap.sessionId} gap_since=${new Date(gap.lastCapturedMs).toISOString()} found=${events.length} written=${written}`);
  }
  return res;
}
