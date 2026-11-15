# Hybrid Search Weighting - tuning `deeplake_hybrid_record`

**Sources:**
- Activeloop Deep Lake docs - `deeplake_hybrid_record($vec::float4[], $text, w1, w2)`
- Hivemind search-path code review
- General dense+sparse hybrid retrieval literature (for tuning intuition)

**Retrieved:** 2026-06-16

## Summary

`deeplake_hybrid_record` combines a vector (dense) arm and a BM25 (sparse) arm into a single ranking. The two weights `w1` (vector) and `w2` (text) decide how much each arm contributes. This note captures how to tune them for Hivemind's tables.

## The signature

```sql
ORDER BY deeplake_hybrid_record(
  $vec::float4[],   -- query embedding (768-dim, nomic-embed-text-v1.5)
  $text,            -- query text for BM25
  w1,               -- vector weight
  w2                -- text weight
) DESC
```

## Tuning intuition

| Want more... | Push weights | Why |
|---|---|---|
| Exact-term precision | toward `w2` (e.g. 0.5 / 0.5 or 0.3 / 0.7) | users searching exact identifiers, symbols, error strings |
| Paraphrase / semantic recall | toward `w1` (e.g. 0.8 / 0.2) | users searching by meaning, not exact wording |
| Balanced default | 0.7 / 0.3 | a sane starting point for most Hivemind tables |

## Per-table guidance

- **memory** - hybrid leans on the vector arm because standalone BM25 is disabled there (oid bug); the text arm of hybrid still contributes, but vector carries recall. Start 0.7 / 0.3.
- **codebase** - exact identifiers and symbol names matter, so push toward text (e.g. 0.5 / 0.5) when search is code-symbol-heavy; keep vector higher when search is natural-language "find the function that does X".
- **skills / rules / goals / kpis** - mixed; 0.7 / 0.3 is a reasonable default, retune if exact-term queries dominate.

## Method

1. Start at 0.7 / 0.3.
2. Pull a sample of real queries and label the ideal results.
3. Sweep weights in 0.1 steps; pick the pair that maximizes top-k relevance on the labeled set.
4. Re-tune when the query mix shifts (e.g. more exact-identifier searches over time).

## Relevance to this stinger

Feeds `guides/02-indexing.md` SShybrid and `templates/indexes-decision-tree.md` Step 3. The weights are a should-refactor lever, not a must-fix - a vector-only query where hybrid clearly wins is the finding.
