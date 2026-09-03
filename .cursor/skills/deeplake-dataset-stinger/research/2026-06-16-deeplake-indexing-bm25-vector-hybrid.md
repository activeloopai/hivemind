# Deep Lake Indexing - BM25, Vector, Hybrid, Lookup

**Sources:**
- Activeloop Deep Lake docs - `deeplake_index` (BM25), `<#>` vector operator, `deeplake_hybrid_record`
- `src/deeplake-api.ts`, `src/deeplake-schema.ts` - `ensureLookupIndex`, embedding tensors
- Hivemind data-layer code review

**Retrieved:** 2026-06-16

## Summary

Deep Lake offers four ways to find rows in Hivemind: a marker-cached lookup index for hot equality, BM25 full-text via `deeplake_index`, vector cosine via `<#>`, and a combined hybrid via `deeplake_hybrid_record`. Choosing wrong wastes Activeloop balance and returns worse results.

## The four strategies

| Strategy | Mechanism | Best for |
|---|---|---|
| Lookup | `ensureLookupIndex(table, col)` (marker-cached) | hot equality filter (`= $1`) |
| BM25 | `CREATE INDEX ... USING deeplake_index (col)` | keyword relevance |
| Vector | `ORDER BY col <#> $vec::float4[]` | semantic similarity on `FLOAT4[]` |
| Hybrid | `deeplake_hybrid_record($vec::float4[], $text, w1, w2)` | keyword + semantic combined |

## Lookup indexes are marker-cached

`ensureLookupIndex` checks a cache marker before issuing the `CREATE INDEX`, so the build happens once per table+column; later calls are cheap no-ops. This is the right tool for a column filtered repeatedly by equality.

## BM25 is disabled on the memory table (oid bug)

A Deep Lake oid bug makes `deeplake_index` unreliable on the memory table. So relevance on memory routes through `<#>` vector or hybrid, never a standalone BM25 index. A BM25 index attempted on the memory table is a must-fix. Other tables (sessions, skills, rules, goals, kpis, codebase) can use BM25 normally.

## Vector search

`<#>` is cosine distance over a `FLOAT4[]` embedding (768-dim, nomic-embed-text-v1.5). The query vector must be cast `::float4[]` to match the stored tensor type. Forgetting the cast errors the query.

## Hybrid search

`deeplake_hybrid_record($vec::float4[], $text, w1, w2)` blends the vector arm and the BM25 text arm into one ranking, with weights `w1` (vector) and `w2` (text). On the memory table, hybrid still works because the vector arm carries it even though the standalone BM25 index is disabled. Weight tuning is its own note (`2026-06-16-deeplake-search-hybrid-weighting.md`).

## Relevance to this stinger

Spine of `guides/02-indexing.md` and `templates/indexes-decision-tree.md`. Drives hard rule #7 and the memory-table caveat.
