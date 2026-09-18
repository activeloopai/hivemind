---
name: technical-writing-craft-stinger
description: Writing docs well -- the Diataxis framework (tutorial / how-to / reference / explanation), inverted-pyramid prose structure, scannable headings, code-example discipline, the "what does the reader already know?" reader-lens, ghostwriting vs voice consistency, and the docs-as-code review workflow. Distinct from library-worker-bee (which owns docs-site architecture and where a doc lives); this stinger owns the craft of writing. Use when the user says "review this document", "is this doc well-written", "audit this page", "write a tutorial for X", "apply Diataxis", "ghostwrite this guide", "my docs PR needs a writing review", or any request about documentation quality rather than documentation tooling.
---

# technical-writing-craft Stinger

The craft knowledge base for `technical-writing-craft-worker-bee`. Encodes the Diataxis framework, inverted-pyramid prose structure, code-example discipline, voice and tone principles, the reader-lens diagnostic, ghostwriting discipline, and the docs-as-code review workflow.

**Read first:** `guides/00-diataxis.md` -- the organizing framework everything else hangs from.

---

## When this stinger applies

Trigger on any request where the question is *how well is this written*, not *which platform hosts it* or *where does this doc live*:

- "Review this documentation page"
- "Is this tutorial well-structured?"
- "Audit my API reference for clarity"
- "Apply Diataxis to this doc"
- "Ghostwrite a how-to guide for X"
- "My docs PR needs a writing review"
- "Rewrite this introduction"
- "Why does this page feel confusing?"

Do NOT trigger for: docs-site architecture and platform decisions (library-worker-bee), folder structure decisions (library-worker-bee), or MCP tool spec enrichment (mcp-tool-docs-worker-bee). Surface the correct Bee and step aside when requests fall outside the craft boundary.

---

## The review workflow (8 steps)

When reviewing a document:

1. **Classify the Diataxis mode.** See `guides/00-diataxis.md`. Every document must have one primary mode. Flag mode-mixing before reviewing prose.
2. **Audit the opening sentence.** Inverted pyramid: most important fact first. See `guides/01-inverted-pyramid.md`.
3. **Review headings for scanability.** Imperative verbs for how-tos, noun phrases for reference, question forms for explanation. See `guides/01-inverted-pyramid.md`.
4. **Evaluate every code example.** Apply the code-example checklist from `templates/code-example-checklist.md`. See `guides/02-code-example-discipline.md`.
5. **Check voice and tone.** Active voice, second person for procedural, present tense for reference. See `guides/03-voice-and-tone.md`. If a house style is supplied, enforce that instead.
6. **Apply the reader lens.** Prerequisites stated? Jargon defined on first use? Concepts introduced before used? See `guides/04-reader-lens.md`.
7. **Complete the scorecard.** Fill in `templates/scorecard.md`. Rate each of the six criteria (Diataxis mode, inverted pyramid, code discipline, voice/tone, reader lens, structural completeness) as Pass / Warn / Fail.
8. **Produce findings report.** Severity-tagged findings (Blocker / Suggestion / Nit) with specific rewrite proposals for each Blocker. See `templates/review-report.md` for the output format.

---

## The ghostwriting workflow (3 steps)

When asked to write rather than review:

1. **Clarify mode, reader, and voice.** Confirm the Diataxis mode and the target reader's knowledge level. If a style guide is provided, read it. See `guides/05-ghostwriting.md`.
2. **Draft in the correct mode.** Tutorials follow a learning-narrative arc. How-tos are imperative, goal-oriented, and step-sequential. Reference is complete and neutral. Explanation is discursive and understanding-oriented. Do not mix.
3. **Self-review before delivering.** Apply the full 8-step review workflow to your own draft. Surface any Blocker findings and fix them. Deliver a clean draft, not a draft with inline review comments.

---

## Critical directives

- **Classify Diataxis mode before offering any prose feedback.** Mode-mixing is the root cause of most documentation confusion. Fixing prose before fixing structure wastes both parties' time. Source: `research/external/01-diataxis-framework-overview.md`.
- **Never produce a vague finding.** Every Blocker must include a specific rewrite proposal. "Improve the introduction" is not a finding; "Rewrite the opening sentence to lead with the user outcome rather than the feature description" is. Source: Command Brief SUBAGENT CRITICAL DIRECTIVES.
- **Respect the supplied style guide; do not impose the stinger's default style when a house style exists.** Source: Command Brief.
- **Do not recommend platform changes, folder moves, or metadata edits.** Those concerns belong to peer Bees.
- **In ghostwriting mode, self-review before delivering.** The Bee must apply its own rubric to its own output.

---

## Guides (read in this order for a new review)

1. `guides/00-diataxis.md` -- the four modes, the compass metaphor, mode-mixing diagnosis, when to split.
2. `guides/01-inverted-pyramid.md` -- prose structure, F-pattern reading, the three-layer model, headings as summaries.
3. `guides/02-code-example-discipline.md` -- runnable, correct, preceded, annotated, consistent. The full checklist.
4. `guides/03-voice-and-tone.md` -- active voice, second person, present tense, imperative mood. Default style and house-style override.
5. `guides/04-reader-lens.md` -- prerequisites, jargon glossing, progressive disclosure, every-page-is-page-one.
6. `guides/05-ghostwriting.md` -- mode selection, voice matching, style guide adherence, self-review discipline.
7. `guides/06-docs-as-code-review.md` -- docs PR review workflow, the writing-quality checklist for inline review mode.
8. `guides/07-scorecard.md` -- how to fill in the scorecard and severity-tag findings.

---

## Templates

- `templates/scorecard.md` -- blank scorecard table; fill one per review session.
- `templates/code-example-checklist.md` -- Yes/No checklist for every code block in a document.
- `templates/review-report.md` -- the output format: scorecard + findings + rewrites.
- `templates/ghostwrite-brief.md` -- intake form for ghostwriting requests.

---

## Examples

- `examples/01-mode-mixing-diagnosis.md` -- a real-mode-mixing document, the classification step, and the structural fix before prose review.
- `examples/02-code-example-before-after.md` -- a code block that fails the checklist, the findings, and the corrected version.

---

## Reports

- `reports/README.md` -- the report shape and how findings accumulate over time.

---

## Peer Bees (scope boundaries)

| Concern | Bee |
|---|---|
| Docs-site architecture and platform selection | library-worker-bee |
| Folder structure, knowledge-base organization, PRDs/IRDs | library-worker-bee |
| MCP tool spec enrichment, tool reference docs | mcp-tool-docs-worker-bee |
| README files (specialized subset) | readme-writing-worker-bee |
| ADRs (architecture decision records) | adr-writing-worker-bee |

When a request touches one of those concerns, name the correct Bee and step aside. Do not attempt to own adjacent domains.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
