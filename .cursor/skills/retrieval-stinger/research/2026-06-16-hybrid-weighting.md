# Hybrid Weighting - deeplake_hybrid_record

**Source:** `src/shell/grep-core.ts`, `templates/hybrid-weight-worksheet.md`, `examples/02-tune-hybrid-weights.md`.
**Retrieved:** 2026-06-16
**Status:** LOAD-BEARING. The precision lever in the absence of a reranker.

---

## TL;DR

`deeplake_hybrid_record($vec::float4[], $text, w1, w2)` blends the semantic `<#>` score (weight
`w1`) with the lexical BM25 score (weight `w2`). Three canonical presets cover most queries.

---

## Presets

| Preset | w1 (semantic) | w2 (lexical) | Use when |
|---|---|---|---|
| Conceptual | 0.7 | 0.3 | paraphrase, intent, no exact tokens (default) |
| Balanced | 0.5 | 0.5 | mixed / unsure |
| Keyword-precise | 0.3 | 0.7 | identifiers, config keys, error strings, symbols |

---

## Key facts

- `w1` weights `<#>` cosine; `w2` weights BM25 over the text column. Higher score = better
  (note: the hybrid record returns a combined score where higher is better, unlike raw `<#>`).
- Weights only bite when embeddings are on. With embeddings off there's no semantic branch, so
  every query is effectively pure BM25 (0/1) regardless of `w1/w2`.
- Default is conceptual (0.7/0.3). Identifier-heavy queries (config keys, symbol names, error
  text) want keyword-precise because embeddings smear exact tokens.

---

## Implications for the guides

- The guide should teach query-shape recognition: symbol/identifier/error-string -> keyword-precise;
  natural-language intent -> conceptual.
- Weight tuning is NOT a fix for missing embeddings. A NULL embedding column is invisible at any
  weight - that's a backfill, not a tune.
- Record chosen weights per query class in the worksheet so the tuning isn't re-derived each time.

---

## Caveats

- No automatic weight selection exists; the caller picks. A query-classifier that sets weights
  is an open idea (`open-questions.md` item 1).
- Keep `w1 + w2 = 1.0` so combined scores stay comparable across queries.
