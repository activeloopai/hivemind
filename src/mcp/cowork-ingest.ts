/**
 * Cowork session ingester.
 *
 * Claude Cowork (Anthropic's desktop Local Agent Mode) has no hook lifecycle
 * like Claude Code — it only talks to us through the MCP server, and that
 * channel is read-only (search/read/index). So Cowork conversations would
 * never land in Deeplake on their own.
 *
 * Cowork's Local Agent Mode runs a real Claude Code instance under the hood
 * and writes standard Claude-Code transcript JSONL to:
 *   <claudeDesktopConfigDir>/local-agent-mode-sessions/**​/.claude/projects/<enc>/<sessionId>.jsonl
 *
 * This module tails those transcripts and writes each new user/assistant
 * message into the shared `sessions` table with agent = "claude_cowork",
 * so Cowork sessions become first-class shared memory like every other agent.
 *
 * It runs piggy-backed on the MCP server (which is spawned in every Cowork
 * session), so no extra install step is needed. A per-transcript line
 * watermark prevents re-ingesting old events; a lock file prevents the
 * several concurrent MCP processes Cowork spawns from double-inserting.
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadCredentials } from "../commands/auth.js";
import { loadConfig, type Config } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { claudeDesktopConfigDir } from "../cli/util.js";
import { getVersion } from "../cli/version.js";
import {
  appendQueuedSessionRow,
  buildQueuedSessionRow,
  buildSessionPath,
  drainSessionQueues,
  gcOversizedQueueFiles,
} from "../hooks/session-queue.js";
import { spawnWikiWorker, bundleDirFromImportMeta } from "../hooks/spawn-wiki-worker.js";
import { forceSessionEndTrigger } from "../skillify/triggers.js";
import { basename } from "node:path";
import { log } from "../utils/debug.js";

/** Value written to the `agent` column for Cowork-originated rows. */
export const COWORK_AGENT = "claude_cowork";
/** `project` column value — lets Cowork rows be filtered without a JSON dig. */
const COWORK_PROJECT = "claude_cowork";

const DEEPLAKE_DIR = join(homedir(), ".deeplake");
const STATE_PATH = join(DEEPLAKE_DIR, "cowork-ingest-state.json");
const LOCK_PATH = join(DEEPLAKE_DIR, ".cowork-ingest.lock");
const COWORK_QUEUE_DIR = join(DEEPLAKE_DIR, "queue-cowork");
const NOTICE_MARKER = join(DEEPLAKE_DIR, ".cowork-data-notice-shown");
const DROPPED_MARKER = join(DEEPLAKE_DIR, "cowork-dropped-rows.jsonl");
const LOCK_STALE_MS = 60_000;
// Refresh the held lock's mtime well inside LOCK_STALE_MS so a long ingest is
// never mistaken for a dead run and stolen mid-flight by a second process.
const LOCK_HEARTBEAT_MS = 20_000;
// A Cowork transcript untouched for this long is treated as a finished session
// and gets a summary (Cowork has no SessionEnd hook to signal completion).
const SUMMARY_IDLE_MS = 5 * 60_000;

const DATA_NOTICE =
  "ℹ️ Hivemind data notice: this Cowork session is being saved to your team's shared Deeplake memory " +
  "(your prompts, the assistant's responses, and tool calls) so agents and teammates can recall it later. " +
  "Everyone in your Deeplake workspace can read it. To turn capture off, set HIVEMIND_CAPTURE=false. " +
  "(This notice is shown once.)";

/**
 * One-time consent/data notice for Cowork. Cowork has no SessionStart banner,
 * so the only place we can surface this is the first hivemind tool result.
 * Returns the notice text exactly once (guarded by a marker file), and only
 * when Cowork capture is actually active; "" otherwise.
 */
export function coworkDataNoticeOnce(): string {
  try {
    if (process.env.HIVEMIND_CAPTURE === "false") return "";
    if (!existsSync(coworkSessionsRoot())) return ""; // not a Cowork host → nothing captured
    mkdirSync(DEEPLAKE_DIR, { recursive: true });
    // Atomic create-exclusive: the first caller to win the `wx` open writes the
    // marker and returns the notice; a racing Cowork process gets EEXIST and
    // returns "". Replaces a check-then-write (existsSync + writeFileSync) that
    // CodeQL flagged as a file-system race (js/file-system-race).
    try {
      writeFileSync(NOTICE_MARKER, new Date().toISOString(), { flag: "wx" });
    } catch {
      return ""; // marker already present (or unwritable) → notice already shown
    }
    return `${DATA_NOTICE}\n\n`;
  } catch {
    return "";
  }
}

export interface IngestState {
  /** transcript absolute path → number of lines already ingested. */
  processedLines: Record<string, number>;
  /** transcript absolute path → line count at last summary spawn. */
  summarizedLines?: Record<string, number>;
}

export interface TranscriptLine {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  message?: { role?: string; content?: unknown };
}

function coworkSessionsRoot(): string {
  return join(claudeDesktopConfigDir(), "local-agent-mode-sessions");
}

/** Recursively collect Claude-Code transcript JSONL files under a dir. */
function findTranscripts(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(full);
      } else if (
        name.endsWith(".jsonl") &&
        // Separator-agnostic so Windows transcript paths (\\.claude\\projects\\)
        // match too — otherwise ingest is a silent no-op on Windows hosts.
        /[\\/]\.claude[\\/]projects[\\/]/.test(full) &&
        /^[0-9a-f-]{36}\.jsonl$/i.test(name)
      ) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/** True when the Cowork queue still holds rows the backend has not taken. */
function hasQueuedRows(): boolean {
  try {
    // Dot-prefixed entries are queue metadata (drain lock, disabled marker),
    // never rows owed to the backend.
    return readdirSync(COWORK_QUEUE_DIR)
      .some(n => !n.startsWith(".") && (n.endsWith(".jsonl") || n.endsWith(".inflight")));
  } catch {
    return false; // no queue dir yet
  }
}

/**
 * Note rows the queue ceiling refused. The transcript watermark has already
 * moved past them, so they will never be uploaded; this file is the only
 * durable trace of that loss.
 */
function recordLoss(detail: Record<string, unknown>): void {
  try {
    mkdirSync(DEEPLAKE_DIR, { recursive: true });
    appendFileSync(DROPPED_MARKER, `${JSON.stringify({ at: new Date().toISOString(), ...detail })}\n`);
  } catch {
    /* best effort */
  }
  log("cowork-ingest", `recorded queue loss: ${JSON.stringify(detail)}`);
}

function recordDroppedRows(count: number): void {
  recordLoss({ droppedRows: count, reason: "session queue at its size ceiling" });
}

function loadState(): IngestState {
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
    if (raw && typeof raw === "object" && raw.processedLines) return raw as IngestState;
  } catch {
    /* fresh state */
  }
  return { processedLines: {} };
}

function saveState(state: IngestState): void {
  mkdirSync(DEEPLAKE_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state));
}

/** Flatten a Claude-Code message content into plain text. */
export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
          return String((block as { text?: string }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function isBlock(b: unknown): b is { type?: string; [k: string]: unknown } {
  return !!b && typeof b === "object";
}

/**
 * Map one transcript line to zero or more sessions-table message entries.
 * Captures user prompts, assistant text, assistant tool calls, and the
 * matching tool results — parity with the claude_code capture hook.
 */
export function entriesForLine(line: TranscriptLine): Record<string, unknown>[] {
  if (!line.sessionId) return [];
  const ts = line.timestamp ?? new Date().toISOString();
  const base = { session_id: line.sessionId, timestamp: ts, cwd: line.cwd, agent: COWORK_AGENT };
  const content = line.message?.content;
  const out: Record<string, unknown>[] = [];

  if (line.type === "user") {
    // Tool results come back as user lines carrying tool_result blocks.
    if (Array.isArray(content)) {
      for (const b of content) {
        if (isBlock(b) && b.type === "tool_result") {
          out.push({
            id: crypto.randomUUID(),
            ...base,
            type: "tool_result",
            tool_use_id: b.tool_use_id,
            tool_response: JSON.stringify(b.content ?? null),
          });
        }
      }
    }
    const text = extractText(content);
    if (text.trim()) out.push({ id: crypto.randomUUID(), ...base, type: "user_message", content: text });
    return out;
  }

  if (line.type === "assistant") {
    const text = extractText(content);
    if (text.trim()) out.push({ id: crypto.randomUUID(), ...base, type: "assistant_message", content: text });
    if (Array.isArray(content)) {
      for (const b of content) {
        if (isBlock(b) && b.type === "tool_use") {
          out.push({
            id: crypto.randomUUID(),
            ...base,
            type: "tool_call",
            tool_name: b.name,
            tool_use_id: b.id,
            tool_input: JSON.stringify(b.input ?? null),
          });
        }
      }
    }
    return out;
  }

  return out;
}

function tryAcquireLock(): (() => void) | null {
  mkdirSync(DEEPLAKE_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK_PATH, "wx");
      closeSync(fd);
      // Heartbeat the lock mtime so a run that outlives LOCK_STALE_MS (many
      // transcripts / slow upload) is not seen as abandoned and stolen by a
      // second Cowork process — which would replay the same transcripts and
      // duplicate session rows. Cleared on release; unref'd so it never keeps
      // the process alive on its own.
      const heartbeat = setInterval(() => {
        try {
          const t = new Date();
          utimesSync(LOCK_PATH, t, t);
        } catch {
          /* lock vanished — nothing to refresh */
        }
      }, LOCK_HEARTBEAT_MS);
      heartbeat.unref?.();
      return () => {
        clearInterval(heartbeat);
        rmSync(LOCK_PATH, { force: true });
      };
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "EEXIST") return null;
      try {
        if (Date.now() - statSync(LOCK_PATH).mtimeMs >= LOCK_STALE_MS) {
          rmSync(LOCK_PATH, { force: true });
          continue;
        }
      } catch {
        /* lock vanished — retry */
      }
      return null;
    }
  }
  return null;
}

/**
 * Spawn a wiki-worker for each Cowork session whose transcript has gone idle
 * and has un-summarized content. The worker reads the session rows we already
 * wrote to the sessions table (keyed by sessionId) and uploads a summary to
 * the memory table — same path every other agent uses, so Cowork sessions
 * appear in hivemind_index / recall. Best-effort: a missing `claude` binary or
 * a spawn failure is logged and skipped (the raw session is still captured).
 */
export type SpawnSummaryFn = (sessionId: string) => void;

export function summarizeIdleSessions(
  config: Config,
  state: IngestState,
  spawn?: SpawnSummaryFn,
  now: number = Date.now(),
): void {
  const bundleDir = bundleDirFromImportMeta(import.meta.url);
  // Default end-of-session work for a Cowork session: a wiki summary (so it
  // shows up in hivemind_index) AND a skillify mining pass — exactly what the
  // claude_code SessionEnd hook does. Each is independent and best-effort.
  const doSpawn: SpawnSummaryFn =
    spawn ??
    ((sessionId) => {
      try {
        spawnWikiWorker({ config, sessionId, cwd: `/${COWORK_PROJECT}`, bundleDir, reason: "CoworkIdle", agent: COWORK_AGENT });
      } catch (e: unknown) {
        log("cowork-ingest", `summary spawn skipped for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        forceSessionEndTrigger({ config, cwd: `/${COWORK_PROJECT}`, bundleDir, agent: COWORK_AGENT, sessionId });
      } catch (e: unknown) {
        log("cowork-ingest", `skillify trigger skipped for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  state.summarizedLines ??= {};

  for (const path of Object.keys(state.processedLines)) {
    const processed = state.processedLines[path] ?? 0;
    if (processed === 0) continue;
    if (processed <= (state.summarizedLines[path] ?? 0)) continue; // nothing new since last summary

    try {
      if (now - statSync(path).mtimeMs < SUMMARY_IDLE_MS) continue; // still active
    } catch {
      continue; // transcript vanished
    }

    const sessionId = basename(path).replace(/\.jsonl$/, "");
    try {
      doSpawn(sessionId);
      state.summarizedLines[path] = processed;
      log("cowork-ingest", `ran end-of-session work (summary + skillify) for idle Cowork session ${sessionId}`);
    } catch (e: unknown) {
      log("cowork-ingest", `idle-session work failed for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * Tail Cowork transcripts and write new messages to the sessions table.
 * Safe to call repeatedly; never throws and never writes to stdout (which
 * would corrupt the MCP stdio channel).
 */
export async function ingestCoworkSessions(): Promise<{ ingested: number } | { skipped: string }> {
  if (process.env.HIVEMIND_CAPTURE === "false") return { skipped: "capture-disabled" };

  const root = coworkSessionsRoot();
  if (!existsSync(root)) return { skipped: "no-cowork-sessions" };

  const creds = loadCredentials();
  if (!creds?.token) return { skipped: "not-authenticated" };
  const config = loadConfig();
  if (!config) return { skipped: "no-config" };

  const release = tryAcquireLock();
  if (!release) return { skipped: "busy" };

  let ingested = 0;
  try {
    // Reclaim any queue file left oversized by an earlier upload outage before
    // writing more rows — such a file can no longer be flushed.
    gcOversizedQueueFiles(COWORK_QUEUE_DIR, undefined, (path, sizeBytes) =>
      recordLoss({ droppedQueueFile: path, sizeBytes }),
    );
    const state = loadState();
    const transcripts = findTranscripts(root);
    let appendedAny = false;
    let dropped = 0;

    for (const path of transcripts) {
      let lines: string[];
      try {
        lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
      } catch {
        continue;
      }
      const already = state.processedLines[path] ?? 0;
      if (lines.length <= already) continue;

      for (const raw of lines.slice(already)) {
        let parsed: TranscriptLine;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        for (const entry of entriesForLine(parsed)) {
          const serialized = JSON.stringify(entry);
          const row = buildQueuedSessionRow({
            sessionPath: buildSessionPath(config, String(entry.session_id)),
            line: serialized,
            userName: config.userName,
            projectName: COWORK_PROJECT,
            description: String(entry.type ?? ""),
            agent: COWORK_AGENT,
            pluginVersion: getVersion(),
            timestamp: String(entry.timestamp),
          });
          const { appended } = appendQueuedSessionRow(row, COWORK_QUEUE_DIR);
          if (appended) {
            appendedAny = true;
            ingested += 1;
          } else {
            dropped += 1;
          }
        }
      }
      state.processedLines[path] = lines.length;
    }

    // Persist the watermark as soon as the rows are in the on-disk queue, and
    // BEFORE the upload. The queue file — not this watermark — is what owes the
    // backend those rows, and it retries them on the next tick with the same
    // row ids (the INSERT is idempotent). Saving after the upload instead meant
    // that any upload failure lost the watermark, so the next tick re-read the
    // same transcript lines and appended the whole transcript to the queue
    // again, every 30s, without bound: a customer running Cowork with a
    // flapping network filesystem reached a single 39.9 GB queue file growing
    // ~5 GB/day (2026-08-19).
    if (appendedAny) saveState(state);

    if (dropped > 0) {
      // The watermark advanced past these lines, so they are gone for good.
      // Record it where support can find it — a debug log nobody has enabled
      // is not a record. Only reachable after a very long upload outage.
      recordDroppedRows(dropped);
    }

    // Drain whenever anything is queued — not only when this tick appended.
    // Before the watermark fix, the replay itself kept appendedAny true and so
    // kept retrying; without it, a queue left behind by an outage would never
    // be uploaded if the Cowork session had meanwhile gone quiet.
    if (appendedAny || hasQueuedRows()) {
      const api = new DeeplakeApi(
        config.token,
        config.apiUrl,
        config.orgId,
        config.workspaceId,
        config.sessionsTableName,
      );
      try {
        await drainSessionQueues(api, {
          sessionsTable: config.sessionsTableName,
          queueDir: COWORK_QUEUE_DIR,
        });
      } catch (e: unknown) {
        // Upload failure is expected while offline. The rows stay queued and
        // the next tick retries them; do not let it abort the summarize pass.
        log("cowork-ingest", `queue drain failed, rows stay queued: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Summarize sessions that have gone idle — Cowork has no SessionEnd hook,
    // so "untouched for SUMMARY_IDLE_MS" is our completion signal. Reads the
    // rows we just wrote to the sessions table (same as every other agent).
    summarizeIdleSessions(config, state);

    saveState(state);

    if (ingested > 0) log("cowork-ingest", `ingested ${ingested} message(s) from Cowork transcripts`);
    return { ingested };
  } catch (e: unknown) {
    log("cowork-ingest", `error: ${e instanceof Error ? e.message : String(e)}`);
    return { ingested };
  } finally {
    release();
  }
}

/**
 * Start background ingestion: once on startup, then on an interval. The timer
 * is unref'd so it never keeps the MCP process alive on its own.
 */
export function startCoworkIngestLoop(intervalMs = 30_000): void {
  void ingestCoworkSessions();
  const timer = setInterval(() => {
    void ingestCoworkSessions();
  }, intervalMs);
  timer.unref?.();
}
