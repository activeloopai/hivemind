---
source_url: https://adr.github.io/adr-templates/
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: critical
topic: format-variants
stinger: adr-writing-stinger
---

# ADR Templates | adr.github.io (Official ADR Organization)

## Summary

The official ADR templates page maintained by the `adr` GitHub organization. Documents the three primary ADR formats (MADR, Nygard ADR, Y-Statement) and their relationships in a UML class diagram. MADR provides full and minimal templates in annotated and bare variants. Y-statement short form: "In the context of `__`, facing `__` we decided for `__` to achieve `__`, accepting `__`." Long form adds a "because" clause and lists neglected alternatives. Notes that MADR explicitly includes tradeoff analysis (pros/cons of considered options) as a design principle.

## Key quotations / statistics

- Y-statement short form: "In the context of `<situation>`, facing `<concern>` we decided for `<option>` to achieve `<quality>`, accepting `<downside>`."
- Y-statement long form: "In the context of `<situation>`, facing `<concern>`, we decided for `<option>` and neglected `<alternatives>`, to achieve `<quality>`, accepting `<downside>`, because `<rationale>`."
- "MADR is about architectural decisions that matter ([ˈmæɾɚ])."
- "We think that the considered options with their pros and cons are crucial to understand the reasons for choosing a particular design."
- "MADR provides a full and a minimal template, both of which now come in an annotated and a bare format."
- MADR 4.0.0 is referenced as the current version; VS Code extension available but may be outdated.
- cards42 has adopted the Y-statement template; English version adds state information.
- Y-statement source: "Y-Statements - A Light Template for Architectural Decision Capturing" on Medium (Olaf Zimmermann)
- Links to `@joelparkerhenderson`'s collection of additional ADR templates

## Annotations for stinger-forge

- `guides/03-y-statements.md`: The two Y-statement forms (short and long) should be the core of this guide. The long form with "neglected" and "because" clauses is more useful for audit/archaeology than the short form. Present both.
- `guides/02-madr-format.md`: Reference adr.github.io/madr/ directly; MADR 4.0.0 is current; mention VS Code extension caveat (may be outdated).
- `guides/00-principles.md`: The format comparison matrix (Nygard/MADR/Y-statement) should reference this page as the official format registry.
- The cards42 German/English ADR card is an interesting physical format variant for physical teams - mention as an aside.
- Note for stinger-forge: The canonical Y-statement source is Olaf Zimmermann's Medium article, not Jolie Rize as listed in the Command Brief. Both names appear in sources; Zimmermann is the academic attribution, Rize may be a popularization credit. Flag for human review.
