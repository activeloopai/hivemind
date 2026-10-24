---
source_url: https://codecraftdiary.com/2026/04/04/trunk-based-development-why-most-teams-think-they-use-it-but-dont/
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: trunk-based-development
stinger: code-review-pr-stinger
published: 2026-04-04
author: codecraftdiary
---

# Trunk-Based Development: Why Most Teams Think They Use It (But Don't) (CodeCraft Diary)

## Summary

A practitioner analysis of the gap between teams that claim trunk-based development and those that actually practice it. Focuses on the three failure modes that prevent real TBD: PRs that are too large, code reviews that block integration (1-day delays compound into 5-day PR lifetimes), and fear of merging incomplete work. The case study embedded in the article documents a team that introduced three rules (PR mergeable same day; 300-line soft limit; feature flags for incomplete work) and saw PR size drop 40%, review time drop from days to hours, and merges increase to multiple per day.

## Key quotations / statistics

- "Trunk-based development is not about branches. It's about integration frequency and safety."
- "At its core, it requires: merging to main at least daily (ideally multiple times per day); keeping changes small enough to review quickly; having strong safety mechanisms in place."
- **Review latency is the integration killer:**
  - "1 day → integration is delayed"
  - "2-3 days → conflicts increase"
  - "5 days → context is lost"
- **Feature flags are required, not optional:** "Without feature flags: you need to finish everything before merging; you keep a long-lived branch; integration is delayed. With feature flags: merge partial work; deploy continuously; control exposure."
- **Three rules from case study:**
  1. "PR must be mergeable within the same day"
  2. "No PR over ~300 lines (soft limit)"
  3. "Feature flags for incomplete features"
- **Results of implementing three rules:** "PR size dropped by ~40%; review time dropped to hours; merges increased to multiple per day; production issues decreased."
- "CI under 10 minutes → good; under 5 minutes → ideal." (Without fast CI, TBD collapses.)
- **Checklist for "are you actually doing TBD?":**
  - Do you merge to main multiple times per day?
  - Are most PRs reviewed within hours, not days?
  - Can you safely merge incomplete work?
  - Are branches short-lived (hours, not days)?
- "With AI-assisted coding, developers can generate code faster than ever. If you don't enforce: small changes; fast integration; clear boundaries - the review queue becomes a bottleneck."

## Annotations for stinger-forge

- **Best practitioner source for `guides/03-small-prs.md`**: The case study results (40% PR size reduction, review time from days to hours) are the strongest before/after data set in the research corpus. The three rules are implementable immediately.
- **"Feature flags for incomplete work"** is the key enabler that separates genuine small-PR culture from "we claim to do small PRs but actually batch features." Include as a named dependency in the small-PR guide.
- **Review latency as integration risk**: The 1-day/2-3-day/5-day compounding effect graph (implied) is a compelling visualization anchor for `guides/04-async-review.md`. Even "fast" 1-day review creates integration delay that undermines TBD.
- **"Same day merge" target** is a more aggressive SLA than the 4-business-hour first-review norm from other sources. The stinger should present both and let teams choose based on their TBD ambition level.
- **CI speed dependency** (under 10 minutes) is a prerequisite that belongs as a prerequisite call-out at the top of `guides/03-small-prs.md`, since slow CI nullifies small-PR discipline.
- **Contradiction with other sources**: 300-line soft limit here vs. 400-line threshold elsewhere. The stinger should document this as a configurable constant (default: 400 lines per PR, adjustable to 200-300 for teams pursuing stricter TBD).
