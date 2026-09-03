# Source: Deep Lake Vector Columns and Cosine Recall

**Source type:** Deep Lake documentation
**Authority:** High
**Date fetched:** 2026-06-16

## Key findings

- **`FLOAT4[]` columns.** Hivemind stores embeddings in Deep Lake columns typed `FLOAT4[]`, arrays of 32-bit floats. The two columns are `summary_embedding` and `message_embedding`, declared in `src/embeddings/columns.ts`.
- **Fixed width.** Each `FLOAT4[]` embedding column is sized to a fixed width, `EMBEDDING_DIMS=768`. The vectors written into them must be exactly that wide. A width mismatch fails the write or stores malformed data.
- **`<#>` cosine operator.** Recall queries vectors with the `<#>` operator (negative inner product / cosine distance), ranking stored vectors by similarity to the query vector. This is the semantic recall path when `HIVEMIND_SEMANTIC_SEARCH` is on.
- **Hybrid record path.** `deeplake_hybrid_record` combines the vector (cosine) signal with the lexical (BM25/ILIKE) signal, so enabling embeddings adds a semantic layer on top of lexical recall rather than replacing it.
- **Main consumer.** The retrieval pipeline in `src/shell/grep-core.ts` is the primary consumer of both the vector columns and the hybrid path. When embeddings are off, it uses the lexical path alone.
- **Dimension is a schema property.** Because the column width is fixed at creation, changing the embedding dimension means resizing the columns, a schema event handled via the dataset schema-heal path, not a config change.

## Synthesis for stinger

- The `FLOAT4[]` column width is the hard constraint the embedding model must satisfy: 768, always, unless a schema migration is undertaken.
- The `<#>` cosine path is why q8 quantization is acceptable; cosine recall is robust to small quantization error.
- The hybrid record path means turning embeddings on is additive, which supports framing the on/off decision as "add semantic lift on top of lexical," not "switch recall engines."
- Resizing a `FLOAT4[]` column is the deeplake-dataset schema-heal job; this stinger triggers it but does not execute it.
