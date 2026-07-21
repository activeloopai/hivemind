/**
 * Refresh bookkeeping for the wiki freshness loop — one reserved `_meta` row
 * per (project, scope) in the docs table.
 *
 * The row's `content` is a small JSON blob:
 *   { last_refresh_sha, claimed_by, claimed_at, patch_counts }
 *
 * Concurrency model (fault-resistant by construction):
 *   - The refresh "turn" is a LEASE, not a lock: `tryClaimTurn` stamps
 *     claimed_by/claimed_at; a claim older than the TTL is dead and can be
 *     taken over by anyone. A crashed worker leaves nothing to clean up.
 *   - Claims are verified by READ-BACK, not by UPDATE row counts: the Deeplake
 *     backend can silently drop one of two rapid UPDATEs on the same row, so
 *     the only trustworthy signal is re-reading the row and seeing our own
 *     stamp survive.
 *   - `last_refresh_sha` advances ONLY via `commitRefresh` at the end of a
 *     successful cycle (the commit point). A half-done cycle leaves the sha
 *     untouched, so the next turn simply redoes the whole window — every step
 *     of the refresh is idempotent, so redoing converges.
 */

import { sqlIdent, sqlStr } from "../utils/sql.js";
import { docRowId } from "./write.js";
import type { QueryFn } from "./read.js";

/** Parsed `_meta` content. */
export interface RefreshMeta {
  /** Commit sha the canonical docs currently describe. Empty = never refreshed. */
  last_refresh_sha: string;
  /** Owner of the in-flight refresh turn, or null when free. */
  claimed_by: string | null;
  /** ISO timestamp of the claim, or null when free. */
  claimed_at: string | null;
  /** Per-page in-place patch counters (escalation to full regen past a cap). */
  patch_counts: Record<string, number>;
}

export interface MetaReadResult {
  meta: RefreshMeta;
  /** The row's updated_at — the optimistic-concurrency token for writes. */
  updated_at: string;
}

export const META_DOC_ID = "_meta";

/** Default lease duration: a claim older than this is dead and can be taken. */
export const CLAIM_TTL_MS = 30 * 60 * 1000;

const EMPTY_META: RefreshMeta = {
  last_refresh_sha: "",
  claimed_by: null,
  claimed_at: null,
  patch_counts: {},
};

function parseMeta(content: string): RefreshMeta {
  try {
    const raw = JSON.parse(content) as Partial<RefreshMeta>;
    return {
      last_refresh_sha: typeof raw.last_refresh_sha === "string" ? raw.last_refresh_sha : "",
      claimed_by: typeof raw.claimed_by === "string" ? raw.claimed_by : null,
      claimed_at: typeof raw.claimed_at === "string" ? raw.claimed_at : null,
      patch_counts: raw.patch_counts && typeof raw.patch_counts === "object" ? raw.patch_counts as Record<string, number> : {},
    };
  } catch {
    return { ...EMPTY_META };
  }
}

/** Latest `_meta` row for (project, scope), or null when it does not exist yet. */
export async function readRefreshMeta(
  query: QueryFn,
  tableName: string,
  project: string,
  scope = "main",
): Promise<MetaReadResult | null> {
  const safe = sqlIdent(tableName);
  const id = docRowId(project, scope, META_DOC_ID);
  const rows = await query(
    `SELECT content, updated_at FROM "${safe}" WHERE id = '${sqlStr(id)}' ` +
      `ORDER BY updated_at DESC LIMIT 1`,
  );
  if (!rows.length) return null;
  return {
    meta: parseMeta(String(rows[0].content ?? "")),
    updated_at: String(rows[0].updated_at ?? ""),
  };
}

/** Write the whole meta row in ONE statement (DELETE+INSERT keyed on the fixed id). */
async function writeMetaRow(
  query: QueryFn,
  tableName: string,
  project: string,
  scope: string,
  meta: RefreshMeta,
  now: string,
): Promise<void> {
  const safe = sqlIdent(tableName);
  const id = docRowId(project, scope, META_DOC_ID);
  await query(`DELETE FROM "${safe}" WHERE id = '${sqlStr(id)}'`);
  await query(
    `INSERT INTO "${safe}" ` +
      `(id, doc_id, path, content, anchors, tier, status, project, scope, version, ` +
      `created_at, updated_at, agent, plugin_version) VALUES (` +
      `'${sqlStr(id)}', '${META_DOC_ID}', '', E'${sqlStr(JSON.stringify(meta))}', '[]', ` +
      `'slow', 'meta', '${sqlStr(project)}', '${sqlStr(scope)}', 1, ` +
      `'${sqlStr(now)}', '${sqlStr(now)}', 'refresh-meta', '')`,
  );
  // Heal races: DELETE+INSERT is not transactional here, so two concurrent
  // writers can interleave (A del, B del, A ins, B ins) and leave duplicate
  // meta rows. Readers already pick the newest, and every write starts with a
  // full DELETE — this trailing sweep removes any OLDER sibling immediately
  // instead of waiting for the next write, keeping the one-row invariant a
  // steady state rather than an eventual one.
  await query(`DELETE FROM "${safe}" WHERE id = '${sqlStr(id)}' AND updated_at < '${sqlStr(now)}'`);
}

export interface ClaimOpts {
  /** Who is claiming (e.g. `${os.userInfo().username}@${hostname}:${pid}`). */
  owner: string;
  /** Lease duration; a claim older than this is dead. Default 30 min. */
  ttlMs?: number;
  /** Injectable clock (tests). */
  now?: () => Date;
  /** Injectable settle delay before read-back (tests). Default 250ms. */
  sleep?: (ms: number) => Promise<void>;
}

export type ClaimResult =
  | { won: true; meta: RefreshMeta }
  | { won: false; reason: "held" | "lost-race" };

/**
 * Try to take the refresh turn. Returns `won: false` when another live claim
 * exists, or when the read-back shows a concurrent claimer overwrote ours.
 */
export async function tryClaimTurn(
  query: QueryFn,
  tableName: string,
  project: string,
  scope: string,
  opts: ClaimOpts,
): Promise<ClaimResult> {
  const ttl = opts.ttlMs ?? CLAIM_TTL_MS;
  const nowFn = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const current = await readRefreshMeta(query, tableName, project, scope);
  const nowIso = nowFn().toISOString();
  if (current?.meta.claimed_at && current.meta.claimed_by) {
    const age = nowFn().getTime() - new Date(current.meta.claimed_at).getTime();
    if (age < ttl) return { won: false, reason: "held" };
  }

  // Re-read IMMEDIATELY before writing: the claim row carries the whole meta
  // (sha, counters), and a concurrent commit between the held-check read and
  // this write would otherwise be overwritten with its pre-commit values —
  // regressing last_refresh_sha. The fresh read shrinks that window to the
  // write itself; the backend offers no CAS to close it entirely.
  const fresh = await readRefreshMeta(query, tableName, project, scope);
  const claimed: RefreshMeta = {
    ...(fresh?.meta ?? current?.meta ?? EMPTY_META),
    claimed_by: opts.owner,
    claimed_at: nowIso,
  };
  await writeMetaRow(query, tableName, project, scope, claimed, nowIso);

  // Read-back verification: only our surviving stamp proves the claim. A
  // concurrent claimer's later write wins the row; row counts are not trusted.
  await sleep(250);
  const after = await readRefreshMeta(query, tableName, project, scope);
  if (after?.meta.claimed_by === opts.owner && after.meta.claimed_at === nowIso) {
    return { won: true, meta: after.meta };
  }
  return { won: false, reason: "lost-race" };
}

export type CommitResult = { committed: true } | { committed: false; reason: "lost-lease" };

/**
 * Release the claim WITHOUT advancing the sha — the exit path of an
 * INCOMPLETE cycle. Leaving the lease held until TTL would block every retry
 * for 30 minutes after a single failed page; releasing (sha untouched) lets
 * the next tick redo the same window immediately. Ownership is verified the
 * same way as commitRefresh: a stale worker must not clobber a newer claim.
 */
export async function releaseClaim(
  query: QueryFn,
  tableName: string,
  project: string,
  scope: string,
  opts: { owner: string; patchCounts?: Record<string, number>; now?: () => Date },
): Promise<boolean> {
  const nowFn = opts.now ?? (() => new Date());
  const current = await readRefreshMeta(query, tableName, project, scope);
  if (current?.meta.claimed_by !== opts.owner) return false;
  await writeMetaRow(query, tableName, project, scope, {
    last_refresh_sha: current.meta.last_refresh_sha,
    claimed_by: null,
    claimed_at: null,
    patch_counts: opts.patchCounts ?? current.meta.patch_counts,
  }, nowFn().toISOString());
  return true;
}

/**
 * Commit point of a successful refresh cycle: advance the sha, release the
 * claim, and persist the updated per-page patch counters — one row write.
 *
 * Ownership is re-verified first: a refresh that outlived its TTL may have
 * lost the lease to another worker, and a stale worker must NEVER overwrite
 * the newer claim or regress `last_refresh_sha`. When `owner` no longer holds
 * the claim the commit is refused (the redone cycle is idempotent, so the
 * new owner converges to the same result).
 */
export async function commitRefresh(
  query: QueryFn,
  tableName: string,
  project: string,
  scope: string,
  sha: string,
  patchCounts: Record<string, number>,
  opts: { owner: string; now?: () => Date },
): Promise<CommitResult> {
  const nowFn = opts.now ?? (() => new Date());
  const current = await readRefreshMeta(query, tableName, project, scope);
  if (current?.meta.claimed_by !== opts.owner) {
    return { committed: false, reason: "lost-lease" };
  }
  const meta: RefreshMeta = {
    last_refresh_sha: sha,
    claimed_by: null,
    claimed_at: null,
    patch_counts: patchCounts,
  };
  await writeMetaRow(query, tableName, project, scope, meta, nowFn().toISOString());
  return { committed: true };
}
