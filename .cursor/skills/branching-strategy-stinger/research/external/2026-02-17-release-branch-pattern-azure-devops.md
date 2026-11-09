---
source_url: https://learn.microsoft.com/en-us/azure/devops/repos/git/git-branching-guidance?view=azure-devops
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: high
topic: release-hotfix-patterns
stinger: branching-strategy-stinger
---

# Git Branching Guidance - Azure Repos / Microsoft Learn (updated 2026-02-17)

## Summary

Microsoft's official Git branching guidance for Azure DevOps, updated February 17, 2026. Notable because it documents Microsoft's own internal "Release Flow" strategy and provides authoritative guidance on the cherry-pick-back pattern for keeping release branches and main in sync.

**Core branching principles:**
- Use feature branches for all new features and bug fixes
- Merge feature branches into main using pull requests
- Keep a high quality, up-to-date main branch

**Release branch guidance (distinct from GitFlow's model):**
- Create release branches from main when you get close to your release or end of sprint milestone (e.g., `release/20`)
- Release branches are long-lived and NOT merged back into main via pull request (unlike feature branches)
- Create branches to fix bugs from the release branch and merge them back into the release branch via PR
- Lock release branches when you stop supporting that version

**Cherry-pick-back pattern for porting fixes to main:**
The Azure DevOps team's recommended approach for porting release branch fixes back to main:
1. Create a new feature branch off main to port the changes
2. Cherry-pick the changes from the release branch to your new feature branch
3. Merge the feature branch back into main in a second pull request

Why cherry-pick instead of merge: "Merging the release branch into the main branch can bring over release-specific changes you don't want in the main branch."

**Tags vs branches:** The document recommends branches over tags for releases, arguing that tags introduce extra steps (separate push) that team members can easily miss, while branches are self-documenting and integrated into the standard workflow.

**Environment branches:** Treat deployment environments like release branches - `deploy/performance-test` with a clear naming convention. Cherry-pick bug fixes from deployment branches back to main.

## Key quotations / statistics

- "Create a release branch from the main branch when you get close to your release or other milestone, such as the end of a sprint. Give this branch a clear name associating it with the release."
- "Use cherry-picking instead of merging so that you have exact control over which commits are ported back to the main branch."
- "Merging the release branch into the main branch can bring over release-specific changes you don't want in the main branch."
- "Tags are maintained and pushed separately from your commits. Team members can easily miss tagging a commit."
- Updated: "Last updated on 02/17/2026"

## Annotations for stinger-forge

- Use for `guides/02-release-and-hotfix.md` as the authoritative source on the cherry-pick-back pattern vs the merge-back pattern.
- The "tags vs branches" argument is a useful corrective to teams that use only git tags for releases - document both approaches with the trade-offs.
- Microsoft's "Release Flow" variant (cherry-pick patches to main rather than back-porting from main to release) is the opposite of some other guidance - flag this as a design choice with explicit rationale.
- The "lock branches when EOL" practice should be in the release branch lifecycle section.
- This document is useful because it covers a pragmatic middle-ground: not full GitFlow, not pure trunk-based, but a "main + release branches" hybrid that many enterprise teams use.
