/**
 * Shared accessor for the memory-backfill staging manifest at
 * ~/.claude/hivemind/pending-memory.json.
 *
 * Why this exists: memory ingestion is split at the upload boundary so the
 * expensive, auth-free work happens at `hivemind install` and the cheap,
 * auth-bound work happens after sign-in.
 *
 *   - EXTRACT (no auth, runs at install in the background): replay the
 *     user's last 4-6 weeks of local agent sessions through the same
 *     wiki-prompt the live SessionEnd path uses, write each summary to
 *     ~/.claude/hivemind/pending-memory/<session_id>.md, compute the
 *     embedding LOCALLY via the embed daemon, and append one row here
 *     with `uploaded: false`.
 *   - FLUSH (needs auth, runs after `hivemind login`/org-select in the
 *     background): read every `uploaded: false` row, INSERT the staged
 *     summary + vector into the chosen org's `memory` table, flip the
 *     row to `uploaded: true`.
 *
 * This mirrors the skills path exactly: `mine-local` writes skills with
 * `uploaded: false` to local-mined.json, and a later `push-local` uploads
 * them after sign-in. Memory is the same shape, one table over.
 *
 * The manifest does triple duty (same as local-manifest.ts):
 *   1. One-shot sentinel — the backfill orchestrator refuses to re-run an
 *      already-staged session (dedup by session_id) and the install-time
 *      trigger refuses to re-fire when the file exists (unless --force).
 *   2. Provenance + flush queue — records the staged summary path, local
 *      embedding state, source session, and `uploaded` flag so the
 *      post-login flush uploads exactly the right rows, once.
 *   3. Read-only hint surface — SessionStart hooks can surface the count
 *      of pending (un-uploaded) summaries: "N past sessions staged. Sign
 *      in to push them into your team's memory."
 *
 * Kept separate from the backfill orchestrator so the SessionStart hooks
 * and the login-time flush can read/write it without dragging the
 * orchestrator's transitive deps (wiki-worker spawn, embed client,
 * local-source enumeration) into a hook bundle.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface PendingMemoryEntry {
  /** Native session id (also the staged summary filename stem). */
  session_id: string;
  /** Source agent the session came from: claude_code | codex | cursor | hermes. */
  source_agent: string;
  /** Project/repo name derived from the session cwd, for org/project scoping at flush. */
  project: string;
  /** Absolute path to the source session JSONL on disk. */
  source_session_path: string;
  /** Absolute path to the staged summary markdown written by the extract phase. */
  summary_path: string;
  /**
   * True once a local embedding vector has been computed and stored
   * alongside the summary (see embedding_path). When false, the flush
   * phase must compute the embedding itself before INSERT — but because
   * the embed daemon is local and auth-free, extract normally fills this
   * in so flush stays a pure upload.
   */
  embedded: boolean;
  /** Absolute path to the staged embedding (JSON array of floats), when embedded. */
  embedding_path?: string;
  /** ISO 8601 UTC — when the extract phase wrote this row. */
  extracted_at: string;
  /** False until the post-login flush uploads this summary to the org `memory` table. */
  uploaded: boolean;
  /** ISO 8601 UTC — when the flush uploaded the row. Absent until uploaded. */
  uploaded_at?: string;
  /** Org the row was flushed to, recorded at upload time for auditing/idempotency. */
  uploaded_org?: string;
}

export interface PendingMemoryManifest {
  created_at: string;
  entries: PendingMemoryEntry[];
}

const HIVEMIND_DIR = join(homedir(), ".claude", "hivemind");

/** Directory holding the staged summary + embedding files. */
export const PENDING_MEMORY_DIR = join(HIVEMIND_DIR, "pending-memory");

/** The staging manifest / flush queue. */
export const PENDING_MEMORY_MANIFEST_PATH = join(HIVEMIND_DIR, "pending-memory.json");

/**
 * Sibling lock used by the install-time background extract trigger so a
 * crashed run leaves a recoverable sentinel rather than wedging forever.
 * Mirrors LOCAL_MINE_LOCK_PATH.
 */
export const PENDING_MEMORY_LOCK_PATH = join(HIVEMIND_DIR, "pending-memory.lock");

/**
 * Read the manifest. Returns null when the file doesn't exist or is
 * malformed. `path` is injectable so tests can point at a tmpdir.
 */
export function readPendingMemoryManifest(
  path: string = PENDING_MEMORY_MANIFEST_PATH,
): PendingMemoryManifest | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PendingMemoryManifest;
  } catch {
    return null;
  }
}

/**
 * Write the manifest atomically (temp file + rename) so a crash mid-write
 * can never leave a torn/truncated manifest — a reader either sees the old
 * file or the complete new one.
 *
 * Concurrency note: the upsert/markUploaded read-modify-write helpers are
 * synchronous and the EXTRACT phase runs in a single process (the spawn
 * worker holds an exclusive lock against a second backfill process), so
 * concurrent backfill workers can't interleave a read-modify-write and lose
 * each other's rows. The atomic rename guards against crash-torn files, not
 * against multi-process lost updates (which the spawn lock already prevents).
 */
export function writePendingMemoryManifest(
  m: PendingMemoryManifest,
  path: string = PENDING_MEMORY_MANIFEST_PATH,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(m, null, 2));
  renameSync(tmp, path);
}

/**
 * Set of session ids already staged. Lets the extract orchestrator dedup
 * against prior runs (and against sessions the live capture path already
 * ingested, when that set is unioned in) without re-reading entries.
 */
export function stagedSessionIds(
  path: string = PENDING_MEMORY_MANIFEST_PATH,
): Set<string> {
  const m = readPendingMemoryManifest(path);
  const ids = new Set<string>();
  if (Array.isArray(m?.entries)) {
    for (const e of m!.entries) {
      if (e && typeof e.session_id === "string") ids.add(e.session_id);
    }
  }
  return ids;
}

/**
 * Count of rows not yet uploaded — the flush queue depth. Powers the
 * "N past sessions staged, sign in to push" SessionStart hint. Returns 0
 * for a missing/malformed manifest.
 */
export function countPendingUploads(
  path: string = PENDING_MEMORY_MANIFEST_PATH,
): number {
  const m = readPendingMemoryManifest(path);
  if (!Array.isArray(m?.entries)) return 0;
  return m!.entries.filter((e) => e && e.uploaded === false).length;
}

/**
 * Append a freshly-extracted row, or replace an existing row for the same
 * session_id (re-extract overwrites). Creates the manifest on first call.
 * `now` is injectable so callers can stamp a deterministic timestamp
 * (scripts/hooks can't use Date.now in some harnesses).
 */
export function upsertPendingMemoryEntry(
  entry: PendingMemoryEntry,
  now: string,
  path: string = PENDING_MEMORY_MANIFEST_PATH,
): void {
  const existing = readPendingMemoryManifest(path) ?? { created_at: now, entries: [] };
  const entries = Array.isArray(existing.entries) ? existing.entries : [];
  const next = entries.filter((e) => e && e.session_id !== entry.session_id);
  next.push(entry);
  writePendingMemoryManifest({ created_at: existing.created_at ?? now, entries: next }, path);
}

/**
 * Mark a staged row uploaded. No-op (returns false) if the session id
 * isn't present. Idempotent: re-marking an already-uploaded row is a
 * harmless rewrite.
 */
export function markUploaded(
  sessionId: string,
  org: string,
  now: string,
  path: string = PENDING_MEMORY_MANIFEST_PATH,
): boolean {
  const m = readPendingMemoryManifest(path);
  if (!m || !Array.isArray(m.entries)) return false;
  let found = false;
  for (const e of m.entries) {
    if (e && e.session_id === sessionId) {
      e.uploaded = true;
      e.uploaded_at = now;
      e.uploaded_org = org;
      found = true;
    }
  }
  if (found) writePendingMemoryManifest(m, path);
  return found;
}
