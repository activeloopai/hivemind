/**
 * On-disk cache of teammates' summaries for local proactive recall.
 *
 * Layout (one directory per org / workspace / memory table, so switching any
 * of them never mixes data):
 *
 *   ~/.deeplake/recall-cache/<orgId>/<workspaceId>/<table>/
 *     store.json  — sync cursor + condensed summary rows (the source of truth)
 *     index.json  — BM25 index built from store.json (what the hooks read)
 *     sync.lock   — held by the one sync worker running for this cache
 *
 * Files are written atomically (tmp + rename) with 0600 permissions: they hold
 * teammates' session summaries, which every org member can already read via
 * the memory mount, but they now also live on local disk.
 */

import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, openSync, closeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RecallDoc, RecallIndex } from "./lexical-index.js";
import { INDEX_VERSION } from "./lexical-index.js";

export const STORE_VERSION = 1;

export interface SyncCursor {
  date: string;
  path: string;
}

export interface RecallStore {
  v: number;
  userName: string;
  cursor: SyncCursor;
  lastSyncAt: string;
  lastReconcileAt: string;
  docs: Record<string, RecallDoc>;
}

export interface CacheKey {
  orgId: string;
  workspaceId: string;
  table: string;
}

/** Root of all recall caches (overridable for tests). */
export function recallCacheRoot(): string {
  return process.env.HIVEMIND_RECALL_CACHE_DIR || join(homedir(), ".deeplake", "recall-cache");
}

const safeSeg = (s: string) => (s || "_").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+$/, "_");

export function cacheDir(key: CacheKey, root: string = recallCacheRoot()): string {
  return join(root, safeSeg(key.orgId), safeSeg(key.workspaceId), safeSeg(key.table));
}

export function emptyStore(userName: string): RecallStore {
  return {
    v: STORE_VERSION,
    userName,
    cursor: { date: "", path: "" },
    lastSyncAt: "",
    lastReconcileAt: "",
    docs: {},
  };
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, path);
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Load the store, or a fresh one when absent / another version / another user. */
export function loadStore(dir: string, userName: string): RecallStore {
  const s = readJson<RecallStore>(join(dir, "store.json"));
  if (!s || s.v !== STORE_VERSION || s.userName !== userName || typeof s.docs !== "object") {
    return emptyStore(userName);
  }
  return s;
}

export function saveStore(dir: string, store: RecallStore): void {
  ensureDir(dir);
  writeJsonAtomic(join(dir, "store.json"), store);
}

export function loadIndex(dir: string): RecallIndex | null {
  const idx = readJson<RecallIndex>(join(dir, "index.json"));
  return idx && idx.v === INDEX_VERSION && Array.isArray(idx.docs) ? idx : null;
}

export function saveIndex(dir: string, index: RecallIndex): void {
  ensureDir(dir);
  writeJsonAtomic(join(dir, "index.json"), index);
}

export function indexSizeBytes(dir: string): number {
  try { return statSync(join(dir, "index.json")).size; } catch { return 0; }
}

/** Remove every cached file for this key (e.g. `hivemind recall clear`). */
export function clearCache(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** A lock older than this is treated as left behind by a crashed worker. */
const LOCK_STALE_MS = 10 * 60_000;

/**
 * Take the per-cache sync lock. Returns a release function, or null when
 * another live worker holds it. Never throws.
 */
export function acquireSyncLock(dir: string, now: number = Date.now()): (() => void) | null {
  try {
    ensureDir(dir);
    const lock = join(dir, "sync.lock");
    if (existsSync(lock)) {
      const age = now - statSync(lock).mtimeMs;
      if (age < LOCK_STALE_MS) return null;
      rmSync(lock, { force: true });
    }
    const fd = openSync(lock, "wx", 0o600);
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    return () => { try { rmSync(lock, { force: true }); } catch { /* best-effort */ } };
  } catch {
    return null;
  }
}

// ── Summary condensing ──────────────────────────────────────────────────────

/**
 * Sections of a wiki summary that carry recall signal, in priority order.
 * "Errors & Fixes" only exists in summaries written by newer plugin versions;
 * older rows simply don't have it and fall back to the others.
 */
export const RECALL_SECTIONS = [
  "Errors & Fixes",
  "Key Facts",
  "Decisions & Reasoning",
  "Entities",
  "Open Questions / TODO",
];

const BODY_MAX_CHARS = 3_000;

function sectionBody(summary: string, heading: string): string {
  const safe = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = summary.match(new RegExp(`##\\s*${safe}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i"));
  const body = m ? m[1].trim() : "";
  return body.toLowerCase() === "none" ? "" : body;
}

/**
 * Keep only the recall sections of a summary (as markdown, headings kept so
 * the excerpt picker can still find them), capped at BODY_MAX_CHARS. Rows that
 * don't follow the wiki template are kept as their leading text.
 */
export function condenseSummary(summary: string): string {
  const text = summary || "";
  const parts: string[] = [];
  for (const h of RECALL_SECTIONS) {
    const body = sectionBody(text, h);
    if (body) parts.push(`## ${h}\n${body}`);
  }
  const out = parts.length ? parts.join("\n\n") : text;
  return out.slice(0, BODY_MAX_CHARS);
}
