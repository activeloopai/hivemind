---
source_url: https://www.archyl.com/blog/architecture-decision-records-best-practices
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: best-practices
stinger: adr-writing-stinger
---

# Best Practices for Architecture Decision Records (ADRs) - Archyl Blog (2025)

## Summary

A January 2025 practitioner article focusing on practical adoption patterns, common mistakes, and the workflow for making ADRs a sustainable habit. Key insights: write ADRs during (not after) the decision, store them with code in `docs/adr/`, create a template to reduce friction, and review quarterly. Strong section on the "Rejected" status as uniquely valuable for capturing why something was NOT chosen.

## Key quotations / statistics

- "The format is deliberately lightweight. An ADR should fit on one page. If it's longer, you're probably documenting more than one decision."
- "The rejected status is particularly valuable. Sometimes you want to capture why you didn't do something, so future teams don't propose the same thing."
- "Be specific about constraints. 'We need ACID compliance' is much more useful than 'we need reliability.'"
- "State the decision clearly. Not 'we might consider' or 'we should explore' - what we actually decided."
- "Documenting what you didn't choose is often as valuable as documenting what you did."
- "The best time to write an ADR is during the decision process, not weeks later."
- "If your ADR is more than one page, you're probably: documenting multiple decisions (split into multiple ADRs); including implementation details (save that for design docs); overexplaining obvious context."
- Four common mistakes: writing after the fact, making them too long, not linking related ADRs, abandoning the practice.
- Status lifecycle: Proposed -> Accepted -> Deprecated (no longer relevant) / Superseded (replaced by newer ADR) / Rejected

## Annotations for stinger-forge

- `guides/00-principles.md`: The "Rejected" status insight is a key differentiator from the basic Nygard model - include as a fifth status alongside Proposed/Accepted/Deprecated/Superseded.
- `guides/01-nygard-format.md`: The "ACID compliance vs reliability" contrast is a great example of good vs bad Context writing.
- `guides/04-supersession-workflow.md`: The distinction between Deprecated (no longer relevant) and Superseded (replaced) is clearly articulated here.
- `guides/05-tooling-integration.md`: The template creation advice and `docs/adr/` directory convention belong in the tooling guide.
- `guides/06-adr-as-onboarding-tool.md`: The quarterly review cadence and PR template "Architecture Impact" checkbox are actionable patterns.
- No contradictions with other sources. This article and the Archyl 2026 guide are complementary.
