# Hybrid Weighting - `deeplake_hybrid_record`

Reference for how Hivemind blends the semantic and lexical arms into one ranked result.

## The function

```
deeplake_hybrid_record($vec::float4[], $text, w1, w2)
```

- `$vec` - the 768-dim query vector (`::float4[]`), for the semantic (`<#>`) arm.
- `$text` - the lexical query text, for the BM25/ILIKE arm.
- `w1` - weight on the semantic score.
- `w2` - weight on the lexical score.

The record's hybrid score is the weighted combination of its semantic closeness and its lexical match. Rows rank by that blended score.

## The presets

| Preset | w1 (semantic) | w2 (lexical) | Use |
|---|---|---|---|
| Conceptual | 0.7 | 0.3 | paraphrase-heavy recall; user describes a concept loosely |
| Balanced | 0.5 | 0.5 | mixed or unknown query intent |
| Keyword-precise | 0.3 | 0.7 | user knows the exact identifier, error, or string |

## Why two weights, not one mode

A single mode (pure semantic or pure lexical) forces a bad choice on mixed queries. Weighting lets both arms contribute and tilts toward whichever matches the query intent. The semantic arm catches paraphrases the lexical arm misses; the lexical arm catches exact identifiers the semantic arm blurs. The weight is the dial between those failure modes.

## Discipline

- Pick the weighting per query intent. One fixed weighting for every query is a should-refactor - it wastes the dial.
- Hybrid needs a real vector. With `queryEmbedding === null`, there is no semantic arm to weight; recall runs pure lexical, not a hybrid call with a missing `$vec`.
- A wrong-dimension `$vec` is a must-fix.

See `guides/02-hybrid-search.md` for the decision procedure and `recall-quality-eval.md` for measuring whether a weighting change helped.
