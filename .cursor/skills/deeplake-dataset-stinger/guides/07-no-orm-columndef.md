# 07 - No ORM: the ColumnDef Single Source

Hivemind has no ORM. There is no Drizzle, no Prisma, no Kysely, no generated client. The schema is one `readonly ColumnDef[]` in `src/deeplake-schema.ts`, and `buildCreateTableSql` renders it to `USING deeplake` DDL. This guide explains why, and how to work within it.

Source: `research/2026-06-16-no-orm-columndef-deeplakeapi.md`.

## Why no ORM

Deep Lake is reached over an HTTP SQL API, not a relational driver. There is no relational connection for an ORM to bind to, and the SQL surface (tensors, `FLOAT4[]`, `<#>`, `deeplake_index`, `deeplake_hybrid_record`) is Deep Lake-specific - a general ORM would map none of it. So Hivemind owns its own thin layer:

- `src/deeplake-schema.ts` - the `ColumnDef[]` single source of truth.
- `src/deeplake-api.ts` - `DeeplakeApi`, the hardened HTTP client.
- `src/utils/sql` - `sqlStr` / `sqlLike` / `sqlIdent` guards.

This is deliberate. An ORM would hide the exact DDL and search operators that make Deep Lake useful, and would have nothing to generate against.

## The ColumnDef single source

Every column for every table is declared once:

```ts
export const memoryColumns: readonly ColumnDef[] = [
  { name: 'id', type: 'TEXT', notNull: true, default: "''" },
  { name: 'session_id', type: 'TEXT' },
  { name: 'message', type: 'JSONB' },
  { name: 'message_embedding', type: 'EMBEDDING' },   // -> FLOAT4[] 768-dim
  { name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'now()' },
] as const;
```

Two consumers read this list:

1. **`buildCreateTableSql`** - renders the `CREATE TABLE IF NOT EXISTS "<name>" (...) USING deeplake`.
2. **`healMissingColumns`** - diffs the live table against this list and adds missing columns (see `guides/03-schema-healing.md`).

Because both read the same array, the schema cannot drift - as long as every column lives in the ColumnDef list. A column defined anywhere else (a hand-written `ALTER`, an inline string) breaks the heal diff and is a must-fix.

## buildCreateTableSql and `USING deeplake`

`buildCreateTableSql(tableName, columns)` produces:

```sql
CREATE TABLE IF NOT EXISTS "memory" (
  id TEXT NOT NULL DEFAULT '',
  session_id TEXT,
  message JSONB,
  message_embedding FLOAT4[],
  created_at TIMESTAMP NOT NULL DEFAULT now()
) USING deeplake;
```

`USING deeplake` is mandatory - it tells the engine to back the table with a Deep Lake dataset rather than any default storage. `IF NOT EXISTS` is correct on CREATE TABLE (the engine handles it); it is NOT correct on `ADD COLUMN` (the heal diff is the guard - see `guides/03-schema-healing.md`).

The table name passes through `sqlIdent` before it reaches the DDL - it comes from env (`HIVEMIND_TABLE`, etc.) and must match `[A-Za-z_][A-Za-z0-9_]*`.

## Working within the no-ORM model

- **Add a column** -> add a `ColumnDef` to the list, let `healMissingColumns` reconcile. Never hand-write the `ALTER` outside the heal path.
- **Query** -> build guarded SQL and send it through `DeeplakeApi` (`guides/05-querying-deeplakeapi.md`). There is no query builder; SQL is SQL.
- **Type safety** -> the `ColumnDef` list and TypeScript interfaces over query results carry the types. There is no codegen step.

## Output an ADR

Use `templates/ADR.md` when a structural decision needs recording (a new table, a storage-backend change, a versioning policy). The ADR should:

- State which of the 7 tables is affected.
- State the ColumnDef changes (added / promoted columns, NOT NULL + DEFAULT pairings).
- State the search operators the table will use.
- Capture trade-offs honestly; cite this guide.

## Cross-references

- `01-schema-design.md` - the ColumnDef types and the NOT NULL + DEFAULT rule.
- `03-schema-healing.md` - how the heal reads the ColumnDef list.
- `05-querying-deeplakeapi.md` - the DeeplakeApi client and SQL guards.
- `templates/columndef-table-spec.ts` - a ColumnDef starter.
