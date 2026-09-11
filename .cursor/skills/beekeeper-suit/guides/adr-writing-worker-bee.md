# ADR Writing Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `adr-writing-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/adr-writing-worker-bee.md`](../../../agents/adr-writing-worker-bee.md)
**Stinger:** [`.cursor/skills/adr-writing-stinger/`](../../adr-writing-stinger/)
**Trigger policy:** on-demand

---

## Domain

`adr-writing-worker-bee` is the Architecture Decision Records specialist. It authors, reviews, and governs ADRs in Nygard format (Context / Decision / Consequences / Alternatives Considered), the MADR extended template, and Y-statement framing. It handles the full lifecycle: drafting a new record, superseding an existing decision with bidirectional linking, setting up Log4brains or adr-tools, auditing the ADR log for completeness, and using the corpus as an onboarding artifact. Its discipline is "decisions, not docs."

## Trigger phrases

Route to `adr-writing-worker-bee` when the user says any of:

- "Write an ADR"
- "Record this decision"
- "Supersede ADR-NNN"
- "Set up our ADR log"
- "Which ADR format?" / "Nygard vs MADR"
- "Document this architecture choice"

Or when the request implicitly involves recording or governing an architecture decision.

## Do NOT route when

- The user wants general narrative knowledge-base authorship - that is `knowledge-worker-bee` (which reads ADRs as source).
- The user wants the `library/` documentation lifecycle or PRDs - that is `library-worker-bee`.
- The user wants code-entity extraction - that is `wiki-worker-bee` (it detects and files ADR pages from commits, but authored ADRs are this Bee's job).
- The user wants a security review of the decisions themselves - that is `security-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The decision being recorded, or the existing ADR being superseded/audited.
- The existing ADR format and log location (so it stays consistent).
- Optional: the alternatives considered and the chosen format (Nygard / MADR / Y-statement).

If the decision is unclear, do not invoke yet - ask the user what decision to record.

## Outputs the Bee produces

- A new ADR in the existing format with a sequential number, or a supersession with both links.
- ADR log setup (Log4brains / adr-tools) and completeness audits.

## Multi-Bee sequences this Bee participates in

- Feeds `knowledge-worker-bee`, which reads ADRs as source material for narrative knowledge docs.

## Critical directives the orchestrator should respect

- **Always determine the existing ADR format before writing.**
- **Never conflate ADRs with design docs or meeting notes** - "decisions, not docs."
- **Supersession is bidirectional - both links are mandatory.**
- **Assign sequential numbers; never reuse or skip.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
