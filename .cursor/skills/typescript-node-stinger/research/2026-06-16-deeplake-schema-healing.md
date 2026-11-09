# 2026-06-16 - Deep Lake schema healing (single-source + healMissingColumns)

Authored 2026-06-16 from `src/deeplake-schema.ts`. Repo is the source of truth.

## Sources

- `src/deeplake-schema.ts` (the doc comment, `ColumnDef`, `MEMORY_COLUMNS`, `SESSIONS_COLUMNS`, `buildCreateTableSql`, `healMissingColumns`, `isMissingColumnError`).

## Summary

The Deep Lake table schemas live in exactly one file. Each table is a frozen `readonly ColumnDef[]` (`{ name, sql }`). Both `CREATE TABLE` (`buildCreateTableSql`) and the lazy healing path iterate the same array, so adding a column is a single edit with no second mirror to keep in sync.

`healMissingColumns` is the only sanctioned path to add a column to a live table. Its documented rules:

1. One SELECT against `information_schema.columns` per table to read the current column set.
2. Diff against the `ColumnDef` list.
3. `ALTER TABLE ADD COLUMN` only the genuinely missing columns - never blanket, never `IF NOT EXISTS`. The single tolerated race (an "already exists" error from a concurrent writer) is caught and re-verified with a second SELECT.

The source notes a historical Deep Lake post-ALTER bug (a ~30s window of failing INSERTs after each ALTER) that motivated a marker-cached path; it was re-probed against `api.deeplake.ai` on 2026-05-18 (71/71 INSERTs OK, first success ~2ms after ALTER) and is no longer reproducible. The SELECT-first rule survives anyway because each ALTER costs ~800ms and a targeted diff produces clearer logs than a blanket sweep.

## Key facts the guides depend on

- A hand-rolled `ALTER TABLE` outside `healMissingColumns` is a must-fix; so is a blanket sweep and a second copy of a column list (`guides/15`).
- New columns carry a `DEFAULT` so existing rows stay valid.

## Relevance

- `guides/15-deeplake-schema-healing.md`, `examples/05`, `scripts/audit-schema-drift.mjs`.
