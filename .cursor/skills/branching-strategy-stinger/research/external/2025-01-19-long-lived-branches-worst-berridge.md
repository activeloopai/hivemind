---
source_url: https://www.kevinberridge.com/posts/20250126-long-lived-feature-branches
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: feature-flags-vs-branches
stinger: branching-strategy-stinger
---

# Long-lived Feature Branches Are The Worst

## Summary

A balanced 2025 practitioner post from Kevin Berridge that names the real costs of long-lived branches while also honestly documenting the real costs of feature flags. This is the most intellectually honest treatment in the research corpus - it pushes back on the "just use feature flags" advice with specific technical failure modes.

**Costs of long-lived feature branches (enumerated):**
1. Lack of feedback - no one can test the feature until it's all the way done; bugs go undetected for weeks
2. Divergence and conflicts - even with regular reverse-integration, long-lived branches in an active codebase accumulate conflicts with other long-lived branches

**Costs of feature flags (honest counter-argument):**
The author notes that feature flags are "NOT easy" in most real scenarios:
- Non-additive schema changes (e.g., renaming a database column) cannot be hidden behind a feature flag without also adopting a no-breaking-changes schema migration strategy
- Feature flags double the test matrix: every path must be tested with the flag on AND off
- Flag cleanup is a real maintenance burden: stale flags become invisible dependencies in production

**Alternative approach:**
Rather than either long-lived branches or feature flags, the author proposes "shipping in small moves" - decomposing big features into a sequence of small, independently-deliverable changes. This requires careful upfront planning and sometimes product buy-in (to ship partial user-visible changes), but eliminates both the branch divergence problem and the flag complexity problem.

**Conclusion:**
Long-lived branches are still the worst option. But the author acknowledges that in hindsight some of his past large features could have been tackled in small moves or with feature flags, with more development work up front. The right answer depends on the nature of the change.

## Key quotations / statistics

- "I get very annoyed at the communication around this though. It's often presented as if it's the easiest thing: 'just use feature flags.' But, no, that's crazy, feature flags are NOT easy."
- "To do this feature with a feature flag, we also have to embrace no-breaking-changes to our database schema."
- "Feature flags double the complexity even then: you have to test it works on and off!"
- "The long-lived feature branch on the other hand costs nothing up front, but gets worse and worse the longer things go on."
- "Long-lived feature branches really are the worst."

## Annotations for stinger-forge

- This is essential for `guides/04-feature-flag-vs-branch.md` as the honest counter-weight to the "always use flags" advice.
- The schema-change limitation of feature flags should be documented as a specific exception case in the decision matrix.
- The "small moves" alternative (decomposing features incrementally) should be presented in `guides/04-feature-flag-vs-branch.md` as a third option beyond the binary branch-vs-flag choice.
- This source contradicts the more optimistic vendor sources (Rollgate, LaunchDarkly). Stinger-forge should present the flag debt and schema-migration costs as real considerations in the decision matrix, not just theoretical objections.
