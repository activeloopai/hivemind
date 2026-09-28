# Embeddings On vs BM25 Fallback - The On/Off Decision

The single most common decision this stinger makes: should Hivemind generate embeddings and use semantic recall, or stay on the lexical BM25/ILIKE fallback? This guide frames that honestly.

## The two states

| | Embeddings ON | Embeddings OFF (default) |
|---|---|---|
| Toggles | `HIVEMIND_EMBEDDINGS` + `HIVEMIND_SEMANTIC_SEARCH` on | both off |
| Engine | `@huggingface/transformers` daemon, ~600MB + CPU | none |
| Write path | generates 768-dim vectors into `FLOAT4[]` columns | no vectors written |
| Recall | `<#>` cosine + hybrid `deeplake_hybrid_record` | BM25 / ILIKE lexical |
| What it catches | paraphrases, synonyms, conceptual matches | exact and near-exact keyword matches |
| Cost | 600MB install + ongoing CPU at inference | none |

## There is no quality cliff when off

This is the most important framing. With embeddings off, recall does not break; it falls back to BM25/ILIKE lexical search in `src/shell/grep-core.ts`. Lexical recall is genuinely good at exact and near-exact keyword matching. What it misses is semantic reach: a query worded differently from the stored text. So "off" is "less semantic," not "broken." Off is a shipped, legitimate configuration and the default for good reason.

## What turning embeddings on actually buys

Semantic recall earns its keep when the queries and the stored records use *different words for the same thing*:

- A query asking about "auth failures" surfacing a record that says "login errors."
- Conceptual recall where no shared keyword exists.
- Robustness to phrasing differences between how something was written and how it is later searched.

If the user's recall is mostly exact-term lookups (function names, identifiers, literal strings), BM25/ILIKE may already cover it and the embeddings add little.

## The cost side, stated plainly

Turning embeddings on is not free:

- ~600MB install of `@huggingface/transformers` plus the model under `~/.hivemind/embed-deps/`.
- CPU spent on inference for every record written (write path) and, with semantic search on, at query time.
- A warm daemon holding the model resident in memory.

## How to decide

1. **Characterize the queries.** Are they paraphrase-heavy and conceptual, or exact-keyword? Paraphrase-heavy favors embeddings; exact-keyword favors leaving BM25.
2. **Measure the lift, do not assume it.** Embed a representative slice, run real queries through both paths, and see whether semantic recall surfaces records BM25 missed. If the lift is not visible on real data, on is a should-refactor.
3. **Weigh the lift against 600MB + CPU.** The question is literally "is the semantic lift worth 600MB and CPU for this workload?" If yes, turn it on. If marginal, stay on BM25.
4. **Remember hybrid exists.** The `deeplake_hybrid_record` path combines lexical and vector signals, so turning embeddings on does not throw away the lexical strength; it adds the semantic layer on top.

## Recommendation defaults

- **Default to off** unless the workload has a demonstrated need for semantic recall. The no-quality-cliff fallback makes off a safe baseline.
- **Turn on** when paraphrase/conceptual recall is needed and the lift is measured on real Hivemind data.
- **Never** justify turning it on with a generic "embeddings are better" claim. The decision is workload-specific and cost-aware.

See `examples/enable-embeddings-workflow.md` for the end-to-end enablement steps and how to confirm the fallback path.
