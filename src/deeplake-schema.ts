/**
 * Single source of truth for the Deeplake table schemas this plugin owns.
 *
 * Each table is described as an array of `{ name, sql }` entries. Both
 * `CREATE TABLE` and lazy schema healing iterate over the same list, so
 * adding a new column means one edit here — no second mirror in the
 * ensure / ALTER paths to keep in sync.
 *
 * Healing rules (do not hand-roll the flow elsewhere — call
 * `healMissingColumns` below):
 *   1. One SELECT against `information_schema.columns` per table to read
 *      the current column set.
 *   2. Diff against the schema definition.
 *   3. `ALTER TABLE ADD COLUMN` only the genuinely missing columns —
 *      never blanket, never `IF NOT EXISTS`. The single tolerated race
 *      ("already exists" from a concurrent writer) is caught and
 *      re-verified with a second SELECT.
 *
 * Background: a historical Deeplake post-ALTER bug (a ~30s window of
 * failing INSERTs after every ALTER) motivated a marker-cached
 * "ensureColumn" path. The bug was re-probed against `api.deeplake.ai`
 * on 2026-05-18 in the `test_plugin` org and is no longer reproducible
 * (71/71 INSERTs OK, first success 2ms after ALTER). The SELECT-first
 * rule survives anyway because each ALTER still costs ~800ms and a
 * targeted diff produces clearer logs than a blanket sweep.
 */

import { sqlIdent, sqlStr } from "./utils/sql.js";

export interface ColumnDef {
  /** Bare column identifier, e.g. `contributors`. */
  name: string;
  /** Column SQL minus the name, e.g. `TEXT NOT NULL DEFAULT '[]'`. */
  sql: string;
}

// ── Schema definitions ──────────────────────────────────────────────────────

/** Memory table — wiki summaries written by the SessionStart workers. */
export const MEMORY_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",                sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path",              sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "filename",          sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "summary",           sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "summary_embedding", sql: "FLOAT4[]" },
  { name: "author",            sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "mime_type",         sql: "TEXT NOT NULL DEFAULT 'text/plain'" },
  { name: "size_bytes",        sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "project",           sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "description",       sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent",             sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "plugin_version",    sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "creation_date",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "last_update_date",  sql: "TEXT NOT NULL DEFAULT ''" },
]);

/** Sessions table — raw per-turn agent events. */
export const SESSIONS_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",                sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path",              sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "filename",          sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "message",           sql: "JSONB" },
  { name: "message_embedding", sql: "FLOAT4[]" },
  { name: "author",            sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "mime_type",         sql: "TEXT NOT NULL DEFAULT 'application/json'" },
  { name: "size_bytes",        sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "project",           sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "description",       sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent",             sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "plugin_version",    sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "creation_date",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "last_update_date",  sql: "TEXT NOT NULL DEFAULT ''" },
]);

/** Skills table — one row per skill version. */
export const SKILLS_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",              sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "name",            sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "project",         sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "project_key",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "local_path",      sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "install",         sql: "TEXT NOT NULL DEFAULT 'project'" },
  { name: "source_sessions", sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "source_agent",    sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "scope",           sql: "TEXT NOT NULL DEFAULT 'me'" },
  { name: "author",          sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "contributors",    sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "description",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "trigger_text",    sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "body",            sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version",         sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at",      sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at",      sql: "TEXT NOT NULL DEFAULT ''" },
]);

/**
 * Rules table — org-wide principles ("never DROP TABLE on prod creds").
 *
 * One row per rule version. Edits INSERT a fresh row with version+1; reads
 * pick the latest per rule_id (ORDER BY version DESC LIMIT 1). Same
 * pattern as SKILLS_COLUMNS — sidesteps the Deeplake UPDATE-coalescing
 * quirk that bit the wiki worker.
 */
export const RULES_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",             sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "rule_id",        sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "text",           sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "scope",          sql: "TEXT NOT NULL DEFAULT 'team'" },
  { name: "status",         sql: "TEXT NOT NULL DEFAULT 'active'" },
  { name: "assigned_by",    sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version",        sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent",          sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
]);

/**
 * Goals table — user-tracked objectives backed by the VFS path
 * convention `memory/goal/<owner>/<status>/<goal_id>.md`.
 *
 * Path decomposition is the source of truth for `owner`, `status`, and
 * `goal_id`; the `content` column stores the human-readable markdown
 * body. This avoids the "path vs content drift" footgun codex flagged
 * in the design round 3 review — there is nothing to drift since the
 * content does not replicate path-encoded fields.
 *
 * Immutable + version-bumped (same shape as SKILLS_COLUMNS /
 * RULES_COLUMNS). Every VFS write produces v=N+1;
 * `rm` translates to v=N+1 with status='closed' (soft-close, full
 * audit trail preserved).
 *
 * Status enum: 'opened' | 'in_progress' | 'closed' — mirrors the path
 * folder names. KPIs link via shared `goal_id` (no FK enforcement on
 * Deeplake; logical join only).
 */
export const GOALS_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",             sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "goal_id",        sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "owner",          sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "status",         sql: "TEXT NOT NULL DEFAULT 'opened'" },
  { name: "content",        sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version",        sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent",          sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
]);

/**
 * KPIs table — markdown bodies describing target / current / unit for
 * one KPI on one goal. Backed by VFS path
 * `memory/kpi/<goal_id>/<kpi_id>.md`. Path encodes the (goal_id,
 * kpi_id) pair; the content column stores the body (free markdown,
 * by convention with `target:` / `current:` / `unit:` lines for the
 * commit-extract worker to mutate).
 *
 * Owner is intentionally NOT stored here — it is derived from the
 * parent goal (logical join on goal_id). This avoids the
 * reassign-races scenario where moving a goal between owners would
 * otherwise force a multi-file cascade move on the KPI files.
 *
 * Same version-bump pattern: every write INSERTs v=N+1; deleting a
 * KPI conceptually means writing a tombstone version, deferred to v1.1.
 */
export const KPIS_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",             sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "goal_id",        sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "kpi_id",         sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "content",        sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "version",        sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent",          sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
]);

/**
 * Docs table — per-file internal documentation kept fresh on code deltas.
 *
 * One row per doc version. Edits INSERT a fresh row with version+1; reads
 * pick the latest per doc_id (ORDER BY version DESC LIMIT 1). Same
 * immutable / version-bumped pattern as RULES_COLUMNS / SKILLS_COLUMNS —
 * sidesteps the Deeplake UPDATE-coalescing quirk that bit the wiki worker.
 *
 * `doc_id` is the stable key = the documented source file path (e.g.
 * `src/shell/deeplake-fs.ts`); `path` is the VFS location the doc is read
 * from (`/docs/<project>/<file>.md`). `anchors` is a JSON array of
 * `{ symbol_id, content_hash }` pairs tying doc sections to graph nodes —
 * a changed `content_hash` is the objective drift signal that marks the
 * doc stale. `tier` is `fast` (per-file, regenerated freely on delta) or
 * `slow` (project knowledge, append-only through the gate; never silently
 * overwritten by a fast edit).
 */
export const DOCS_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",             sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "doc_id",         sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path",           sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "content",        sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "anchors",        sql: "TEXT NOT NULL DEFAULT '[]'" },
  { name: "tier",           sql: "TEXT NOT NULL DEFAULT 'fast'" },
  { name: "status",         sql: "TEXT NOT NULL DEFAULT 'active'" },
  { name: "project",        sql: "TEXT NOT NULL DEFAULT ''" },
  // Which shared view a row belongs to: `main` = the canonical truth
  // (written only by the elected refresh turn); `u:<user>|b:<branch>` =
  // a personal branch overlay (v2, opt-in). Reads default to `main`.
  { name: "scope",          sql: "TEXT NOT NULL DEFAULT 'main'" },
  // Per-page source fingerprint: JSON `{file: git-blob-sha}` the page was
  // generated from. Drives freshness (stale iff it differs from HEAD's), the
  // overlay-divergence decision, the origin publish gate, and merge promotion.
  // Read only where needed (scoped reads) so generic reads stay heal-safe.
  { name: "source_fp",      sql: "TEXT NOT NULL DEFAULT '{}'" },
  { name: "version",        sql: "BIGINT NOT NULL DEFAULT 1" },
  { name: "created_at",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "updated_at",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "agent",          sql: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: "plugin_version", sql: "TEXT NOT NULL DEFAULT ''" },
  // Semantic-search vector over `content` (nomic, DOC_PREFIX). Nullable/empty
  // when embeddings are off or not yet backfilled — `docs/find/` guards with
  // ARRAY_LENGTH(...) > 0, exactly like grep-core does for summaries.
  { name: "content_embedding", sql: "FLOAT4[]" },
]);

// ── Module-load lint ────────────────────────────────────────────────────────

/**
 * `ALTER TABLE ADD COLUMN <name> NOT NULL` on a populated table fails
 * unless a DEFAULT is provided (the backend needs something to backfill
 * existing rows with). Catch this at module-load time so a missing
 * DEFAULT can't sneak into a schema definition and break healing in
 * production. Nullable columns (no NOT NULL) are exempt: NULL is their
 * implicit default and the backfill is trivial.
 */
function validateSchema(label: string, cols: readonly ColumnDef[]): void {
  const seen = new Set<string>();
  for (const col of cols) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(col.name)) {
      throw new Error(`${label}: column name "${col.name}" is not a valid SQL identifier`);
    }
    if (seen.has(col.name)) {
      throw new Error(`${label}: duplicate column "${col.name}"`);
    }
    seen.add(col.name);
    const notNull = /\bNOT\s+NULL\b/i.test(col.sql);
    const hasDefault = /\bDEFAULT\b/i.test(col.sql);
    if (notNull && !hasDefault) {
      throw new Error(
        `${label}: column "${col.name}" is NOT NULL but has no DEFAULT — ` +
        `ALTER TABLE ADD COLUMN on a populated table would fail.`,
      );
    }
  }
}

/**
 * Codebase table — one row per (org, workspace, repo, user, worktree, commit).
 * snapshot_jsonb stores the canonical NetworkX node-link JSON written to disk.
 * snapshot_sha256 lets us dedup AND detect extractor-version drift (same
 * commit + same code SHOULD produce the same sha256; a mismatch means the
 * extractor changed).
 *
 * Phase 1.5 = simple: a single SELECT-before-INSERT push pattern. Cross-user
 * node-level dedup (split into manifest + content-addressable nodes) is
 * deferred to v1.1+.
 */
export const CODEBASE_COLUMNS: readonly ColumnDef[] = Object.freeze([
  // Identity key (matches the PK below)
  { name: "org_id",          sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "workspace_id",    sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "repo_slug",       sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "user_id",         sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "worktree_id",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "commit_sha",      sql: "TEXT NOT NULL DEFAULT ''" },

  // Observation metadata
  { name: "parent_sha",      sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "branch",          sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "ts",              sql: "TIMESTAMP" },
  { name: "pushed_by",       sql: "TEXT NOT NULL DEFAULT ''" },

  // Snapshot payload
  { name: "snapshot_sha256", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "snapshot_jsonb",  sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "node_count",      sql: "BIGINT NOT NULL DEFAULT 0" },
  { name: "edge_count",      sql: "BIGINT NOT NULL DEFAULT 0" },

  // Generator metadata (for drift diagnostics — what hivemind version produced this?)
  { name: "generator",         sql: "TEXT NOT NULL DEFAULT 'hivemind-graph'" },
  { name: "generator_version", sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "schema_version",    sql: "BIGINT NOT NULL DEFAULT 1" },
]);

validateSchema("MEMORY_COLUMNS", MEMORY_COLUMNS);
validateSchema("SESSIONS_COLUMNS", SESSIONS_COLUMNS);
validateSchema("SKILLS_COLUMNS", SKILLS_COLUMNS);
validateSchema("RULES_COLUMNS", RULES_COLUMNS);
validateSchema("GOALS_COLUMNS", GOALS_COLUMNS);
validateSchema("KPIS_COLUMNS", KPIS_COLUMNS);
validateSchema("DOCS_COLUMNS", DOCS_COLUMNS);
validateSchema("CODEBASE_COLUMNS", CODEBASE_COLUMNS);

// ── SQL builders ────────────────────────────────────────────────────────────

/** Render a `CREATE TABLE IF NOT EXISTS … USING deeplake` from a column list. */
export function buildCreateTableSql(tableName: string, cols: readonly ColumnDef[]): string {
  const safe = sqlIdent(tableName);
  const colSql = cols.map(c => `${c.name} ${c.sql}`).join(", ");
  return `CREATE TABLE IF NOT EXISTS "${safe}" (${colSql}) USING deeplake`;
}

/** Render a `SELECT column_name` against `information_schema.columns`. */
function buildIntrospectionSql(tableName: string, workspaceId: string): string {
  return (
    `SELECT column_name FROM information_schema.columns ` +
    `WHERE table_name = '${sqlStr(tableName)}' ` +
    `AND table_schema = '${sqlStr(workspaceId)}'`
  );
}

// ── Healing primitive shared by API client and worker ───────────────────────

export type QueryFn = (sql: string) => Promise<unknown>;

/** Outcome of a `healMissingColumns` pass. */
export interface HealResult {
  /**
   * Columns the introspection SELECT determined were missing from the table.
   * Empty when the table already matched the schema. Useful for distinguishing
   * "schema was up-to-date" from "the ALTER pass ran but lost every race",
   * which look the same if you only look at `altered`.
   */
  missing: string[];
  /**
   * Columns this call actually ALTERed in. A subset of `missing`. The
   * difference (`missing` items not in `altered`) is where the ALTER hit
   * an "already exists" race and was re-verified as no-op.
   */
  altered: string[];
}

/**
 * Add missing columns to `tableName` so it matches `cols`. One SELECT
 * against `information_schema.columns` reads the current set, then we
 * `ALTER TABLE ADD COLUMN` only the truly missing ones. Race with a
 * concurrent writer ("already exists") is caught and re-verified.
 *
 * Caller decides when to invoke. Suggested triggers:
 *   - long-lived API client: once per process per table (e.g. on
 *     SessionStart), wrapped in your own dedup if you want zero-cost
 *     no-ops across many calls;
 *   - short-lived worker: only inside the catch of an INSERT that
 *     failed with a missing-column error.
 *
 * Returns both `missing` (what the diff said) and `altered` (what we
 * actually ran). A worker can use `missing.length === 0` to decide that
 * the error came from a column outside the schema's knowledge and
 * propagate the original error rather than retrying.
 */
export async function healMissingColumns(args: {
  query: QueryFn;
  tableName: string;
  workspaceId: string;
  columns: readonly ColumnDef[];
  /** Optional logger for `[schema-heal] …` lines. */
  log?: (msg: string) => void;
}): Promise<HealResult> {
  const safeTable = sqlIdent(args.tableName);
  const introspectSql = buildIntrospectionSql(args.tableName, args.workspaceId);

  const rows = (await args.query(introspectSql)) as Array<Record<string, unknown>>;
  const existing = new Set<string>();
  for (const row of rows) {
    // Deeplake returns either { column_name: "x" } or positional rows
    // wrapped to objects by the API client. Both shapes carry the same key.
    const v = row?.column_name;
    if (typeof v === "string") existing.add(v.toLowerCase());
  }

  const missingCols = args.columns.filter(c => !existing.has(c.name.toLowerCase()));
  const missing = missingCols.map(c => c.name);
  if (missingCols.length === 0) return { missing, altered: [] };

  const altered: string[] = [];
  for (const col of missingCols) {
    try {
      await args.query(`ALTER TABLE "${safeTable}" ADD COLUMN ${col.name} ${col.sql}`);
      altered.push(col.name);
      args.log?.(`schema-heal: added "${args.tableName}"."${col.name}"`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists/i.test(msg)) throw e;
      // Race: a concurrent writer added the column between our SELECT and
      // our ALTER. Re-verify before treating as success — any other shape
      // of "already exists" (e.g. a same-named column with the wrong type
      // we did not put there) should not be silently swallowed.
      const recheck = (await args.query(introspectSql)) as Array<Record<string, unknown>>;
      const present = recheck.some(r => {
        const v = r?.column_name;
        return typeof v === "string" && v.toLowerCase() === col.name.toLowerCase();
      });
      if (!present) throw e;
      args.log?.(`schema-heal: "${args.tableName}"."${col.name}" appeared via race, treating as success`);
    }
  }
  return { missing, altered };
}

// ── Error classification (shared by worker INSERT retry) ────────────────────

/**
 * Match the wording Deeplake / Postgres emit when the *table itself*
 * is missing. Excludes "permission denied" and missing-column variants
 * — those route to different recovery branches.
 */
export function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  if (/permission denied|must be owner/i.test(message)) return false;
  // Postgres' missing-column shape includes `relation "x" does not exist`
  // as a substring of `column "y" of relation "x" does not exist`, so any
  // mention of `column` routes to the column branch instead.
  if (/\bcolumn\b/i.test(message)) return false;
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}

/**
 * Match the wording Deeplake / Postgres emit when *any column* is
 * missing on a write. Used by short-lived workers to decide whether to
 * run a heal pass before retrying the INSERT.
 */
export function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  if (/permission denied|must be owner/i.test(message)) return false;
  return (
    /column ["']?[A-Za-z_][A-Za-z0-9_]*["']? .*does not exist/i.test(message) ||
    /unknown column/i.test(message) ||
    /no such column/i.test(message)
  );
}
