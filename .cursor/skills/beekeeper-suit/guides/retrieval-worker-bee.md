# Retrieval Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `retrieval-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/retrieval-worker-bee.md`](../../../agents/retrieval-worker-bee.md)
**Stinger:** [`.cursor/skills/retrieval-stinger/`](../../retrieval-stinger/)
**Trigger policy:** proactive

---

## Domain

`retrieval-worker-bee` owns how Hivemind finds things and how it learns, two halves of one pipeline. **Recall:** hybrid lexical plus semantic search across the Deep Lake `memory` table (summaries) and `sessions` table (raw JSONB dialogue), run as a single `UNION ALL` query in `src/shell/grep-core.ts` with a fast path at `src/hooks/grep-direct.ts`; semantic mode uses the `<#>` cosine operator against the 768-dim `FLOAT4[]` embedding columns, with BM25/`ILIKE` lexical as the silent fallback. **Codify (skillify):** the `src/skillify/*` loop that pulls recent in-scope sessions, runs a Haiku KEEP/MERGE/SKIP gate, writes a `SKILL.md` via `skill-writer.ts`, records provenance in the `skills` table, and fans teammate-mined skills out at SessionStart via `pull.ts` / `auto-pull.ts`. It also owns the tree-sitter codebase graph and recall/skillify quality evaluation.

## Trigger phrases

Route to `retrieval-worker-bee` when the user says any of:

- "Tune recall" / "recall is noisy" / "why did this query miss"
- "Semantic vs lexical here"
- "Audit the skillify gate" / "a bad skill got mined"
- "Fix propagation"
- "Score retrieval quality"

Or when the request implicitly involves the search or codify path, hybrid weighting, the BM25 fallback decision, or skill propagation.

## Do NOT route when

- The user wants the embedding model, daemon lifecycle, quantization, or whether embeddings should be on - that is `embeddings-runtime-worker-bee`. This Bee owns recall quality; embeddings-runtime owns the model that feeds it.
- The user wants the Deep Lake table schema, column shape, or indexing DDL - that is `deeplake-dataset-worker-bee`. This Bee owns the query; the dataset Bee owns the schema underneath.
- The user wants API-key, PII, or prompt-injection audits - that is `security-worker-bee`.
- The user wants feature PRD authoring - that is `library-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The recall or skillify path in scope (`grep-core.ts`, `grep-direct.ts`, `src/skillify/*`).
- The symptom: a missed query, noisy recall, a bad mined skill, or a propagation failure.
- Optional: a fixed query set for precision/recall measurement, and whether embeddings are on or off in the environment.

If the symptom or the path in scope is missing, do not invoke yet - ask the user to describe what went wrong.

## Outputs the Bee produces

- Recall tuning findings (weighting choice, fallback behavior, fast-path parity) with `file:LN` citations.
- Skillify gate and propagation audits (KEEP/MERGE/SKIP correctness, provenance rows, scope handling).
- Before/after precision/recall measurements over a fixed query set when a pipeline change is proposed.

## Multi-Bee sequences this Bee participates in

- **Memory / retrieval feature** - `retrieval-worker-bee` reviews, refactors, or extends recall and the skillify codify pipeline first; `embeddings-runtime-worker-bee` owns any embedding model/daemon change that feeds the vectors; `deeplake-dataset-worker-bee` heals the tables underneath; `typescript-node-worker-bee` owns the TypeScript implementation; `security-worker-bee` then `quality-worker-bee` close out.

## Critical directives the orchestrator should respect

- **Recall is hybrid by design** - both arms of the `UNION ALL` (memory summaries AND sessions dialogue); searching one table is a recall regression.
- **BM25/ILIKE is a silent fallback, never a silent failure** - recall the user expected to run semantically but silently ran lexical is a finding worth surfacing.
- **A null query vector means lexical, full stop** - `queryEmbedding === null` must not throw and must not run a broken `<#>` query.
- **Dimension must match the schema** (768); the schema event itself hands off to `deeplake-dataset-worker-bee`.
- **Pick the weighting on purpose** (0.7/0.3, 0.5/0.5, 0.3/0.7); one fixed weighting for every query is a should-refactor.
- **The skillify gate is the quality bar**, every mined skill writes provenance, and recall quality is measured, not vibed.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
