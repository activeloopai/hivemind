# Example: Embedding Model Comparison for Hivemind Recall

A filled-in comparison applying the Hivemind-scoped rubric from `guides/03-embedding-model-selection.md`. The question is narrow: is any candidate worth swapping in for `nomic-embed-text-v1.5` (q8, 768 dim) on Hivemind's recall?

## Context

- Current: `nomic-ai/nomic-embed-text-v1.5`, q8, 768 dim, local `@huggingface/transformers` daemon.
- Corpus: coding-agent summaries and messages stored in Deep Lake.
- Recall path: `<#>` cosine + hybrid `deeplake_hybrid_record`, consumed by `src/shell/grep-core.ts`.
- Hard gate: output must be 768 dim, or the swap is a schema event.

## Candidates

| Model | Native dim | 768-compatible? | Local-runnable (transformers.js)? | Footprint | CPU latency | Notes |
|---|---|---|---|---|---|---|
| **nomic-embed-text-v1.5 (q8)** | 768 | Yes (native) | Yes | ~600MB | Fast | Current default; strong retrieval at 768 |
| nomic-embed-text-v1.5 (fp16) | 768 | Yes (native) | Yes | Larger | Slower on CPU | Marginal fidelity gain; rarely worth it (see quantization guide) |
| all-MiniLM-L6-v2 | 384 | No, dim event | Yes | Smaller (~90MB) | Very fast | Smaller footprint, but 384 dim = schema migration, and weaker recall on longer text |
| bge-base-en-v1.5 | 768 | Yes | Yes | Comparable | Comparable | Drop-in dim; only adopt if recall on Hivemind data is measurably better |
| a larger 1024-dim model | 1024 | No, dim event | Varies | Larger | Slower | 1024 dim forces a column resize + re-embed; high migration cost |

## Applying the rubric

### 1. Dimension gate

- nomic (q8/fp16) and bge-base-en-v1.5 are **768 dim**, drop-in candidates.
- all-MiniLM-L6-v2 (384) and the 1024-dim model are **schema events**: adopting either means resizing the `FLOAT4[]` columns and re-embedding every record via the deeplake-dataset schema-heal path. That cost is only justified by a large, measured recall win.

### 2. Recall quality on Hivemind's corpus

The only honest way to compare: embed a representative slice with the current and a candidate model, run real Hivemind queries through the `<#>` path, and count which surfaces the right records (especially paraphrased and conceptual matches). A leaderboard score is not the deciding factor.

### 3. Latency and footprint

The daemon is CPU-bound and in-process. nomic q8 is fast and ~600MB. A bigger or higher-precision model must earn its added latency and footprint with a recall win you can measure.

## Recommendation

**Stay on `nomic-embed-text-v1.5` (q8, 768 dim).** It is dim-native, fast on CPU, and gives strong retrieval at the schema's width.

- **Only drop-in candidate worth A/B testing:** bge-base-en-v1.5 (768 dim, no migration), but only adopt it if it measurably beats nomic on Hivemind's actual queries.
- **Reject the off-dimension candidates** (all-MiniLM 384, 1024-dim models) unless a major, measured recall need justifies a full schema migration and re-embed.

**Deciding factor:** dimension compatibility plus a measured recall lift. Without a recall win on real Hivemind data, the migration risk of an off-dimension model is not worth it, and a same-dimension swap is not worth the churn.

## If a swap is approved

Use `templates/embedding-model-swap-plan.md`. If the chosen model is not 768 dim, also run `templates/dim-migration-checklist.md` and hand the column resize to deeplake-dataset-worker-bee.
