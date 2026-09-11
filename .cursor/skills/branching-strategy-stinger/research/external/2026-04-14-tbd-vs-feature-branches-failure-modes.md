---
source_url: https://unixy.io/blog/trunk-based-dev-vs-feature-branches/
fetched: 2026-05-20
source_type: blog
authority: medium
relevance: high
topic: long-lived-branch-anti-pattern
summary: "April 2026 adversarial analysis of both TBD and feature branch failure modes. Rare perspective: takes both sides seriously and identifies where each ACTUALLY breaks. Feature branches break at integration time; TBD breaks at commit time. The 'feature flags are not free' argument: every flag is a branch in code (an if statement that doubles execution paths), flag debt is real, zombie flags that accumulate for months become invisible dependencies. Key finding: 'Feature branches collide at merge time. Trunk-based commits collide at deploy time.' Provides a nuanced hybrid recommendation: TBD for small/simple changes; short-lived branches for anything touching shared state (schema migrations, API contract changes, middleware)."
---

# Trunk-Based Dev vs Feature Branches: Where Each Model Actually Breaks

## Summary
April 2026 adversarial analysis. Valuable as the counterpoint source - surfaces the real failure modes of TBD that advocates often minimize, particularly around feature flag debt and shared-state collision timing.

## Key quotations / statistics

- "Feature branches collide at merge time. Trunk-based commits collide at deploy time."
- "Feature flags are technical debt with a timer. Every flag is a branch in your code - an if statement that doubles the execution paths. Two flags means four paths. Ten flags? Your code has more conditional branches than a choose-your-own-adventure book, and nobody has tested all the combinations."
- "Flags that are never cleaned up - the 'temporary' flag that has been in production for eight months - become invisible dependencies. New code is written assuming the flag is on. Someone turns it off during a rollback, and features that were never behind that flag break because they depended on a code path that only exists when the flag is enabled."
- "How senior is your team? Trunk-based development requires every developer to understand the blast radius of their changes. It requires small commits by instinct, not by policy. A team of senior engineers who have worked in this way will thrive. A team of mixed experience levels needs the guardrails that feature branches provide."
- "How fast is your CI? Trunk-based development without fast CI is a recipe for a broken trunk. If your test suite takes 30 minutes, developers will not wait. They will merge and hope. 'Merge and hope' is not a strategy."

## Failure modes comparison

| Dimension | Feature Branches | Trunk-Based |
|---|---|---|
| Isolation | Full per-branch | None (flags instead) |
| Merge pain | Big, infrequent | Small, constant |
| Shared DB risk | Schema divergence + data pollution | Migration ordering conflicts |
| CI requirements | Moderate (per-branch) | High (must be fast + reliable) |
| Rollback | Revert merge commit | Toggle flag or revert commit |
| Team discipline | PR review culture | Small-commit culture |
| Where it breaks | At integration time | At commit time |

## The hybrid recommendation
- TBD for small changes: config updates, copy changes, bug fixes touching one file
- Short-lived feature branches for anything that touches shared state: schema migrations, API contract changes, middleware modifications
- "The rule is not 'always branch' or 'never branch.' The rule is: if this change can break something I cannot see from my editor, it gets a branch and a targeted integration test before it touches trunk."

## Annotations for stinger-forge
- The "feature flags as technical debt" framing is a critical counterpoint that the Bee must surface honestly
- The collision timing insight (merge time vs commit time) is the clearest conceptual distinction between the two models
- The hybrid recommendation (TBD for small, branches for shared-state) is a nuanced directive for mixed-maturity teams
- The "team seniority" prerequisite for TBD is something many TBD advocates skip - the Bee should surface this
- Contradiction with other sources: other sources treat feature flags as uniformly positive; this source correctly identifies the governance precondition
