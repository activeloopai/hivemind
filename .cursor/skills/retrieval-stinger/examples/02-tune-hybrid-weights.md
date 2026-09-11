# Example 02 - Tune Hybrid Weights for a Conceptual vs Keyword Query

`deeplake_hybrid_record($vec::float4[], $text, w1, w2)` blends semantic (`<#>` cosine on
the embedding column) with lexical (BM25/`ILIKE` on the text column). `w1` is the semantic
weight, `w2` the lexical weight. This example shows how to pick weights per query intent.

> **Reference:** `src/shell/grep-core.ts`, `guides/` hybrid-search section. Worksheet: `templates/hybrid-weight-worksheet.md`.

---

## The three canonical presets

| Preset | w1 (semantic) | w2 (lexical) | Use when |
|---|---|---|---|
| Conceptual | 0.7 | 0.3 | "how do we handle daemon restarts" - paraphrase-heavy, intent over exact words |
| Balanced | 0.5 | 0.5 | mixed query, unsure of phrasing |
| Keyword-precise | 0.3 | 0.7 | "EMBEDDING_DIMS 768", "HIVEMIND_SEMANTIC_SEARCH" - exact tokens, identifiers, error strings |

Default is conceptual (0.7/0.3). Move toward keyword-precise when the query contains symbols,
config keys, or exact error text that BM25 nails and embeddings smear.

---

## Worked case A - conceptual recall

> "What's our approach when the embeddings daemon is unreachable?"

No exact identifier here, it's intent. Use 0.7/0.3.

```sql
SELECT path, content, score
  FROM deeplake_hybrid_record($vec::float4[], $text, 0.7, 0.3)
 ORDER BY score DESC
 LIMIT 20;
```

The semantic branch surfaces the fallback-to-BM25 summary even though the row never says the
word "unreachable" - it says "daemon timeout" and "null query embedding". That paraphrase match
is exactly what the 0.7 semantic weight buys.

---

## Worked case B - keyword-precise recall

> "HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS default"

This is a config key. Embeddings will fuzz it against every other timeout in the corpus.
Flip to 0.3/0.7 so BM25 anchors on the exact token.

```sql
SELECT path, content, score
  FROM deeplake_hybrid_record($vec::float4[], $text, 0.3, 0.7)
 ORDER BY score DESC
 LIMIT 20;
```

Now the row that literally contains `HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS ?? "500"` ranks first.

---

## Step-by-step tuning loop

1. Start at 0.7/0.3.
2. Inspect top 10. If the right row is buried under semantically-similar-but-wrong rows,
   the query is probably keyword-shaped - shift toward 0.3/0.7.
3. If the right row never appears because the corpus phrases it differently, you're already
   semantic-weighted; widen `LIMIT` or check that the row's embedding column is populated.
4. Record the chosen weights against the query class in `templates/hybrid-weight-worksheet.md`.

---

## Gotchas

- Weights only matter when embeddings are on. With embeddings off there is no `<#>` branch,
  so every query is effectively 0.0/1.0 (pure BM25) regardless of what you pass.
- `w1 + w2` does not need to sum to 1, but keeping it normalized makes the score comparable
  across queries.
- Do not tune weights to fix a missing-embedding problem. If `summary_embedding` is NULL the
  row is invisible to the semantic branch at any weight - that's an indexing fix, not a tuning fix.
