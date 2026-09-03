# Indexes / Search Decision Tree

Printable cheat sheet. Keep within arm's reach during schema review. Source: `guides/02-indexing.md`.

---

## Step 1 - What is the column type and the question?

| Column / question | Strategy |
|---|---|
| Scalar / TEXT, hot equality (`= $1`) | Lookup index via `ensureLookupIndex` (marker-cached) |
| TEXT, "best keyword match" | BM25 via `CREATE INDEX ... USING deeplake_index` |
| `FLOAT4[]` embedding, "most similar meaning" | Vector `<#>` cosine |
| Both keyword and semantic | Hybrid `deeplake_hybrid_record($vec::float4[], $text, w1, w2)` |
| `JSONB` payload read in full | No index - it is a blob, not a filter |

## Step 2 - The memory-table caveat

| Table | BM25 (`deeplake_index`) allowed? |
|---|---|
| memory | NO - Deep Lake oid bug. Route relevance through `<#>` vector or hybrid. |
| sessions / skills / rules / goals / kpis / codebase | Yes |

## Step 3 - Tuning hybrid weights

| Want more... | Push weights |
|---|---|
| Exact-term precision | toward the text weight (e.g. 0.5 / 0.5 or 0.3 / 0.7) |
| Paraphrase / semantic recall | toward the vector weight (e.g. 0.8 / 0.2) |
| Balanced default | 0.7 vector / 0.3 text |

## Must-have

- [ ] **Lookup index on every hot equality column** via `ensureLookupIndex` (marker-cached so it builds once).
- [ ] **`::float4[]` cast on every query vector** for `<#>` and hybrid.
- [ ] **Vector or hybrid for relevance on the memory table** (BM25 is disabled there).
- [ ] **Every searched embedding is `FLOAT4[]` 768-dim** (nomic-embed-text-v1.5).

## Avoid

- [ ] BM25 `deeplake_index` on the memory table (oid bug).
- [ ] Re-issuing `CREATE INDEX` on every call instead of `ensureLookupIndex`.
- [ ] Forgetting the `::float4[]` cast on the query vector.
- [ ] Vector-only search where users filter by exact identifiers (use hybrid or BM25).
- [ ] Indexing a column nothing filters or searches on.

## Through DeeplakeApi

- [ ] All queries go through `DeeplakeApi` (retry on 429/5xx, Semaphore(5), 402 detection).
- [ ] Table / column names pass `sqlIdent`; string and LIKE values pass `sqlStr` / `sqlLike`.

---

*Source: `guides/02-indexing.md`, `research/2026-06-16-deeplake-indexing-bm25-vector-hybrid.md`, `research/2026-06-16-deeplake-search-hybrid-weighting.md`.*
