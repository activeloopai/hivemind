# No ORM - the ColumnDef Single Source & buildCreateTableSql

**Sources:**
- `src/deeplake-schema.ts` - `ColumnDef[]`, `buildCreateTableSql`, `healMissingColumns`, `validateSchema`
- `src/deeplake-api.ts`, `src/utils/sql`
- Activeloop Deep Lake docs - `USING deeplake`
- Hivemind data-layer code review

**Retrieved:** 2026-06-16

## Summary

Hivemind has no ORM - no Drizzle, no Prisma, no Kysely, no generated client. Deep Lake is reached over an HTTP SQL API, not a relational driver, and the SQL surface (tensors, `FLOAT4[]`, `<#>`, `deeplake_index`, `deeplake_hybrid_record`) is Deep Lake-specific. A general ORM would map none of it and would have nothing to bind to. So Hivemind owns a thin layer instead.

## The thin layer

| File | Role |
|---|---|
| `src/deeplake-schema.ts` | the `readonly ColumnDef[]` single source of truth + `buildCreateTableSql` / `healMissingColumns` / `validateSchema` |
| `src/deeplake-api.ts` | `DeeplakeApi` - the hardened HTTP client |
| `src/utils/sql` | `sqlStr` / `sqlLike` / `sqlIdent` guards |

## The ColumnDef single source

Every column for every table is declared once as a `ColumnDef` (`name`, `type`, optional `notNull` + `default`). Two consumers read the same list:

1. **`buildCreateTableSql`** renders `CREATE TABLE IF NOT EXISTS "<name>" (...) USING deeplake`.
2. **`healMissingColumns`** diffs the live table against the list and adds missing columns.

Because both read the same array, the schema cannot drift - as long as every column lives in the ColumnDef list. A column defined anywhere else (a hand-written `ALTER`, an inline string) breaks the heal diff and is a must-fix.

## buildCreateTableSql and `USING deeplake`

`buildCreateTableSql(tableName, columns)` produces the DDL with `USING deeplake` - mandatory, it backs the table with a Deep Lake dataset. `IF NOT EXISTS` is correct on CREATE TABLE; it is NOT correct on `ADD COLUMN` (the heal diff is the guard - see `research/2026-06-16-additive-schema-healing-500-not-409.md`). The table name passes `sqlIdent` first.

## Why this is deliberate

An ORM would hide the exact DDL and search operators that make Deep Lake useful, and would have nothing to generate against. Type safety comes from the ColumnDef list plus hand-written TypeScript interfaces over query results - no codegen step.

## Relevance to this stinger

Spine of `guides/07-no-orm-columndef.md` and `templates/columndef-table-spec.ts`. Drives hard rule #1 (single-source the schema).
