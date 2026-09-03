# 01 - Schema Design

Single-source schema. Every column is a `ColumnDef` in `src/deeplake-schema.ts`; the type system is the contract.

Source: `research/2026-06-16-no-orm-columndef-deeplakeapi.md`, `research/2026-06-16-deeplake-types-jsonb-embedding-versioning.md`.

## The 7 tables

Hivemind's Deep Lake dataset is seven tables, all single-sourced in `deeplake-schema.ts`:

| Table | Purpose | Env override |
|---|---|---|
| memory | turn-level memory records | `HIVEMIND_TABLE` |
| sessions | session metadata | `HIVEMIND_SESSIONS_TABLE` |
| skills | append-only skill versions | `HIVEMIND_SKILLS_TABLE` |
| rules | append-only rule versions | `HIVEMIND_RULES_TABLE` |
| goals | append-only goal versions | - |
| kpis | append-only KPI versions | - |
| codebase | indexed code chunks | - |

Each is created `CREATE TABLE IF NOT EXISTS "<name>" (...) USING deeplake` via `buildCreateTableSql`, which renders the `ColumnDef[]` for that table. `IF NOT EXISTS` is fine on CREATE TABLE (Deep Lake handles it); it is NOT fine on `ADD COLUMN` - see `guides/03-schema-healing.md`.

## The ColumnDef shape

A column is declared once:

```ts
export interface ColumnDef {
  name: string;            // tensor name, must pass sqlIdent
  type: ColumnType;        // 'TEXT' | 'INT' | 'BIGINT' | 'BOOL' | 'TIMESTAMP' | 'JSONB' | 'EMBEDDING'
  notNull?: boolean;       // if true, MUST set default (validateSchema enforces)
  default?: string;        // SQL default literal
}
```

`EMBEDDING` renders to `FLOAT4[]` (768-dim, nomic-embed-text-v1.5). `JSONB` is for genuinely schemaless payloads (`message`).

## Type selection - the cheat sheet

### Text
- `TEXT` for strings. There is no `varchar(n)` ceremony on the Deep Lake SQL surface; store text as text.

### Integers
- `BIGINT` for IDs, counts, and `version`. `INT` for fixed-range values.

### Booleans
- `BOOL`. Keep non-null with a default unless "unknown" is a valid third state.

### Timestamps
- `TIMESTAMP` for points in time, stored UTC. Set `notNull` with a `now()`-style default where the row should always carry a creation time.

### `JSONB` vs columns

Apply the 80/20 test from `research/2026-06-16-deeplake-types-jsonb-embedding-versioning.md`:

| Use JSONB when | Use columns when |
|---|---|
| Schema varies per row (the `message` blob) | Schema is uniform |
| Field is read in full or not at all | Field is filtered, sorted, or searched |
| Payloads, tool blobs, raw records | Anything that appears in a `WHERE` more than once a week |

`message` is the canonical JSONB column. Do NOT flatten it into columns just because it is convenient; do NOT hide queried fields inside it.

### Embeddings

```ts
{ name: 'message_embedding', type: 'EMBEDDING' }   // -> FLOAT4[] 768-dim
{ name: 'summary_embedding', type: 'EMBEDDING' }
```

All embeddings are 768-dim nomic-embed-text-v1.5. Searched with the `<#>` cosine operator (see `guides/02-indexing.md`). Storage shape only - retrieval / reranking is `retrieval-worker-bee`.

## Constraints

### NOT NULL + DEFAULT (the pairing rule)

`validateSchema()` requires every NOT NULL column to carry a DEFAULT. This is not optional: a NOT NULL column with no default cannot be added to a populated table, and `healMissingColumns` would abort. State the default in the ColumnDef:

```ts
{ name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'now()' }
{ name: 'version', type: 'BIGINT', notNull: true, default: '1' }
```

### Append-only version columns

skills / rules / goals / kpis carry a `version BIGINT NOT NULL DEFAULT 1`. Edits INSERT version+1; reads take the latest via `ORDER BY version DESC`. There is no UPDATE path - see `guides/06-embeddings-jsonb-versioning.md` for the UPDATE-coalescing quirk that makes this mandatory.

## Identifiers and guards

Every column `name` and table name must pass `sqlIdent` (`[A-Za-z_][A-Za-z0-9_]*`). A name that fails the guard cannot be created or healed. See `guides/05-querying-deeplakeapi.md`.

## PII and security flags

Mark columns that hold PII so `security-worker-bee` can audit creds, encryption, and retention. Note the PII columns in the schema spec and surface them in any review with file:line. deeplake-dataset-worker-bee flags PII; security-worker-bee audits the controls (including `creds_key` and BYOC credentials).

## Cross-references

- `02-indexing.md` - every column you filter or search on needs an index plan (lookup / BM25 / vector / hybrid).
- `03-schema-healing.md` - adding a column after launch is an additive heal, never a blanket migration.
- `06-embeddings-jsonb-versioning.md` - the JSONB, embedding, and version-bump details.
- `07-no-orm-columndef.md` - why there is no ORM and how `buildCreateTableSql` renders the ColumnDef.
