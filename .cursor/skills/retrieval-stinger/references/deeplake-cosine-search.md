# Deep Lake Cosine Search - the `<#>` operator

The semantic arm of Hivemind recall. Reference for what `<#>` does and what it scores against.

## What it is

`<#>` is Deep Lake's cosine-distance operator. Given a query vector and a stored vector column, it returns the cosine distance between them, which recall uses to rank rows by semantic closeness. Lower distance = closer meaning.

## What it scores against

Two `FLOAT4[]` columns, both 768-dim (`EMBEDDING_DIMS=768`, `src/embeddings/columns.ts`):

- `memory.summary_embedding` - the embedding of the row's `summary` text.
- `sessions.message_embedding` - the embedding of the row's `message` JSONB content.

Both are populated only when `HIVEMIND_EMBEDDINGS` is on at capture time. A row captured with embeddings off has a NULL column and is invisible to the `<#>` arm (it still surfaces via the lexical arm).

## How recall uses it

In `src/shell/grep-core.ts`, when `SearchOptions.queryEmbedding` is a 768-length vector, the recall query runs the `<#>` operator against both embedding columns inside the `UNION ALL`. The query vector is produced by the `EmbedClient` against the embed daemon.

## Operands and pitfalls

- The query vector must be cast `::float4[]` and be exactly 768-dim. Any other length is a must-fix (no implicit truncation or pad).
- A NULL stored column cannot be scored; the `<#>` arm skips it. Running `<#>` and expecting a clean result from NULL-heavy data is the noisy/garbage trap.
- A `null` query vector means the daemon was unreachable - recall must fall back to lexical, not run `<#>` against nothing.

## Where it sits

This is the semantic half of hybrid recall. It is blended with the lexical (BM25/ILIKE) arm via `deeplake_hybrid_record` (`hybrid-weighting.md`). The dimension and column DDL are owned by deeplake-dataset-worker-bee; the daemon producing the vectors by embeddings-runtime-worker-bee. retrieval-worker-bee owns the query.
