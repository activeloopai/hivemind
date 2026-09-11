---
source_url: https://codelit.io/blog/git-branching-strategies
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: release-hotfix-patterns
stinger: branching-strategy-stinger
---

# Git Branching Strategies: Trunk-Based, GitFlow, GitHub Flow & Beyond

## Summary

A thorough 2026 guide covering all major branching strategies with dedicated sections on release branches and hotfix flow - the most detailed treatment of these topics in the research corpus.

**Release branch best practices (key section):**
- Name branches consistently: `release/2.4.0` or `release/2026-03-29`
- Allow ONLY bug fixes on release branches - never new features (feature freeze enforced)
- Merge fixes back to the main integration branch (develop or main) to prevent regression
- Automate cherry-pick validation with CI checks on the release branch
- Delete release branches after the version reaches end-of-life

**Standard hotfix process (step-by-step):**
1. Branch from the production tag or main
2. Apply the minimal fix - avoid bundling unrelated changes
3. Run the full test suite against the hotfix branch
4. Merge into main (or the release branch) and tag a new patch version
5. Back-merge or cherry-pick the fix into develop or trunk to prevent regression

In trunk-based development, a hotfix is simplified to a fast-tracked PR to main with an expedited review - no separate hotfix branch needed.

The feature branch vs feature flag comparison table is particularly sharp:
- Isolation mechanism: Git branch vs Runtime toggle
- Merge cost: Grows with branch lifetime vs Near zero
- Partial rollout: Not possible vs Percentage rollout, user targeting
- Rollback speed: Revert commit or redeploy vs Toggle off in seconds
- Technical debt: Branch divergence vs Stale flags in codebase

The guide also covers CI/CD alignment by strategy: merge queues (GitHub merge queue, GitLab merge trains) to serialize merges and prevent broken trunk.

## Key quotations / statistics

- "Allow only bug fixes on release branches - never new features."
- "In trunk-based development, a hotfix is simply a fast-tracked PR to main with an expedited review."
- "Use merge queues (GitHub merge queue, GitLab merge trains) to serialize merges and prevent broken trunk."
- "The highest-performing teams combine both [feature branches AND feature flags]: short-lived branches for code review plus feature flags for progressive delivery."
- "Keep CI under 10 minutes for trunk-based workflows. If your pipeline exceeds that, parallelize or split test suites."

## Annotations for stinger-forge

- This is the primary source for `guides/02-release-and-hotfix.md` - the 5-step hotfix process should be reproduced as a numbered procedure.
- The "hotfix as fast-tracked PR" simplification for TBD teams is an important insight: hotfix branches are a GitFlow artifact that TBD teams don't need.
- The feature branch vs feature flag comparison table (6 rows) should be reproduced verbatim in `guides/04-feature-flag-vs-branch.md`.
- The "GitFlow to trunk-based migration" note ("Gradually shorten feature branch lifetimes. Introduce feature flags for incomplete work. Merge develop into main and delete develop once the team is comfortable.") is a perfect 3-sentence migration playbook for `guides/05-migration-playbook.md`.
