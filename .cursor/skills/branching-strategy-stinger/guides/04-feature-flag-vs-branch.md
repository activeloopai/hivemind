# Feature Flag vs Feature Branch: The Decision Framework

**Research sources:** `research/external/2026-02-25-feature-flags-vs-branches-rollgate.md` (decision framework), `research/external/2019-classic-feature-toggles-martinfowler.md` (canonical taxonomy), `research/external/2025-01-19-long-lived-branches-worst-berridge.md` (real flag costs, honest pushback), `research/external/2026-04-06-feature-flag-driven-development-viprasol.md` (flag lifecycle), `research/external/2026-03-29-branching-strategies-hotfix-codelit.md` (6-dimension comparison table).

**Example:** `examples/edge-case-gitflow-justified.md` (contrasting scenario)

---

## The core rule

> If a feature cannot be merged to `main` in ≤ 2 working days, it needs a feature flag - not a longer-lived branch.

The inverse is NOT "therefore all features need feature flags." Short-lived branches (≤ 2 days) that are reviewed and merged cleanly are fine without flags.

---

## The long-lived-branch trap (formalized)

A long-lived branch exhibits the following failure mode:

1. Feature starts on a branch. Day 1: clean diff, no conflicts.
2. Other engineers merge work to main. Day 3: first conflicts appear.
3. More merges happen. Day 5: the branch owner spends half a day on merge resolution.
4. The feature is still not done. Day 8: the branch is now "risky to touch" - no one is sure what the full impact of merging is. The branch is put on ice.
5. Eventually, a big-bang merge creates a production incident.

"Branches older than 3 days generate exponentially more merge conflicts." - `research/external/2026-03-31-tbd-vs-gitflow-comparison-novvista.md`

The trap is caused by feature scope, not the branch model. The branch model is just where the symptoms appear.

---

## Feature flag taxonomy (Fowler/Hodgson)

The canonical four-category framework from Pete Hodgson's article on martinfowler.com (`research/external/2019-classic-feature-toggles-martinfowler.md`):

| Type | Purpose | Expected lifetime | Cleanup discipline |
|---|---|---|---|
| **Release toggle** | Deploy incomplete features to production hidden from users | Days to weeks | Remove within 2 weeks of full rollout - MANDATORY |
| **Experiment toggle** | A/B or multivariate testing | Days to weeks | Remove when experiment concludes |
| **Ops toggle** | Kill switches, circuit breakers, operational behavior control | Weeks to months | Remove when the operational risk it guards against is resolved |
| **Permission toggle** | Gate features by user role, plan tier, or beta group | Potentially permanent | Manage as a product feature, not technical debt |

**Management rule:** Release and Experiment toggles are transient - clean up aggressively. Ops and Permission toggles are longer-lived - manage as product configuration.

---

## Six-dimension comparison table

| Dimension | Feature branch | Feature flag |
|---|---|---|
| **Isolation mechanism** | Git branch | Runtime toggle |
| **Merge cost** | Grows with branch lifetime | Near zero (code ships to main immediately) |
| **Partial rollout** | Not possible | Percentage rollout, user targeting |
| **Rollback speed** | Revert commit + redeploy (minutes) | Toggle off in seconds |
| **Technical debt** | Branch divergence (resolved on merge) | Stale flags in codebase (ongoing) |
| **Schema change support** | Full - any migration runs on merge | Limited - non-additive changes cannot be hidden behind a flag |

*Adapted from `research/external/2026-03-29-branching-strategies-hotfix-codelit.md`*

---

## The real costs of feature flags (honest accounting)

Most vendor-authored content underplays flag costs. The research corpus provides the corrective:

**From `research/external/2025-01-19-long-lived-branches-worst-berridge.md` (Kevin Berridge):**

1. **Schema changes that are non-additive cannot be hidden behind a flag.** If your feature requires dropping a column, renaming a field, or changing a table constraint, the database change cannot be wrapped in a runtime toggle. You need a two-phase migration (expand: add new column → migrate data → contract: remove old column) regardless of flags.

2. **Every flag doubles the test matrix.** The code must work with the flag on AND with the flag off. If you have 5 flags, your test matrix can be up to 2^5 = 32 combinations. In practice, only two matter (all-on, all-off), but multi-flag interactions in the same code path are a real debugging burden.

3. **Cleanup cost is real and is systematically underestimated.** The average Release toggle lives 3-5x longer than teams plan for. Stale flag paths cause production incidents when engineers assume a flag is always-true and remove the conditional without checking the flag status in production.

**Recommendation:** Require a cleanup ticket to be created BEFORE the flag is turned on in production, linked to the flag's name in the flag management system. When the flag reaches full rollout, the ticket moves to the next sprint.

---

## Decision matrix: when to use a flag vs a branch

| Scenario | Recommendation |
|---|---|
| Feature is complete, < 2 working days of work | Short-lived branch; no flag needed |
| Feature is large (> 2 days), can be built incrementally | Feature flag (Release type); merge partial work behind flag |
| Feature requires a non-additive schema change | Branch + phased migration; flag cannot help with the schema change itself |
| Team needs to A/B test a user experience | Experiment flag; no branch needed after initial feature ship |
| Platform/kill-switch behavior control | Ops flag; always a flag, never a branch |
| Premium feature / plan tier gating | Permission flag; always a flag, never a branch |
| Hotfix for a production bug | Branch (fast-track PR) or direct commit; flags would slow the resolution |

---

## Feature flag platform selection

> TODO: open question - the research corpus mentions LaunchDarkly, Unleash, Rollout.io, and Statsig but does not compare them in depth. (`research/research-summary.md` open question 4). The Command Brief does not specify a platform. Keep guide platform-agnostic; if the team asks for a platform recommendation, note that this is out of scope for `branching-strategy-worker-bee` and that implementation routes to `typescript-node-worker-bee`.

The decision principle that applies regardless of platform: a flag is only as clean as its lifecycle management. A flag system with no cleanup process will accumulate debt faster than long-lived branches ever did.
