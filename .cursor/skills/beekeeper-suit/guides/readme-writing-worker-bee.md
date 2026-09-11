# README Writing Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `readme-writing-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/readme-writing-worker-bee.md`](../../../agents/readme-writing-worker-bee.md)
**Stinger:** [`.cursor/skills/readme-writing-stinger/`](../../readme-writing-stinger/)
**Trigger policy:** proactive

---

## Domain

`readme-writing-worker-bee` treats the README as a conversion surface - a landing page, not a manual. It authors, audits, and restructures `README.md` files using the canonical section order, badge discipline, the OSS vs internal-tool register split (value-prop-first for OSS, context-first and operational for internal), and README-driven development. It emits an audit table before any rewrite and a done checklist after, and it insists the quickstart works copy-paste on a fresh machine.

## Trigger phrases

Route to `readme-writing-worker-bee` when the user says any of:

- "Write a README" / "README for this project"
- "Audit my README" / "improve my README" / "my README is too long"
- "README-driven development"
- "Badges are broken"
- "Quickstart doesn't work"

Or when starting a greenfield project that needs a README before code.

## Do NOT route when

- The user wants the full documentation-site or `library/` architecture - that is `library-worker-bee`.
- The user wants code-entity extraction into a wiki - that is `wiki-worker-bee`.
- The user wants CI badge pipeline wiring - that is `ci-release-worker-bee`.
- The user wants MCP tool or CLI reference docs - that is `mcp-tool-docs-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The existing README (for an audit) or the project context (for a fresh write).
- The register: OSS or internal tool.
- Optional: the install command and quickstart steps to verify.

If neither an existing README nor project context is supplied, do not invoke yet - ask the user.

## Outputs the Bee produces

- An audit table surfacing what is already good before any rewrite.
- A restructured README in the canonical section order with disciplined badges and a copy-paste quickstart.
- A done checklist.

## Multi-Bee sequences this Bee participates in

- Hands documentation-site/library architecture to `library-worker-bee`, entity extraction to `wiki-worker-bee`, and badge pipeline wiring to `ci-release-worker-bee`.

## Critical directives the orchestrator should respect

- **README is a landing page, not a manual** - no walls of prose; a section over 30 lines without a code example belongs elsewhere.
- **Every section must earn its place** - convert a visitor or retain a contributor, or cut it.
- **Quickstart must work copy-paste** on a fresh machine.
- **Audit before you rewrite** - surface intentional choices that look like mistakes.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
