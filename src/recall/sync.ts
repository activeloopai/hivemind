/**
 * Incremental sync of teammates' summaries from the EXISTING `memory` table
 * into the local recall cache.
 *
 * Backend contract — read-only, no schema change:
 *   - Only existing text columns are read (path, author, project, description,
 *     summary, last_update_date). `summary_embedding` is never touched, so rows
 *     without embeddings sync like any other.
 *   - Keyset pagination on (last_update_date, path): after the first full
 *     pull, a sync only returns rows changed since the stored cursor, which
 *     is usually zero or a handful.
 *   - Throttled (default: at most once per 15 minutes per cache) and
 *     single-flighted by a lock file, so many open sessions don't multiply
 *     the load.
 *   - The current user's own summaries are filtered server-side: proactive
 *     recall only ever surfaces teammates' work.
 *   - Deletions are reconciled at most weekly with a path-only query.
 */

import type { RecallDoc } from "./lexical-index.js";
import { buildIndex } from "./lexical-index.js";
import {
  acquireSyncLock, cacheDir, condenseSummary, emptyStore, loadIndex, loadStore, saveIndex, saveStore,
  type CacheKey, type RecallStore,
} from "./cache.js";
import { sqlStr, sqlIdent } from "../utils/sql.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export interface SyncOptions extends CacheKey {
  query: QueryFn;
  userName: string;
  /** Ignore the throttle. */
  force?: boolean;
  /** Drop the local store and pull everything again. */
  full?: boolean;
  now?: number;
  root?: string;
  pageSize?: number;
  maxPages?: number;
  maxDocs?: number;
  intervalMs?: number;
}

export interface SyncResult {
  status: "synced" | "fresh" | "locked" | "error";
  fetched: number;
  removed: number;
  total: number;
  pages: number;
  ms: number;
  error?: string;
}

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 200;
const DEFAULT_MAX_DOCS = 20_000;
const RECONCILE_EVERY_MS = 7 * 86_400_000;

function envMinutes(raw: string | undefined, fallbackMin: number): number {
  const n = Number(raw);
  return (Number.isFinite(n) && n >= 0 ? n : fallbackMin) * 60_000;
}

export const DEFAULT_SYNC_INTERVAL_MS = envMinutes(process.env.HIVEMIND_RECALL_SYNC_INTERVAL_MIN, 15);

const SELECT = "path, author, project, description, summary, last_update_date";

export function buildPageSql(table: string, userName: string, cursor: { date: string; path: string }, limit: number): string {
  const d = sqlStr(cursor.date);
  const p = sqlStr(cursor.path);
  return (
    `SELECT ${SELECT} FROM "${sqlIdent(table)}" ` +
    `WHERE path LIKE '/summaries/%' AND author <> '${sqlStr(userName)}' ` +
    `AND (last_update_date > '${d}' OR (last_update_date = '${d}' AND path > '${p}')) ` +
    `ORDER BY last_update_date ASC, path ASC LIMIT ${limit}`
  );
}

export function buildReconcileSql(table: string, userName: string): string {
  return (
    `SELECT path FROM "${sqlIdent(table)}" ` +
    `WHERE path LIKE '/summaries/%' AND author <> '${sqlStr(userName)}'`
  );
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function rowToDoc(r: Record<string, unknown>): RecallDoc {
  return {
    path: str(r.path),
    author: str(r.author),
    project: str(r.project),
    description: str(r.description).slice(0, 600),
    body: condenseSummary(str(r.summary)),
    lastUpdate: str(r.last_update_date),
  };
}

/** Keep the `max` most recently updated docs. */
function capDocs(store: RecallStore, max: number): void {
  const paths = Object.keys(store.docs);
  if (paths.length <= max) return;
  paths
    .sort((a, b) => store.docs[b].lastUpdate.localeCompare(store.docs[a].lastUpdate))
    .slice(max)
    .forEach((p) => delete store.docs[p]);
}

export async function syncRecallCache(opts: SyncOptions): Promise<SyncResult> {
  const started = Date.now();
  const now = opts.now ?? started;
  const dir = cacheDir(opts, opts.root);
  const res = (status: SyncResult["status"], extra: Partial<SyncResult> = {}): SyncResult => ({
    status, fetched: 0, removed: 0, total: 0, pages: 0, ms: Date.now() - started, ...extra,
  });

  const release = acquireSyncLock(dir, now);
  if (!release) return res("locked");
  try {
    const store = opts.full ? emptyStore(opts.userName) : loadStore(dir, opts.userName);
    const isFirst = !store.lastSyncAt;

    const interval = opts.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    const last = Date.parse(store.lastSyncAt);
    if (!opts.force && !opts.full && !Number.isNaN(last) && now - last < interval) {
      // Throttled for the backend, but an index from an older INDEX_VERSION
      // can be rebuilt from the local store with no query at all.
      if (!loadIndex(dir)) saveIndex(dir, buildIndex(Object.values(store.docs), new Date(now)));
      return res("fresh", { total: Object.keys(store.docs).length });
    }

    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    let fetched = 0;
    let pages = 0;
    let error: string | undefined;
    try {
      while (pages < maxPages) {
        const rows = await opts.query(buildPageSql(opts.table, opts.userName, store.cursor, pageSize));
        pages++;
        for (const r of rows) {
          const doc = rowToDoc(r);
          if (!doc.path) continue;
          store.docs[doc.path] = doc;
          store.cursor = { date: doc.lastUpdate, path: doc.path };
          fetched++;
        }
        if (rows.length < pageSize) break;
      }
    } catch (e) {
      // Keep what we got: the cursor already points past the saved rows, so
      // the next sync resumes instead of starting over.
      error = e instanceof Error ? e.message : String(e);
    }

    let removed = 0;
    const lastRec = Date.parse(store.lastReconcileAt);
    if (!error && !isFirst && (Number.isNaN(lastRec) || now - lastRec >= RECONCILE_EVERY_MS)) {
      try {
        const live = new Set((await opts.query(buildReconcileSql(opts.table, opts.userName))).map((r) => str(r.path)));
        for (const p of Object.keys(store.docs)) {
          if (!live.has(p)) { delete store.docs[p]; removed++; }
        }
        store.lastReconcileAt = new Date(now).toISOString();
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    if (isFirst && !error) store.lastReconcileAt = new Date(now).toISOString();

    capDocs(store, opts.maxDocs ?? DEFAULT_MAX_DOCS);
    if (!error) store.lastSyncAt = new Date(now).toISOString();
    saveStore(dir, store);
    // Also rebuild when the on-disk index is missing or from an older
    // INDEX_VERSION (tokenizer change): otherwise an upgrade would leave
    // recall with no usable index until a teammate's summary changes.
    if (fetched || removed || isFirst || !loadIndex(dir)) saveIndex(dir, buildIndex(Object.values(store.docs), new Date(now)));

    const total = Object.keys(store.docs).length;
    return error
      ? res("error", { fetched, removed, total, pages, error })
      : res("synced", { fetched, removed, total, pages });
  } finally {
    release();
  }
}
