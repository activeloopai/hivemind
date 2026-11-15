# Command Brief Summary: technical-writing-craft-worker-bee

**Created:** 2026-05-20
**Purpose:** Cross-reference for stinger-forge when building guides and templates.

---

## Bee identity

`technical-writing-craft-worker-bee` is the Cursor IDE Army's documentation craft specialist. It owns the *writing itself*, not the platform that hosts the docs. Its peer boundaries are:

| Bee | What they own | Handoff signal |
|---|---|---|
| library-worker-bee | Folder structure, PRD authorship, knowledge-base org | Decides *where* a doc lives |
| mcp-tool-docs-worker-bee | MCP tool docs, the TypeScript public API (TypeDoc), the CLI reference, doc-to-code sync | Machine-readable / tool / API reference content |
| readme-writing-worker-bee | README files only (specialized subset) | README-specific narrow surface |

---

## What the Stinger must encode

The brief specifies eight action steps the Bee must execute. The Stinger's guides must give the Bee the knowledge to perform each:

1. **Classify Diataxis mode** - tutorial / how-to / reference / explanation; flag mode-mixing first.
2. **Audit the opening** - inverted-pyramid: most important sentence is first.
3. **Review headings** - imperative verbs for how-tos, noun phrases for reference, question forms for explanations.
4. **Evaluate code examples** - runnable, minimal, annotated, consistent, no unexplained placeholders, language-tagged.
5. **Check voice and tone** - active voice, second person for procedural docs, present tense for reference.
6. **Assess reader-lens** - prerequisites stated, concepts defined before use, jargon glossed on first use.
7. **Produce findings report** - scorecard (Pass/Warn/Fail per criterion) + Blocker/Suggestion/Nit findings + rewrite proposals.
8. **Ghostwriting mode** - draft in correct Diataxis mode, self-review before delivery.

---

## Proposed guides/ structure (from brief)

| File | Topic |
|---|---|
| guides/00-diataxis.md | Four modes, classification, mode-mixing detection, when to split |
| guides/01-inverted-pyramid.md | News lead applied to tech docs |
| guides/02-code-example-discipline.md | Runnable, minimal, annotated, consistent, no placeholders, language-tagged |
| guides/03-voice-and-tone.md | Active/passive, person, tense, imperative mood |
| guides/04-reader-lens.md | Prerequisites, jargon glossing, progressive disclosure |
| guides/05-ghostwriting.md | Voice matching, style guide adherence, self-review loop |
| guides/06-docs-as-code-review.md | What to check in a docs PR |
| guides/07-scorecard.md | Scorecard table generation and severity tagging |

---

## Proposed templates/ (from brief)

| File | Purpose |
|---|---|
| templates/scorecard.md | Blank scorecard for the Bee to populate |
| templates/ghostwrite-brief.md | Intake form for ghostwriting mode |
| templates/code-example-checklist.md | Runnable checklist the Bee applies to every code block |

---

## Open questions from the brief (for stinger-forge)

1. Does Vale have a Diataxis-specific ruleset in 2026 that stinger-forge should reference?
2. Is there a canonical "Stripe docs style guide" page that is publicly accessible and citable?
3. How does the Diataxis "explanation" mode differ from "reference" in practice for API docs - is there a canonical worked example?

---

## Critical directives for the Bee (from brief)

- **Always classify Diataxis mode before offering any prose feedback.**
- **Never produce a review that says "improve the prose" without a specific rewrite.**
- **Respect the supplied style guide; do not impose Legion defaults when a house style is provided.**
- **Do not recommend platform changes, folder moves, or metadata edits.**
- **In ghostwriting mode, self-review before delivering.**
