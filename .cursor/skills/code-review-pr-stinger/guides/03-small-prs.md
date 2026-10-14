# 03 - Small PR Discipline

The 400-line threshold, split strategies, the trunk-based discipline, and how AI-assisted coding has made small PRs more urgent in 2025-2026.

Sources: `research/external/2026-05-20-gitautoreview-pr-size-metrics.md`, `research/external/2026-05-20-ardura-implementation-guide.md`, `research/external/2026-05-20-codecraftdiary-trunk-based-dev.md`, `research/external/2026-05-20-stackfyi-best-practices-guide.md`.

---

## The data case for small PRs

| PR size | Defect detection rate | Source |
|---|---|---|
| 200-400 lines | 75%+ | DORA 2025 / GitAutoReview metrics |
| 400-1,000 lines | 50-60% | DORA 2025 |
| > 1,000 lines | 31% | DORA 2025 |

The 2025 DORA Report found that AI-assisted coding tools increased code output per engineer by 40-60%, causing a 91% increase in review time per PR. The practical implication: without active small-PR discipline, AI-augmented teams spend more time reviewing than coding. The 400-line threshold is the point at which reviewers can still hold the full change in working memory.

---

## Canonical size signals

Flag a PR when ANY of the following is true:

| Signal | Threshold | Action |
|---|---|---|
| Changed lines | > 400 | Flag; suggest splits |
| Unrelated logical concerns | > 3 | Flag; suggest split by concern |
| Files changed | > 20 | Audit for mixed concerns |
| Expected review time | > 60 minutes | Recommend scheduling a sync review session |
| Separate service boundaries crossed | > 1 | Split by service unless migration requires cross-boundary change |

The 400-line threshold is the default. It can be lowered to 300 for security-critical code or raised to 600 for mechanical refactors (e.g., automated renaming, whitespace normalization) where defect risk is low.

---

## Split strategies

### Split by logical concern

The most common fix. Each split PR addresses one independent logical change.

**Anti-pattern:** A single PR adds a new feature, refactors a shared utility, and updates the test harness.

**Fix:**
1. PR A: refactor the shared utility (no behavior change; easiest to review)
2. PR B: add the new feature using the refactored utility (depends on A)
3. PR C: update the test harness (depends on B; or merge with B if small)

Submit PRs in order. Mark each with `depends on #<N>` in the description.

### Split by service boundary

When a change touches multiple services or packages in a monorepo, split along the service boundary. This allows each service's owners to review only their scope.

### Split using feature flags

For large features that cannot be reviewed in a single PR without context, use a feature flag to ship the infrastructure first (behind the flag) and the activation second. Allows incremental review without feature-flag debt accumulating.

**Pattern:**
1. PR A: Add infrastructure behind `feature_flag_name = false` (reviewable without knowing the full feature)
2. PR B: Implement behavior; still gated by flag
3. PR C: Enable the flag (1-line PR; easiest to review)

### Split by layer

For full-stack changes, split into a backend PR and a frontend PR. This allows backend and frontend reviewers to work in parallel and reduces context-switching for generalist reviewers.

---

## Trunk-based development and small PRs

Short-lived feature branches (1-2 days) are the structural enforcement of small PRs. Long-lived branches are almost always associated with large PRs because developers defer the "split the PR" problem until it becomes a "resolve 200 merge conflicts" problem.

**Trunk-based checklist for the Bee:**

- [ ] Branch is less than 2 days old? If not, flag for merge or split.
- [ ] Diff is against `main`/`trunk` directly? Stacking on other feature branches creates hidden size.
- [ ] All CI checks pass on trunk at the point the branch was cut? If not, the PR review will be contaminated by pre-existing failures.

Source: `research/external/2026-05-20-codecraftdiary-trunk-based-dev.md`.

---

## How the Bee flags a large PR

When a PR exceeds a threshold, the Bee's output is:

```
🔔 PR size flag
Lines changed: 643 (threshold: 400)
Logical concerns identified: 4

Suggested splits:
  - PR A: extract `useAuthContext` hook (45 lines) - no behavioral change
  - PR B: add token-refresh logic using the new hook (280 lines)
  - PR C: update E2E auth tests (120 lines)
  - PR D: update documentation (50 lines)

Splitting PRs A + B would bring each under 300 lines. Merging C+D with B is acceptable (total: 450 lines).
```

The Bee never blocks the PR based on size alone. It flags the risk and proposes splits. The human decides.
