---
title: "Google Developer Documentation Style Guide - Highlights and Code Samples"
url: https://developers.google.com/style
source_type: official-docs
authority: high
relevance: high
date_accessed: 2026-05-20
topic_tags: [voice-tone, code-examples, style-guide, headings, active-voice, second-person]
---

# Google Developer Documentation Style Guide

## Summary

Google's Developer Documentation Style Guide is one of the most authoritative publicly available technical writing style references. It covers tone, language, grammar, formatting, code samples, and images. The highlights page provides a compact canon of the most important rules. The code-samples sub-page provides precise formatting rules applicable to code example discipline.

**Key voice and tone rules:** Be conversational and friendly without being frivolous. Use second person ("you" rather than "we"). Use active voice - make clear who is performing the action. Put conditions before instructions, not after. Use standard American spelling and punctuation.

**Key formatting and organization rules:** Use sentence case for document titles and section headings. Use numbered lists for sequences. Use bulleted lists for most other lists. Put code-related text in code font. Put UI elements in bold.

**Code samples specific rules:** Follow language-specific indentation guidelines (typically 2 spaces, sometimes 4). Wrap lines at 80 characters. Mark code blocks as preformatted text. Indicate omitted code using a language comment - never use ellipsis characters or three dots. Precede every code sample with an introductory sentence or paragraph (ending with a colon if immediately preceding, a period if more material intervenes). Never prioritize brevity over correctness.

## Key quotations / statistics

- "Use second person: 'you' rather than 'we.'"
- "Use active voice: make clear who's performing the action."
- "Put conditions before instructions, not after." (This is a subtle but important rule for procedural how-to writing.)
- "Indicate omitted code by using a comment in the syntax of the language of your code sample. Don't use three dots or the ellipsis character (`...`)."
- "In most cases, precede a code sample with an introductory sentence or paragraph."
- "Not recommended (ending with a colon): The following code sample shows how to use the `get` method. For information about other methods, see [link]: [sample]" (shows that a trailing link before the sample breaks the colon rule)

## Annotations for stinger-forge

- The second-person rule ("you" not "we") maps directly to the Bee's voice-and-tone check. `guides/03-voice-and-tone.md` should cite Google as the canonical authority for this preference.
- "Conditions before instructions" is a specific, testable rule the Bee can flag in reviews: "If you want to do X, run Y" - not "Run Y if you want to do X."
- The code-sample rules (introductory sentence, no ellipsis for omissions, language comments for gaps, line-length wrap) form a significant part of `guides/02-code-example-discipline.md` and `templates/code-example-checklist.md`.
- Sentence case for headings is a common violation in developer docs; the Bee should flag Title Case headings as a Suggestion-level finding.
- The Google style guide is available at https://developers.google.com/style and is actively maintained (the URL pattern suggests 2026-current). Stinger-forge should link to it directly from the Stinger as a canonical reference.
- Open question from brief (Q2: canonical Stripe style guide page) - Google style guide can serve as a partial substitute, and Stripe's publicly stated approach aligns with Google's second-person / active-voice canon.
