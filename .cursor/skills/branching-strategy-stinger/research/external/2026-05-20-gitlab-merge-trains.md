---
source_url: https://docs.gitlab.com/ci/pipelines/merge_trains
fetched: 2026-05-20
source_type: official-docs
authority: high
relevance: medium
topic: gitlab-merge-trains
summary: "Official GitLab documentation for merge trains (GitLab's equivalent of GitHub's merge queue). A merge train queues merge requests and validates each one against the combined changes of all earlier queued MRs. Pipelines run in parallel. If a pipeline fails, that MR is removed and new pipelines restart for all subsequent MRs. Requirements: Maintainer role, merged results pipelines must be enabled first, must use merge request pipelines in CI config. 2025 roadmap: adding API support for merge trains, UX improvement for re-adding dropped MRs with single click. Key difference from GitHub: GitLab pioneered this feature; GitHub merge queue (2023 GA) is the equivalent."
---

# Merge Trains - GitLab Documentation

## Summary
Official GitLab merge trains documentation. Merge trains address the same problem as GitHub's merge queue: multiple concurrent MRs racing to merge into the default branch, risking incompatible changes. GitLab's merge trains run pipelines in parallel on the combined changes of all queued MRs.

## Key quotations / statistics

- "In projects with frequent merges to the default branch, changes in different merge requests might conflict with each other. Use merge trains to put merge requests in a queue."
- "Each merge request merges into the target branch only after: [1] The merge request's pipeline completes [successfully]."
- "If a merge train pipeline fails, the merge request is not merged. GitLab removes that merge request from the merge train, and starts new pipelines for all the merge requests that were queued after it."
- From category direction page: "GitLab pioneered Merge Train functionality for CI/CD establishing early market leadership."
- From direction page: "When merge trains are used, each merge request joins as the last item in that train. Each merge request is processed in order and is added to the merge result of the last successful merge request."
- FY26 focus: "Adding additional API support for Merge Trains" + "UX improvement that will allow users to re-add an MR back to Merge Train with a single click when an MR is dropped from the train due to an unexpected pipeline failure."

## Requirements
- Maintainer role required
- GitLab repository (not external)
- Pipeline must be configured to use merge request pipelines
- Merged results pipelines must be enabled first

## Comparison: GitLab Merge Trains vs GitHub Merge Queue
| Dimension | GitLab Merge Trains | GitHub Merge Queue |
|---|---|---|
| GA date | Earlier (pioneered) | July 2023 |
| Pipeline model | Parallel pipelines per MR in train | Groups of PRs tested together |
| Failed MR handling | Removed, later MRs restart | Conflicts auto-detected, queue re-formed |
| Skip option | Skip train available (admin) | Jump to front (admin, Enterprise) |
| API support | In progress (FY26) | Available |
| Availability | GitLab users | GitHub org repos; Enterprise Cloud for private |

## Annotations for stinger-forge
- The GitLab vs GitHub comparison is important for `guides/06-merge-queue.md` - the Bee must distinguish between platforms
- The "merged results pipelines must be enabled first" prerequisite chain is a common setup gotcha
- The pipeline failure handling (drop MR, restart subsequent pipelines) is the key operational concept to explain
- The parallel execution model is a key performance property vs serial validation
- For teams on GitLab, merge trains are the equivalent capability to GitHub merge queue
