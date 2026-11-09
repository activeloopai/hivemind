# Recall / Skillify Quality Audit - <topic>

> Copy this into `library/qa/retrieval/<date>-<topic>.md` (or the feature/issue reports path) and fill it in. Delete the guidance blockquotes.

## Metadata

| Field | Value |
|---|---|
| Date | YYYY-MM-DD |
| Auditor | retrieval-worker-bee |
| Scope | <recall pipeline / skillify gate / propagation / codebase graph> |
| Trigger | <query missed / noisy recall / bad skill mined / scope leak / eval cadence> |
| Embeddings posture | <semantic on/off; HIVEMIND_EMBEDDINGS=?; HIVEMIND_SEMANTIC_SEARCH=?; embedded-row coverage> |

> The embeddings posture is mandatory on every recall audit - it drives the interpretation of nearly every finding.

## Summary

> Two or three sentences: what was audited, the headline finding, and the recommended action.

## What was examined

> Files, queries, sessions, or skills in scope. Cite source paths (`src/shell/grep-core.ts`, `src/skillify/gate-runner.ts`, etc.).

## Findings

| # | Finding | Severity | Evidence (file:line / query / skill) | Guide |
|---|---|---|---|---|
| 1 | | must-fix / should-refactor / style | | |
| 2 | | | | |

> Severity is the credibility of the finding. Reserve must-fix for: null-vector throw, non-768 query vector, dropped UNION ALL arm, fast-path/slow-path divergence, `<#>` against NULL columns, mined skill with no provenance row, `me`-scoped skill fanned to teammates.

## Recall quality evidence (if a recall change)

> Required when the audit covers a weighting or pipeline change. Fixed query set, before/after, posture stamped.

| Query | Intent | Weighting | Precision before/after | Recall before/after |
|---|---|---|---|---|
| | conceptual / keyword / mixed | 0.7/0.3 etc. | | |

## Skillify gate evidence (if a codify audit)

> Verdict distribution over the candidate sessions, and any KEEP that should have been SKIP/MERGE.

| Session | Gate verdict | Correct? | Note |
|---|---|---|---|
| | KEEP / MERGE / SKIP | | |

## Cross-Bee handoffs

> Anything handed off: schema -> deeplake-dataset-worker-bee; daemon -> embeddings-runtime-worker-bee; PII/scope-as-security -> security-worker-bee. Close-out order: security-worker-bee then quality-worker-bee.

## Recommended actions

1. <action> - <severity> - <owner>

## Sign-off

> security-worker-bee reviewed: yes/no. quality-worker-bee reviewed: yes/no.
