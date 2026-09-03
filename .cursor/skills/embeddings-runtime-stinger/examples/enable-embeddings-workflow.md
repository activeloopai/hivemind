# Example: Turn Embeddings On End-to-End

A complete walkthrough of enabling semantic recall in Hivemind, from the off default through the first warm query, and confirming the BM25/ILIKE fallback still works if the daemon dies.

## Starting state: off (the default)

Out of the box, `HIVEMIND_EMBEDDINGS` and `HIVEMIND_SEMANTIC_SEARCH` are unset. Recall runs through BM25/ILIKE lexical search in `src/shell/grep-core.ts`. This works; it just does not catch paraphrased or conceptual matches. There is no missing dependency and no error; off is a legitimate configuration.

## Step 0 - Decide it is worth it

Before enabling, apply `guides/05-embeddings-vs-bm25.md`. Embeddings cost ~600MB plus CPU. Turn them on only if the workload has paraphrase/conceptual queries and you have reason to believe semantic recall will lift results over BM25. If recall is mostly exact-keyword, stop here and stay on lexical.

## Step 1 - Enable the toggles

```bash
export HIVEMIND_EMBEDDINGS=1        # write path generates 768-dim vectors
export HIVEMIND_SEMANTIC_SEARCH=1   # query path uses vector recall
```

`HIVEMIND_EMBEDDINGS` controls generation; `HIVEMIND_SEMANTIC_SEARCH` controls whether recall uses the vectors. You can generate without searching (backfill first), but to actually use semantic recall both must be on.

## Step 2 - First run installs the shared deps

The first time embeddings are enabled on a machine, `@huggingface/transformers` and `nomic-embed-text-v1.5` (q8) are installed under `~/.hivemind/embed-deps/`, roughly 600MB, downloaded once and reused across repos. Subsequent repos reuse the same install with no re-download.

## Step 3 - Warm the daemon

The first embedding loads and warms the q8 model, a one-time cost in the seconds range. After that, inference is steady-state and fast. Warm it before the first user-facing query so the warmup latency does not land on a hot path. See `examples/daemon-warmup-and-ipc.md` for the warmup snippet.

## Step 4 - Backfill existing records (optional but usually needed)

Records written while embeddings were off have no vectors. To make semantic recall useful on existing data, re-embed them:

- Batch the existing records through the daemon (one socket request per batch, not per record).
- Write the 768-dim vectors into `summary_embedding` and `message_embedding`.
- Validate each vector is 768-wide before writing.

New records written from now on get embeddings automatically on the write path.

## Step 5 - Confirm semantic recall is live

Issue a paraphrased query, one that does not share keywords with the stored text, and confirm the right record surfaces via the `<#>` cosine / hybrid `deeplake_hybrid_record` path. If a paraphrase now matches where it would not have under BM25, semantic recall is working.

## Step 6 - Confirm the fallback still holds

The point of off-by-default is graceful degradation. Verify that if the daemon is unavailable, recall falls back to BM25/ILIKE rather than throwing:

- Stop the daemon (or simulate a connection refusal).
- Issue a query; it should return lexical results, not an error.

This confirms a dead daemon degrades to lexical recall, the no-quality-cliff guarantee.

## Rollback

To turn it back off, unset both toggles. Existing vectors stay in the columns (harmless) and recall reverts to BM25/ILIKE. No schema change is involved, because turning the feature on or off never changes the 768-dim column width.
