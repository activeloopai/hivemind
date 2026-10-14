# 02 - Indexing

Pick the right index and search operator per query shape + column type. Choosing wrong is one of the top causes of slow reads and wasted Activeloop balance.

Source: `research/2026-06-16-deeplake-indexing-bm25-vector-hybrid.md`, `research/2026-06-16-deeplake-search-hybrid-weighting.md`.

## The decision tree

Ask, in order:

1. **What is the column type?** A `FLOAT4[]` embedding takes vector search; `TEXT` takes BM25 or lookup; scalar takes lookup.
2. **What is the predicate shape?** Equality, full-text relevance, semantic similarity, or both.
3. **Is it the memory table?** BM25 is disabled there (oid bug) - route relevance through vector or hybrid instead.
4. **Is the index hot enough to cache?** `ensureLookupIndex` is marker-cached so it builds once.

## The four search strategies

| Strategy | Best for | How |
|---|---|---|
| **Lookup index** | Hot equality filter on a scalar / TEXT column | `ensureLookupIndex` (marker-cached so it builds once) |
| **BM25 full-text** | Keyword relevance ranking | `CREATE INDEX ... USING deeplake_index` (NOT on memory) |
| **Vector (`<#>`)** | Semantic similarity on a `FLOAT4[]` embedding | `ORDER BY embedding <#> $vec::float4[]` cosine |
| **Hybrid** | Both relevance and similarity in one ranking | `deeplake_hybrid_record($vec::float4[], $text, w1, w2)` |

## Lookup indexes

For a column you filter on repeatedly with equality:

```ts
await ensureLookupIndex(table, 'session_id');
```

`ensureLookupIndex` is marker-cached: it checks a cache marker before issuing the `CREATE INDEX`, so the build happens once per table+column and subsequent calls are cheap no-ops. This is the right tool for hot equality filters (`WHERE session_id = $1`).

## BM25 full-text (`deeplake_index`)

For keyword relevance:

```sql
CREATE INDEX ON "skills" USING deeplake_index (description);
```

BM25 ranks by term frequency / inverse document frequency. It is the right tool when the query is "find rows whose text best matches these words".

**Hard constraint: BM25 is disabled on the memory table.** A Deep Lake oid bug makes `deeplake_index` unreliable on memory, so relevance there routes through vector or hybrid search instead. Attempting a BM25 index on memory is a must-fix.

## Vector search (`<#>`)

For semantic similarity on a `FLOAT4[]` embedding (768-dim, nomic-embed-text-v1.5):

```sql
SELECT * FROM "memory"
ORDER BY message_embedding <#> $vec::float4[]
LIMIT $k;
```

`<#>` is cosine distance. The query vector must be cast `::float4[]` to match the stored tensor type. This is the right tool for "find rows most similar to this embedding".

## Hybrid search (`deeplake_hybrid_record`)

When you want keyword relevance AND semantic similarity combined into one ranking:

```sql
SELECT * FROM "skills"
ORDER BY deeplake_hybrid_record(
  $vec::float4[],   -- query embedding
  $text,            -- query text for BM25
  0.7,              -- w1: vector weight
  0.3               -- w2: text weight
) DESC
LIMIT $k;
```

The two weights `w1` / `w2` trade similarity against relevance. Tuning them is the heart of `research/2026-06-16-deeplake-search-hybrid-weighting.md`: start at 0.7 / 0.3, push toward text when exact terms matter, toward vector when paraphrase recall matters. On the memory table, hybrid still works because the vector arm carries it even though the standalone BM25 index is disabled.

## Choosing between them

- **Exact key lookup** -> lookup index. Never scan when you can index an equality.
- **"Best keyword match"** -> BM25 (off-memory) or the text arm of hybrid.
- **"Most similar meaning"** -> `<#>` vector.
- **"Relevant and similar"** -> hybrid; tune `w1` / `w2`.

## Anti-patterns

- **BM25 on the memory table.** Hits the oid bug. Must-fix - route through vector or hybrid.
- **Re-issuing `CREATE INDEX` on every call.** Use `ensureLookupIndex` so the marker cache builds it once.
- **Forgetting the `::float4[]` cast on the query vector.** The operator needs matching tensor types or it errors.
- **Vector-only where exact terms matter.** If users search by exact identifiers, hybrid (or BM25) beats pure similarity.
- **Indexing columns nothing filters on.** Every index costs build time and balance. Index by query shape, not paranoia.

## Cross-references

- `01-schema-design.md` - every searched column needs an index plan; embeddings are `FLOAT4[]`.
- `05-querying-deeplakeapi.md` - issue these queries through DeeplakeApi with guarded fragments.
- `06-embeddings-jsonb-versioning.md` - the embedding shape behind `<#>`.
- `templates/indexes-decision-tree.md` - printable cheat sheet.
