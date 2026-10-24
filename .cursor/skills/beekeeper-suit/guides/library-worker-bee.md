# Library Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `library-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/library-worker-bee.md`](../../../agents/library-worker-bee.md)
**Stinger:** [`.cursor/skills/library-stinger/`](../../library-stinger/)
**Trigger policy:** on-demand

---

## Domain

`library-worker-bee` is the unified documentation lifecycle engineer for the repository. It owns every artifact under `library/` from initial scaffold through long-term maintenance: scaffolding the canonical folder on first run, ingesting GitHub issues into IRDs, authoring feature PRDs from requirements, reverse-engineering existing code into backwards-PRDs, maintaining knowledge-base sources, enforcing folder and naming invariants, and running documentation sync audits to detect drift. The one carve-out: QA report authorship belongs to `quality-worker-bee`.

## Trigger phrases

Route to `library-worker-bee` when the user says any of:

- "Initialize the library" / "set up docs" / "scaffold documentation"
- "Write a PRD" / "write a PRD for X"
- "Ingest GitHub issues" / "pull issues from GitHub into PRDs"
- "Backwards-PRD this module" / "document what this code already does"
- "Document Z in the knowledge base"
- "Docs sync audit" / "check for drift between docs and code"

Or when the request implicitly involves the `library/` documentation lifecycle, PRDs, IRDs, or drift audits.

## Do NOT route when

- The user wants narrative, private-domain knowledge docs (system overviews, the recall pipeline story) - that is `knowledge-worker-bee`. This Bee owns the lifecycle and PRDs/IRDs; knowledge owns the deep narrative under `library/knowledge/private/<domain>/`.
- The user wants the atomic entity graph (per-entity pages, backlinks, ADR detection) - that is `wiki-worker-bee`. This Bee writes the narrative; wiki writes the atomic graph.
- The user wants a QA report - that is `quality-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- A description of the documentation task.
- Relevant file paths (source files for backwards-PRDs, issue URLs for ingestion, requirements for feature PRDs).
- Optional: scope and depth preferences.

If the task target is missing, do not invoke yet - ask the user what to document.

## Outputs the Bee produces

- New or updated files under `library/` (never under the human-only `library/notes/`). Feature PRDs land at `library/requirements/features/feature-<###>-<title>/`; issue IRDs at `library/requirements/issues/issue-<###>-<title>/`; knowledge-base sources under `library/knowledge-base/<domain>/`.
- Drift-audit reports listing doc-code mismatches with actionable fixes.
- An updated master index when new documents are added.

## Multi-Bee sequences this Bee participates in

- **Compounding documentation** - after `wiki-worker-bee` builds the atomic entity graph, `library-worker-bee` authors the per-module narrative documentation, reading the entity pages at query time; `knowledge-worker-bee` writes the deeper private-domain narratives.

## Critical directives the orchestrator should respect

- **`library/notes/` is human-only territory** - this Bee must not write there.
- **QA reports are `quality-worker-bee`'s job**, even though the rest of `library/` is owned here.
- **Repo-agnostic** - do not hardcode product-specific behavior into invocations.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
