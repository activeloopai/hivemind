# Research Summary - embeddings-runtime-stinger

**Depth consumed:** normal (Hivemind source + a focused set of external sources)
**Date:** 2026-06-16

## Executive summary

The embeddings runtime for Hivemind is a deliberately narrow, well-bounded system: a single local embedding model run through an in-process daemon, feeding fixed-width vector columns in Deep Lake. The findings that shaped the stinger's guides:

1. **The runtime is local-first and off by default.** `@huggingface/transformers ^3` is an optional dependency (~600MB) installed under `~/.hivemind/embed-deps/`. With `HIVEMIND_EMBEDDINGS` and `HIVEMIND_SEMANTIC_SEARCH` off, recall falls back to BM25/ILIKE lexical search in `src/shell/grep-core.ts`. There is no quality cliff; off is a legitimate, shipped state.

2. **The dimension locks the schema.** `EMBEDDING_DIMS=768` (in `src/embeddings/columns.ts`) must equal the model's output width and the `summary_embedding` / `message_embedding` `FLOAT4[]` column widths. A dimension change is a schema event handled via the deeplake-dataset schema-heal path, with a re-embedding backfill. Quantization changes do not touch the dimension and are therefore not schema events.

3. **nomic-embed-text-v1.5 at q8/768 is the right default.** It pairs strong retrieval quality with a 768-dim output that matches the columns and a footprint that fits a CPU daemon. q8 recall is very close to full precision because cosine recall is robust to small per-weight quantization error.

4. **A warm daemon is the whole point of the architecture.** Model load/warmup is the expensive step; the daemon (`daemon.ts` + `nomic.ts`) holds the model resident and answers batched requests over a Unix-socket NDJSON channel (`protocol.ts` + `client.ts`). Per-request spawning is always wrong on production paths.

5. **The on/off decision is workload-specific and cost-aware.** Embeddings buy paraphrase and conceptual recall over BM25, at the cost of ~600MB + CPU. The honest question is whether the semantic lift is real for the corpus and queries, measured, not assumed.

6. **Local vs hosted is decided on privacy/footprint, not leaderboard rank.** For coding-agent memory, local inference (no egress, no per-call cost, offline) is the natural default. A hosted API is considered only under a concrete constraint, and only if it outputs 768 dim or the team accepts a schema migration.

## Most influential sources

1. The Hivemind `src/embeddings/` source: `daemon.ts`, `nomic.ts`, `protocol.ts`, `client.ts`, `columns.ts`; the ground truth for architecture and the 768-dim constraint.
2. `src/shell/grep-core.ts`: the retrieval pipeline and the BM25/ILIKE fallback behavior.
3. nomic-embed-text-v1.5 model card: 768 dim, retrieval quality, Matryoshka truncation, license.
4. `@huggingface/transformers` (transformers.js) v3 docs: in-process JS/WASM/ONNX inference, quantization options.
5. Deep Lake vector column references: `FLOAT4[]` storage, the `<#>` cosine operator, the hybrid record path.

## Open questions

1. At what corpus size / query mix does the semantic lift over BM25 become clearly worth the 600MB + CPU for typical Hivemind users?
2. Is bge-base-en-v1.5 (also 768 dim) ever a measurable recall improvement over nomic on Hivemind's actual records, or is the default already optimal?
3. Under what footprint pressure, if any, would sub-q8 quantization be acceptable without measurable recall loss?

## Sources to re-fetch if research is stale

- nomic-embed-text-v1.5 model card (for any successor model or license change).
- `@huggingface/transformers` release notes (runtime/quantization changes).
- The Hivemind `src/embeddings/` source (the authoritative ground truth if the runtime changes).
