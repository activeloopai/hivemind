---
source_url: https://specsource.dev/en/blog/how-to-write-architecture-decision-records
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: writing-guide
stinger: adr-writing-stinger
---

# How to Write Architecture Decision Records | Specsource (2026)

## Summary

An April 2026 guide focused on the writing act itself: what makes the three "most-skipped" sections (Alternatives Considered, Consequences, Status) actually useful. Strong emphasis on the philosophical distinction between an ADR and a justification document. Introduces the five-status taxonomy (proposed/accepted/rejected/superseded/deprecated) as the most complete set. Excellent on the "moment of decision" concept: an ADR describes the moment when multiple options were live and one was chosen, not the current state of the system.

## Key quotations / statistics

- "An ADR is not a design document. It is not a technical specification. It is a record of a specific decision, captured at the moment it was made, with enough context to be understood by someone who was not in the room."
- "A decision has a moment. Before it, multiple options were live. After it, one was chosen."
- "The codebase shows you that RLS is in use. The ADR explains why it was chosen over the alternatives."
- "Alternatives considered is the most important section. The decision itself is visible in the codebase. What is not visible is what you ruled out and why."
- "Without the alternatives, future developers cannot tell whether you considered their idea or never thought of it."
- "Consequences forces honesty. Writing down the real downsides of a decision... is what separates an ADR from a justification document."
- "The five statuses worth using are: proposed, accepted, rejected, superseded, and deprecated."
- "Rejected is for options that were put forward and turned down, worth keeping as a record so the team does not revisit the same idea every quarter."
- "Superseded means a newer decision replaced this one, with a reference. Deprecated means the decision no longer applies but was not formally replaced by anything."
- "The format matters far less than the habit. An ADR in a text file in your repository is infinitely more useful than an undocumented decision sitting in someone's memory."
- "Write the context first. Then the alternatives. Then the decision and its consequences."

## Annotations for stinger-forge

- `guides/00-principles.md`: The "moment of decision" concept is the clearest philosophical statement of what an ADR is. Opens with "Before it, multiple options were live. After it, one was chosen."
- `guides/01-nygard-format.md`: The five-status taxonomy (adding Rejected explicitly to Nygard's four) is the consensus 2026 standard and should be the canonical list in the Nygard guide.
- `guides/04-supersession-workflow.md`: The Deprecated vs Superseded distinction ("deprecated means no longer applies but was not formally replaced by anything") is the clearest definition found in research.
- The writing order recommendation ("context first, then alternatives, then decision and consequences") is a valuable tip for the principles or Nygard format guide.
- No contradictions with other sources; the "justification document" anti-pattern aligns with Docsio's "empty consequences" anti-pattern.
