# 04 - The Reader Lens

> Source: `research/external/10-every-page-is-page-one.md`, `research/external/04-inverted-pyramid-technical-docs.md`

The reader lens asks: **"What does the reader already know, and is this document calibrated to that?"** It is the most human of the six review criteria -- it cannot be linted automatically. It requires the reviewer to model the reader's knowledge state and check whether the document meets them where they are.

---

## The every-page-is-page-one (EPPO) principle

Mark Baker's EPPO principle: in a hyperlinked web of content, readers frequently arrive at any page via search, link, or AI assistant -- not by reading from the beginning. Every page must be self-contained enough to serve as its own entry point.

In 2026, with AI chatbots pulling individual paragraphs out of context, EPPO is more relevant than when Baker wrote it. A paragraph that depends on knowledge from page 3 of a 10-page tutorial will fail when extracted in isolation.

**EPPO review heuristics:**
- Does the page state its scope in the first paragraph?
- Does the page define its audience (beginner / practitioner / expert)?
- Does the page link to prerequisites rather than assuming they were read?
- Can a reader who arrives cold understand what this page is about and why it matters?

---

## The reader knowledge check

For every document, identify:

1. **Who is the target reader?** Beginner (has the goal, needs the foundations), intermediate practitioner (has the foundations, needs the specifics), or expert (needs the edge cases and advanced options).
2. **What does the reader already know?** State prerequisites explicitly in an opening "Prerequisites" or "Before you begin" section.
3. **What will the reader know after?** State the learning outcome or deliverable at the top.

If these three answers are not answerable from the document, the reader lens audit fails.

---

## Prerequisite discipline

Prerequisites must be stated, not assumed. The reader should not need to fail halfway through a procedure to discover a prerequisite.

**Good:** "Before you begin: You'll need Node.js 20 or later and an API key from your dashboard."

**Bad:** (No prerequisites stated; reader discovers on step 4 that they need an API key.)

The prerequisite section is especially critical for tutorials and how-tos. Explanation and reference can often assume prerequisites without listing them, because readers self-select for those modes.

---

## Jargon discipline

Define jargon on first use. The rule:

1. **First use in the document:** define it (inline or with a link to the reference page).
2. **Subsequent uses:** use the term without definition.
3. **Cross-document:** if the term is defined in another page, link there rather than redefining.

**What counts as jargon?** Any term the target reader cannot be assumed to know. When in doubt, define it. Over-defining for expert readers is a Nit; under-defining for the target reader is a Suggestion or Blocker.

**How to define inline:**
> "A webhook (an HTTP POST sent by the API when an event occurs) lets you react to changes in real time."
> "Configure the retry policy -- the set of rules that govern how and when failed webhook deliveries are retried."

---

## Progressive disclosure

Introduce concepts before using them. A document that uses a term in step 1 and explains it in step 5 fails the reader lens.

Check the document in order: whenever a concept appears for the first time, verify that either (a) it has been defined by that point in the document, or (b) there is a link to where it is defined.

This applies to both terms and to conceptual dependencies. If step 3 depends on understanding the output of step 2, make the dependency explicit.

---

## Calibration findings

| Finding | Severity | Indicator |
|---|---|---|
| Missing prerequisites section in a tutorial or how-to | Suggestion | Reader likely to fail without stated prerequisites |
| Term used before definition (in the same document) | Suggestion | Reader will be confused at first use |
| No audience statement | Nit | Page does not self-identify who it is for |
| Content is too basic for the stated audience | Nit | Expert-targeted page explains beginner concepts |
| Content assumes advanced knowledge for the stated beginner audience | Blocker | Beginner-targeted page uses unexplained advanced concepts |
| Page cannot be understood in isolation (depends on unlinked prior content) | Suggestion | EPPO violation |

See `examples/01-mode-mixing-diagnosis.md` for a worked reader-lens check.
