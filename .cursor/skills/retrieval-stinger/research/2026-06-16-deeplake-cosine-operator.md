# Deep Lake `<#>` Cosine Operator

**Source:** `src/shell/grep-core.ts` (SearchOptions.queryEmbedding, `<#>` usage), `src/embeddings/columns.ts`.
**Retrieved:** 2026-06-16
**Status:** LOAD-BEARING. This is how semantic recall ranks.

---

## TL;DR

Semantic ranking uses Deep Lake's `<#>` operator - negative inner product - between the query
vector and the row's FLOAT4[] embedding column (`summary_embedding`, `message_embedding`, or
`chunk_embedding`). Smaller `<#>` = closer, so semantic results are ordered ascending.

---

## Key facts

- `<#>` is negative inner product. With L2-normalized vectors that's equivalent to cosine
  similarity up to sign. Closest match = most-negative value -> `ORDER BY dist ASC`.
- Operand columns are `FLOAT4[]`, 768-dim (`EMBEDDING_DIMS = 768` in `columns.ts`).
- The query vector arrives as `SearchOptions.queryEmbedding: number[] | null`. Non-null ->
  semantic branch. Null (daemon unreachable) -> lexical branch. The null-ness is the switch.
- No separate vector index server. The vectors live in the Deep Lake tables alongside the text.

---

## Why this matters

- The ranking primitive is a single SQL operator, not a service call. That's why there's no
  Qdrant/HNSW config to tune - tuning lives in coverage and hybrid weights instead.
- Because both the vector and the text are in the same row, hybrid scoring
  (`deeplake_hybrid_record`) can blend `<#>` and BM25 without a join.

---

## Implications for the guides

- Always present similarity as "smaller `<#>` is closer." A guide that treats it as a
  larger-is-better cosine will sort backwards.
- Dimension is fixed at 768. Any guide example using a query vector must use 768-dim.

---

## Caveats

- The exact normalization Deep Lake applies should be confirmed against the running version;
  the pipeline assumes L2-normalized 768-dim nomic output so `<#>` behaves like cosine.
- `<#>` only ranks; the line-wise regex refinement is a separate filter applied after.
