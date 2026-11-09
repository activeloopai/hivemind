---
source_url: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
retrieved_on: 2026-05-20
source_type: blog
authority: official
relevance: critical
topic: nygard-format
stinger: adr-writing-stinger
---

# Documenting Architecture Decisions - Michael Nygard (2011)

## Summary

The canonical source that defined the Architecture Decision Record format. Nygard proposes storing short Markdown text files in `doc/arch/adr-NNN.md`, numbered sequentially and monotonically (never reused). Each ADR has five sections: Title (short noun phrase), Context (value-neutral facts about forces at play), Decision (stated in active voice: "We will..."), Status (proposed/accepted/deprecated/superseded), and Consequences (all outcomes including negative ones). ADRs are immutable once accepted; reversed decisions are kept but marked superseded. The document is described as "a conversation with a future developer."

## Key quotations / statistics

- "We will keep a collection of records for 'architecturally significant' decisions: those that affect the structure, non-functional characteristics, dependencies, interfaces, or construction techniques."
- "An architecture decision record is a short text file in a format similar to an Alexandrian pattern."
- "Context: The language in this section is value-neutral. It is simply describing facts."
- "Decision: This section describes our response to these forces. It is stated in full sentences, with active voice. 'We will …'"
- "Status: A decision may be 'proposed' if the project stakeholders haven't agreed with it yet, or 'accepted' once it is agreed. If a later ADR changes or reverses a decision, it may be marked as 'deprecated' or 'superseded' with a reference to its replacement."
- "Consequences: All consequences should be listed here, not just the 'positive' ones."
- "If a decision is reversed, we will keep the old one around, but mark it as superseded. (It's still relevant to know that it was the decision, but is no longer the decision.)"
- "The whole document should be one or two pages long. We will write each ADR as if it is a conversation with a future developer."
- "Bullets kill people, even PowerPoint bullets." (On requiring full sentences, not bullet fragments.)
- "ADRs will be numbered sequentially and monotonically. Numbers will not be reused."

## Annotations for stinger-forge

- `guides/01-nygard-format.md`: This is THE primary source. Reproduce the five sections (Title, Context, Decision, Status, Consequences) verbatim with attribution. The "conversation with a future developer" framing should open the guide.
- `guides/00-principles.md`: The "architecturally significant" definition (affects structure, non-functional characteristics, dependencies, interfaces, or construction techniques) is the canonical decision filter.
- `guides/04-supersession-workflow.md`: The supersession immutability rule originates here: keep old records, mark superseded, add reference.
- Note: Nygard's original template does not include "Alternatives Considered" - that section was added by later practitioner evolution (MADR, etc.). Stinger-forge should note this evolution.
- Archive note: The original Cognitect URL is the authoritative source. The bookmark at `bookmarks.1729.org.uk/assets/4` is a reliable mirror preserving the full text.
