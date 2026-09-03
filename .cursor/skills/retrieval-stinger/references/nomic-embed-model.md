# nomic-embed-text-v1.5 - the vector source

Reference for the model recall depends on. retrieval-worker-bee does not own the daemon (embeddings-runtime-worker-bee does) - this note documents only the facts recall must hold true.

## The model

- **Model:** `nomic-ai/nomic-embed-text-v1.5`.
- **Quantization:** q8 (the `dtype` passed to the feature-extraction pipeline in `src/embeddings/nomic.ts`).
- **Output dimension:** 768. This is the number that locks `EMBEDDING_DIMS=768` and the `FLOAT4[]` column width.
- **Runtime:** `@huggingface/transformers`, run locally via the embed daemon (`src/embeddings/daemon.ts` + `nomic.ts`), installed under `~/.hivemind/embed-deps/` (~600MB optional dependency).
- **IPC:** the daemon answers over a Unix socket using an NDJSON protocol (`src/embeddings/protocol.ts`, `client.ts`).

## Why recall cares

1. **Dimension lock.** The model outputs 768, so every query vector recall sends to `<#>` must be 768. Swapping to a model of a different dimension is a schema migration, not a recall change.
2. **The query/document symmetry.** The query vector and the stored vectors must come from the same model, or cosine distance is meaningless. Recall and capture both go through the same daemon to guarantee this.
3. **The null contract.** If the daemon is unreachable, the `EmbedClient` returns `null` and recall falls back to lexical. This is why recall never hard-depends on the model being present.

## What is NOT this Bee's call

- Whether to turn embeddings on (the 600MB + CPU tradeoff).
- Swapping the model or the quantization.
- Daemon warmup, batching, crash recovery.

All of the above belong to embeddings-runtime-worker-bee. retrieval-worker-bee states the dimension and the null contract, and hands the rest over.
