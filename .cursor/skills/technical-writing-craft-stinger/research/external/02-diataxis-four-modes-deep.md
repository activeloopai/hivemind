---
title: "Diátaxis - Tutorials, How-to Guides, Explanation (canonical sub-pages)"
url: https://diataxis.fr/tutorials/ | https://diataxis.fr/how-to-guides/ | https://diataxis.fr/explanation/
source_type: official-docs
authority: high
relevance: high
date_accessed: 2026-05-20
topic_tags: [diataxis, tutorials, how-to-guides, explanation, mode-classification]
---

# Diátaxis - Four Modes Deep Dive

## Summary

This file consolidates the canonical sub-pages for three of the four Diataxis modes (tutorials, how-to guides, explanation) into a single annotated research note. Each mode has a precise definition, key principles, a characteristic language pattern, and an anti-pattern list. Understanding the distinctions between modes - especially the tutorial/how-to conflation and the explanation/reference confusion - is essential for the Bee's classification step.

**Tutorials** are learning-oriented. The teacher takes full responsibility; the student only follows. Key principles: show the destination first, deliver results early and often, ruthlessly minimise explanation, focus on the concrete, ignore alternatives. Language: "we" (shared journey), "First, do x. Now, do y.", "You have built a...". Anti-pedagogical temptations: abstraction, generalisation, explanation, choices, information.

**How-to guides** are goal-oriented (serve the already-competent user). They must be addressed to real-world problems (user perspective), not tool operations (machine perspective). Key principles: address real-world complexity, omit the unnecessary, describe a logical sequence, seek flow, pay attention to naming. Language: "If you want x, do y.", conditional imperatives, no teaching. The recipe is the canonical analogy: a chef who has made the dish 100 times still follows the recipe.

**Explanation** is understanding-oriented, discursive, reflective. It is not prescriptive. Its scope is a "topic" (bounded area of knowledge). Key principles: make connections, provide context (design decisions, history, constraints), admit opinion and perspective, keep closely bounded. Language: "The reason for x is because historically, y...", "W is better than z, because...", "Some users prefer w (because z). This can be a good approach, but...". The canonical analogy is Harold McGee's "On Food and Cooking" - contextualises a subject without teaching how to cook anything.

## Key quotations / statistics

**Tutorials:**
- "A lesson is a kind of contract between teacher and student, in which nearly all the responsibility falls upon the teacher."
- "A tutorial must inspire confidence. Confidence can only be built up layer by layer, and is easily shaken."
- "Ruthlessly minimise explanation. A tutorial is not the place for explanation."

**How-to guides:**
- "How-to guides must be written from the perspective of the user, not of the machinery."
- "A how-to guide serves the work of the already-competent user, whom you can assume to know what they want to do."
- "A good recipe follows a well-established format, that excludes both teaching and discussion, and focuses only on how to make the dish concerned."
- Good title: "How to integrate application performance monitoring". Bad: "Integrating application performance monitoring". Very bad: "Application performance monitoring".

**Explanation:**
- "Explanation deepens and broadens the reader's understanding of a subject. It brings clarity, light and context."
- "It's documentation that it makes sense to read while away from the product itself."
- "In explanation, you're not giving instruction or describing facts - you're opening up the topic for consideration."

## Annotations for stinger-forge

- The tutorial/how-to conflation is the most common mode-mixing failure in software docs. `guides/00-diataxis.md` must include a side-by-side "Is this a tutorial or a how-to?" decision table derived from these pages.
- The explanation mode answers "Can you tell me about...?" - contrasted with how-to ("How do I...?") and reference ("What is the exact...?"). This three-question heuristic is a compact classification tool for the Bee.
- The recipe analogy for how-to guides is powerful and worth including in the guide as a memorable mental model.
- The Harold McGee analogy for explanation is equally strong.
- The Bee's heading review step maps directly to the Diataxis language patterns: imperative verb forms for how-tos ("How to integrate..."), noun phrases for reference, question forms or "About..." framing for explanation.
- Fetch `https://diataxis.fr/reference/` separately to complete the four-mode picture. Reference is information-oriented, describes the machinery as-is, is consulted not read, must be consistent and complete.
