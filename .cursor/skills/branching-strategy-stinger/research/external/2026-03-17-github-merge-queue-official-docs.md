---
source_url: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: critical
topic: merge-queue
stinger: branching-strategy-stinger
---

# Managing a merge queue - GitHub Docs (official, updated 2026-03-17)

## Summary

The official GitHub documentation for the merge queue feature, last updated March 17, 2026. This is the authoritative source for merge queue configuration parameters and mechanics.

**Core value proposition:** A merge queue helps increase velocity by automating pull request merges into a busy branch and ensuring the branch is never broken by incompatible changes. It provides the same benefits as "Require branches to be up to date before merging" but does not require PR authors to manually update their branch and wait for CI to finish.

**Configuration parameters (all accessible via branch protection settings):**
- **Merge method:** merge, rebase, or squash (note: when merge queue is enabled, the merge method is controlled by the queue, not the PR author)
- **Build concurrency:** 1-100 `merge_group` webhooks dispatched simultaneously; controls CI throughput
- **Only merge non-failing PRs:** If YES, all PRs must satisfy required checks. If NO, a group can include failing PRs as long as the LAST PR in the group passed (useful for intermittent test failures)
- **Status check timeout:** How long the queue waits for CI response before assuming failure
- **Merge limits:** Min and max PRs to merge at once (1-100), with a timeout for reaching minimum group size

**How the queue works (mechanics):**
1. PR is added to queue via "Merge when ready" button (requires write access)
2. Queue creates a temporary branch `gh-readonly-queue/{base_branch}/pr-N` containing: base branch + all PRs ahead in queue + this PR's changes
3. CI runs against the temporary branch (must use `merge_group` event trigger)
4. If all required checks pass: merge to base branch
5. If CI fails: PR is removed from queue; queue re-forms remaining groups

**Jumping the queue:** Any user can jump to the front (admin-only by default on GitHub Enterprise). CAUTION: jumping causes a full rebuild of all in-progress PRs, potentially significantly slowing total queue velocity.

**CI integration requirement:** GitHub Actions workflows MUST add `merge_group:` as an event trigger alongside `pull_request:`. Without this, merge queue will fail because CI won't run on the temporary merge_group branches.

## Key quotations / statistics

- "A merge queue helps increase velocity by automating pull request merges into a busy branch and ensuring the branch is never broken by incompatible changes."
- "A merge queue cannot be enabled with branch protection rules that use wildcard characters (*) in the branch name pattern."
- "Be aware that jumping to the top of a merge queue will cause a full rebuild of all in-progress pull requests, as the reordering of the queue introduces a break in the commit graph. Heavily utilizing this feature can slow down the velocity of merges for your target branch."
- "You must update your CI configuration to trigger and report on merge group events when requiring a merge queue."

## GitHub Actions trigger pattern

```yaml
on:
  pull_request:
  merge_group:
```

Third-party CI providers: watch for pushes to branches matching `gh-readonly-queue/{base_branch}/*`.

## Annotations for stinger-forge

- This is the primary source for `guides/06-merge-queue.md` - all configuration parameters should be documented from this official source.
- The `merge_group` event trigger requirement is a common misconfiguration that breaks merge queues silently; it should be called out as a setup gotcha.
- The "only merge non-failing PRs = NO" setting for intermittent failures is a nuanced but important configuration decision; document when to use it.
- The merge method override (queue controls method, not PR author) should be noted as a behavior change when enabling merge queue.
- Cross-reference with GitHub Blog case study (separate file) for real-world scale numbers.
