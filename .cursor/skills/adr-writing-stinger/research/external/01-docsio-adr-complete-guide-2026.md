---
source_url: https://docsio.co/blog/architecture-decision-record
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: overview
stinger: adr-writing-stinger
---

# Architecture Decision Record: The Complete Guide (2026) | Docsio

## Summary

A comprehensive 2026 guide to ADRs covering the canonical Nygard template, the "decisions, not docs" philosophy, immutability rules, when to write an ADR, anti-patterns, and lifecycle maintenance. Strongly emphasises brevity (one page max), negative consequences, and immutability of accepted records. Includes concrete advice on linking ADRs from code comments, quarterly review cadences, and avoiding the "novel" anti-pattern.

## Key quotations / statistics

- "The format is deliberately lightweight. An ADR should fit on one page. If it's longer, you're probably documenting more than one decision."
- "Write an ADR for any decision that will be hard to reverse, has consequences across more than one team, or that you would want a new engineer to find when they ask 'why did we do this?'"
- "Once accepted, ADRs are immutable. If a team starts editing old ADRs to 'keep them current,' the decision log loses its archaeological value."
- "A comment in payments/processor.ts that says // ADR-0034: PCI scope kept to Stripe Elements is the cheapest possible way to keep the decision visible in the place it actually applies."
- "Write ADR-0001 about adopting ADRs. Yes, the first ADR is about ADRs themselves."
- "Tag ADRs with a 'review by' date for high-stakes decisions. Anything with a security or scaling commitment gets a 12-month review trigger."
- "The empty consequences section. 'Consequences: This will improve performance.' That's not consequences, that's a decision restated. Real consequences include the negative ones: cost, complexity, risk, lock-in."
- Five categories that warrant an ADR: new technology adoption, structural choices, non-functional commitments, trade-offs you might forget, and decisions that override existing ADRs.

## Annotations for stinger-forge

- `guides/00-principles.md`: The "decisions, not docs" framing and immutability rule are perfectly articulated here. Use the "novel" and "empty consequences" anti-patterns as negative examples.
- `guides/01-nygard-format.md`: Provides the copy-paste Nygard template introduction and the five ADR trigger categories.
- `guides/06-adr-as-onboarding-tool.md`: The code-comment linking pattern (`// ADR-0034: ...`) is the key practical pattern for embedding ADR references.
- `guides/04-supersession-workflow.md`: The quarterly review cadence and "review by" date tagging are worth incorporating.
- No contradictions with other sources. This is the most current (April 2026) general overview and is highly consistent with Nygard's original framing.
