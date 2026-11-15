---
source_url: https://google.github.io/eng-practices/review/reviewer/standard.html
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: critical
topic: code-review-standard
stinger: code-review-pr-stinger
---

# The Standard of Code Review (Google Engineering Practices)

## Summary

Google's engineering practices documentation establishes the canonical standard for code review quality: reviewers should favor approving a CL (change list) once it "definitely improves the overall code health of the system being worked on, even if the CL isn't perfect." This is explicitly the **senior principle** among all code review guidelines, and it directly counters perfectionism-driven review blocking. The document frames review as a continuous improvement mechanism, not a gatekeeping checkpoint, and explicitly enables mentorship as part of the review process.

## Key quotations / statistics

- "In general, reviewers should favor approving a CL once it is in a state where it definitely improves the overall code health of the system being worked on, even if the CL isn't perfect."
- "There is no such thing as 'perfect' code - there is only better code."
- "A CL that, as a whole, improves the maintainability, readability, and understandability of the system shouldn't be delayed for days or weeks because it isn't 'perfect'."
- "Reviewers should always feel free to leave comments expressing that something could be better, but if it's not very important, prefix it with something like 'Nit: ' to let the author know that it's just a point of polish that they could choose to ignore."
- On mentoring: "Code review can have an important function of teaching developers something new about a language, a framework, or general software design principles. It's always fine to leave comments that help a developer learn something new."
- "Technical facts and data overrule opinions and personal preferences."
- On style: "Any purely style point (whitespace, etc.) that is not in the style guide is a matter of personal preference."
- On conflict resolution: "Don't let a CL sit around because the author and the reviewer can't come to an agreement." (Escalation path: team discussion → Tech Lead → maintainer → Eng Manager)

## Annotations for stinger-forge

- **Directly supports `guides/00-principles.md`**: The "improve overall code health, not perfection" principle is the axiomatic foundation for the Bee's entire approach. Quote verbatim.
- **Supports the three-tier taxonomy**: Google's "Nit:" prefix is the authoritative canonical precedent for differentiating blocking vs. advisory comments. The Bee's taxonomy (blocker / suggestion / thought) maps to Google's (required / Nit / educational).
- **Supports `guides/06-comment-coaching.md`**: The "comments about code, not the developer" principle, plus the escalation path for unresolvable conflicts, belong in the coaching guide.
- **Supports `guides/00-principles.md` mentoring section**: Google explicitly frames mentorship as an embedded function of review, not a separate activity.
- **Contradiction to watch**: Google uses "Nit:" for minor polish but does not distinguish "suggestion" from "blocker" with explicit prefixes the way the Pillai or ARDURA guides do. The Bee should synthesize a consistent three-tier taxonomy citing Google as precedent for the "Nit:" tier.
