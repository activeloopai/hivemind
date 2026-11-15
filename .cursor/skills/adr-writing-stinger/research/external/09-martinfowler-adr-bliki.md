---
source_url: https://martinfowler.com/bliki/ArchitectureDecisionRecord.html
retrieved_on: 2026-05-20
source_type: blog
authority: official
relevance: high
topic: overview
stinger: adr-writing-stinger
---

# Architecture Decision Record | Martin Fowler's Bliki

## Summary

Martin Fowler's concise canonical reference for ADRs on martinfowler.com. Covers the basics: short document, numbered files with decision-describing names (e.g., "0001-HTMX-for-active-web-pages"), immutability once accepted, status lifecycle (proposed -> accepted -> superseded), and the link-to-superseding rule. Adds the insight about recording confidence level of a decision and naming triggers for re-evaluation.

## Key quotations / statistics

- "An Architecture Decision Record (ADR) is a short document that captures and explains a single decision relevant to a product or ecosystem."
- "Documents should be short, just a couple of pages, and contain the decision, the context for making it, and significant ramifications."
- "They should not be modified if the decision is changed, but linked to a superseding decision."
- "Each record should be its own file, and should be numbered in a monotonic sequence as part of their file name, with a name that captures the decision, so that they are easy to [find] in a directory listing. (for example: '0001-HTMX-for-active-web-pages')"
- "Each ADR has a status. 'proposed' while it is under discussion, 'accepted' once the team accepts it and it is active, 'superseded' once it is significantly modified or replaced - with a link to the superseding ADR."
- "Once an ADR is accepted, it should never be reopened or changed - instead it should be superseded. That way we have a clear log of decisions and how long they governed the work."
- "It's handy to record the confidence level of the decision."
- "This is a good place to mention any changes in the product context that should trigger the team to reevaluate the decision."

## Annotations for stinger-forge

- `guides/00-principles.md`: Fowler's summary is the cleanest external authority statement for ADRs. The "never reopened or changed" immutability principle and the "clear log of how long they governed the work" rationale are quotable.
- `guides/01-nygard-format.md`: The filename convention (`0001-HTMX-for-active-web-pages`) reinforces the kebab-case naming pattern and shows the title carries meaning in the filename.
- `guides/04-supersession-workflow.md`: The confidence level recording and "trigger for re-evaluation" concepts are forward-looking additions not in Nygard's original. Consider adding a "Review Triggers" field to the extended template.
- This source is authoritative as a secondary endorsement (Fowler links to and endorses Nygard's work). Use it to show that ADRs have mainstream architecture endorsement beyond Nygard alone.
