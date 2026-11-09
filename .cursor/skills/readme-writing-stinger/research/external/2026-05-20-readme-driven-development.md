---
source_url: https://pandev-metrics.com/docs/blog/readme-driven-development
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: rdd
stinger: readme-writing-stinger
---

# README-Driven Development: How It Changes Your Team (PanDev Metrics, 2026)

## Summary

2026 practitioner post on README-driven development (RDD): the discipline of writing the README before any implementation code. The article synthesizes Tom Preston-Werner's original manifesto with contemporary team metrics, providing quantitative evidence that RDD reduces rewrites and onboarding time. The five core principles are: write README first, treat it as single source of truth, use it to guide implementation, keep it synchronized with code, and use it as a collaboration artifact for team alignment. Key process note: "write the README as if the product already exists - no future tense" and plan for 2.3 review rounds before implementation begins.

## Key quotations / statistics

- "22% fewer rewrites in the first 90 days of a new service" for teams practicing RDD.
- "3x faster onboarding for new engineers."
- "34% less time spent in exploratory coding sessions."
- "1.4 fewer contentious PR discussions in the first 3 months post-launch."
- "Write the README as if the product already exists - no future tense."
- "This design discussion phase typically involves 2.3 review rounds and catches API decisions early."
- Five principles: (1) Write first, (2) Single source of truth, (3) Guide implementation, (4) Keep updated, (5) Collaboration tool.

## Annotations for stinger-forge

- **`guides/04-rdd.md`**: This source is the direct feedstock for the RDD guide. The five principles should map to the guide's five sections. The 22%/3x/34%/1.4 metrics are compelling enough to quote in the guide header as motivation.
- **`guides/00-principles.md`**: The "no future tense" writing rule is a concrete implementation directive to include in the principles guide.
- The 2.3-review-rounds note supports recommending a review gate before coding begins - a concrete process step to include in `guides/04-rdd.md`.
- Companion to ponyfoo source (below): ponyfoo is the philosophical origin story; pandev-metrics provides the team-adoption workflow and the quantitative case. Both belong in `guides/04-rdd.md` citations.
