# Example 01, Happy-Path Clean Audit

Demonstrates a small, faithful implementation that passes the audit with one Suggestion. Illustrates the minimum viable report, even when nothing is wrong, the full structure is produced.

**Illustrates guides:** `00-principles.md` (no silent passes), `04-five-axis-evaluation.md` (all-green scorecard), `06-report-writing.md` (voice and metadata).

---

## Input, Plan document excerpt

Plan file: `library/requirements/features/feature-007-result-mode-label/prd-feature-007-result-mode-label.md`

```markdown
# PRD: Result Mode Label

## Goal
Tag each retrieval result with the mode that produced it so callers can tell
dense results from BM25-fallback results.

## User Stories
- US-1: As a caller, I read a `mode` field on each result so that I know whether it came from embeddings or the BM25 fallback.

## Acceptance Criteria
- AC-1.1: `mode` is `"embeddings"` when dense ranking ran.
- AC-1.2: `mode` is `"bm25-fallback"` when the lexical ranker ran.
- AC-1.3: The field is part of the exported `SearchResult` type.

## Non-Goals
- NG-1: No new ranking logic in this phase, only labeling.
- NG-2: No changes to the embeddings daemon.

## Tasks
- [ ] Add a `tagMode` helper.
- [ ] Apply it in `rank`.
```

## Input, Diff

```
A  src/retrieval/tag-mode.ts
M  src/retrieval/rank.ts
```

Contents of `src/retrieval/tag-mode.ts`:

```ts
import type { SearchResult, RankMode } from "./types.js";

export function tagMode(results: SearchResult[], mode: RankMode): SearchResult[] {
  return results.map((r) => ({ ...r, mode }));
}
```

Excerpt of `src/retrieval/rank.ts` showing the integration:

```ts
import { tagMode } from "./tag-mode.js";
// ...
const ranked = embeddingsAvailable
  ? tagMode(await denseRank(query), "embeddings")
  : tagMode(await bm25Rank(query), "bm25-fallback");
return ranked;
```

---

## Output, QA Report

Written to `library/requirements/features/feature-007-result-mode-label/reports/2026-04-24-qa-report.md`.

```markdown
# QA Report: feature-007 Result Mode Label

**Plan document:** `library/requirements/features/feature-007-result-mode-label/prd-feature-007-result-mode-label.md`
**Audit date:** 2026-04-24
**Base branch:** `main`
**Head:** `feat/result-mode-label`
**Auditor:** quality-worker-bee

## Summary

The result-mode-label implementation is complete, faithful to the plan, and ships with a clean scorecard across all five axes. One minor Suggestion on narrowing the `mode` type is included but does not block merge.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | The user story and all three acceptance criteria implemented |
| Correctness   | ✅ | `mode` is set correctly on both the dense and fallback paths |
| Alignment     | ✅ | Uses the exported `SearchResult` / `RankMode` types as specified |
| Gaps          | ✅ | No implicit gaps, helper is pure with no async paths |
| Detrimental   | ✅ | No regressions, performance issues, or security smells |

## Critical Issues (must fix)

None.

## Warnings (should fix)

None.

## Suggestions (consider improving)

- [ ] **Consider a string-literal union for `RankMode` if it isn't already**, `src/retrieval/tag-mode.ts:1-5`

  The helper accepts `mode: RankMode`. If `RankMode` is currently a plain `string`, narrow it to `"embeddings" | "bm25-fallback"` so a typo cannot produce an invalid mode. Not in scope for this PR; tracking as a pointer for the next types pass.

## Plan Item Traceability

| #     | Plan Requirement                                          | Status | Implementation Location                     | Notes |
|-------|-----------------------------------------------------------|--------|---------------------------------------------|-------|
| US-1  | Caller reads a `mode` field on each result                | ✅     | `src/retrieval/rank.ts:4-7`                 | Applied via `tagMode(...)` on both paths |
| AC-1.1| `mode` is `"embeddings"` when dense ranking ran          | ✅     | `src/retrieval/rank.ts:5`                   | `tagMode(..., "embeddings")` |
| AC-1.2| `mode` is `"bm25-fallback"` when lexical ran             | ✅     | `src/retrieval/rank.ts:6`                   | `tagMode(..., "bm25-fallback")` |
| AC-1.3| `mode` is part of the exported `SearchResult` type      | ✅     | `src/retrieval/tag-mode.ts:1,3`             | Returns `SearchResult[]` |
| T-1   | Add `tagMode` helper                                     | ✅     | `src/retrieval/tag-mode.ts` (new)           |, |
| T-2   | Apply it in `rank`                                       | ✅     | `src/retrieval/rank.ts:4-7`                 |, |
| NG-1  | Non-goal: No new ranking logic                           | ✅     |,                                           | Honored, helper only labels |
| NG-2  | Non-goal: No embeddings daemon changes                   | ✅     |,                                           | Honored, no daemon file touched |

## Files Changed

- `src/retrieval/rank.ts` (M), imports `tagMode` and applies it on both the dense and fallback ranking paths
- `src/retrieval/tag-mode.ts` (A), new pure helper: accepts `SearchResult[]` and a `RankMode`, returns the results with the `mode` field set
```

---

## Why the audit looks this way

- **All-green scorecard.** Every plan item maps to implementation. No regressions, no gaps, no anti-patterns.
- **Full report despite no Criticals.** Per `guides/00-principles.md` rule #4 (No silent passes), the scorecard and traceability are written out even when everything passes.
- **One Suggestion, not a Warning.** Per `guides/05-severity-classification.md`, a type-narrowing improvement on correct code is a Suggestion, not a Warning.
- **Non-Goals traced.** Both NG rows appear in the traceability table, confirming scope was audited.
