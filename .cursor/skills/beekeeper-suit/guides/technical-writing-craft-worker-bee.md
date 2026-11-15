# Technical Writing Craft Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `technical-writing-craft-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/technical-writing-craft-worker-bee.md`](../../../agents/technical-writing-craft-worker-bee.md)
**Stinger:** [`.cursor/skills/technical-writing-craft-stinger/`](../../technical-writing-craft-stinger/)
**Trigger policy:** proactive

---

## Domain

`technical-writing-craft-worker-bee` reviews and writes technical documentation as a craft. It owns the Diataxis framework (tutorial / how-to / reference / explanation), inverted-pyramid prose structure, code-example discipline, voice-and-tone consistency, the reader-lens diagnostic, ghostwriting discipline, and docs-as-code PR review. Every finding comes with a specific proposed fix, never a vague "improve this," and it respects a supplied house style over its defaults.

## Trigger phrases

Route to `technical-writing-craft-worker-bee` when the user says any of:

- "Review this document" / "is this doc well-written" / "audit this page"
- "Apply Diataxis"
- "Ghostwrite this guide"
- "Rewrite this introduction"
- "Code example review" / "my docs PR needs a writing review"

Or proactively when a PR diff touches documentation files and a writing-quality review has not been performed.

## Do NOT route when

- The user wants docs-site architecture, platform decisions, or folder structure - that is `library-worker-bee`.
- The user wants MCP tool spec enrichment or CLI reference docs - that is `mcp-tool-docs-worker-bee`.
- The user wants README structure and conversion - that is `readme-writing-worker-bee`.
- The user wants the deep narrative knowledge docs themselves authored - that is `knowledge-worker-bee` (this Bee reviews the prose craft, including theirs).

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The document or section to review or ghostwrite.
- The intended Diataxis mode (or let the Bee classify it).
- Optional: the supplied house style guide to respect.

If the document is missing, do not invoke yet - ask the user to paste it.

## Outputs the Bee produces

- A writing-craft review with the Diataxis mode classified and every finding paired with a specific proposed fix.
- Ghostwritten or rewritten prose, self-reviewed against the Bee's own rubric before delivery.

## Multi-Bee sequences this Bee participates in

- Reviews prose produced by `library-worker-bee`, `knowledge-worker-bee`, and `readme-writing-worker-bee`; routes platform/folder decisions and tool-spec enrichment back to them.

## Critical directives the orchestrator should respect

- **Always classify Diataxis mode before offering any prose feedback** - mode-mixing is the root cause of most doc confusion.
- **Never produce a finding without a specific fix** - propose the replacement text.
- **Respect the supplied style guide; do not impose the default style when a house style exists.**
- **Do not recommend platform changes, folder moves, or metadata edits** - those belong to peer Bees.
- **In ghostwriting mode, self-review before delivering.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
