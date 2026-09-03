---
title: "Diátaxis - A systematic approach to technical documentation authoring"
url: https://diataxis.fr/
source_type: official-docs
authority: high
relevance: high
date_accessed: 2026-05-20
topic_tags: [diataxis, documentation-types, framework, information-architecture]
---

# Diátaxis Framework - Overview

## Summary

Diátaxis (from Ancient Greek: "across" + "arrangement") is the canonical framework for organizing and writing technical documentation. Created by Daniele Procida, it identifies four distinct user needs and four corresponding documentation forms: tutorials, how-to guides, technical reference, and explanation. The framework addresses documentation content (what to write), style (how to write it), and architecture (how to organize it). It is proven in hundreds of real-world projects and has been adopted by Cloudflare, Gatsby, Vonage, and many others.

The framework is organized around two axes: one axis runs from practical to theoretical (action vs. cognition); the other runs from serving study/acquisition to serving work/application. Plotting the four documentation types on this compass gives writers a diagnostic tool for detecting mode-mixing - the root cause of most "I don't understand this doc" complaints.

## Key quotations / statistics

- "Diátaxis solves problems related to documentation content (what to write), style (how to write it) and architecture (how to organise it)."
- "It is light-weight, easy to grasp and straightforward to apply. It doesn't impose implementation constraints."
- "Diátaxis has allowed us to build a high-quality set of internal documentation that our users love, and our contributors love adding to." (Greg Frileux, Vonage)
- "While redesigning the Cloudflare developer docs, Diátaxis became our north star for information architecture." (Adam Schwartz, Cloudflare)
- "Diátaxis is proven in practice. Its principles have been adopted successfully in hundreds of documentation projects."

## Annotations for stinger-forge

- This is the primary source for `guides/00-diataxis.md`. The four modes and the compass metaphor should anchor the guide.
- The framework's key insight - that documentation fails when it mixes modes - gives the Bee its first and most important diagnostic step: classify before critiquing.
- The "light-weight, doesn't impose constraints" framing is important: the Stinger should present Diataxis as a lens, not a bureaucratic checklist.
- The two-axis compass (action/cognition, study/work) is the visualization to include in the guide; it helps writers classify ambiguous documents quickly.
- Fetch `https://diataxis.fr/reference-explanation/` for a deeper treatment of the distinction between reference and explanation - this is cited in the Command Brief's open questions.
