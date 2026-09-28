---
source_url: https://github.blog/engineering/engineering-principles/how-github-uses-merge-queue-to-ship-hundreds-of-changes-every-day
retrieved_on: 2026-05-20
source_type: blog
authority: official
relevance: high
topic: merge-queue
stinger: branching-strategy-stinger
---

# How GitHub Uses Merge Queue to Ship Hundreds of Changes Every Day

## Summary

A GitHub engineering blog post (March 2024) describing how GitHub itself rolled out merge queue internally before making it generally available. This is the most detailed real-world case study of merge queue at scale available in public documentation.

**Scale context:** GitHub's merge queue processes 2,500 pull requests per month into their large monorepo, with over 500 engineers. This is more than double the volume from a few years ago. The average wait time to ship a change has been reduced by 33%.

**Why they built it (three goals):**
1. Improve developer experience: express "I want to ship this" and let the system handle the rest
2. Prevent problematic PRs from impacting everyone: isolate failures so the overall throughput is preserved
3. Be consistent and automated: remove manual toil

**What replaced merge queue (the old system "trains"):** Previously trains limited the team to deploying no more than 15 changes at once. With merge queue, they can safely deploy 30 or more if needed. Trains required knowledge of special ChatOps commands or labels to manage state.

**Key operational insight:** GitHub rolled out changes in phases, testing and rolling back early in the morning before most developers started working. The transition to merge queue covered their large monorepo AND all repositories responsible for production services.

**Developer experience improvement:** One engineer described merge queue as "one of the best quality-of-life improvements to shipping changes that I've seen at GitHub." The key UX win: developers can add their PR to the queue and leave the queue with a single click if they spot an issue - no special commands required.

**Availability:** Merge queue is available to public repositories on GitHub.com owned by organizations and to all repositories on GitHub Enterprise (Cloud or Server).

## Key quotations / statistics

- "Every month, over 500 engineers merge 2,500 pull requests into our large monorepo with merge queue, more than double the volume from a few years ago."
- "The average wait time to ship a change has also been reduced by 33%."
- "We can now safely deploy 30 or more [PRs at once] if needed." (up from 15 with the old trains system)
- "Merge queue has become the single entry point for shipping code changes at GitHub."
- "Merge queue was tested at scale, shipping 30,000+ pull requests with their associated 4.5 million CI runs, for GitHub.com before merge queue was made generally available."

## Annotations for stinger-forge

- Use as the primary case study in `guides/06-merge-queue.md` - GitHub's own dogfooding is the strongest endorsement of the feature.
- The 33% wait-time reduction metric is the most quotable business outcome.
- The 30-PR group size (up from 15-train limit) illustrates the "build concurrency" configuration parameter from the official docs.
- The phased rollout (early-morning testing, rolling back if needed) is a template for the migration section of `guides/06-merge-queue.md`.
- Note: this is a 2024 post, not 2026. The data is still valid because merge queue mechanics haven't changed materially. Flag in the guide that this represents 2024 scale numbers.
