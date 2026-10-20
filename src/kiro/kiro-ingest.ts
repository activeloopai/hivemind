/**
 * Kiro CLI session ingester.
 *
 * Kiro CLI (kiro-cli) writes sessions to:
 *   ~/.kiro/sessions/cli/<uuid>.jsonl
 *
 * Each line is a JSON object with a `version`, `kind`, and `data` field:
 *
 *   {"version":"v1","kind":"Prompt","data":{"content":[{"kind":"text","data":"..."}]}}
 *   {"version":"v1","kind":"AssistantMessage","data":{"content":[{"kind":"text","data":"..."},{"kind":"toolUse","data":{"toolUseId":"...","name":"...","input":{...}}}]}}
 *   {"version":"v1","kind":"ToolResults","data":{"content":[{"kind":"toolResult","data":{"toolUseId":"...","content":[...]}}]}}
 *
 * Kiro has no hook lifecycle. This module tails those JSONL transcripts and
 * writes each new entry into the shared `sessions` table with agent = "kiro",
 * so Kiro sessions become first-class shared memory alongside Claude Code,
 * Cursor, and Cowork sessions.
 *
 * It runs piggy-backed on the MCP server (which Kiro spawns for every session
 * via ~/.kiro/settings/mcp.json), so no extra install step is needed beyond
 * `hivemind install kiro`. A per-transcript line watermark prevents
 * re-ingesting old events; a lock file prevents concurrent MCP processes from
 * double-inserting.
 */
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadCredentials } from "../commands/auth.js";
import { loadConfig, type Config } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { getVersion } from "../cli/version.js";
import {
  appendQueuedSessionRows,
  buildQueuedSessionRow,
  buildSessionPath,
  drainSessionQueues,
  gcOversizedQueueFiles,
  queuedRowBytes,
  MAX_SESSION_QUEUE_BYTES,
} from "../hooks/session-queue.js";
import { spawnWikiWorker, bundleDirFromImportMeta } from "../hooks/spawn-wiki-worker.js";
import { forceSessionEndTrigger } from "../skillify/triggers.js";
import { redactSecrets } from "../hooks/shared/redact.js";
import { basename } from "node:path";
import { log } from "../utils/debug.js";

/** Value written to the `agent` column for Kiro-originated rows. */
export const KIRO_AGENT = "kiro";
/** `project` column value. */
const KIRO_PROJECT = "kiro";

const HOME = homedir();
const KIRO_SESSIONS_DIR = join(HOME, ".kiro", "sessions", "cli");
const DEEPLAKE_DIR = join(HOME, ".deeplake");
const STATE_PATH = join(DEEPLAKE_DIR, "kiro-ingest-state.json");
const LOCK_PATH = join(DEEPLAKE_DIR, ".kiro-ingest.lock");
const KIRO_QUEUE_DIR = join(DEEPLAKE_DIR, "queue-kiro");
const DROPPED_MARKER = join(DEEPLAKE_DIR, "kiro-dropped-rows.jsonl");
const MAX_LOSS_JOURNAL_BYTES = 1024 * 1024;
const LOCK_STALE_MS = 60_000;
const LOCK_HEARTBEAT_MS = 20_000;
// A Kiro transcript untouched for this long is treated as a finished session.
const SUMMARY_IDLE_MS = 5 * 60_000;

export interface IngestState {
  /** transcript absolute path → number of lines already ingested. */
  processedLines: Record<string, number>;
  /** transcript absolute path → line count at last summary spawn. */
  summarizedLines?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Kiro JSONL types
// ---------------------------------------------------------------------------

interface KiroTextBlock {
  kind: "text";
  data: string;
}

interface KiroToolUseBlock {
  kind: "toolUse";
  data: {
    toolUseId: string;
    name: string;
    input: unknown;
  };
}

interface KiroToolResultBlock {
  kind: "toolResult";
  data: {
    toolUseId: string;
    content: unknown;
  };
}

type KiroContentBlock = KiroTextBlock | KiroToolUseBlock | KiroToolResultBlock | { kind: string; [k: string]: unknown };

export interface KiroLine {
  version?: string;
  kind?: string;
  data?: {
    content?: KiroContentBlock[];
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load persisted watermark state from disk.
 *
 * Returns `{ processedLines: {} }` when no state file exists yet (first run).
 * Returns `null` — signalling "skip ingestion this tick" — when the file
 * exists but cannot be parsed or has an unexpected shape, so callers never
 * reset watermarks to zero and accidentally replay already-ingested lines.
 */
function loadState(): IngestState {
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
    if (raw && typeof raw === "object" && raw.processedLines) return raw as IngestState;
    // File exists but has invalid shape — do not reset to empty watermark,
    // which would replay every transcript from line zero and create duplicates.
    // Return null to signal a bad state; callers skip ingestion for this tick.
  } catch (e: unknown) {
    // Missing file is the only acceptable reason to start fresh.
    if ((e as { code?: string }).code === "ENOENT") return { processedLines: {} };
    // Any other error (partial write, permission issue) — fail closed.
  }
  return null as unknown as IngestState; // signals "do not ingest this tick"
}

/**
 * Persist watermark state atomically.
 *
 * Writes to a `.tmp` file first, then renames it into place so readers
 * always see either the previous complete state or the new one — never a
 * half-written file.
 */
function saveState(state: IngestState): void {
  mkdirSync(DEEPLAKE_DIR, { recursive: true });
  // Atomic write: write to a temp file first, then rename into place.
  // A rename is atomic on every OS — the reader always sees either the old
  // complete state or the new complete state, never a half-written file.
  const tmp = `${STATE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_PATH);
}

/**
 * Append a structured entry to the loss journal on disk (best-effort).
 *
 * Called whenever a queue file is dropped or a transcript line cannot be
 * enqueued. The journal is capped at `MAX_LOSS_JOURNAL_BYTES` to prevent
 * unbounded growth; entries beyond the ceiling are silently discarded.
 * Never throws — a failure here must not interrupt the ingest loop.
 */
function recordLoss(detail: Record<string, unknown>): void {
  try {
    mkdirSync(DEEPLAKE_DIR, { recursive: true });
    const fd = openSync(DROPPED_MARKER, "a");
    try {
      const record = Buffer.from(`${JSON.stringify({ at: new Date().toISOString(), ...detail })}\n`, "utf-8");
      if (fstatSync(fd).size + record.length > MAX_LOSS_JOURNAL_BYTES) {
        log("kiro-ingest", "loss journal is at its ceiling, not recording further entries");
        return;
      }
      let written = 0;
      while (written < record.length) written += writeSync(fd, record, written, record.length - written);
    } finally {
      closeSync(fd);
    }
  } catch {
    /* best effort */
  }
  log("kiro-ingest", `recorded queue loss: ${JSON.stringify(detail)}`);
}

/**
 * Attempt to acquire the per-process ingest lock.
 *
 * Uses an exclusive `wx` open on `LOCK_PATH` so only one concurrent MCP
 * process ingests at a time. Returns a `release` callback on success, or
 * `null` if another process holds the lock. Stale locks (no heartbeat for
 * `LOCK_STALE_MS`) are reclaimed automatically. The returned callback stops
 * the heartbeat interval and removes the lock file.
 */
function tryAcquireLock(): (() => void) | null {
  mkdirSync(DEEPLAKE_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK_PATH, "wx");
      closeSync(fd);
      const heartbeat = setInterval(() => {
        try {
          const t = new Date();
          utimesSync(LOCK_PATH, t, t);
        } catch {
          /* lock vanished */
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
 * Return `true` if there are any pending or in-flight queue files in
 * `KIRO_QUEUE_DIR` that have not yet been drained to DeepLake.
 */
function hasQueuedRows(): boolean {
  try {
    return readdirSync(KIRO_QUEUE_DIR)
      .some(n => !n.startsWith(".") && (n.endsWith(".jsonl") || n.endsWith(".inflight")));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Line parsing — exported for tests
// ---------------------------------------------------------------------------

/**
 * Type guard: return `true` when `b` is a non-null object with a `kind`
 * property, i.e. a valid `KiroContentBlock`.
 */
function isBlock(b: unknown): b is KiroContentBlock {
  return !!b && typeof b === "object" && "kind" in (b as object);
}

/**
 * Extract plain text from Kiro content blocks.
 * Only `kind: "text"` blocks contribute; toolUse and toolResult are skipped.
 */
export function extractText(content: KiroContentBlock[] | undefined): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is KiroTextBlock => isBlock(b) && b.kind === "text")
    .map(b => b.data)
    .filter(Boolean)
    .join("\n");
}

/**
 * Map one Kiro JSONL line to zero or more sessions-table message entries.
 *
 * Kind mapping:
 *   Prompt           → user_message  (text blocks only)
 *   AssistantMessage → assistant_message (text blocks) + tool_call per toolUse block
 *   ToolResults      → tool_result per toolResult block
 *
 * The session_id is derived from the transcript filename (UUID).
 */
export function entriesForLine(
  line: KiroLine,
  sessionId: string,
  timestamp: string = new Date().toISOString(),
): Record<string, unknown>[] {
  const base = { session_id: sessionId, timestamp, agent: KIRO_AGENT };
  const blocks = line.data?.content ?? [];
  const out: Record<string, unknown>[] = [];

  if (line.kind === "Prompt") {
    const text = extractText(blocks as KiroContentBlock[]);
    if (text.trim()) {
      out.push({
        id: crypto.randomUUID(),
        ...base,
        type: "user_message",
        content: redactSecrets(text),
      });
    }
    return out;
  }

  if (line.kind === "AssistantMessage") {
    const text = extractText(blocks as KiroContentBlock[]);
    if (text.trim()) {
      out.push({
        id: crypto.randomUUID(),
        ...base,
        type: "assistant_message",
        content: redactSecrets(text),
      });
    }
    for (const b of blocks) {
      if (isBlock(b) && b.kind === "toolUse") {
        const tb = b as KiroToolUseBlock;
        // Validate required fields before dereferencing — a malformed block
        // without .data would throw and block all subsequent transcript lines.
        if (!tb.data || typeof tb.data.name !== "string" || typeof tb.data.toolUseId !== "string") {
          log("kiro-ingest", `skipping malformed toolUse block (missing data/name/toolUseId)`);
          continue;
        }
        out.push({
          id: crypto.randomUUID(),
          ...base,
          type: "tool_call",
          tool_name: tb.data.name,
          tool_use_id: tb.data.toolUseId,
          tool_input: redactSecrets(JSON.stringify(tb.data.input ?? null)),
        });
      }
    }
    return out;
  }

  if (line.kind === "ToolResults") {
    for (const b of blocks) {
      if (isBlock(b) && b.kind === "toolResult") {
        const rb = b as KiroToolResultBlock;
        // Same: validate before dereferencing.
        if (!rb.data || typeof rb.data.toolUseId !== "string") {
          log("kiro-ingest", `skipping malformed toolResult block (missing data/toolUseId)`);
          continue;
        }
        out.push({
          id: crypto.randomUUID(),
          ...base,
          type: "tool_result",
          tool_use_id: rb.data.toolUseId,
          tool_response: redactSecrets(JSON.stringify(rb.data.content ?? null)),
        });
      }
    }
    return out;
  }

  return out;
}

/**
 * Serialize a Kiro session entry and build the queued row.
 *
 * Secret redaction is performed upstream in entriesForLine() on each
 * individual field before the entry is assembled, so the redactor sees one
 * level of JSON encoding per field. This function serializes once.
 */
export function buildKiroQueueRow(
  entry: Record<string, unknown>,
  config: { userName: string; orgName: string; workspaceId: string },
): ReturnType<typeof buildQueuedSessionRow> {
  return buildQueuedSessionRow({
    sessionPath: buildSessionPath(config, String(entry.session_id ?? "")),
    line: JSON.stringify(entry),
    userName: config.userName,
    projectName: KIRO_PROJECT,
    description: String(entry.type ?? ""),
    agent: KIRO_AGENT,
    pluginVersion: getVersion(),
    timestamp: String(entry.timestamp ?? new Date().toISOString()),
  });
}

// ---------------------------------------------------------------------------
// Idle-session summarizer
// ---------------------------------------------------------------------------

/** Callback type for spawning end-of-session work (wiki summary + skillify trigger). */
export type SpawnSummaryFn = (sessionId: string) => void;

/**
 * Trigger end-of-session work for any Kiro transcript that has not been
 * modified for `SUMMARY_IDLE_MS` (5 min) and has new lines since the last
 * summary checkpoint.
 *
 * Spawns a wiki-worker summary and a skillify trigger for each idle session.
 * Advances `state.summarizedLines` only after at least one task starts
 * successfully, so a failure retries on the next idle tick rather than being
 * silently skipped. The `spawn` parameter can be replaced in tests to avoid
 * touching the filesystem.
 */
export function summarizeIdleSessions(
  config: Config,
  state: IngestState,
  spawn?: SpawnSummaryFn,
  now: number = Date.now(),
): void {
  const bundleDir = bundleDirFromImportMeta(import.meta.url);
  const doSpawn: SpawnSummaryFn =
    spawn ??
    ((sessionId) => {
      // Track whether at least one task started successfully. If both fail,
      // throw so the caller does not advance summarizedLines — the session
      // will be retried on the next idle tick rather than being silently
      // marked as summarized with no summary written.
      let anyStarted = false;
      try {
        spawnWikiWorker({ config, sessionId, cwd: `/${KIRO_PROJECT}`, bundleDir, reason: "KiroIdle", agent: KIRO_AGENT });
        anyStarted = true;
      } catch (e: unknown) {
        log("kiro-ingest", `summary spawn skipped for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        forceSessionEndTrigger({ config, cwd: `/${KIRO_PROJECT}`, bundleDir, agent: KIRO_AGENT, sessionId });
        anyStarted = true;
      } catch (e: unknown) {
        log("kiro-ingest", `skillify trigger skipped for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!anyStarted) throw new Error(`all end-of-session tasks failed for ${sessionId}`);
    });
  state.summarizedLines ??= {};

  for (const path of Object.keys(state.processedLines)) {
    const processed = state.processedLines[path] ?? 0;
    if (processed === 0) continue;
    if (processed <= (state.summarizedLines[path] ?? 0)) continue;

    try {
      if (now - statSync(path).mtimeMs < SUMMARY_IDLE_MS) continue;
    } catch {
      continue;
    }

    const sessionId = basename(path).replace(/\.jsonl$/, "");
    try {
      doSpawn(sessionId);
      state.summarizedLines[path] = processed;
      log("kiro-ingest", `ran end-of-session work for idle Kiro session ${sessionId}`);
    } catch (e: unknown) {
      log("kiro-ingest", `idle-session work failed for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main ingest loop
// ---------------------------------------------------------------------------

/**
 * Tail Kiro transcripts and write new messages to the sessions table.
 * Safe to call repeatedly; never throws and never writes to stdout (which
 * would corrupt the MCP stdio channel).
 */
export async function ingestKiroSessions(): Promise<{ ingested: number } | { skipped: string }> {
  if (process.env.HIVEMIND_CAPTURE === "false") return { skipped: "capture-disabled" };
  if (!existsSync(KIRO_SESSIONS_DIR)) return { skipped: "no-kiro-sessions" };

  const creds = loadCredentials();
  if (!creds?.token) return { skipped: "not-authenticated" };
  const config = loadConfig();
  if (!config) return { skipped: "no-config" };

  const release = tryAcquireLock();
  if (!release) return { skipped: "busy" };

  let ingested = 0;
  try {
    gcOversizedQueueFiles(KIRO_QUEUE_DIR, undefined, (path, sizeBytes) =>
      recordLoss({ droppedQueueFile: path, sizeBytes }),
    );

    const state = loadState();
    if (!state) return { skipped: "invalid-state" };
    let transcripts: string[];
    try {
      transcripts = readdirSync(KIRO_SESSIONS_DIR)
        .filter(n => /^[0-9a-f-]{36}\.jsonl$/i.test(n))
        .map(n => join(KIRO_SESSIONS_DIR, n));
    } catch {
      return { skipped: "no-kiro-sessions" };
    }

    let appendedAny = false;
    let queueFull = false;

    for (const path of transcripts) {
      let lines: string[];
      try {
        lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
      } catch {
        continue;
      }
      const already = state.processedLines[path] ?? 0;
      if (lines.length <= already) continue;

      // Session ID is the UUID filename (without .jsonl).
      const sessionId = basename(path).replace(/\.jsonl$/, "");

      let processed = already;
      const newLines = lines.slice(already);
      for (let i = 0; i < newLines.length; i++) {
        const raw = newLines[i]!;
        let parsed: KiroLine;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // A parse failure on the final line means Kiro is still writing it
          // (the line is unterminated). Leave the watermark here so the next
          // tick retries it once the write is complete.
          // A parse failure on any earlier line is a corrupt record — skip it.
          const isLastLine = i === newLines.length - 1;
          if (!isLastLine) processed += 1;
          continue;
        }

        const timestamp = new Date().toISOString();
        const rows = entriesForLine(parsed, sessionId, timestamp).map(entry =>
          buildKiroQueueRow(entry, config),
        );
        if (rows.length === 0) {
          processed += 1;
          continue;
        }

        const { appended } = appendQueuedSessionRows(rows, KIRO_QUEUE_DIR);
        if (!appended) {
          const needed = rows.reduce((n, row) => n + queuedRowBytes(row), 0);
          if (needed > MAX_SESSION_QUEUE_BYTES) {
            recordLoss({ skippedTranscriptLine: path, sessionId, neededBytes: needed });
            processed += 1;
            continue;
          }
          queueFull = true;
          break;
        }

        appendedAny = true;
        ingested += rows.length;
        processed += 1;
      }
      state.processedLines[path] = processed;
    }

    if (appendedAny) saveState(state);

    if (queueFull) {
      log("kiro-ingest", "ingestion paused at the queue ceiling; no rows dropped");
    }

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
          queueDir: KIRO_QUEUE_DIR,
        });
      } catch (e: unknown) {
        log("kiro-ingest", `queue drain failed, rows stay queued: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    summarizeIdleSessions(config, state);
    saveState(state);

    if (ingested > 0) log("kiro-ingest", `ingested ${ingested} message(s) from Kiro transcripts`);
    return { ingested };
  } catch (e: unknown) {
    log("kiro-ingest", `error: ${e instanceof Error ? e.message : String(e)}`);
    return { ingested };
  } finally {
    release();
  }
}

/**
 * Start background ingestion: once on startup, then on an interval.
 * The timer is unref'd so it never keeps the MCP process alive on its own.
 */
export function startKiroIngestLoop(intervalMs = 30_000): void {
  void ingestKiroSessions();
  const timer = setInterval(() => {
    void ingestKiroSessions();
  }, intervalMs);
  timer.unref?.();
}
