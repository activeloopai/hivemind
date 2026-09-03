# Scripts - deeplake-dataset-stinger

Hivemind has no relational driver and no standalone shell tooling for the data layer. Verification and audits run as queries through `DeeplakeApi` (`src/deeplake-api.ts`), not as scripts against a connection string. This README documents the canonical query shapes the Bee uses; run them through the app's DeeplakeApi (which carries the auth headers, retry, Semaphore, and 402 handling).

## Schema-drift check (the heal diff)

The same query `healMissingColumns()` runs - lists the live columns so you can diff against the `ColumnDef[]` in `deeplake-schema.ts`:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = $1;
```

Diff `desired = ColumnDef[].map(c => c.name)` minus `live`. Anything in `desired` but not `live` is a missing column the heal would add (additively, never `IF NOT EXISTS`). Source: `guides/03-schema-healing.md`.

## NOT-NULL-needs-DEFAULT audit

`validateSchema()` enforces that every NOT NULL column carries a DEFAULT. Audit the ColumnDef list in code: any `{ notNull: true }` with no `default` is a must-fix before any heal. Source: `guides/01-schema-design.md`.

## Search sanity check

Confirm the search operator works for a table's embedding column:

```sql
SELECT id FROM "<table>"
ORDER BY <embedding_col> <#> $vec::float4[]
LIMIT 1;
```

For keyword relevance (NOT on the memory table - oid bug):

```sql
-- requires CREATE INDEX ... USING deeplake_index (<text_col>)
SELECT id FROM "<table>"
ORDER BY deeplake_hybrid_record($vec::float4[], $text, 0.7, 0.3) DESC
LIMIT 1;
```

Source: `guides/02-indexing.md`.

## Append-only version check

Confirm skills / rules / goals / kpis read the latest version and were never UPDATEd in place:

```sql
SELECT id, max(version) AS latest FROM "<table>"
GROUP BY id;
```

Source: `guides/06-embeddings-jsonb-versioning.md`.

## Conventions

- All checks are read-only - they never mutate data or schema.
- All checks run through `DeeplakeApi`, never a raw connection. Dynamic fragments pass `sqlIdent` / `sqlStr` / `sqlLike` (`src/utils/sql`).
- Each check cites its source guide.
