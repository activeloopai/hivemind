# Example 05 - Add a column to a Deep Lake table

Goal: add a `tags` column to the memory table. Shows the single-sourced, healing-driven way to change the schema - one edit in `src/deeplake-schema.ts`, no hand-rolled ALTER.

## 1. Add the ColumnDef (the only schema edit)

In `src/deeplake-schema.ts`, add the column to `MEMORY_COLUMNS` with a sane `DEFAULT` so existing rows stay valid:

```ts
export const MEMORY_COLUMNS: readonly ColumnDef[] = Object.freeze([
  { name: "id",       sql: "TEXT NOT NULL DEFAULT ''" },
  { name: "path",     sql: "TEXT NOT NULL DEFAULT ''" },
  // ...existing columns...
  { name: "tags",     sql: "TEXT NOT NULL DEFAULT '[]'" },   // <-- new column, JSON array as text
]);
```

That is the entire schema change. Both paths read the same array:

- **New tables** - `buildCreateTableSql("memory_table", MEMORY_COLUMNS)` emits the column.
- **Existing tables** - `healMissingColumns(...)` SELECTs `information_schema.columns`, diffs against `MEMORY_COLUMNS`, and `ALTER TABLE ADD COLUMN`s only `tags`.

## 2. What you do NOT write

```ts
// WRONG - hand-rolled ALTER outside healMissingColumns (must-fix, guides/15)
await api.query(`ALTER TABLE "memory_table" ADD COLUMN tags TEXT DEFAULT '[]'`);

// WRONG - a second copy of the column list somewhere else (must-fix)
const MEMORY_COLS_FOR_INSERT = ["id", "path", "summary", "tags"];
```

The schema is single-sourced; healing applies the diff. There is no migration file to write.

## 3. Update the TS row shape

If a zod schema or a row type mirrors the row, add `tags` there too so the TS side stays honest (`guides/12`):

```ts
export const MemoryRowSchema = z.object({
  path: z.string(),
  summary: z.string().default(""),
  tags: z.string().default("[]"),   // mirror the new column
});
```

## 4. Test the definition + healing diff

```ts
import { describe, it, expect } from "vitest";
import { MEMORY_COLUMNS } from "../../src/deeplake-schema.js";

describe("memory schema", () => {
  it("includes the tags column with a default", () => {
    const tags = MEMORY_COLUMNS.find((c) => c.name === "tags");
    expect(tags).toBeDefined();
    expect(tags?.sql).toMatch(/DEFAULT/);
  });
});
```

You can also drive `healMissingColumns` against a fake client that reports the table is missing `tags`, and assert it issues exactly one targeted `ADD COLUMN tags` (not a blanket sweep).

## 5. Verify

```bash
npm run typecheck
node scripts/audit-schema-drift.mjs src/   # confirms no stray ALTER / duplicate column list
npm test
```

## See also

- `guides/15-deeplake-schema-healing.md`, `guides/12-strict-types-and-zod.md`.
- `src/deeplake-schema.ts` (`ColumnDef`, `MEMORY_COLUMNS`, `buildCreateTableSql`, `healMissingColumns`).
