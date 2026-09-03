# 12 - Common Failure Modes

Symptom-first triage across recall, codify, and propagation. Start here when the invocation is "something is wrong" rather than a specific mode. Each row routes to the guide that fixes it.

---

## Recall failures

| Symptom | Likely cause | Severity | Guide |
|---|---|---|---|
| Query returns nothing for a concept the user remembers discussing | recall ran lexical (embeddings off / daemon down) and the words did not match verbatim | should-refactor (surface the degradation) | `03-bm25-fallback.md` |
| Recall returns conceptually-near but literally-wrong rows | semantic weight too high for an identifier query (noisy recall) | should-refactor | `02-hybrid-search.md`, `10-recall-quality-eval.md` |
| Exact identifier query misses the row that contains it | semantic arm blurred the token; lexical arm not weighted enough | should-refactor | `02-hybrid-search.md` |
| Recall throws / returns garbage | `<#>` run against a NULL column or a null query vector (should have fallen back) | must-fix | `00-principles.md` §5, `03-bm25-fallback.md` |
| Only summaries (or only raw turns) ever come back | one `UNION ALL` arm dropped | must-fix | `01-recall-pipeline.md` |
| A 5 KB JSON blob returned instead of matching turns | session-blob normalization did not fire | must-fix | `01-recall-pipeline.md` |
| Fast path returns different results than the shell | fast-path/slow-path divergence | must-fix | `06-fast-path-grep-direct.md` |
| Recall mode flips unexpectedly between calls | the two semantic gates disagree, or a stale cache key | must-fix | `06-fast-path-grep-direct.md` |
| "Recall got worse after I changed weights" | no before/after snapshot | should-refactor | `10-recall-quality-eval.md` |
| Dimension error on the `<#>` query | query vector not 768-dim | must-fix | `04-embeddings-integration.md` |

---

## Codify (skillify) failures

| Symptom | Likely cause | Severity | Guide |
|---|---|---|---|
| A trivial / one-off "skill" got mined | gate returned KEEP on noise, or an unparseable verdict defaulted to mine | must-fix (if default-mine) / should-refactor (gate prompt) | `07-skillify-codify.md` |
| Near-duplicate skills piling up | MERGE not actually merging | should-refactor | `07-skillify-codify.md` |
| Mined skill has no source / cannot be trusted | no provenance row in the `skills` table | must-fix | `07-skillify-codify.md` |
| Gate returns junk that is not KEEP/MERGE/SKIP | gate prompt drifted | should-refactor | `07-skillify-codify.md` |
| Codify is slow / expensive | heavyweight model on the gate instead of Haiku | should-refactor (cost) | `07-skillify-codify.md` |

---

## Propagation failures

| Symptom | Likely cause | Severity | Guide |
|---|---|---|---|
| A teammate received a private skill | `me`-scoped skill fanned out | must-fix (privacy) | `11-scope-and-privacy.md` |
| Freshly mined skills never reach teammates | auto-pull not wired into SessionStart | must-fix | `08-propagation.md` |
| Same skill duplicated on disk after each session | non-idempotent pull | should-refactor | `08-propagation.md` |
| Pulled skill is invisible to the agent | wrong install target (project vs global) | should-refactor | `08-propagation.md` |
| `scope org` errored | legacy value not coerced to `team` | must-fix | `11-scope-and-privacy.md` |

---

## Codebase-graph failures

| Symptom | Likely cause | Severity | Guide |
|---|---|---|---|
| Structural recall misses a symbol | file parsed with tree-sitter ERROR nodes; degraded graph | should-refactor (surface it) | `09-treesitter-chunking.md` |
| Graph stale after edits | full re-parse skipped, or build never triggered | should-refactor | `09-treesitter-chunking.md` |
| Teammate's graph queries return nothing | graph built locally, never pushed to `codebase` | should-refactor | `09-treesitter-chunking.md` |

---

## Triage workflow

1. **Confirm the embeddings posture first** (`00-principles.md` §1) - it explains most recall symptoms.
2. **Classify** as recall / codify / propagation / graph.
3. **Find the row** above, route to the guide.
4. **Assign severity** honestly - the credibility of the finding rides on it.
5. **Hand off** PII/security to security-worker-bee, schema to deeplake-dataset-worker-bee, daemon to embeddings-runtime-worker-bee.
