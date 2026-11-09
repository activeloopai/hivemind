# open-questions.md - retrieval-stinger

Things we don't know definitively about the Hivemind recall pipeline. Each is paired with
the experiment that would answer it.

---

## 1. Optimal default hybrid weights

**Question:** Is 0.7/0.3 (semantic/lexical) the right default, or would 0.6/0.4 serve the
typical Hivemind query better given how identifier-heavy the corpus is?

**How we'd answer:** Run `recall-precision.ts` over a labeled fixture set at 0.7/0.3, 0.6/0.4,
0.5/0.5; compare top-5 precision.

**Until answered:** 0.7/0.3 is canonical default; flip to 0.3/0.7 for keyword-shaped queries.

---

## 2. Embed timeout sweet spot

**Question:** Is 500ms (`HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS`) the right budget, or does it cause
too many cold-start fallbacks on first query after idle?

**How we'd answer:** Track fallback rate vs latency at 500 / 800 / 1200ms over a day of real use.

**Until answered:** 500ms canonical; warm the daemon to avoid cold-start blowouts rather than raise it.

---

## 3. Would a reranker lift precision enough to justify the latency?

**Question:** Does adding a cross-encoder rerank over the top-K `<#>` candidates lift top-5
precision more than the latency cost?

**How we'd answer:** Prototype a rerank stage; A/B precision and latency over fixtures.

**Until answered:** no rerank - cosine + regex is the path.

---

## 4. Skillify gate KEEP threshold

**Question:** Where's the right KEEP bar so recall stays dense with signal but not flooded?

**How we'd answer:** Label 100 candidates KEEP/MERGE/SKIP by hand; run the gate; measure agreement;
tune the rubric until agreement > 0.7.

**Until answered:** rubric in `templates/skillify-gate-rubric.md` is canonical; calibrate when it drifts.

---

## 5. Cross-surface ranking

**Question:** Should a codified `memory` summary outrank a raw `sessions` turn at equal distance?

**How we'd answer:** A/B flat-rank vs surface-weighted rank over fixtures; measure precision and
whether users prefer summaries over raw turns.

**Until answered:** flat distance rank across all three surfaces.

---

## 6. Graph chunk granularity

**Question:** Does function-level chunking beat file-level (or class-level) for code recall?

**How we'd answer:** Re-extract a sample at different granularities; eval code-recall fixtures.

**Until answered:** node-level (function/class/symbol) chunking is canonical.

---

## 7. Coverage threshold that actually matters

**Question:** Is 0.95 embedding coverage the right alert bar, or does recall degrade noticeably
before that?

**How we'd answer:** Synthetically NULL out embeddings at 99/97/95/90% and measure precision drop.

**Until answered:** 0.95 is the working bar in `embedding-coverage.ts`.

---

## 8. Propagation cadence

**Question:** Is SessionStart the right pull cadence, or does it miss skills codified mid-session
by a parallel agent?

**How we'd answer:** Measure staleness between a `team` skill write and when peers actually pull it.

**Until answered:** SessionStart pull (`auto-pull.ts`) is canonical.
