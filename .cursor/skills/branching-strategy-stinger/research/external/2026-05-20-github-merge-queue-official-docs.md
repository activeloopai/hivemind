---
source_url: https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
fetched: 2026-05-20
source_type: official-docs
authority: high
relevance: high
topic: github-merge-queue
summary: "Official GitHub documentation for merge queue configuration. Covers: enabling via branch protection rules, configuration options (merge method, build concurrency 1-100, only-merge-non-failing-PRs toggle, status check timeout, merge limits min/max 1-100 with wait timeout). Merge limits use cases: max group size controls deployment batch size; min group size prevents holding up queue during lengthy CI builds. FIFO ordering guaranteed. Temporary branches use special prefix. Conflict detection is automatic. Jump-to-front is admin-only on Enterprise. Important note: when using merge queue, the repository merge method setting is overridden by the queue's merge method rule."
---

# Managing a merge queue - GitHub Enterprise Cloud Docs (Official)

## Summary
Official configuration reference for GitHub's merge queue feature. The merge queue provides the same benefits as "require branches to be up to date before merging" without forcing PR authors to manually rebase and re-wait for CI.

## Key quotations / statistics

- "A merge queue helps increase velocity by automating pull request merges into a busy branch and ensuring the branch is never broken by incompatible changes."
- "The merge queue provides the same benefits as the Require branches to be up to date before merging branch protection, but does not require a pull request author to update their pull request branch and wait for status checks to finish before trying to merge."
- "When using the merge queue, you no longer get to choose the merge method, as this is controlled by the queue." (The queue's merge method rule overrides repo settings)
- "Be aware that jumping to the top of a merge queue will cause a full rebuild of all in-progress pull requests, as the reordering of the queue introduces a break in the commit graph."

## Configuration options

| Option | Range | Notes |
|---|---|---|
| Merge method | merge / rebase / squash | Overrides repo merge method setting |
| Build concurrency | 1-100 | Max parallel merge_group CI builds |
| Only merge non-failing PRs | on/off | Off = flaky-test-tolerant mode |
| Status check timeout | configurable | Assumes failure after timeout |
| Merge limits min | 1-100 | Min group size; use for slow CI/deployments |
| Merge limits max | 1-100 | Max group size; use for deployment batch control |
| Wait time | configurable | Timeout before merging with fewer than min |

## Key operational facts
- Available on: public repos owned by orgs; private repos on GitHub Enterprise Cloud
- Temporary branch prefix: `gh-readonly-queue/{base_branch}`
- CI must be configured to trigger on `merge_group` event (not just `push` or `pull_request`)
- Jump-to-front: admin-only by default on Enterprise (can grant via custom repo role)
- FIFO ordering guaranteed when required checks pass

## Annotations for stinger-forge
- The configuration table is directly usable as a reference table in `guides/06-merge-queue.md`
- The "CI must trigger on merge_group event" is the #1 configuration gotcha - must be prominently called out
- The jump-to-front rebuild warning is important operational knowledge
- The "merge method override" note must be called out for teams that rely on squash-merge policies
- Availability (Enterprise Cloud required for private repos) is a prerequisite check the Bee must perform
