# Template: Hybrid Weight Tuning Worksheet

Fill one row per query class you tune. `deeplake_hybrid_record($vec, $text, w1, w2)` -
`w1` semantic, `w2` lexical. Default 0.7/0.3. Record what you chose and why so the next
person doesn't re-derive it.

> **Source of truth:** `src/shell/grep-core.ts`, `examples/02-tune-hybrid-weights.md`.

---

## Presets

| Preset | w1 (semantic) | w2 (lexical) | Query shape |
|---|---|---|---|
| Conceptual | 0.7 | 0.3 | paraphrase, intent, no exact tokens |
| Balanced | 0.5 | 0.5 | mixed / unsure |
| Keyword-precise | 0.3 | 0.7 | identifiers, config keys, error strings, symbols |

---

## Worksheet

| Query class (example) | Chosen w1 | Chosen w2 | Top-1 correct? | Notes |
|---|---|---|---|---|
| "how do we handle daemon restarts" | 0.7 | 0.3 | yes | conceptual, semantic bridges paraphrase |
| "HIVEMIND_SEMANTIC_SEARCH default" | 0.3 | 0.7 | yes | exact config key, BM25 anchors it |
| "embeddings model name" | 0.5 | 0.5 | yes | half identifier, half intent |
| _add your class_ | | | | |

---

## Tuning loop

1. Start at 0.7/0.3.
2. Pull top 10. Right row buried under similar-but-wrong rows -> shift toward 0.3/0.7.
3. Right row absent (corpus phrases it differently) -> already semantic-weighted; widen `LIMIT`
   or confirm the row's embedding column is populated.
4. Lock the weights into the row above.

---

## Rules

- Weights only bite when embeddings are on. Off -> every query is pure BM25 regardless of w1/w2.
- Do not tune to compensate for a NULL embedding column. That's an indexing fix (backfill), not a weight fix.
- Keep `w1 + w2 = 1.0` so scores stay comparable across queries.
- If a whole query class consistently wants keyword weighting, that's a signal the corpus is
  identifier-heavy - fine, just write it down here.
