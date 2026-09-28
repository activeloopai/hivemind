# 02 - Hybrid Search

Hybrid recall blends a semantic arm (`<#>` cosine) and a lexical arm (BM25/ILIKE) and ranks by a weighted score. This guide covers the operator, the weighting function, and how to pick weights.

---

## The two arms

### Semantic - `<#>` cosine

Deep Lake's `<#>` operator computes cosine distance between the query vector and a stored `FLOAT4[]` column:

- `memory.summary_embedding` for summaries.
- `sessions.message_embedding` for raw dialogue.

Both columns are 768-dim (`EMBEDDING_DIMS=768`, `src/embeddings/columns.ts`). The query vector is produced by the `EmbedClient` against the daemon. Semantic recall catches paraphrases, synonyms, and conceptual matches that share no literal tokens with the query.

### Lexical - BM25 / ILIKE

Term-frequency ranking (BM25) and substring match (`ILIKE`) catch exact identifiers, error strings, file paths, and rare tokens that a 768-dim embedding blurs together. This is also the silent fallback arm when embeddings are off (`03-bm25-fallback.md`).

---

## The weighting function

```
deeplake_hybrid_record($vec::float4[], $text, w1, w2)
```

- `$vec` - the 768-dim query vector (must be `::float4[]`).
- `$text` - the lexical query text.
- `w1` - weight on the semantic arm.
- `w2` - weight on the lexical arm.

The two weights are the lever. Three presets cover almost every query:

| Preset | w1 / w2 | When |
|---|---|---|
| **Conceptual** | 0.7 / 0.3 | paraphrase-heavy recall - "that thing we discussed about caching", "how did we handle auth retries" |
| **Balanced** | 0.5 / 0.5 | mixed intent, or you do not know the query shape |
| **Keyword-precise** | 0.3 / 0.7 | the user knows the exact term - an identifier, an error message, a file name, a flag |

---

## How to pick

Ask what the query is reaching for:

- **A concept the user can only describe loosely** -> conceptual (0.7/0.3). Literal token overlap will be low; lean on the embedding.
- **A specific string the user remembers** -> keyword-precise (0.3/0.7). The embedding will blur `retryCount` and `retryDelay` together; BM25 will not.
- **You genuinely cannot tell** -> balanced (0.5/0.5). It is the safe default, not the universal one.

Defaulting every query to one weighting is a should-refactor. The whole point of exposing `w1`/`w2` is to match the query intent.

---

## Hybrid requires a vector

Hybrid scoring needs both operands. If `queryEmbedding` is `null` (daemon unreachable) there is no semantic arm to weight, so recall must run pure lexical, not a hybrid call with a missing vector. Sending an empty or wrong-length vector into `deeplake_hybrid_record` is a must-fix (`00-principles.md` §5, §6).

---

## What to check on a hybrid finding

1. **Is the weighting matched to the query intent?** Or is it the same number every time?
2. **Is the vector 768-dim and `::float4[]` cast?** A dimension mismatch is a must-fix.
3. **Did the lexical arm get the un-embedded text, not the vector?** `$text` and `$vec` are separate operands.
4. **Would pure lexical have answered this?** If the query is an exact identifier, the semantic arm is wasted CPU - keyword-precise or pure BM25 is cheaper and sharper.
