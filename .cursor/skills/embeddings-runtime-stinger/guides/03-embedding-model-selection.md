# Embedding Model Selection - Hivemind-Scoped Rubric

This is not a tour of the embedding-model landscape. It is a tight rubric for choosing or swapping the embedding model behind Hivemind's daemon, scoped to one question: what gives the best recall for Hivemind's records and queries within the runtime's constraints?

## The current default

`nomic-ai/nomic-embed-text-v1.5`, quantized to `q8`, output dimension 768, run in-process via `@huggingface/transformers`. It is the default because it pairs strong retrieval quality with a 768-dim output that matches the `FLOAT4[]` columns and a footprint that fits a CPU daemon. Deviating from it requires explicit rationale.

## The rubric, in priority order

### 1. Dimension compatibility (gate, not a slider)

The Deep Lake `FLOAT4[]` columns are sized to `EMBEDDING_DIMS=768`. A candidate model either:

- **Outputs 768 dim** - it is a drop-in candidate; evaluate it on quality/latency/footprint.
- **Outputs a different dimension** - adopting it is a schema event. The columns must be resized and existing records re-embedded via the deeplake-dataset schema-heal path. Treat it as a migration (see `templates/embedding-model-swap-plan.md`), not a swap.

Some models (nomic-embed-text-v1.5 included) support Matryoshka truncation, emitting a shorter vector from a longer one. Truncating to 768 keeps schema compatibility, but validate that recall quality at the truncated length is still acceptable before relying on it.

### 2. Recall quality on Hivemind's data

Quality here means recall on Hivemind's actual stored records (summaries and messages) and the queries the retrieval pipeline issues, not a generic benchmark. Evaluate a candidate by:

- Embedding a representative slice of records with both the current and candidate model.
- Running real queries through the `<#>` cosine path and comparing which surfaces the right records.
- Checking paraphrase and conceptual recall, since that is what embeddings buy over BM25.

A model that wins a public leaderboard but does not improve recall on Hivemind's corpus is not a win here.

### 3. Latency

The daemon runs on CPU. Per-text and per-batch inference time directly affects how fast the write path and the query path are. A larger or higher-precision model that improves recall marginally but doubles inference time is usually the wrong trade for an in-process daemon.

### 4. Footprint

The engine plus model installs under `~/.hivemind/embed-deps/` (~600MB for the current default) and lives resident in the warm daemon. A candidate that meaningfully grows install size or memory needs a recall justification, because this runs in-process, not on dedicated hardware.

## When a swap is justified

Recommend a model swap only when:

- Recall on Hivemind's corpus is measurably and repeatably better, and
- The dimension is 768 (drop-in) or the team accepts the schema migration, and
- The latency and footprint cost is acceptable for an in-process CPU daemon.

If recall is already adequate, leave the default. A swap that does not move recall on real data is a should-refactor at best and usually not worth the migration risk.

## What this rubric explicitly excludes

- Hosted embedding APIs as a quality play; that is the local-vs-hosted tradeoff in `guides/06-local-vs-hosted.md`, decided on privacy/latency/footprint, not leaderboard rank.
- Quantization choice; that is `guides/04-quantization-and-footprint.md`.
- The mechanics of resizing the columns; that is the schema-heal path, owned by deeplake-dataset-worker-bee.

See `examples/embedding-model-comparison.md` for a filled-in comparison.
