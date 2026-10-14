---
title: "Every Page is Page One - Topic-based Writing for Technical Communication and the Web"
url: https://everypageispageone.com/ | http://xmlpress.net/publications/eppo/
source_type: book
authority: high
relevance: medium
date_accessed: 2026-05-20
topic_tags: [reader-lens, topic-based-writing, self-contained-docs, context, web-navigation]
---

# Every Page is Page One (Mark Baker)

## Summary

"Every Page is Page One" is a book and blog by Mark Baker (XML Press, 2013, still widely cited) that establishes a design philosophy for technical documentation in the web era. The core insight is that readers no longer access documentation sequentially. On the web there is "no first, last, previous, next, up, or back" - every page a reader arrives at, typically via search or a direct link, becomes their page one. Documentation that assumes prior reading will fail these readers.

**Seven design principles for EPPO topics:**
1. **Self-contained** - Every topic must contain all content needed to fulfill its purpose without linear dependencies on other topics. Do not write "as described in the previous section."
2. **Specific and limited purpose** - Each topic serves a single, well-defined purpose within the reader's overall task.
3. **Establish context** - Cannot assume prior reading; must provide necessary background to orient the reader.
4. **Conform to a type** - Topics should follow a recognizable type (tutorial, how-to, reference, explanation - the Diataxis modes are the natural mapping here).
5. **Assume the reader is qualified** - How-to guides assume competence; do not write for every possible level simultaneously.
6. **Stay on one level** - A topic pitched at one level of abstraction or detail should not suddenly shift to another.
7. **Link richly** - Because topics cannot contain everything, they must link generously to related content.

**EPPO and the inverted pyramid:** Every page being page one makes the opening paragraph even more critical. A reader who arrives cold needs the most important information immediately to orient themselves - this is the inverted pyramid applied at the navigation level, not just the prose level.

**EPPO and Diataxis:** The EPPO topology of "topics as hubs in a network" rather than "pages as steps in a sequence" is complementary to Diataxis. Diataxis defines what kind of document each topic should be; EPPO defines how each topic should work as a standalone unit. A well-structured Diataxis how-to guide that also applies EPPO principles will be self-contained, purpose-specific, and richly linked.

## Key quotations / statistics

- "On the web, there is no first, last, previous, next, up, or back anymore - every page a reader arrives at becomes their page one."
- "Every page is page one topics must be: self-contained, specific and limited purpose, establish context, conform to a type, assume the reader is qualified, stay on one level, and link richly."
- "This reflects how readers actually seek information - through search and browsing rather than sequential reading."
- EPPO uses "bottom-up organization where every page functions as a hub in a network," contrasted with "top-down hierarchical structures."

## Annotations for stinger-forge

- `guides/04-reader-lens.md` should open with the EPPO principle as the foundational motivation: because readers arrive cold, the "what does the reader already know?" lens is not optional - it is a prerequisite for basic usability.
- The seven EPPO principles map to concrete review heuristics: (1) Does the doc rely on a previously read doc? (2) Does it have a single clear purpose? (3) Does it state its context/prerequisites? (4) Does it conform to a Diataxis mode? (5) Does it correctly assume its audience's competence level? (6) Is it pitched consistently at one level? (7) Does it link to related content where it omits detail?
- The "conform to a type" principle is the bridge between EPPO and Diataxis: the type IS the Diataxis mode. Stinger-forge should make this connection explicit in `guides/00-diataxis.md` and `guides/04-reader-lens.md`.
- The EPPO "link richly" principle is a structural recommendation that interacts with the Bee's scope boundary: the Bee can recommend links, but cannot restructure the docs layout/navigation (that is library-worker-bee's job).
- Baker's book is from 2013 but the principle is more relevant than ever given the dominance of AI-assisted search and chatbot citations in 2026. Every page must answer the question cold because AI citations increasingly pull individual paragraphs out of context.
