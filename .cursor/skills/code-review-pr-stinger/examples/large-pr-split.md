# Example: Large PR Split

A worked example of `code-review-pr-worker-bee` evaluating a large PR (643 changed lines, 4 mixed concerns) and proposing a concrete split into reviewable increments.

---

## Scenario

**PR title:** `feat: recency-weighted recall`
**Lines changed:** 643
**Files changed:** 18
**Author request:** "Is this PR too large? How should I split it?"

**Diff overview:**
- `src/utils/scoring.ts` - 45 lines (new `decayWeight` helper extracted from `recall.ts`)
- `src/retrieval/recall.ts` - 38 lines (uses new helper; removes inline math)
- `src/dataset/queryWindow.ts` - 120 lines (adds `queryRecentCommits` Deep Lake method)
- `src/dataset/queryWindow.test.ts` - 80 lines (Vitest cases for the new method)
- `src/retrieval/pipeline.ts` - 180 lines (rewires recall to apply recency weighting)
- `src/retrieval/rankers/recencyRanker.ts` - 60 lines (new ranker)
- `src/retrieval/pipeline.test.ts` - 90 lines (new tests)
- `docs/retrieval.md` - 30 lines (documents the new ranker)

---

## Step 1: Size evaluation

```
🔔 PR size flag
Lines changed: 643 (threshold: 400)
Files changed: 18
Logical concerns identified: 4

  1. Scoring helper extraction (decayWeight) - no behavioral change
  2. Deep Lake query method (queryRecentCommits) - dataset concern
  3. Pipeline rewiring + new ranker - retrieval concern
  4. Tests - spread across concerns 1-3
```

**Verdict:** This PR exceeds the 400-line threshold and mixes dataset, retrieval, and refactoring concerns. Splitting is strongly recommended.

---

## Step 2: Split proposal

### PR A: Extract `decayWeight` helper
**Lines:** ~83 (helper + recall.ts changes)
**Concern:** Pure refactor - no behavioral change
**Rationale:** This is the safest PR to review; it changes structure without changing behavior. Ship it first so downstream PRs can depend on it.
**Description starter:** "Extracts the time-decay math from `recall.ts` into a `decayWeight` helper in `scoring.ts`. No behavioral change. Enables reuse in the new recency ranker (see #[next-PR])."

### PR B: Add `queryRecentCommits` Deep Lake method
**Lines:** ~200 (method + tests)
**Concern:** Dataset-layer addition
**Rationale:** Dataset-only change; can be reviewed by whoever owns the Deep Lake layer without retrieval context. Ships independently. Route any schema questions to `deeplake-dataset-worker-bee`.
**Description starter:** "Adds `queryRecentCommits(window)` to the dataset layer, returning commits within a time window with bounded result size. Includes Vitest cases. The pipeline will consume this in #[next-PR]."
**Depends on:** Can be opened in parallel with PR A.

### PR C: Pipeline rewiring + recency ranker
**Lines:** ~360 (pipeline + ranker + docs + tests)
**Concern:** Retrieval feature
**Rationale:** Uses the helper from PR A and calls the method from PR B. Must be reviewed after both are merged.
**Description starter:** "Wires recency weighting into the recall pipeline using `decayWeight` (from #PR-A) and `queryRecentCommits` (from #PR-B). Adds `recencyRanker` and 12 test cases. Updates `docs/retrieval.md`."
**Depends on:** PR A merged, PR B merged.

---

## Step 3: Dependency visualization

```
PR A: decayWeight helper (refactor)   <-- No deps; ship first
PR B: queryRecentCommits method        <-- No deps; ship in parallel with A
          |
PR C: pipeline + recency ranker        <-- Depends on A + B
```

---

## Step 4: Revised size validation

| PR | Lines | Status |
|---|---|---|
| PR A | ~83 | ✅ Under 400 |
| PR B | ~200 | ✅ Under 400 |
| PR C | ~360 | ✅ Under 400 |
| Original PR | 643 | ❌ Over threshold |

All three PRs are independently reviewable. The total review effort is similar (same code), but each reviewer has a focused context window - dramatically improving defect detection probability.

---

## PR description for PR A (complete example)

```markdown
## Motivation

`recall.ts` currently inlines the time-decay scoring math alongside the ranking
logic. The decay function is tightly coupled to the recall path, making it hard
to test in isolation and impossible to reuse in the new recency ranker. This
extraction enables clean reuse in recency-weighted recall (#[issue]).

## Context

- Closes: N/A (enabler PR for #[recency recall issue])
- No prior PR dependency

## What changed

- `src/utils/scoring.ts`: New `decayWeight(ageMs, halfLifeMs)` helper. Moved from
  `recall.ts` lines 22-67 (cut and paste with minor naming cleanup).
- `src/retrieval/recall.ts`: Now imports and uses `decayWeight`. Ranking logic
  is unchanged.

## What did NOT change

- Recall behavior is identical - this is a refactor only
- No changes to the public API of `recall.ts`
- No changes to downstream consumers (they still call `recall()`)

## Testing proof

- [x] Existing recall tests pass without modification
- [x] CI passes: [link]

## Reviewer hints

- The key diff is in `recall.ts` lines 22-67 (deletion) and
  `src/utils/scoring.ts` (addition)
- No logic was changed - the move is line-for-line except for the export name
```
