---
source_url: https://arxiv.org/html/2604.27333v1
retrieved_on: 2026-05-20
source_type: white-paper
authority: official
relevance: high
topic: format-variants
stinger: adr-writing-stinger
---

# One Size Fits All? An Empirical Comparison of ADR Templates | arXiv 2026-04-30

## Summary

A peer-reviewed empirical study (arXiv 2604.27333, published April 30, 2026) comparing five ADR templates: Tyree/Akerman (2005), Nygard (2011), arc42 (2024), Y-statements (2013), and MADR (2018). Methodology: DESMET Feature Analysis by experts to select top 2 (Nygard and MADR), followed by a controlled experiment with 33 undergraduate software engineering students. Results: Nygard outperforms MADR in Overall Score. Key finding: Nygard supports concise/objective documentation; MADR facilitates structural details and specific architectural requirements. Provides an evidence-based template selection guide.

## Key quotations / statistics

- "The top-performing templates were those of Nygard and MADR" (expert feature analysis)
- "In the subsequent controlled experiment, Nygard's template outperformed MADR in terms of the Overall Score."
- "Nygard supports concise and objective documentation, while MADR facilitates structural details and specific architectural requirements."
- Template comparison table:

| Template | Year | Expected Length | Key Focus |
|---|---|---|---|
| Tyree/Akerman | 2005 | 1-2 pages | Detailed rationale and implications |
| Nygard ADR | 2011 | 3-5 short paragraphs | Minimalist, log-based versioning |
| arc42 | 2012 | Multi-section (Long) | Full architectural integration |
| Y-Statements | 2013 | Single Sentence | High-level decision summary |
| MADR | 2018 | 1 page (Structured) | Options comparison and pros/cons |

- "Providing an evidence-based strategy for ADR template adoption by offering a comparison between them."
- The study used 33 undergraduate students - sample size caveat for stinger-forge.

## Annotations for stinger-forge

- `guides/00-principles.md`: This study provides the authoritative evidence-based rationale for defaulting to Nygard. The format comparison table (with years, lengths, and key focus) belongs in the format comparison matrix.
- `guides/02-madr-format.md`: The finding that MADR "facilitates structural details and specific architectural requirements" informs the "when to use MADR" decision criteria - use MADR when the team needs structured options comparison, not just minimalism.
- `guides/03-y-statements.md`: Y-statements are classified as "single sentence, high-level decision summary" - corroborates positioning as a lightweight summary format rather than a replacement for full ADRs.
- Citation note: This is the only peer-reviewed source in the research corpus. Its findings (Nygard wins on overall comprehension and usability) provide academic backing for the stinger's default-to-Nygard recommendation.
- Caveat: 33 undergraduate students is a small, possibly unrepresentative sample. The stinger should use the findings directionally, not as definitive proof.
