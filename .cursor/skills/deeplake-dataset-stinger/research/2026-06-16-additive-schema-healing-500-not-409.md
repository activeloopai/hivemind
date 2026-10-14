# Additive Schema Healing - `healMissingColumns`, 500-not-409, `validateSchema`

**Sources:**
- `src/deeplake-schema.ts` - `ColumnDef[]`, `buildCreateTableSql`, `healMissingColumns`, `validateSchema`
- Activeloop Deep Lake docs - `USING deeplake` tables, `ALTER TABLE ADD COLUMN` behavior
- Hivemind data-layer code review

**Retrieved:** 2026-06-16

## Summary

Hivemind has no migrations framework - no `up`/`down`, no migration history, no diff tool. Schema evolution is **additive healing**: the `ColumnDef[]` in `src/deeplake-schema.ts` is the desired state, and `healMissingColumns()` reconciles a live table to it by adding only the columns that are missing. It never drops, never re-adds, and never blanket-alters.

## The procedure

1. **Read the live columns** - one query:
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name = $1;
   ```
2. **Diff** - `missing = ColumnDef[].map(c => c.name)  -  liveColumnNames`.
3. **Add only the missing** - one `ALTER TABLE "<name>" ADD COLUMN ...` per missing column.
4. **Validate** - `validateSchema()` requires every NOT NULL column to carry a DEFAULT.

## Why never `IF NOT EXISTS` (the 500-not-409 finding)

On a duplicate `ADD COLUMN`, Deep Lake returns **HTTP 500**, not the 409 a conventional SQL engine returns. Two consequences:

- `IF NOT EXISTS` is not a safety net - the error is a generic 500, not a recognizable conflict.
- The DeeplakeApi retry layer treats 500 as retryable (`MAX_RETRIES=3`), so a blind `ADD COLUMN IF NOT EXISTS` against an existing column retries three times and still fails.

The correct guard is the **diff in step 2**, computed before any DDL runs - not `IF NOT EXISTS`. An `ADD COLUMN IF NOT EXISTS` in a heal is a must-fix.

## Why every NOT NULL column needs a DEFAULT

`validateSchema()` enforces it, and the reason is mechanical: a NOT NULL column added to a populated table has no value for the rows that already exist. The DEFAULT supplies it. A NOT NULL ColumnDef with no `default` is rejected before any DDL runs - fix the ColumnDef, not the table.

## Never blanket, never drop

Healing only adds columns named in the ColumnDef list and absent from the live table. Columns on the live table that are not in the ColumnDef list are left alone (the heal never drops). A blanket re-add corrupts existing tensors and burns Activeloop balance - also a must-fix.

## Relevance to this stinger

Spine of `guides/03-schema-healing.md`, `templates/migration-plan.md` (the additive heal plan), `examples/schema-heal-add-column.md`. Drives hard rules #2, #3, and #4.
