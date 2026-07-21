/**
 * Write helpers for `hivemind_docs` — ONE row per doc, mutated in place.
 *
 * A brand-new doc is INSERTed at version=1 (`insertDoc`); every later edit is a
 * single UPDATE of that same row (`updateInPlace`), bumping `version` as an
 * in-row counter. Reads (see ./read.ts) resolve one row per `doc_id`.
 *
 * History: this used to be INSERT-only version-append, to dodge a Deeplake
 * backend bug that coalesced two rapid UPDATEs on the same row. F0 verified
 * (repro: sequential rapid single-row UPDATEs, 0 losses) that a SINGLE UPDATE
 * setting all columns at once is safe — the bug only bit *separate* rapid
 * UPDATEs. So we moved to UPDATE-in-place: no unbounded version growth, and a
 * trivial one-row read path. The invariant `updateInPlace` upholds: exactly one
 * UPDATE per write, all columns together.
 *
 *   - `doc_id` is the documented source file path (the stable identity), and is
 *     never mutated.
 *   - `content` is markdown and MAY contain newlines — preserved, not rejected.
 *   - `created_at` is immutable; only `updated_at` advances.
 */

import { randomUUID } from "node:crypto";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import { embeddingSqlLiteral } from "../embeddings/sql.js";
import type { DocAnchor, DocRow, DocTier, QueryFn } from "./read.js";
import { getDocLatest } from "./read.js";

export interface InsertDocInput {
  /** Documented source file path, e.g. `src/shell/deeplake-fs.ts`. Stable key. */
  doc_id: string;
  /** VFS path the doc is read from, e.g. `/docs/<project>/<file>.md`. */
  path: string;
  /** Markdown body. */
  content: string;
  /** Anchors tying doc sections to graph nodes. Default []. */
  anchors?: DocAnchor[];
  /** `fast` (per-file, default) or `slow` (protected project knowledge). */
  tier?: DocTier;
  /** Project key the doc belongs to. Empty string lands the column default. */
  project?: string;
  /** Shared view the row belongs to. Default `main` (the canonical truth). */
  scope?: string;
  /** Serialized source fingerprint (`{file: blob-sha}` JSON). Default `{}`. */
  source_fp?: string;
  /** Override the `agent` column. Default "manual". */
  agent?: string;
  /** Plugin version that produced the write. Empty string lands the default. */
  plugin_version?: string;
  /** Optional precomputed nomic embedding of `content` (search vector). */
  content_embedding?: number[];
}

/**
 * Deterministic row id for the one-row-per-doc invariant, namespaced so the
 * same `doc_id` can exist per (project, scope) in a shared org table without
 * colliding: `<project>|<scope>|<doc_id>`. Retries and re-runs always target
 * the same row.
 */
export function docRowId(project: string | undefined, scope: string | undefined, docId: string): string {
  return `${project ?? ""}|${scope ?? "main"}|${docId}`;
}

export interface SetDocInput {
  /** Documented source file path, e.g. `src/shell/deeplake-fs.ts`. Stable key. */
  doc_id: string;
  /** VFS path the doc is read from, e.g. `/docs/<project>/<file>.md`. */
  path: string;
  /** Markdown body. */
  content: string;
  /** Anchors tying doc sections to graph nodes. Default []. */
  anchors?: DocAnchor[];
  /** `fast` (per-file, default) or `slow` (protected project knowledge). */
  tier?: DocTier;
  /** Project key the doc belongs to. */
  project?: string;
  /** Status to set. Defaults to keeping the previous (or 'active' on first write). */
  status?: "active" | "archived";
  agent?: string;
  plugin_version?: string;
  /** Optional precomputed nomic embedding of `content` (search vector). */
  content_embedding?: number[];
}

export interface EditDocInput {
  /** Stable doc_id (the source file path). */
  doc_id: string;
  /** New markdown body. Omit to keep the previous content. */
  content?: string;
  /** New anchors. Omit to keep the previous anchors. */
  anchors?: DocAnchor[];
  /** New tier. Omit to keep the previous tier. */
  tier?: DocTier;
  /** New status. Omit to keep the previous status. */
  status?: "active" | "archived";
  /** New VFS path. Omit to keep the previous path. */
  path?: string;
  /** New project. Omit to keep the previous project. */
  project?: string;
  /** New serialized source fingerprint. Omit to leave the column untouched. */
  source_fp?: string;
  agent?: string;
  plugin_version?: string;
  /** Optional precomputed nomic embedding of `content` (search vector). */
  content_embedding?: number[];
}

export interface WriteResult {
  doc_id: string;
  version: number;
}

const MAX_CONTENT_LENGTH = 50_000;

/**
 * Validate the markdown body. Throws on empty input or over-cap length.
 * Newlines are allowed — docs are multi-line by nature.
 */
function assertValidContent(content: string): void {
  if (content.length === 0) throw new Error("Doc content must not be empty");
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(
      `Doc content exceeds ${MAX_CONTENT_LENGTH} chars (got ${content.length})`,
    );
  }
}

/** Serialize anchors to a JSON string for the `anchors` TEXT column. */
function serializeAnchors(anchors: DocAnchor[]): string {
  return JSON.stringify(
    anchors.map(a => ({ symbol_id: a.symbol_id, content_hash: a.content_hash })),
  );
}

/**
 * Insert a brand new per-file doc at version=1. `created_at` and
 * `updated_at` are both stamped now; later edits carry `created_at` forward.
 */
export async function insertDoc(
  query: QueryFn,
  tableName: string,
  input: InsertDocInput,
): Promise<WriteResult> {
  assertValidContent(input.content);
  if (input.doc_id.length === 0) throw new Error("Doc doc_id must not be empty");
  const safe = sqlIdent(tableName);
  const rowId = randomUUID();
  const now = new Date().toISOString();
  const anchors = serializeAnchors(input.anchors ?? []);
  const tier: DocTier = input.tier ?? "fast";

  const sql =
    `INSERT INTO "${safe}" ` +
    `(id, doc_id, path, content, anchors, tier, status, project, scope, source_fp, version, ` +
    `created_at, updated_at, agent, plugin_version, content_embedding) ` +
    `VALUES (` +
    `'${sqlStr(rowId)}', ` +
    `'${sqlStr(input.doc_id)}', ` +
    `'${sqlStr(input.path)}', ` +
    `E'${sqlStr(input.content)}', ` +
    `E'${sqlStr(anchors)}', ` +
    `'${sqlStr(tier)}', ` +
    `'active', ` +
    `'${sqlStr(input.project ?? "")}', ` +
    `'${sqlStr(input.scope ?? "main")}', ` +
    `E'${sqlStr(input.source_fp ?? "{}")}', ` +
    `1, ` +
    `'${sqlStr(now)}', ` +
    `'${sqlStr(now)}', ` +
    `'${sqlStr(input.agent ?? "manual")}', ` +
    `'${sqlStr(input.plugin_version ?? "")}', ` +
    `${embeddingSqlLiteral(input.content_embedding)}` +
    `)`;
  await query(sql);
  return { doc_id: input.doc_id, version: 1 };
}

/** Default retry budget + backoff (ms) for a timed-out INSERT. */
const WRITE_RETRIES = 3;
const WRITE_BACKOFF_MS = [500, 1500, 4000];

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && /timeout/i.test(err.message);
}

export interface ResilientWriteOpts {
  /** Max retries after the first attempt. Default 3. */
  retries?: number;
  /** Backoff schedule in ms, indexed by retry number. */
  backoffMs?: number[];
  /** Injectable sleep (tests). Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * `insertDoc` hardened against the Deeplake backend's under-load write
 * timeouts. A write can abort client-side at the 10s query timeout while the
 * backend actually committed the row — so on each retry, before re-inserting,
 * we read back the latest version (`getDocLatest`): if the row already landed
 * we return it instead of INSERTing again, which would otherwise fork history
 * into two parallel `version=1` rows. Only timeouts are retried; any other
 * error surfaces immediately.
 *
 * This is what makes bulk `docs generate` reliable on a real codebase: the
 * backend intermittently times out individual writes under concurrency, and a
 * naive single INSERT drops those docs on the floor (18/33 in one real run).
 */
export async function insertDocResilient(
  query: QueryFn,
  tableName: string,
  input: InsertDocInput,
  opts: ResilientWriteOpts = {},
): Promise<WriteResult> {
  const retries = opts.retries ?? WRITE_RETRIES;
  const backoff = opts.backoffMs ?? WRITE_BACKOFF_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await insertDoc(query, tableName, input);
    } catch (err) {
      if (!isTimeoutError(err)) throw err;
      lastErr = err;
      // Did the timed-out attempt actually commit server-side? Checked on
      // EVERY attempt including the last — otherwise a final-attempt timeout
      // whose write landed reports failure and invites a duplicating retry.
      await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
      const landed = await getDocLatest(query, tableName, input.doc_id, { project: input.project, scope: input.scope }).catch(() => null);
      if (landed) return { doc_id: landed.doc_id, version: landed.version };
      if (attempt === retries) break;
    }
  }
  throw lastErr ?? new Error("insertDocResilient: exhausted retries");
}

/**
 * Idempotent generate-write keyed on a DETERMINISTIC row id = doc_id.
 *
 * Bulk generate under high concurrency times writes out client-side while the
 * backend often already committed; the old `insertDocResilient` then re-INSERTed
 * (each with a fresh random UUID) because its read-back missed the landed row
 * under read-after-write lag — forking up to 4 duplicate rows per file.
 *
 * This write is DELETE-then-INSERT on the fixed id = docRowId(project, scope,
 * doc_id), so retrying the WHOLE op is safe: the retry deletes whatever landed
 * and re-inserts exactly one row. One row per (project, scope, doc_id) by
 * construction — no random id, no read-back gate. Only client-side timeouts
 * are retried; other errors surface immediately.
 */
export async function upsertDoc(
  query: QueryFn,
  tableName: string,
  input: InsertDocInput,
  opts: ResilientWriteOpts = {},
): Promise<WriteResult> {
  assertValidContent(input.content);
  if (input.doc_id.length === 0) throw new Error("Doc doc_id must not be empty");
  const safe = sqlIdent(tableName);
  const scope = input.scope ?? "main";
  const id = docRowId(input.project, scope, input.doc_id);
  const anchors = serializeAnchors(input.anchors ?? []);
  const tier: DocTier = input.tier ?? "fast";

  const retries = opts.retries ?? WRITE_RETRIES;
  const backoff = opts.backoffMs ?? WRITE_BACKOFF_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const now = new Date().toISOString();
      // Clear any prior/partial row for this id first, then write exactly one.
      // The legacy bare-doc_id id is deleted too so pre-scope tables converge
      // to the namespaced id instead of accumulating a duplicate doc_id row —
      // but ONLY within this project AND this scope: in a shared org table
      // another project can legitimately own a legacy row with the same bare
      // doc_id, and — critically for branch overlays — a SIBLING scope (e.g.
      // the canonical `main` row, or another user's branch overlay) for the
      // same (project, doc_id) must NOT be deleted when we write our scope.
      // Without the scope guard, writing a branch overlay would wipe main.
      await query(
        `DELETE FROM "${safe}" WHERE id = '${sqlStr(id)}' ` +
          `OR (doc_id = '${sqlStr(input.doc_id)}' AND project = '${sqlStr(input.project ?? "")}' ` +
          `AND scope = '${sqlStr(scope)}')`,
      );
      const sql =
        `INSERT INTO "${safe}" ` +
        `(id, doc_id, path, content, anchors, tier, status, project, scope, source_fp, version, ` +
        `created_at, updated_at, agent, plugin_version, content_embedding) ` +
        `VALUES (` +
        `'${sqlStr(id)}', '${sqlStr(input.doc_id)}', '${sqlStr(input.path)}', ` +
        `E'${sqlStr(input.content)}', E'${sqlStr(anchors)}', '${sqlStr(tier)}', ` +
        `'active', '${sqlStr(input.project ?? "")}', '${sqlStr(scope)}', E'${sqlStr(input.source_fp ?? "{}")}', 1, ` +
        `'${sqlStr(now)}', '${sqlStr(now)}', ` +
        `'${sqlStr(input.agent ?? "manual")}', '${sqlStr(input.plugin_version ?? "")}', ` +
        `${embeddingSqlLiteral(input.content_embedding)}` +
        `)`;
      await query(sql);
      return { doc_id: input.doc_id, version: 1 };
    } catch (err) {
      if (!isTimeoutError(err)) throw err;
      lastErr = err;
      if (attempt === retries) break;
      await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
    }
  }
  throw lastErr ?? new Error("upsertDoc: exhausted retries");
}

/**
 * Edit an existing doc. Reads the latest version, then INSERTs a new row
 * with version+1 carrying the merged fields (omitted fields inherit from
 * the prior version). The immutable `created_at` is carried forward;
 * `updated_at` advances to now. Throws when the `doc_id` does not exist.
 */
export async function editDoc(
  query: QueryFn,
  tableName: string,
  input: EditDocInput,
  opts: { project?: string; scope?: string } = {},
): Promise<WriteResult> {
  // Optional project + scope SELECTOR (distinct from input.project, the value
  // to write) — in a shared org table an unscoped read can resolve the same
  // doc_id to another project's row, or (with branch overlays) to a sibling
  // scope's row. Passing scope confines the edit to one identity.
  const previous = await getDocLatest(query, tableName, input.doc_id, { project: opts.project, scope: opts.scope });
  if (!previous) {
    throw new Error(`Doc not found: ${input.doc_id}`);
  }
  return updateInPlace(query, tableName, previous, input);
}

/**
 * Idempotent upsert by `doc_id` — the public entry point CLI / worker code
 * should use. Reads the latest version: if the doc exists it appends a new
 * version (carrying the immutable `created_at`); if not it inserts v1.
 *
 * This is what makes `doc_id = file path` safe as a caller-supplied key.
 * Calling `insertDoc` directly for an already-documented file would fork
 * history into two parallel `version=1` rows — `setDoc` never does, because
 * the file path identity always resolves to one version chain.
 */
export async function setDoc(
  query: QueryFn,
  tableName: string,
  input: SetDocInput,
  opts: { project?: string; scope?: string } = {},
): Promise<WriteResult> {
  // Project + scope SELECTOR (shared-table safety): without it the bare doc_id
  // can resolve to another project's row — or a sibling branch overlay — and
  // this write would version-bump THAT.
  const previous = await getDocLatest(query, tableName, input.doc_id, { project: opts.project, scope: opts.scope });
  if (!previous) {
    return insertDoc(query, tableName, {
      doc_id: input.doc_id,
      path: input.path,
      content: input.content,
      anchors: input.anchors,
      tier: input.tier,
      project: input.project,
      agent: input.agent,
      plugin_version: input.plugin_version,
      content_embedding: input.content_embedding,
    });
  }
  return updateInPlace(query, tableName, previous, {
    doc_id: input.doc_id,
    content: input.content,
    anchors: input.anchors,
    tier: input.tier,
    status: input.status,
    path: input.path,
    project: input.project,
    agent: input.agent,
    plugin_version: input.plugin_version,
    content_embedding: input.content_embedding,
  });
}

/**
 * Archive a doc (soft delete) — appends a version with status='archived',
 * preserving content + audit trail. Throws when the doc_id does not exist.
 * Used as the delete primitive for the `doc_id = path` lifecycle: when a
 * source file is removed, its doc is archived rather than hard-deleted.
 */
export async function archiveDoc(
  query: QueryFn,
  tableName: string,
  input: { doc_id: string; agent?: string; plugin_version?: string },
  opts: { project?: string; scope?: string } = {},
): Promise<WriteResult> {
  return editDoc(query, tableName, {
    doc_id: input.doc_id,
    status: "archived",
    agent: input.agent,
    plugin_version: input.plugin_version,
  }, opts);
}

/**
 * Update a doc IN PLACE — one row per `doc_id`, mutated with a single UPDATE.
 *
 * This replaced the old INSERT-only version-append once the Deeplake backend's
 * UPDATE-coalescing bug was verified fixed for our access pattern (F0): a
 * single UPDATE that sets ALL columns at once, applied sequentially per doc, is
 * safe (0 losses over the repro). The historic bug only bit *two separate*
 * rapid UPDATEs to the same row — which we never do here.
 *
 * `version` is bumped as an in-row update counter; `created_at` is immutable;
 * `updated_at` advances. The row is targeted by its unique `id` so a table that
 * still carries pre-migration history rows updates exactly the current one.
 */
async function updateInPlace(
  query: QueryFn,
  tableName: string,
  previous: DocRow,
  next: EditDocInput,
): Promise<WriteResult> {
  const content = next.content ?? previous.content;
  assertValidContent(content);
  const safe = sqlIdent(tableName);
  const now = new Date().toISOString();
  const nextVersion = previous.version + 1;
  const anchors = serializeAnchors(next.anchors ?? previous.anchors);
  const tier: DocTier = next.tier ?? previous.tier;
  const status = next.status ?? (previous.status as "active" | "archived");
  const path = next.path ?? previous.path;
  const project = next.project ?? previous.project;

  // One UPDATE, all columns — the F0 safety rule. created_at + doc_id are not
  // touched (immutable identity/creation stamp).
  const sql =
    `UPDATE "${safe}" SET ` +
    `path = '${sqlStr(path)}', ` +
    `content = E'${sqlStr(content)}', ` +
    `anchors = E'${sqlStr(anchors)}', ` +
    `tier = '${sqlStr(tier)}', ` +
    `status = '${sqlStr(status)}', ` +
    `project = '${sqlStr(project)}', ` +
    // Search-vector policy: a fresh vector always wins; a STATUS-ONLY edit
    // must not touch the existing one; but a CONTENT change without a fresh
    // vector (embed daemon down) must NULL it — keeping the old vector would
    // rank the doc by its previous meaning forever, and `docs reindex` only
    // heals MISSING vectors, never stale ones. Missing beats lying.
    `${next.content_embedding !== undefined
      ? `content_embedding = ${embeddingSqlLiteral(next.content_embedding)}, `
      : next.content !== undefined && next.content !== previous.content
        ? `content_embedding = NULL, `
        : ""}` +
    // Fingerprint moves with the content: a patch that lands new bytes stamps
    // the new source state so freshness reflects what the page now describes.
    `${next.source_fp !== undefined ? `source_fp = E'${sqlStr(next.source_fp)}', ` : ""}` +
    `version = ${nextVersion}, ` +
    `updated_at = '${sqlStr(now)}', ` +
    `agent = '${sqlStr(next.agent ?? "manual")}', ` +
    `plugin_version = '${sqlStr(next.plugin_version ?? "")}' ` +
    `WHERE id = '${sqlStr(previous.id)}'`;
  await query(sql);
  return { doc_id: previous.doc_id, version: nextVersion };
}

/** Test-only export so unit tests can verify the cap without monkey-patching. */
export const _MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH;
