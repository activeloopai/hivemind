# Deep Lake Types - JSONB, FLOAT4[] Embeddings, Append-Only Versioning

**Sources:**
- `src/deeplake-schema.ts` - ColumnType, the `message` JSONB column, `EMBEDDING` -> `FLOAT4[]`, the `version` columns
- Activeloop Deep Lake docs - tensor types, JSONB, UPDATE behavior
- Hivemind data-layer code review

**Retrieved:** 2026-06-16

## Summary

Three storage decisions in the Hivemind ColumnDef schema: how schemaless payloads are stored (JSONB `message`), how embeddings are stored (`FLOAT4[]`, 768-dim), and how edits are recorded (append-only version-bump, never UPDATE).

## JSONB vs columns

| Use JSONB when | Use columns when |
|---|---|
| Genuinely schemaless (the `message` payload) | Filtered, sorted, or searched regularly |
| Shape varies per row | Shape is uniform |
| Read in full or not at all | Appears in a `WHERE` more than once a week |

**Rule of thumb:** if 80% of fields inside the JSONB are queried, they are columns. `message` is the canonical JSONB column - the turn payload that varies per row and is read whole. Flattening it into columns, or hiding a frequently-filtered field inside it, is a finding.

## Embeddings - `FLOAT4[]` 768-dim

The `EMBEDDING` ColumnType renders to `FLOAT4[]`: 768 single-precision floats per row, produced by **nomic-embed-text-v1.5**. The dimension is fixed by the model; mixing models silently breaks `<#>` cosine distance. `message_embedding` and `summary_embedding` are the embedding columns; both are searched with `<#>` (cast the query vector `::float4[]`).

## Append-only version-bump

Edits to **skills / rules / goals / kpis** never UPDATE. They INSERT a new row with `version + 1`; reads take the latest via `ORDER BY version DESC`.

### Why - the UPDATE-coalescing quirk

Deep Lake has an UPDATE-coalescing quirk: a true `UPDATE` can coalesce or silently lose writes. The append-only version-bump sidesteps it entirely - every edit is a fresh row, and the read always picks the highest version. A true UPDATE on these four tables is a must-fix.

This row-level history is distinct from dataset versioning (commit / branch / tag / revert_to), which operates on the whole dataset (`research/2026-06-16-versioning-branches-tags.md`). Do not conflate them.

## Relevance to this stinger

Spine of `guides/06-embeddings-jsonb-versioning.md` and `guides/01-schema-design.md`. Drives hard rules #5 and #6.
