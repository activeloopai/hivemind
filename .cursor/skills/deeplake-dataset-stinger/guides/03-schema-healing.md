# 03 - Schema Healing

Hivemind has NO migrations framework. Schema evolution is additive healing: `healMissingColumns()` brings a live table up to the `ColumnDef` contract by adding only the columns that are missing.

Source: `research/2026-06-16-additive-schema-healing-500-not-409.md`.

## Why healing, not migrations

The `ColumnDef[]` in `src/deeplake-schema.ts` is the single source of truth. A live Deep Lake table may lag behind it (a column was added to the schema in code but never created on the table). Healing reconciles the two - additively, never destructively.

There is no `drizzle-kit`-style diff tool, no migration history, no `up` / `down`. There is one function that reads the live columns and adds the missing ones.

## The procedure

```
┌────────────────────────────┐
│ 1. SELECT column_name FROM  │  one query, information_schema.columns
│    information_schema        │
├────────────────────────────┤
│ 2. diff vs ColumnDef[]      │  set difference: defined - live = missing
├────────────────────────────┤
│ 3. ALTER TABLE ADD COLUMN   │  one per missing column, NEVER IF NOT EXISTS
│    (only the missing ones)  │
├────────────────────────────┤
│ 4. validateSchema()         │  every NOT NULL column must have a DEFAULT
└────────────────────────────┘
```

### Step 1 - read the live columns

One query:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = $1;
```

This is the only introspection call. It returns the column set as the table actually exists.

### Step 2 - diff against the ColumnDef list

```
missing = ColumnDef[].map(c => c.name)  -  liveColumnNames
```

A simple set difference. Only names in the ColumnDef list but NOT on the live table get added. Columns that exist on the live table but not in the ColumnDef list are left alone - healing never drops.

### Step 3 - add only the missing columns

For each missing column, exactly one statement:

```sql
ALTER TABLE "skills" ADD COLUMN summary_embedding FLOAT4[];
```

Two hard rules here:

1. **Never blanket re-add.** Only the diff. Re-adding a column that already exists corrupts the tensor and burns balance.
2. **Never `ADD COLUMN IF NOT EXISTS`.** This is the critical one - see below.

## Why never `IF NOT EXISTS` (500-not-409)

On a duplicate column add, Deep Lake returns **HTTP 500**, not the 409 a normal SQL engine would return. `IF NOT EXISTS` is not a safety net here, because:

- The error is a generic 500, not a recognizable "already exists" conflict.
- The DeeplakeApi retry layer treats 500 as retryable (see `guides/05-querying-deeplakeapi.md`), so a blind `ADD COLUMN IF NOT EXISTS` that hits an existing column would retry three times and still fail.

The correct guard is the **diff in step 2**, not `IF NOT EXISTS`. Compute the missing set first; only add what is genuinely absent. An `ADD COLUMN IF NOT EXISTS` in a heal is a must-fix.

Source: `research/2026-06-16-additive-schema-healing-500-not-409.md`.

## Step 4 - validateSchema()

After healing, `validateSchema()` enforces the contract:

- Every NOT NULL column MUST carry a DEFAULT.

A NOT NULL column with no default cannot be added to a populated table - the rows that already exist have no value for it. So the heal of any NOT NULL column must include the default from the ColumnDef:

```sql
ALTER TABLE "memory" ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now();
```

If the ColumnDef declares `notNull: true` without a `default`, `validateSchema()` rejects it before any DDL runs. Fix the ColumnDef, not the table.

## Worked add: a NOT NULL column with a default

See `examples/schema-heal-add-column.md` for the full example. The shape:

1. Add the column to the `ColumnDef[]` in `deeplake-schema.ts` with `notNull: true, default: '...'`.
2. `validateSchema()` confirms the default is present.
3. `healMissingColumns()` diffs, finds the new column missing on the live table, and issues exactly one `ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT ...`.
4. Verification query (handed to `quality-worker-bee`) confirms the column exists and back-filled rows carry the default.

## Checklist

Use `templates/migration-plan.md` (the additive heal plan). Every heal plan must:

- [ ] Name the table and the new column(s).
- [ ] Show the ColumnDef diff (defined minus live).
- [ ] State the exact `ALTER TABLE ADD COLUMN` per missing column.
- [ ] Confirm every NOT NULL column carries a DEFAULT (the `validateSchema()` gate).
- [ ] Confirm NO `IF NOT EXISTS` and NO blanket re-add.
- [ ] Specify verification queries (handed to `quality-worker-bee`).

## Cross-references

- `01-schema-design.md` - the NOT NULL + DEFAULT pairing rule.
- `05-querying-deeplakeapi.md` - why 500 is retried, and the SQL guards around the ALTER.
- `07-no-orm-columndef.md` - the ColumnDef single source the diff reads from.
- `templates/migration-plan.md` - the additive heal-plan skeleton.
