---
title: "Write the Docs Community - Software Documentation Guide and Style Guides"
url: https://www.writethedocs.org/guide | https://www.writethedocs.org/guide/writing/docs-principles.html | https://www.writethedocs.org/guide/writing/style-guides/
source_type: community
authority: medium
relevance: medium
date_accessed: 2026-05-20
topic_tags: [community, style-guides, documentation-principles, voice, tone, consistency]
---

# Write the Docs Community Resources

## Summary

Write the Docs is the largest community of technical writers, developers, and documentation enthusiasts. Their public guide is a "living, breathing" knowledge base that aggregates collective wisdom about software documentation. It covers general principles, style guide recommendations, and community-curated resources. The April 2025 newsletter confirms the community remains actively maintained heading into 2026.

**Documentation principles (ARID + skimmable + exemplary + consistent + current):**
- **ARID** (Accept Repetition In Documentation) - Unlike code, some repetition in docs is necessary and beneficial. A how-to guide should not rely on the reader having read an earlier how-to guide; each page must provide enough context to stand alone. This aligns with "Every Page is Page One."
- **Skimmable** - Documentation must be easy to scan and navigate. This is achieved through headings, bullet lists, code blocks, and the inverted pyramid.
- **Exemplary** - Include practical examples. Abstract descriptions without examples fail developers. This aligns with code example discipline.
- **Consistent** - Maintain uniform style and tone across all content. This is where style guides and Vale linting apply.
- **Current** - Keep information up-to-date. This is the "docs updated in same PR" principle from docs-as-code.

**Process principles:**
- **Precursory** - Begin documenting before development starts; docs should be a design artifact, not an afterthought.
- **Participatory** - Include developers, engineers, and end users throughout the documentation process.

**Style guide guidance from Write the Docs:** A style guide maintains consistent voice, tone, and style across documentation, reducing cognitive load for readers. The community recommends choosing or adapting an existing style guide (Microsoft, Google, Apple) rather than writing one from scratch. Key consideration: long comprehensive pages vs. short focused topics depends on audience, content type, and delivery method.

**Community resources:** Write the Docs maintains a curated list of published style guides including Google, Microsoft, Apple, GitLab, Digital Ocean, and many others. This list is valuable for the Bee when a "house style" is referenced in an input but not provided.

## Key quotations / statistics

- "Documentation should be: ARID (Accept Repetition In Documentation) - unlike code, some repetition is necessary in docs."
- "A style guide maintains consistent voice, tone, and style across documentation, reducing cognitive load for readers."
- "The guide emphasizes that anyone can contribute to improving documentation practices."
- Documentation should be "Precursory (begin documenting before development starts) and Participatory (include developers, engineers, and end users)."
- "Whether to use long, comprehensive pages or short, focused topics... depends on your audience, content type, and delivery method."

## Annotations for stinger-forge

- The ARID principle is an important counterweight to the "DRY" (Don't Repeat Yourself) principle from coding. `guides/04-reader-lens.md` should include a section noting that prerequisites and context should be restated per document even if they appear elsewhere in the docs set.
- The "skimmable" principle maps to the Bee's heading-review step: headings must enable navigation without reading the surrounding text.
- The community's style guide list (https://www.writethedocs.org/guide/writing/style-guides/) is a useful reference for the Bee when a user provides a style guide name but not the document itself - the Bee can look up the appropriate guide.
- The "precursory and participatory" principle is relevant for `guides/05-ghostwriting.md`: the ghostwriting process should include an intake step to understand the audience and context before drafting.
- Write the Docs conference talks (writethedocs.org/videos/) are a secondary source that stinger-forge could consult for worked examples of documentation review processes.
