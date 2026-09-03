---
source_url: https://github.blog/engineering/engineering-principles/how-github-uses-merge-queue-to-ship-hundreds-of-changes-every-day
fetched: 2026-05-20
source_type: official-docs
authority: high
relevance: high
topic: github-merge-queue
summary: "GitHub Engineering blog post (March 2024, still canonical in 2026) documenting how GitHub itself uses merge queue. Key metrics: 500+ engineers, 2,500+ PRs merged monthly into their large monorepo, average wait time reduced 33%, volume more than doubled vs prior tooling. History: GitHub moved from manual trains (2016, ~1,000 PRs/month) → internal tools → merge queue GA (2023), handling 30,000+ PRs with 4.5M CI runs before GA. Merge queue creates temporary branches, forms groups of PRs for validation, enforces branch protection, automatically detects conflicts and removes conflicting PRs, re-forms groups as needed. Removes need for ChatOps commands or special syntax."
---

# How GitHub uses merge queue to ship hundreds of changes every day

## Summary
The definitive practitioner case study for GitHub's own merge queue adoption. Documents the journey from 2016 manual processes to 2023 GA, with concrete metrics on velocity improvement. Establishes merge queue as the single entry point for shipping code at GitHub.

## Key quotations / statistics

- "Every month, over 500 engineers merge 2,500 pull requests into our large monorepo with merge queue, more than double the volume from a few years ago."
- "The average wait time to ship a change has also been reduced by 33%."
- "We can now ship larger groups without the pitfalls and frictions of trains. Trains previously limited our ability to deploy more than 15 changes at once, but now we can safely deploy 30 or more if needed."
- "Merge queue has become the single entry point for shipping code changes at GitHub."
- "By rolling out changes to the process in phases... we were able to slowly transition our large monorepo and all of our repositories responsible for production services onto merge queue by 2023."
- "[Merge queue] shipped 30,000+ pull requests with their associated 4.5 million CI runs for GitHub.com before merge queue was made generally available."
- "Because merge queue is integrated into the pull request workflow (and does not require knowledge of special ChatOps commands, or use of labels or special syntax in comments to manage state), our developer experience is also greatly improved."

## How merge queue works (mechanically)
1. PR passes all required branch protection checks
2. User with write access adds PR to the queue
3. Queue creates temporary branches combining latest base + queued PRs ahead
4. Required status checks run against the merged result
5. If checks pass, PR merges into base branch in FIFO order
6. If a PR conflicts with others, it's automatically detected and removed; queue re-forms

## Annotations for stinger-forge
- This is the canonical real-world validation that merge queues work at scale for `guides/06-merge-queue.md`
- The "33% reduction in wait time" and "2x volume increase" statistics are the key business case metrics
- The temporary branch creation mechanic (gh-readonly-queue/{base}) is important for CI configuration notes
- The FIFO + automatic conflict detection + re-formation behavior is the key operational concept
- The "no ChatOps needed" UX improvement is worth calling out as a developer experience win
