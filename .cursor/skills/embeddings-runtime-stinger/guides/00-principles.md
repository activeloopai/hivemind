# Principles - embeddings-runtime-stinger

These non-negotiables govern every output this stinger produces. Read this guide on every invocation before consulting any specialized guide.

## 1. The embedding dimension locks the schema

Hivemind stores vectors in Deep Lake `FLOAT4[]` columns sized to `EMBEDDING_DIMS=768` (declared in `src/embeddings/columns.ts` alongside `summary_embedding` and `message_embedding`). The dimension is not a tuning knob you change casually:

- A model whose output dimension is not 768 cannot be written to those columns without a schema migration.
- Changing the dimension is a schema event, handled via the deeplake-dataset schema-heal path.
- Any recommendation that involves a different model must state its output dimension up front and, if it differs from 768, treat the whole thing as a migration (see `templates/dim-migration-checklist.md`).

Never recommend a model swap without checking the dimension first.

## 2. Embeddings are off by default and that is fine

Two env toggles gate the feature:

- `HIVEMIND_EMBEDDINGS` generates embeddings for stored records.
- `HIVEMIND_SEMANTIC_SEARCH` uses vector recall at query time.

With both off, the retrieval pipeline (`src/shell/grep-core.ts`) falls back to BM25/ILIKE lexical search. There is no quality cliff; recall still works, it just covers less semantic ground (synonyms, paraphrases, conceptual matches). Off is a legitimate, shipped configuration. Never frame it as broken or as a missing dependency.

## 3. Justify the 600MB + CPU before turning embeddings on

`@huggingface/transformers ^3` is an optional dependency, roughly 600MB once the model is installed under `~/.hivemind/embed-deps/`, and it spends CPU on every inference. Turning embeddings on is a real cost:

- Recommend it only when the semantic recall lift over BM25 is real for the user's corpus and query patterns.
- The honest framing is a tradeoff: 600MB + CPU for better recall of paraphrased and conceptual matches.
- If the workload is mostly exact-keyword recall, BM25/ILIKE may already be enough.

See `guides/05-embeddings-vs-bm25.md` for how to reason about the lift.

## 4. Warm the daemon once; never spawn per request

Model load and warmup is the expensive step. The architecture (`src/embeddings/daemon.ts` + `nomic.ts`, with `client.ts` talking to it over a Unix socket) exists precisely so the model is loaded once and answers many batched requests:

- The daemon stays warm; the first embedding after a cold start pays the warmup cost, subsequent ones do not.
- Bulk writes should be batched into single socket requests, not sent one text at a time.
- Per-request process spawning pays warmup on every call and is always wrong for production paths.

## 5. Match the model to Hivemind, not to a broad leaderboard

The only model rubric that matters here is, in order:

1. **Dim compatibility** - does it output 768 dim (or are you committing to a schema migration)?
2. **Recall quality** - does it improve recall on Hivemind's actual records and queries?
3. **Latency** - CPU inference time per text and per batch.
4. **Footprint** - install size and memory, since this runs in-process via the daemon.

This is not a place for a general embedding-model survey, MTEB leaderboard tour, or provider comparison. Keep the rubric tight and Hivemind-scoped.

## 6. Never strand a dim change mid-migration

Changing the embedding dimension forces a column-width change on the Deep Lake `FLOAT4[]` columns and a re-embedding backfill of existing records. Before recommending it:

- Name the full migration path: schema-heal of the columns, re-embed existing records, validate recall.
- Hand the schema execution to deeplake-dataset-worker-bee; this stinger decides the dimension and writes the plan.
- If recall works today, "should-refactor" is the right severity for a dim change, not "must-fix", unless the current data is already corrupt from a dim mismatch.

## 7. State the consequence, not just the recommendation

Every output should name the consequence on the three axes that matter for this runtime:

- **Dim/schema:** does this touch the 768-dim columns?
- **Footprint:** does install size or memory change?
- **Latency:** does warmup or per-batch inference time change?

A recommendation without these consequences is incomplete.
