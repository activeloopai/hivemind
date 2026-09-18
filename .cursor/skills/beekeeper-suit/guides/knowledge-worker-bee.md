# Knowledge Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `knowledge-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/knowledge-worker-bee.md`](../../../agents/knowledge-worker-bee.md)
**Stinger:** [`.cursor/skills/knowledge-stinger/`](../../knowledge-stinger/)
**Trigger policy:** on-demand

---

## Domain

`knowledge-worker-bee` authors the human-readable, technically deep narrative documentation under `library/knowledge/private/<domain>/` - the docs that explain HOW systems work, WHY they were designed that way, and WHAT the operational ground truth is. For Hivemind that means system overviews with Mermaid diagrams, the Deep Lake table schema reference, the hybrid recall pipeline, the harness architecture, the auth/device-flow doc with sequence diagrams, security trust-boundary diagrams, and coding standards. It works from ADRs and PRDs as source material and never authors PRDs, IRDs, ADRs, or QA reports.

## Trigger phrases

Route to `knowledge-worker-bee` when the user says any of:

- "Document the auth architecture" / "document the device flow"
- "Write the system overview"
- "Create knowledge docs for this repo" / "build out the knowledge base"
- "Document how recall works internally" / "document the hybrid recall pipeline"
- "Document how X works internally"

Or when the request implicitly involves deep, narrative, private-domain knowledge documentation.

## Do NOT route when

- The user wants PRDs, IRDs, the `library/` lifecycle, or drift audits - that is `library-worker-bee`. This Bee owns the deep narrative; library owns the lifecycle and PRDs.
- The user wants the atomic entity graph (per-entity pages, backlinks, ADR detection) - that is `wiki-worker-bee`. This Bee writes the prose story; wiki writes the atomic cross-reference web.
- The user wants ADR authoring as a deliverable - that is `adr-writing-worker-bee` (this Bee reads ADRs as source, never writes them).
- The user wants a QA report - that is `quality-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The domain or system to document (auth, recall, schema, harness architecture).
- Source material: the relevant ADRs, PRDs, and code paths.
- Optional: the desired diagram types (Mermaid system, sequence, trust-boundary).

If the domain is unclear, do not invoke yet - ask the user what to document.

## Outputs the Bee produces

- Narrative knowledge docs under `library/knowledge/private/<domain>/`, with Mermaid diagrams where they add clarity.
- Deep technical explanations grounded in the ADRs/PRDs that source them.

## Multi-Bee sequences this Bee participates in

- **Compounding documentation** - `wiki-worker-bee` builds the atomic entity graph, `library-worker-bee` writes the per-module narrative, and `knowledge-worker-bee` writes the deeper private-domain narratives from ADRs and PRDs.

## Critical directives the orchestrator should respect

- **Owns the `library/knowledge/` narrative domain only** - never PRDs, IRDs, ADRs, or QA reports.
- **Works from ADRs and PRDs as source material** - it reads decisions, it does not record them.
- **Deep and honest** - the docs are the operational ground truth, not marketing.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
