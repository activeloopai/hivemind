---
source_url: https://oneuptime.com/blog/post/2026-01-30-sre-game-day-exercises/view
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: runbook-as-test
stinger: runbook-writing-stinger
---

# How to Create Game Day Exercises - OneUptime

Published: 2026-01-30

## Summary

- **Game day definition**: "A planned event where engineering teams intentionally inject failures into their systems to test incident response capabilities, validate runbooks, and identify weaknesses before real incidents occur. Think of it as a fire drill for your infrastructure."
- **Game day vs. chaos engineering**: Game days are scheduled events with defined participants, clear objectives, and structured observation periods. Chaos engineering runs continuously. Runbook validation uses game days, not continuous chaos.
- **Planning phases**: Initial Planning (4-6 weeks before), Detailed Design (2-3 weeks before), Dry Run (1 week before), Final Prep (2-3 days before), Game Day execution, Debrief (within 48 hours).
- **Quarterly program structure**: Q1 = Database/Storage, Q2 = Network/Dependencies, Q3 = Compute/Scaling, Q4 = Full Stack. Each game day has a theme so teams know what runbooks to prepare.
- **Runbook accuracy metric**: "Did the runbook match actual steps taken? (Observer comparison, scale 1-5)" - shows this is a measurable quality metric, not subjective.
- **Success criteria model**: Each scenario lists the runbook being validated and defines success as "Runbooks followed without deviation."
- **Three metrics to track**: time_to_detect (target < 60 seconds), time_to_acknowledge (target < 5 minutes), time_to_mitigate (target < 30 minutes).
- **Building a program**: Start with tabletop exercises (verbal walkthrough before injecting real failures), then move to live injection.
- **AWS FIS approach (from AWS blog, July 2025)**: AWS's FIS team runs game days with standardized templates, reduced execution time from days to hours via repeatable templates, now runs weekly cadence. "Each feature release in FIS requires a game day exercise."

## Direct quotes

- "A game day is a planned event where engineering teams intentionally inject failures into their systems to test incident response capabilities, validate runbooks, and identify weaknesses before real incidents occur."
- "Game days are the single most effective practice for maintaining runbook quality." (also confirmed by CloudToolStack source)
- "Start with tabletop exercises: Before injecting real failures, walk through scenarios verbally to identify gaps in understanding."
- "Runbook accuracy: Did the runbook match actual steps taken? Observer comparison, scale 1-5."

## Implications for stinger-forge

- `guides/05-runbook-as-test.md` should encode the full game day lifecycle (planning phases, roles, success criteria, debrief structure), not just "run the runbook in staging."
- The quarterly program structure (Q1-Q4 themes) is a concrete template stinger-forge can include as a recommended cadence.
- The `runbook_accuracy` metric (observer comparison, 1-5 scale) gives stinger-forge a measurable KPI to embed in the exercise protocol.
- "Dry run" phase (1 week before) is specifically about verifying injection mechanisms and rollback procedures - maps to the Command Brief's rollback-procedure requirement.
- The tabletop exercise option is important for teams that cannot inject failures into production-like environments; stinger-forge should include it as a lighter variant in `guides/05-runbook-as-test.md`.
