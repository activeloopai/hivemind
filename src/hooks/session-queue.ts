import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import { log } from "../utils/debug.js";

export interface SessionQueueApi {
  query(sql: string): Promise<Record<string, unknown>[]>;
  ensureSessionsTable(name?: string): Promise<void>;
}

export interface QueuedSessionRow {
  id: string;
  path: string;
  filename: string;
  message: string;
  author: string;
  sizeBytes: number;
  project: string;
  description: string;
  agent: string;
  pluginVersion: string;
  creationDate: string;
  lastUpdateDate: string;
}

export interface FlushSessionQueueOptions {
  sessionId: string;
  sessionsTable: string;
  queueDir?: string;
  maxBatchRows?: number;
  allowStaleInflight?: boolean;
  staleInflightMs?: number;
  waitIfBusyMs?: number;
  drainAll?: boolean;
}

export interface FlushSessionQueueResult {
  status: "empty" | "busy" | "flushed" | "disabled";
  rows: number;
  batches: number;
}

export interface DrainSessionQueueOptions {
  sessionsTable: string;
  queueDir?: string;
  maxBatchRows?: number;
  staleInflightMs?: number;
}

export interface DrainSessionQueueResult {
  queuedSessions: number;
  flushedSessions: number;
  rows: number;
  batches: number;
}

const DEFAULT_QUEUE_DIR = join(homedir(), ".deeplake", "queue");
// Hard ceiling for a single session's queue file. The queue is a retry buffer
// for rows the backend has not accepted yet, so it only reaches this size when
// uploads have been failing for a very long time (offline host, disconnected
// network filesystem). Past the ceiling we stop appending instead of filling
// the user's disk: a customer running Cowork hit a single 39.9 GB queue file
// growing ~5 GB/day (2026-08-19). A file this large is also unflushable —
// readQueuedRows() reads it whole — so gcOversizedQueueFiles() drops it.
export const MAX_SESSION_QUEUE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_BATCH_ROWS = 50;
const DEFAULT_STALE_INFLIGHT_MS = 60_000;
const DEFAULT_AUTH_FAILURE_TTL_MS = 5 * 60_000;
const DEFAULT_DRAIN_LOCK_STALE_MS = 30_000;
const BUSY_WAIT_STEP_MS = 100;

interface SessionWriteDisabledState {
  disabledAt: string;
  reason: string;
  sessionsTable: string;
}

class SessionWriteDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionWriteDisabledError";
  }
}

export function buildSessionPath(config: { userName: string; orgName: string; workspaceId: string }, sessionId: string): string {
  return `/sessions/${config.userName}/${config.userName}_${config.orgName}_${config.workspaceId}_${sessionId}.jsonl`;
}

export function buildQueuedSessionRow(args: {
  sessionPath: string;
  line: string;
  userName: string;
  projectName: string;
  description: string;
  agent: string;
  pluginVersion?: string;
  timestamp: string;
}): QueuedSessionRow {
  return {
    id: crypto.randomUUID(),
    path: args.sessionPath,
    filename: args.sessionPath.split("/").pop() ?? "",
    message: args.line,
    author: args.userName,
    sizeBytes: Buffer.byteLength(args.line, "utf-8"),
    project: args.projectName,
    description: args.description,
    agent: args.agent,
    pluginVersion: args.pluginVersion ?? "",
    creationDate: args.timestamp,
    lastUpdateDate: args.timestamp,
  };
}

export interface AppendQueuedRowResult {
  queuePath: string;
  /** false when the row was dropped because the file sits at its ceiling. */
  appended: boolean;
}

export function appendQueuedSessionRow(
  row: QueuedSessionRow,
  queueDir = DEFAULT_QUEUE_DIR,
  maxQueueBytes = MAX_SESSION_QUEUE_BYTES,
): AppendQueuedRowResult {
  return appendQueuedSessionRows([row], queueDir, maxQueueBytes);
}

/**
 * Append a group of rows to one session's queue file, all-or-nothing.
 *
 * The caller uses the group to keep a transcript line atomic: either every row
 * for that line is queued, or none is and the caller can retry the whole line
 * later. Three things make that hold:
 *   - the size check and the write share ONE descriptor, so the size the check
 *     saw is the size the write extends (a stat-then-append on the path is
 *     CodeQL's js/file-system-race, and several Cowork MCP processes write
 *     these files);
 *   - writeSync is looped, because it is allowed to write fewer bytes than
 *     asked for;
 *   - a write that throws part-way is truncated back to where it started, so
 *     the queue never holds half a JSON line.
 *
 * Rollback is what makes this single-writer: truncating while another process
 * appends would destroy its rows, so the rollback is skipped unless the file is
 * exactly as this call left it. The Cowork ingest — the only caller — holds an
 * exclusive lock (~/.deeplake/.cowork-ingest.lock) for the whole tick, so two
 * appenders do not overlap in practice. A malformed tail that survives anyway
 * (failed rollback, a crash mid-write, an older build) is skipped by
 * readQueuedRows rather than wedging the drain forever.
 */
export function appendQueuedSessionRows(
  rows: QueuedSessionRow[],
  queueDir = DEFAULT_QUEUE_DIR,
  maxQueueBytes = MAX_SESSION_QUEUE_BYTES,
): AppendQueuedRowResult {
  if (rows.length === 0) throw new Error("appendQueuedSessionRows: rows must not be empty");
  mkdirSync(queueDir, { recursive: true });
  const queuePath = getQueuePath(queueDir, extractSessionId(rows[0].path));
  const rowsPayload = Buffer.from(rows.map(row => `${JSON.stringify(row)}\n`).join(""), "utf-8");

  // "a+" (not "a"): appends, but is also readable, so endsWithNewline() below
  // can inspect the last byte. With "a" the descriptor is write-only and that
  // read fails with EBADF.
  const fd = openSync(queuePath, "a+");
  try {
    const startedAt = fstatSync(fd).size;
    // If the file does not end in a newline, a previous append died half-way.
    // Start on a fresh line so THESE rows stay parseable — otherwise they are
    // glued onto the broken fragment and skipped with it at read time.
    const payload = endsWithNewline(fd, startedAt)
      ? rowsPayload
      : Buffer.concat([Buffer.from("\n", "utf-8"), rowsPayload]);
    if (startedAt + payload.length > maxQueueBytes) {
      log("session-queue", `queue file at the ${maxQueueBytes}-byte ceiling, refusing ${rows.length} row(s): ${queuePath}`);
      return { queuePath, appended: false };
    }
    let written = 0;
    try {
      while (written < payload.length) {
        written += writeSync(fd, payload, written, payload.length - written);
      }
    } catch (e: unknown) {
      // A throwing writeSync does not report how much it wrote, so bound the
      // rollback by what this call could possibly have written: if the file has
      // grown past startedAt + payload.length, another writer appended in the
      // meantime and truncating would destroy its rows. Leave it alone then —
      // readQueuedRows skips the malformed tail instead of wedging the drain.
      try {
        if (fstatSync(fd).size <= startedAt + payload.length) ftruncateSync(fd, startedAt);
      } catch {
        /* rollback failed — the malformed line is skipped at read time */
      }
      log("session-queue", `append failed after ${written}/${payload.length} bytes: ${e instanceof Error ? e.message : String(e)}`);
      return { queuePath, appended: false };
    }
  } finally {
    closeSync(fd);
  }
  return { queuePath, appended: true };
}

/**
 * Delete queue/inflight files that have grown past the ceiling. Such a file
 * cannot be flushed anyway (readQueuedRows reads it into a single string) and
 * would otherwise sit on disk forever — it is the residue of an upload outage,
 * not data the backend is still waiting for. Returns the bytes reclaimed.
 */
export function gcOversizedQueueFiles(
  queueDir = DEFAULT_QUEUE_DIR,
  maxQueueBytes = MAX_SESSION_QUEUE_BYTES,
  onDropped?: (path: string, sizeBytes: number) => void,
): number {
  let reclaimed = 0;
  let names: string[];
  try {
    names = readdirSync(queueDir);
  } catch {
    return 0;
  }
  for (const name of names) {
    // Skip queue metadata (drain lock, disabled marker, any journal a caller
    // parks here): it is bookkeeping, never rows the backend is owed.
    if (name.startsWith(".")) continue;
    if (!name.endsWith(".jsonl") && !name.endsWith(".inflight")) continue;
    const path = join(queueDir, name);
    const size = fileSize(path);
    // Strictly ABOVE the ceiling. appendQueuedSessionRow never lets a file
    // exceed it, so anything caught here is residue from a build that predates
    // the ceiling — not rows the backend is still waiting for. A file sitting
    // exactly at the ceiling is legitimate and is left alone to be flushed.
    if (size <= maxQueueBytes) continue;
    try {
      rmSync(path, { force: true });
      reclaimed += size;
      log("session-queue", `dropped oversized queue file (${size} bytes): ${path}`);
      // The rows in it were never acknowledged by the backend. Hand the caller
      // the loss so it can be recorded somewhere durable rather than only in a
      // debug log nobody has enabled.
      onDropped?.(path, size);
    } catch {
      /* best effort */
    }
  }
  return reclaimed;
}

/** Bytes one row occupies in a queue file, newline included. */
export function queuedRowBytes(row: QueuedSessionRow): number {
  return Buffer.byteLength(`${JSON.stringify(row)}\n`, "utf-8");
}

/**
 * Bytes still available in a session's queue file before it hits the ceiling.
 * Lets a caller check that a whole group of rows fits BEFORE appending any of
 * them, so it never leaves half a transcript line queued.
 */
export function sessionQueueRoomBytes(
  sessionId: string,
  queueDir = DEFAULT_QUEUE_DIR,
  maxQueueBytes = MAX_SESSION_QUEUE_BYTES,
): number {
  return Math.max(0, maxQueueBytes - fileSize(getQueuePath(queueDir, sessionId)));
}

/** True when the file is empty or its last byte is a newline. */
function endsWithNewline(fd: number, size: number): boolean {
  if (size === 0) return true;
  try {
    const tail = Buffer.alloc(1);
    readSync(fd, tail, 0, 1, size - 1);
    return tail[0] === 0x0a;
  } catch {
    return true; // cannot tell — do not inject a stray newline
  }
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function buildSessionInsertSql(sessionsTable: string, rows: QueuedSessionRow[]): string {
  if (rows.length === 0) throw new Error("buildSessionInsertSql: rows must not be empty");
  const table = sqlIdent(sessionsTable);
  const values = rows.map((row) => {
    // Escape ONLY single quotes for the SQL literal. The payload is already
    // valid JSON and Postgres (standard_conforming_strings) treats backslashes
    // literally, so sqlStr()'s backslash-doubling and control-char stripping
    // would corrupt the JSON and the jsonb cast would 400. Mirrors the
    // capture.ts direct-INSERT path.
    const jsonForSql = coerceJsonbPayload(row.message).replace(/'/g, "''");
    return (
      `('${sqlStr(row.id)}', '${sqlStr(row.path)}', '${sqlStr(row.filename)}', '${jsonForSql}'::jsonb, ` +
      `'${sqlStr(row.author)}', ${row.sizeBytes}, '${sqlStr(row.project)}', '${sqlStr(row.description)}', ` +
      `'${sqlStr(row.agent)}', '${sqlStr(row.pluginVersion ?? "")}', '${sqlStr(row.creationDate)}', '${sqlStr(row.lastUpdateDate)}')`
    );
  }).join(", ");

  // Idempotent batch insert: skip any row whose id already exists, so a flush
  // that re-sends the batch after a transient 5xx (the insert committed but the
  // gateway returned 502/503) cannot duplicate rows. The sessions table has no
  // UNIQUE constraint on id, so this anti-join is the multi-row equivalent of
  // buildDirectSessionInsertSql's `WHERE NOT EXISTS` guard on the single-row
  // capture path. Verified lag-safe against the real backend.
  return (
    `INSERT INTO "${table}" (id, path, filename, message, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `SELECT v.id, v.path, v.filename, v.message, v.author, v.size_bytes, v.project, v.description, v.agent, v.plugin_version, v.creation_date, v.last_update_date ` +
    `FROM (VALUES ${values}) AS v(id, path, filename, message, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `WHERE NOT EXISTS (SELECT 1 FROM "${table}" AS t WHERE t.id = v.id)`
  );
}

function coerceJsonbPayload(message: string): string {
  try {
    return JSON.stringify(JSON.parse(message));
  } catch {
    return JSON.stringify({
      type: "raw_message",
      content: message,
    });
  }
}

export async function flushSessionQueue(api: SessionQueueApi, opts: FlushSessionQueueOptions): Promise<FlushSessionQueueResult> {
  const queueDir = opts.queueDir ?? DEFAULT_QUEUE_DIR;
  const maxBatchRows = opts.maxBatchRows ?? DEFAULT_MAX_BATCH_ROWS;
  const staleInflightMs = opts.staleInflightMs ?? DEFAULT_STALE_INFLIGHT_MS;
  const waitIfBusyMs = opts.waitIfBusyMs ?? 0;
  const drainAll = opts.drainAll ?? false;

  mkdirSync(queueDir, { recursive: true });

  const queuePath = getQueuePath(queueDir, opts.sessionId);
  const inflightPath = getInflightPath(queueDir, opts.sessionId);
  if (isSessionWriteDisabled(opts.sessionsTable, queueDir)) {
    return existsSync(queuePath) || existsSync(inflightPath)
      ? { status: "disabled", rows: 0, batches: 0 }
      : { status: "empty", rows: 0, batches: 0 };
  }
  let totalRows = 0;
  let totalBatches = 0;
  let flushedAny = false;

  while (true) {
    if (opts.allowStaleInflight) recoverStaleInflight(queuePath, inflightPath, staleInflightMs);

    if (existsSync(inflightPath)) {
      if (waitIfBusyMs > 0) {
        await waitForInflightToClear(inflightPath, waitIfBusyMs);
        if (opts.allowStaleInflight) recoverStaleInflight(queuePath, inflightPath, staleInflightMs);
      }
      if (existsSync(inflightPath)) {
        return flushedAny
          ? { status: "flushed", rows: totalRows, batches: totalBatches }
          : { status: "busy", rows: 0, batches: 0 };
      }
    }

    if (!existsSync(queuePath)) {
      return flushedAny
        ? { status: "flushed", rows: totalRows, batches: totalBatches }
        : { status: "empty", rows: 0, batches: 0 };
    }

    try {
      renameSync(queuePath, inflightPath);
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        return flushedAny
          ? { status: "flushed", rows: totalRows, batches: totalBatches }
          : { status: "empty", rows: 0, batches: 0 };
      }
      throw e;
    }

    try {
      const { rows, batches } = await flushInflightFile(api, opts.sessionsTable, inflightPath, maxBatchRows);
      totalRows += rows;
      totalBatches += batches;
      flushedAny = flushedAny || rows > 0;
    } catch (e) {
      requeueInflight(queuePath, inflightPath);
      if (e instanceof SessionWriteDisabledError) {
        return { status: "disabled", rows: totalRows, batches: totalBatches };
      }
      throw e;
    }

    if (!drainAll) {
      return { status: "flushed", rows: totalRows, batches: totalBatches };
    }
  }
}

export async function drainSessionQueues(api: SessionQueueApi, opts: DrainSessionQueueOptions): Promise<DrainSessionQueueResult> {
  const queueDir = opts.queueDir ?? DEFAULT_QUEUE_DIR;
  mkdirSync(queueDir, { recursive: true });

  const sessionIds = listQueuedSessionIds(queueDir, opts.staleInflightMs ?? DEFAULT_STALE_INFLIGHT_MS);
  let flushedSessions = 0;
  let rows = 0;
  let batches = 0;

  for (const sessionId of sessionIds) {
    const result = await flushSessionQueue(api, {
      sessionId,
      sessionsTable: opts.sessionsTable,
      queueDir,
      maxBatchRows: opts.maxBatchRows,
      allowStaleInflight: true,
      staleInflightMs: opts.staleInflightMs,
      drainAll: true,
    });
    if (result.status === "flushed") {
      flushedSessions += 1;
      rows += result.rows;
      batches += result.batches;
    }
  }

  return {
    queuedSessions: sessionIds.length,
    flushedSessions,
    rows,
    batches,
  };
}

export function tryAcquireSessionDrainLock(
  sessionsTable: string,
  queueDir = DEFAULT_QUEUE_DIR,
  staleMs = DEFAULT_DRAIN_LOCK_STALE_MS,
): (() => void) | null {
  mkdirSync(queueDir, { recursive: true });
  const lockPath = getSessionDrainLockPath(queueDir, sessionsTable);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, "wx");
      closeSync(fd);
      return () => rmSync(lockPath, { force: true });
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
      if (existsSync(lockPath) && isStale(lockPath, staleMs)) {
        rmSync(lockPath, { force: true });
        continue;
      }
      return null;
    }
  }

  return null;
}

function getQueuePath(queueDir: string, sessionId: string): string {
  return join(queueDir, `${sessionId}.jsonl`);
}

function getInflightPath(queueDir: string, sessionId: string): string {
  return join(queueDir, `${sessionId}.inflight`);
}

function extractSessionId(sessionPath: string): string {
  const filename = sessionPath.split("/").pop() ?? "";
  return filename.replace(/\.jsonl$/, "").split("_").pop() ?? filename;
}

async function flushInflightFile(
  api: SessionQueueApi,
  sessionsTable: string,
  inflightPath: string,
  maxBatchRows: number,
): Promise<{ rows: number; batches: number }> {
  const rows = readQueuedRows(inflightPath);
  if (rows.length === 0) {
    rmSync(inflightPath, { force: true });
    return { rows: 0, batches: 0 };
  }

  let ensured = false;
  let batches = 0;
  const queueDir = dirname(inflightPath);
  for (let i = 0; i < rows.length; i += maxBatchRows) {
    const chunk = rows.slice(i, i + maxBatchRows);
    const sql = buildSessionInsertSql(sessionsTable, chunk);
    try {
      await api.query(sql);
    } catch (e: any) {
      if (isSessionWriteAuthError(e)) {
        markSessionWriteDisabled(sessionsTable, errorMessage(e), queueDir);
        throw new SessionWriteDisabledError(errorMessage(e));
      }
      if (!ensured && isEnsureSessionsTableRetryable(e)) {
        try {
          await api.ensureSessionsTable(sessionsTable);
        } catch (ensureError: unknown) {
          if (isSessionWriteAuthError(ensureError)) {
            markSessionWriteDisabled(sessionsTable, errorMessage(ensureError), queueDir);
            throw new SessionWriteDisabledError(errorMessage(ensureError));
          }
          throw ensureError;
        }
        ensured = true;
        try {
          await api.query(sql);
        } catch (retryError: unknown) {
          if (isSessionWriteAuthError(retryError)) {
            markSessionWriteDisabled(sessionsTable, errorMessage(retryError), queueDir);
            throw new SessionWriteDisabledError(errorMessage(retryError));
          }
          throw retryError;
        }
      } else {
        throw e;
      }
    }
    batches += 1;
  }

  clearSessionWriteDisabled(sessionsTable, queueDir);
  rmSync(inflightPath, { force: true });
  return { rows: rows.length, batches };
}

function readQueuedRows(path: string): QueuedSessionRow[] {
  const raw = readFileSync(path, "utf-8");
  const rows: QueuedSessionRow[] = [];
  let malformed = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as QueuedSessionRow);
    } catch {
      // A half-written record — a crash mid-append, a rollback that could not
      // run. Skipping it costs one message; throwing would fail this flush and
      // every flush after it, stranding the whole queue permanently.
      malformed += 1;
    }
  }
  if (malformed > 0) log("session-queue", `skipped ${malformed} malformed row(s) in ${path}`);
  return rows;
}

function requeueInflight(queuePath: string, inflightPath: string): void {
  if (!existsSync(inflightPath)) return;
  const inflight = readFileSync(inflightPath, "utf-8");
  appendFileSync(queuePath, inflight);
  rmSync(inflightPath, { force: true });
}

function recoverStaleInflight(queuePath: string, inflightPath: string, staleInflightMs: number): void {
  if (!existsSync(inflightPath) || !isStale(inflightPath, staleInflightMs)) return;
  requeueInflight(queuePath, inflightPath);
}

function isStale(path: string, staleInflightMs: number): boolean {
  return Date.now() - statSync(path).mtimeMs >= staleInflightMs;
}

function listQueuedSessionIds(queueDir: string, staleInflightMs: number): string[] {
  const sessionIds = new Set<string>();
  for (const name of readdirSync(queueDir)) {
    if (name.endsWith(".jsonl")) {
      sessionIds.add(name.slice(0, -".jsonl".length));
    } else if (name.endsWith(".inflight")) {
      const path = join(queueDir, name);
      if (isStale(path, staleInflightMs)) {
        sessionIds.add(name.slice(0, -".inflight".length));
      }
    }
  }
  return [...sessionIds].sort();
}

function isEnsureSessionsTableRetryable(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("does not exist") ||
    message.includes("doesn't exist") ||
    message.includes("relation") ||
    message.includes("not found");
}

export function isSessionWriteAuthError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("403") ||
    message.includes("401") ||
    message.includes("forbidden") ||
    message.includes("unauthorized");
}

export function markSessionWriteDisabled(
  sessionsTable: string,
  reason: string,
  queueDir = DEFAULT_QUEUE_DIR,
): void {
  mkdirSync(queueDir, { recursive: true });
  writeFileSync(
    getSessionWriteDisabledPath(queueDir, sessionsTable),
    JSON.stringify({
      disabledAt: new Date().toISOString(),
      reason,
      sessionsTable,
    } satisfies SessionWriteDisabledState),
  );
}

export function clearSessionWriteDisabled(
  sessionsTable: string,
  queueDir = DEFAULT_QUEUE_DIR,
): void {
  rmSync(getSessionWriteDisabledPath(queueDir, sessionsTable), { force: true });
}

export function isSessionWriteDisabled(
  sessionsTable: string,
  queueDir = DEFAULT_QUEUE_DIR,
  ttlMs = DEFAULT_AUTH_FAILURE_TTL_MS,
): boolean {
  const path = getSessionWriteDisabledPath(queueDir, sessionsTable);
  if (!existsSync(path)) return false;
  try {
    const raw = readFileSync(path, "utf-8");
    const state = JSON.parse(raw) as SessionWriteDisabledState;
    const ageMs = Date.now() - new Date(state.disabledAt).getTime();
    if (Number.isNaN(ageMs) || ageMs >= ttlMs) {
      rmSync(path, { force: true });
      return false;
    }
    return true;
  } catch {
    rmSync(path, { force: true });
    return false;
  }
}

function getSessionWriteDisabledPath(queueDir: string, sessionsTable: string): string {
  return join(queueDir, `.${sessionsTable}.disabled.json`);
}

function getSessionDrainLockPath(queueDir: string, sessionsTable: string): string {
  return join(queueDir, `.${sessionsTable}.drain.lock`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForInflightToClear(inflightPath: string, waitIfBusyMs: number): Promise<void> {
  const startedAt = Date.now();
  while (existsSync(inflightPath) && (Date.now() - startedAt) < waitIfBusyMs) {
    await sleep(BUSY_WAIT_STEP_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
