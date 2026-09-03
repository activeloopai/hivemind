# Worked Example - Additive Schema Heal (Add a NOT NULL Column)

Add a NOT NULL `summary_embedding` column to the live `skills` table via `healMissingColumns()` - additively, with a DEFAULT, never `IF NOT EXISTS`. Source: `guides/03-schema-healing.md`, `guides/01-schema-design.md`, `templates/migration-plan.md`.

---

## Context

- **Persistence:** Activeloop Deep Lake over the HTTP SQL API.
- **Table:** `skills`, live and populated, append-only version history.
- **Goal:** add `summary_embedding FLOAT4[] NOT NULL` so summaries can be searched semantically.
- **There is no migrations framework.** This is an additive heal, not a migration.
- **Naive single-step that would fail:**
  ```sql
  -- DO NOT DO THIS
  ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS summary_embedding FLOAT4[];
  ```
  Deep Lake returns HTTP 500 (not 409) on a duplicate add, so `IF NOT EXISTS` is no guard, and the DeeplakeApi retry layer would retry the 500 three times and still fail. The guard is the diff, not `IF NOT EXISTS`. Source: `guides/03-schema-healing.md` SS500-not-409.

## Step 1 - declare the column in the ColumnDef list

In `src/deeplake-schema.ts`, add the column to `skillsColumns`:

```ts
{ name: 'summary_embedding', type: 'EMBEDDING' },   // -> FLOAT4[] 768-dim
```

If the column must be NOT NULL, it MUST carry a default - `validateSchema()` enforces it:

```ts
// example of a NOT NULL column add (illustrative)
{ name: 'indexed_at', type: 'TIMESTAMP', notNull: true, default: 'now()' }
```

## Step 2 - validateSchema() gate

`validateSchema()` runs before any DDL. It rejects any NOT NULL column with no DEFAULT. A NOT NULL column added to a populated table with no default would break every existing row, so this gate fails fast - fix the ColumnDef, not the table.

## Step 3 - healMissingColumns() diffs and adds

```
1. SELECT column_name FROM information_schema.columns WHERE table_name = 'skills';
2. missing = skillsColumns.map(c => c.name)  -  liveColumnNames
   -> missing = ['summary_embedding']
3. for each missing column, one ALTER:
```

```sql
ALTER TABLE "skills" ADD COLUMN summary_embedding FLOAT4[];
-- for a NOT NULL column it would be:
-- ALTER TABLE "skills" ADD COLUMN indexed_at TIMESTAMP NOT NULL DEFAULT now();
```

Only the missing column is added. Columns already on the live table are left untouched - the heal never re-adds and never drops. No `IF NOT EXISTS`.

| Step | Behavior | Notes |
|---|---|---|
| `information_schema` read | one SELECT | the only introspection call |
| diff | set difference | defined minus live |
| `ADD COLUMN` | one per missing column | NEVER `IF NOT EXISTS`, NEVER blanket |
| `validateSchema()` | NOT NULL needs DEFAULT | runs before DDL |

## Step 4 - verification (handed to `quality-worker-bee`)

```sql
-- 1. Column exists on the live table
SELECT column_name FROM information_schema.columns
WHERE table_name = 'skills' AND column_name = 'summary_embedding';
-- expect one row

-- 2. For a NOT NULL+DEFAULT column, existing rows carry the default
SELECT count(*) FROM "skills" WHERE indexed_at IS NULL;
-- expect 0

-- 3. The new embedding is searchable
SELECT id FROM "skills"
ORDER BY summary_embedding <#> $vec::float4[]
LIMIT 1;
```

## Rollback

There is no destructive rollback path in a heal - the heal only adds. If the column was a mistake, remove it from the ColumnDef list (so future heals stop expecting it) and, if it must come off the live table, do that as a deliberate, separately-reviewed change. For dataset-level recovery from a bad bulk write, `revert_to` a prior commit (`guides/04-versioning-branches.md`).

## Why this is a heal, not a migration

- No `up` / `down`, no migration history, no `drizzle-kit`.
- The ColumnDef list is the desired state; the live table is reconciled to it additively.
- The retry behavior on 500 is exactly why the diff (not `IF NOT EXISTS`) is the guard.

## References

- `guides/03-schema-healing.md` SS500-not-409, SSvalidateSchema.
- `guides/01-schema-design.md` SSNOT-NULL-DEFAULT.
- `templates/migration-plan.md` (the additive heal-plan skeleton).
- `research/2026-06-16-additive-schema-healing-500-not-409.md`.

---

*Forged 2026-06-16.*
