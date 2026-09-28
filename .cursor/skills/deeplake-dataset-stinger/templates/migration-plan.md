# Schema-Heal Plan - {{slug}}

**Date:** {{YYYY-MM-DD}}
**Author:** deeplake-dataset-worker-bee
**Persistence:** Activeloop Deep Lake over the HTTP SQL API
**Affected table:** {{table-name}}

> Hivemind has NO migrations framework. Schema evolution is additive healing via `healMissingColumns()`. This plan adds only the columns that are missing - never blanket, never `IF NOT EXISTS`.

---

## Goal

{{One paragraph: which column(s) are being added to which table, and why.}}

## Step 1 - declare in the ColumnDef list

In `src/deeplake-schema.ts`, add to `{{table}}Columns`:

```ts
{ name: '{{new_col}}', type: '{{TEXT|INT|BIGINT|BOOL|TIMESTAMP|JSONB|EMBEDDING}}', notNull: {{true|false}}, default: '{{...}}' }
```

> If `notNull: true`, a `default` is MANDATORY - `validateSchema()` rejects a NOT NULL column with no default before any DDL runs.

## Step 2 - the diff

| Source | Columns |
|---|---|
| ColumnDef list (desired) | {{list}} |
| Live table (`information_schema.columns`) | {{list}} |
| **Missing (to add)** | {{new_col, ...}} |

`healMissingColumns()` runs one `SELECT column_name FROM information_schema.columns WHERE table_name = '{{table}}'`, then `missing = desired - live`.

## Step 3 - the additive ALTER(s)

One statement per missing column. NEVER `IF NOT EXISTS`. NEVER blanket re-add.

```sql
ALTER TABLE "{{table}}" ADD COLUMN {{new_col}} {{TYPE}}{{ NOT NULL DEFAULT ...}};
```

> Reminder: a duplicate add returns HTTP 500 (not 409), and the DeeplakeApi retry layer retries 500 three times. The diff in Step 2 is the guard, not `IF NOT EXISTS`.

## Step 4 - validateSchema() gate

- [ ] Every NOT NULL column in the ColumnDef list carries a DEFAULT.
- [ ] No `IF NOT EXISTS` anywhere in the heal.
- [ ] No blanket re-add - only the missing columns.

## Verification queries (handed to `quality-worker-bee`)

```sql
-- 1. Column now exists on the live table
SELECT column_name FROM information_schema.columns
WHERE table_name = '{{table}}' AND column_name = '{{new_col}}';
-- expect one row

-- 2. For a NOT NULL+DEFAULT column, existing rows carry the default
SELECT count(*) FROM "{{table}}" WHERE {{new_col}} IS NULL;
-- expect 0

-- 3. If the column is searchable, confirm the operator works
SELECT id FROM "{{table}}"
ORDER BY {{new_col}} <#> $vec::float4[]
LIMIT 1;
```

## Rollback / recovery

- A heal only adds; there is no destructive rollback step.
- If the column was a mistake, remove it from the ColumnDef list so future heals stop expecting it; take it off the live table only as a deliberate, separately-reviewed change.
- For whole-dataset recovery from a bad bulk write, `revert_to` a prior commit or tag (`guides/04-versioning-branches.md`).

## Handoffs

- **`quality-worker-bee`** - runs the verification queries above; confirms green.
- **`security-worker-bee`** - review any new PII column.
- **`typescript-node-worker-bee`** - flag any data-access changes the TypeScript call sites must adopt.

## References

- `guides/03-schema-healing.md`
- `guides/01-schema-design.md` SSNOT-NULL-DEFAULT
- {{external Deep Lake / Activeloop docs URLs}}

---

*Template from `deeplake-dataset-stinger/templates/migration-plan.md`. See `examples/schema-heal-add-column.md` for a filled example.*
