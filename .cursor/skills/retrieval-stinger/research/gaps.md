# gaps.md - retrieval-stinger

Areas where retrieval-stinger's coverage of the Hivemind recall pipeline is partial or
absent. Listed for transparency so the orchestrator routes awkward edge cases correctly.

---

## 1. No reranker stage

Recall ranks by `<#>` cosine (semantic) or BM25 (lexical), then a line-wise regex filter.
There is no second-stage rerank model. A cross-encoder rerank would likely lift precision on
ambiguous queries but is not built. Adopting one is a substitution, not a tweak.

## 2. Hybrid weights are caller-chosen, not learned

`deeplake_hybrid_record` takes explicit `w1/w2`. There's no automatic per-query weight
selection - the caller picks a preset based on query shape. A classifier that detects
keyword-vs-conceptual queries and sets weights automatically is not built.

## 3. Silent BM25 fallback has no built-in alert

When the daemon times out, recall falls back to BM25 with no signal to the user. `scripts/`
make it visible on demand, but there is no standing alert on sustained fallback. Should-refactor.

## 4. Embedding backfill is manual

A row captured with embeddings off lands with a NULL embedding column and stays invisible to
semantic recall until re-embedded. There is no automatic backfill sweep; `embedding-coverage.ts`
flags the gap but the fix is a manual re-run.

## 5. Skillify gate calibration is informal

The Haiku gate (KEEP/MERGE/SKIP) has a rubric but no standing labeled set for calibration.
Gate drift (too loose -> junk skills, too strict -> starved recall) is caught by eyeballing,
not a metric. A golden set would harden this.

## 6. Graph staleness detection

The codebase graph rebuilds on a git hook. If the hook isn't installed or a commit slips past
it, chunks go stale (old byte ranges) and recall points at the wrong span. Detection is a
manual spot-check; no automated stale-chunk sweep.

## 7. Cross-surface ranking is flat

memory, sessions, and codebase are UNION'd and ranked together by raw distance. There's no
surface-aware weighting (e.g. "prefer a codified summary over a raw turn for the same score").
Whether that would improve results is untested.

## 8. Propagation conflict handling

When `team`-scoped skills propagate (`pull.ts` / `auto-pull.ts`), conflicting edits to the same
skill across agents are resolved by last-write rather than a merge. Fine at current scale;
a real concern if many agents codify the same area concurrently.

## 9. Embedding model is pinned

The stack is hard-pinned to nomic-embed-text-v1.5 at 768-dim (`EMBEDDING_DIMS`). Trying a
different embedder means re-embedding every row in three tables and updating the dim constant.
No A/B path exists for embedder swaps.

## 10. Multilingual recall

nomic-embed-text-v1.5 has some multilingual capacity but the pipeline is tuned and validated
for English. Non-English recall quality is unmeasured.
