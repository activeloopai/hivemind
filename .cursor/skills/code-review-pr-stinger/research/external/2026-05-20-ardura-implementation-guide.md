---
source_url: https://ardura.consulting/blog/code-review-process-implementation-guide/
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: review-implementation
stinger: code-review-pr-stinger
published: 2026-03-16
author: Bartosz Ciepierski
---

# Code Review Process Implementation Guide (ARDURA Consulting)

## Summary

A detailed implementation guide for standing up a code review process from scratch. Notable for its concrete PR-size-to-turnaround table differentiating standard vs. critical changes, its explicit four-prefix comment taxonomy ([blocker] / [suggestion] / [nit] / [question]), and its conflict-resolution protocol (2-3 comment exchanges then 10-minute sync). Synthesizes Microsoft research on optimal reviewer count (2 reviewers max; a third adds marginal value and triggers the bystander effect) and Google's internal data on review quality degradation above 400 lines and 60-90 minute sessions.

## Key quotations / statistics

- **PR size and turnaround table:**
  - Standard changes: max 400 lines, max 4 business-hour turnaround
  - Critical changes: max 200 lines, max 2 business-hour turnaround, 2 required approvals
- "Research from Microsoft shows [a third reviewer adds diminishing value]."
- "Google's internal research shows that review quality drops sharply when reviewers spend more than 60-90 minutes on a single review or when PRs exceed 400 lines."
- **Four-prefix taxonomy:**
  - `[blocker]` - must be fixed before merge (bug, security issue, correctness problem)
  - `[suggestion]` - could be improved but acceptable as-is
  - `[nit]` - minor style preference, up to the author
  - `[question]` - request for clarification, not a change request
- "Distinguish between objective issues (bugs, security vulnerabilities, performance problems) and subjective preferences (naming conventions, code style, architectural opinions). Objective issues must be fixed - these are not negotiable."
- "For subjective preferences, adopt the rule: if the team has a documented convention, follow it. If there is no convention, the author decides."
- "Timebox the discussion to 2-3 comment exchanges. If not resolved, escalate to a brief synchronous conversation (10 minutes) or to the tech lead for a decision. Never let review comments go back and forth more than 3 times on the same point."
- "Review as gatekeeping. When senior developers use review to enforce their personal preferences - blocking merges over style opinions - it kills team morale and slows delivery."
- "Acknowledge good work. When you see clean code, clever solutions, or thorough testing, say so."
- "Write a good PR description. Explain what the change does, why it is needed, how to test it, and any decisions that might surprise the reviewer."

## Annotations for stinger-forge

- **Best source for the standard-vs-critical PR table** in `guides/03-small-prs.md`. The two-tier system (400 lines / 4h for standard; 200 lines / 2h for critical) is a useful concrete anchor for configurable PR size thresholds.
- **Conflict escalation protocol** (max 3 back-and-forth exchanges, then 10-minute sync, then tech lead) belongs verbatim in `guides/06-comment-coaching.md` as the "what to do when stuck" sub-section.
- **Objective vs. subjective distinction** is a crucial framing for the comment-coaching guide: objective issues (correctness, security) vs. subjective preferences (style, naming). Author decides on subjective; documented conventions rule if they exist.
- **"Review as gatekeeping" anti-pattern** is the most concise definition of one of the five anti-patterns (`guides/05-rubber-stamp-detection.md` covers rubber-stamp; this covers the opposite extreme).
- **Praise norm** (acknowledge good work) reinforces the Google guidance and belongs in the mentorship guide as a named behavioral norm, not just an aside.
