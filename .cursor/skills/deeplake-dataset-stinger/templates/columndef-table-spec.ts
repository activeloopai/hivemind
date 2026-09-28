/**
 * ColumnDef Table Spec - deeplake-dataset-stinger template
 *
 * Opinionated starter for a Hivemind Deep Lake table, single-sourced as a
 * `readonly ColumnDef[]`. Replace `example` with your own table.
 *
 * Defaults baked in:
 * - Every column is one ColumnDef in src/deeplake-schema.ts (the single source).
 * - `EMBEDDING` renders to FLOAT4[] (768-dim, nomic-embed-text-v1.5).
 * - `JSONB` only for genuinely schemaless payloads (e.g. `message`).
 * - Every NOT NULL column carries a DEFAULT (validateSchema() gate).
 * - Append-only tables (skills/rules/goals/kpis) carry a `version` column.
 * - Table is created `CREATE TABLE IF NOT EXISTS "<name>" (...) USING deeplake`.
 *
 * Source: guides/01-schema-design.md, guides/07-no-orm-columndef.md.
 */

export type ColumnType =
  | 'TEXT'
  | 'INT'
  | 'BIGINT'
  | 'BOOL'
  | 'TIMESTAMP'
  | 'JSONB'
  | 'EMBEDDING'; // -> FLOAT4[] (768-dim)

export interface ColumnDef {
  name: string; // tensor name; MUST pass sqlIdent: [A-Za-z_][A-Za-z0-9_]*
  type: ColumnType;
  notNull?: boolean; // if true, `default` is MANDATORY (validateSchema enforces)
  default?: string; // SQL default literal, e.g. "''", 'now()', '1'
}

// ---------- example table ----------
export const exampleColumns: readonly ColumnDef[] = [
  { name: 'id', type: 'TEXT', notNull: true, default: "''" },
  { name: 'session_id', type: 'TEXT' },
  // genuinely schemaless payload -> JSONB (not flattened into columns)
  { name: 'message', type: 'JSONB' },
  // semantic search vector -> FLOAT4[] 768-dim, searched with <#>
  { name: 'message_embedding', type: 'EMBEDDING' },
  // append-only history: edits INSERT version+1, latest wins via ORDER BY version DESC
  { name: 'version', type: 'BIGINT', notNull: true, default: '1' },
  // every NOT NULL column has a DEFAULT
  { name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'now()' },
] as const;

/**
 * Rendering and healing:
 *
 *   buildCreateTableSql('example', exampleColumns)
 *     -> CREATE TABLE IF NOT EXISTS "example" (
 *          id TEXT NOT NULL DEFAULT '',
 *          session_id TEXT,
 *          message JSONB,
 *          message_embedding FLOAT4[],
 *          version BIGINT NOT NULL DEFAULT 1,
 *          created_at TIMESTAMP NOT NULL DEFAULT now()
 *        ) USING deeplake;
 *
 *   healMissingColumns('example', exampleColumns)
 *     -> SELECT column_name FROM information_schema.columns WHERE table_name = 'example'
 *     -> diff: defined - live = missing
 *     -> one `ALTER TABLE "example" ADD COLUMN ...` per missing column
 *        (NEVER `IF NOT EXISTS` - a duplicate add returns HTTP 500, not 409)
 */

/**
 * Indexing (see guides/02-indexing.md):
 *
 *   await ensureLookupIndex('example', 'session_id');            // hot equality, marker-cached
 *   // BM25 keyword relevance (NOT on the memory table - oid bug):
 *   // CREATE INDEX ON "example" USING deeplake_index (message);
 *   // vector similarity:
 *   // SELECT * FROM "example" ORDER BY message_embedding <#> $vec::float4[] LIMIT $k;
 *   // hybrid:
 *   // ORDER BY deeplake_hybrid_record($vec::float4[], $text, 0.7, 0.3) DESC
 */

/**
 * SQL guards (see guides/05-querying-deeplakeapi.md):
 *
 *   import { sqlIdent, sqlStr, sqlLike } from '../utils/sql';
 *   const table = sqlIdent(process.env.HIVEMIND_TABLE ?? 'example');
 *   const sql = `SELECT * FROM "${table}" WHERE session_id = ${sqlStr(sessionId)}`;
 *
 * PII flags: note PII columns in the schema spec so `security-worker-bee` can audit
 * creds / creds_key / retention. deeplake-dataset-worker-bee flags PII; security-worker-bee audits.
 */
