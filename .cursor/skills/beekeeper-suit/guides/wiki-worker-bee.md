# Wiki Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `wiki-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/wiki-worker-bee.md`](../../../agents/wiki-worker-bee.md)
**Stinger:** [`.cursor/skills/wiki-stinger/`](../../wiki-stinger/)
**Trigger policy:** on-demand (driven by Hivemind's graph driver, or by Cursor @-mention)

---

## Domain

`wiki-worker-bee` is Hivemind's per-repo entity cartographer. It receives code chunks plus pre-computed git context from Hivemind's tree-sitter graph driver (`src/graph/`), or self-discovers chunks when @-mentioned in Cursor, extracts entities across a 13-type catalog (functions, classes, modules, MCP tools, env vars, Deep Lake tables, queues/workers, scheduled hooks, feature flags, and more) using the same tree-sitter engine `src/graph/extract/*` runs, and files them as atomic markdown pages with `[[backlinks]]` into `library/knowledge/`. It infers ADRs from commit messages that clearly encode decisions and runs an active four-artifact contradiction protocol whenever a contract changes, never silently overwriting history. It is opinionated about atomicity (one entity, one page), evidence (every claim cites `file:line`), and contradictions.

## Trigger phrases

Route to `wiki-worker-bee` when the user says any of:

- "Extract entities from {file/dir}"
- "Document this module's exports"
- "Add this to the knowledge graph"
- "Lint the wiki"

Or when Hivemind's graph driver fires `mode: document / update / scan-directory / lint`. The TS driver is the canonical path; the @-mention is the escape hatch (the agent confirms scope before writing and flags `partial_scan: true`).

## Do NOT route when

- The user wants per-module narrative documentation (the human-readable story) - that is `library-worker-bee` (module narratives under `library/knowledge/private/<domain>/`). This Bee builds the atomic cross-reference graph; library writes the narrative around it.
- The user wants deeper private-domain narrative docs from ADRs and PRDs - that is `knowledge-worker-bee`.
- The user wants QA report authorship - that is `quality-worker-bee`.
- The user wants any mutation of the knowledge area's global state files (`index.md`, `<type>/_index.md`, `log.md`, `hot.md`, `.hivemind/file-hashes.json`) - the graph driver owns those, not this Bee.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The code chunk(s) plus git context (canonical path: from the graph driver) or a target file/directory (escape-hatch path).
- The mode: document, update, scan-directory, or lint.
- Optional: confirmation of inferred scope when @-mentioned directly.

If neither a driver payload nor a target file/directory is supplied, do not invoke yet - ask the user what to extract.

## Outputs the Bee produces

- Atomic entity pages with `[[backlinks]]`, frontmatter, `last_commit_hash`, and `file:line` citations, written into `library/knowledge/`.
- ADR-detection pages (only when commit language clearly matches the catalog) and `questions/` pages when confidence is low.
- The four contradiction-protocol artifacts when a contract changes (`[!stale]`, `[!contradiction]`, a contradiction report, a `notification_flag`).

## Multi-Bee sequences this Bee participates in

- **Compounding documentation** - `wiki-worker-bee` runs across code chunks via the tree-sitter graph driver, writing atomic entity, concept, and ADR pages; `library-worker-bee` then authors the per-module narrative documentation, reading the entity pages at query time; `knowledge-worker-bee` writes the deeper private-domain narratives.

## Critical directives the orchestrator should respect

- **Never touch global state files** - the graph driver owns `index.md`, `<type>/_index.md`, `log.md`, `hot.md`, `.hivemind/file-hashes.json`.
- **The active contradiction protocol is mandatory - all four artifacts every time.**
- **Never fabricate an ADR or a relationship** - every wikilink must be supported by an AST edge or clear commit-message evidence.
- **Always cite source `file:line`** and **include `last_commit_hash`** in entity frontmatter.
- **Repo-relative paths only**, read-only against source code.
- **@-mention invocation: confirm scope before any write, flag `partial_scan: true`.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
