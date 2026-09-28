# 15 - Deep Lake Schema & Healing

The Deep Lake table schemas live in exactly one file: `src/deeplake-schema.ts`. This is the migrations-equivalent discipline. There are no migration files, no `migrate` command - there is one schema definition and a healing pass that brings real tables up to it.

## One source of truth

Each table is a frozen array of `ColumnDef`:

```ts
export interface ColumnDef {
  name: string;  // bare column identifier, e.g. "contributors"
  sql: string;   // column SQL minus the name, e.g. "TEXT NOT NULL DEFAULT '[]'"
}

export const MEMORY_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",       sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path",     sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "summary",  sql: "TEXT NOT NULL DEFAULT ''" },
  // ...
]);
export const SESSIONS_COLUMNS: readonly ColumnDef[] = Object.freeze([ /* ... */ ]);
```

Both `CREATE TABLE` (`buildCreateTableSql`) and the lazy healing path iterate over the **same** list. That is the whole point: adding a column is one edit here, with no second mirror in an ALTER path to keep in sync. A column list copied anywhere else is a **must-fix**.

## healMissingColumns: the only way to add a column to a live table

`healMissingColumns({...})` is the sanctioned path. Its rules (do not hand-roll the flow elsewhere):

1. **One SELECT against `information_schema.columns` per table** to read the current column set.
2. **Diff** against the `ColumnDef` list.
3. **`ALTER TABLE ADD COLUMN` only the genuinely missing columns** - never blanket, never `IF NOT EXISTS`. The single tolerated race ("already exists" from a concurrent writer) is caught and re-verified with a second SELECT.

A hand-rolled `ALTER TABLE` anywhere outside this function is a **must-fix**. So is a blanket "ALTER everything" sweep - it costs ~800ms per ALTER and produces noisier logs than a targeted diff. (Historical note in the source: a Deep Lake post-ALTER bug that briefly failed INSERTs was re-probed 2026-05-18 and is no longer reproducible; the SELECT-first rule survives on cost/clarity grounds.)

## Adding a column (the procedure)

See `examples/05`. The steps:

1. Add the `ColumnDef` to the right array in `src/deeplake-schema.ts` with a sane `DEFAULT` so existing rows are valid.
2. Nothing else changes the schema - `buildCreateTableSql` (new tables) and `healMissingColumns` (existing tables) both pick it up.
3. Update any zod schema / row type that mirrors the row shape so the TS side stays honest (`guides/12`).
4. Add a test asserting the column is in the definition and that healing would diff it in.

## Audit script

`scripts/audit-schema-drift.mjs` flags any `ALTER TABLE` / `ADD COLUMN` string in `src/` outside `deeplake-schema.ts`, and any column-name string-literal list that looks like a second copy of `MEMORY_COLUMNS` / `SESSIONS_COLUMNS`. See `scripts/README.md`.

## Common findings

- A hand-rolled `ALTER TABLE ADD COLUMN` outside `healMissingColumns` - **must-fix**.
- A blanket ALTER sweep instead of a targeted diff - **must-fix**.
- A second copy of a column list outside `deeplake-schema.ts` - **must-fix**.
- A new column with no `DEFAULT`, leaving existing rows invalid - **must-fix**.
- A row type / zod schema not updated to match a new column - **should-refactor**.

## Sources

- `src/deeplake-schema.ts` (`ColumnDef`, `MEMORY_COLUMNS`, `SESSIONS_COLUMNS`, `buildCreateTableSql`, `healMissingColumns`, `isMissingColumnError`).
- `research/2026-06-16-deeplake-schema-healing.md`.
