# Schema and Columns - EMBEDDING_DIMS, FLOAT4[], and the Dim Constraint

This guide covers the hard constraint that ties the embeddings runtime to the Deep Lake storage layer: the embedding dimension must match the column width, and changing it is a schema event.

## The pieces

In `src/embeddings/columns.ts`:

- `EMBEDDING_DIMS = 768`, the single source of truth for the vector width.
- `summary_embedding` and `message_embedding`, the two embedding columns, stored in Deep Lake as `FLOAT4[]` (32-bit float arrays) sized to 768.

Consumers downstream:

- Vectors are queried with the `<#>` cosine operator (negative inner product / cosine distance) for nearest-neighbor recall.
- The hybrid `deeplake_hybrid_record` path combines vector recall with the lexical signal.
- The retrieval pipeline in `src/shell/grep-core.ts` is the main consumer of both.

## The constraint

The vectors the daemon produces must be exactly `EMBEDDING_DIMS` wide, and the `FLOAT4[]` columns are sized to that same width. These three things must agree at all times:

1. The model's output dimension.
2. `EMBEDDING_DIMS`.
3. The width of the `summary_embedding` / `message_embedding` columns.

If they disagree, writes fail or store malformed vectors, and `<#>` recall returns garbage. A dimension mismatch is a **must-fix** in the severity rubric because it silently corrupts recall.

## Why a dim change is a schema event

Changing the dimension (because a new model outputs a different width, or to truncate/expand) is not a config tweak. It forces:

1. **Column resize.** The `FLOAT4[]` columns must be re-sized to the new width. This is the schema-heal path on the Deep Lake dataset, owned by deeplake-dataset-worker-bee.
2. **Re-embedding backfill.** Every existing record's `summary_embedding` and `message_embedding` was produced at the old dimension. Old vectors cannot coexist with new ones in a resized column; existing records must be re-embedded with the new model.
3. **Validation.** Recall must be re-validated after the migration, since both the model and the vector space changed.

Until all three are done, recall is in an inconsistent state. This is why principle 6 ("never strand a dim change mid-migration") exists.

## Quantization is not a schema event

Worth repeating: quantization (q8 vs fp16 vs fp32) changes weight precision, not output width. The model still emits 768-dim vectors at any quantization. So changing quantization never touches the columns and is *not* a schema event. Only a dimension change is.

## The dimension decision flow

When a model change is proposed:

1. **What dimension does the candidate output?**
   - 768 -> drop-in. No schema event. Evaluate on recall/latency/footprint only.
   - Not 768, but Matryoshka-truncatable to 768 -> truncate, stay schema-compatible, but validate truncated recall.
   - Not 768 and not truncatable -> schema event. Go to the migration path.
2. **If a schema event:** write the swap plan (`templates/embedding-model-swap-plan.md`) and the checklist (`templates/dim-migration-checklist.md`), then hand the column resize to deeplake-dataset-worker-bee.
3. **Re-embed and validate** before declaring the migration complete.

## Handoff

The schema-heal mechanics, how the Deep Lake dataset actually resizes a `FLOAT4[]` column and reconciles existing rows, belong to deeplake-dataset-worker-bee. This stinger decides the dimension, writes the plan, and triggers the handoff. It does not execute the schema event itself.
