# 06 - Embeddings, JSONB & Append-Only Versioning

Three intertwined storage decisions: how embeddings are stored (`FLOAT4[]`), how schemaless payloads are stored (JSONB `message`), and how edits are recorded (append-only version-bump). deeplake-dataset-worker-bee owns the storage shape; retrieval is `retrieval-worker-bee`.

Source: `research/2026-06-16-deeplake-types-jsonb-embedding-versioning.md`.

## Embeddings - `FLOAT4[768]`

All Hivemind embeddings are stored as `FLOAT4[]`, 768-dimensional, from **nomic-embed-text-v1.5**. Declared in the schema as the `EMBEDDING` ColumnType, which renders to `FLOAT4[]`:

```ts
{ name: 'message_embedding', type: 'EMBEDDING' }   // -> FLOAT4[]  (768-dim)
{ name: 'summary_embedding', type: 'EMBEDDING' }
```

### Why `FLOAT4[]`

- `FLOAT4` (single-precision) is the storage type Deep Lake uses for the tensor; 768 single-precision floats per row.
- The dimension is fixed by the model. Do not store a 768-dim vector next to a column expecting a different dim - mixing models silently breaks `<#>` distance.
- Query vectors must be cast `::float4[]` to match (see `guides/05-querying-deeplakeapi.md`).

### Searching embeddings

`<#>` cosine distance, optionally combined with BM25 via hybrid. The operator choice is `guides/02-indexing.md`. deeplake-dataset-worker-bee picks the column shape and the operator, then hands chunking / reranking / eval to `retrieval-worker-bee`.

## JSONB - the `message` column

`message` is the canonical JSONB column: a genuinely schemaless turn payload. JSONB is right here because the shape varies per row and the column is read in full, not filtered field-by-field.

### The 80/20 rule

| Keep in JSONB when | Promote to a column when |
|---|---|
| Shape varies per row | Shape is uniform |
| Read in full or not at all | Filtered, sorted, or searched |
| Tool blobs, raw turn records | Anything in a `WHERE` more than once a week |

Flattening `message` into columns "for convenience" is a must-fix (it breaks the schemaless contract). Hiding a frequently-filtered field inside `message` is also a finding (it should be a column).

## Append-only version-bump

Edits to **skills / rules / goals / kpis** are never UPDATEs. They INSERT a new row with `version + 1`; the latest wins via `ORDER BY version DESC`.

```sql
-- edit a skill: do NOT update in place
INSERT INTO "skills" (id, ..., version)
SELECT id, ..., version + 1 FROM "skills"
WHERE id = $1 ORDER BY version DESC LIMIT 1;

-- read the current skill
SELECT * FROM "skills" WHERE id = $1 ORDER BY version DESC LIMIT 1;
```

### Why append-only - the UPDATE-coalescing quirk

Deep Lake has an UPDATE-coalescing quirk: a true `UPDATE` can coalesce or silently lose writes. The append-only version-bump sidesteps it entirely - every edit is a fresh row, and the read always takes the highest version. A true `UPDATE` on skills / rules / goals / kpis is a must-fix.

This is row-level history and is distinct from dataset versioning (commit / branch / tag / revert_to in `guides/04-versioning-branches.md`). Do not conflate the two.

## Memory and the BM25 caveat

The memory table stores `message` (JSONB) and `message_embedding` (`FLOAT4[]`). Its relevance search uses `<#>` vector or hybrid, NOT a standalone BM25 `deeplake_index` - the memory table hits a Deep Lake oid bug that disables BM25 there. See `guides/02-indexing.md`.

## Cross-references

- `01-schema-design.md` - the ColumnDef types behind EMBEDDING and JSONB.
- `02-indexing.md` - `<#>` vector, hybrid, and the memory-table BM25 caveat.
- `04-versioning-branches.md` - dataset-level versioning, distinct from this row-level version-bump.
- Hand off retrieval / recall to `retrieval-worker-bee`.
