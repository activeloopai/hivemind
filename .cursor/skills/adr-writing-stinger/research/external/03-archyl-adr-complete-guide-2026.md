---
source_url: https://www.archyl.com/blog/architecture-decision-records-complete-guide
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: lifecycle
stinger: adr-writing-stinger
---

# Architecture Decision Records (ADR): The Complete Guide - Archyl Blog (2026)

## Summary

A comprehensive January 2026 guide covering ADR anatomy, the full lifecycle (Draft -> Proposed -> Accepted -> Active -> Superseded -> Deprecated), governance, tooling integration (linking to C4 model elements), and the Lightweight ADR (LADR) three-sentence variant. Particularly strong on the "Alternatives Considered" section's long-term value and the governance cadence (quarterly reviews). Introduces the concept of a "decision log" - a chronological index of all ADRs.

## Key quotations / statistics

- "Every ADR answers four fundamental questions: What was the context? What did we decide? What alternatives did we consider? What are the consequences?"
- "A well-written ADR can answer all four in less than a page."
- "Context is the most important section. Include specific numbers ('we process 50K orders per day'), constraints ('must comply with PCI-DSS'), and team factors ('three engineers have PostgreSQL experience, none have MongoDB experience')."
- "Decision should be unambiguous. 'We will use PostgreSQL 16 as the primary data store for the order service' is good. 'We should probably consider a relational database' is not an ADR - it's a suggestion."
- "Alternatives Considered is the section that saves the most time long-term. Without this section, teams relitigate the same debates endlessly."
- "Importantly, you should never delete ADRs - even rejected decisions are valuable because they prevent future teams from reconsidering options that were already evaluated."
- Full lifecycle: Draft/Proposed -> Accepted -> Active -> Superseded -> Deprecated
- Lightweight ADR (LADR) format: "In the context of [situation], we decided [decision], to achieve [goal], accepting [trade-off]."
- Decision log table format: `| # | Date | Decision | Status |`

## Annotations for stinger-forge

- `guides/01-nygard-format.md`: The four-question framework is an excellent opening hook. The PostgreSQL example is a strong concrete "Decision" section example.
- `guides/04-supersession-workflow.md`: The five-stage lifecycle (Draft/Proposed -> Accepted -> Active -> Superseded -> Deprecated) is the most complete status taxonomy found in research.
- `guides/03-y-statements.md`: The LADR three-sentence format ("In the context of... we decided... to achieve... accepting...") is effectively a Y-statement variant. Cross-reference with Y-statement guide.
- `guides/06-adr-as-onboarding-tool.md`: The "decision log" index table (`# | Date | Decision | Status`) is the canonical format for the `adr-log.md` index file.
- Contradiction note: The "Alternatives Considered" section is presented as essential here, but Nygard's original template does not include it. Stinger-forge should note this as evolutionary best practice layered on top of the original format.
