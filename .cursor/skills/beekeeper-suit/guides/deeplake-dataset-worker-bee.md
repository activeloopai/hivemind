# Deep Lake Dataset Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `deeplake-dataset-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/deeplake-dataset-worker-bee.md`](../../../agents/deeplake-dataset-worker-bee.md)
**Stinger:** [`.cursor/skills/deeplake-dataset-stinger/`](../../deeplake-dataset-stinger/)
**Trigger policy:** proactive

---

## Domain

`deeplake-dataset-worker-bee` is the Army's Deep Lake data architecture engineer for Hivemind. It owns the 7-table `ColumnDef` schema (memory, sessions, skills, rules, goals, kpis, codebase), single-sourced in `deeplake-schema.ts`, the `USING deeplake` table model and `buildCreateTableSql`, the `FLOAT4[768]` embedding layout (nomic-embed-text-v1.5) and JSONB `message` storage, additive schema healing (`healMissingColumns`, `validateSchema`), append-only version-bump writes, the indexing decision tree (`deeplake_index` BM25, `<#>` vector, `deeplake_hybrid_record`), DeeplakeApi querying discipline, SQL-guard hygiene, dataset versioning (commit / branch / merge / tag / revert_to), and BYOC storage selection (`al://`, `s3://`, `gcs://`, `azure://`, `file://`, `mem://`, raw creds vs `creds_key`). It is allergic to blanket `ALTER TABLE` and to true UPDATEs on append-only tables.

## Trigger phrases

Route to `deeplake-dataset-worker-bee` when the user says any of:

- "Design this table" / "design a Deep Lake table"
- "Review this ColumnDef" / "add a column" / "we need a new NOT NULL column on the memory table"
- "Should this be JSONB or a column?"
- "Is this index right?" / "vector or hybrid search here?"
- "How do we heal a missing column?" / "schema healing"
- "Append-only versioning" / "which storage backend?" / "BYOC storage"

Or when the request implicitly involves the Hivemind Deep Lake data layer schema, indexing, or storage.

## Do NOT route when

- The user wants recall quality, hybrid weighting, BM25 fallback behavior, or the skillify gate (the *use* of the tables) - that is `retrieval-worker-bee`. This Bee owns the schema underneath; retrieval owns the query that runs over it.
- The user wants the embedding model, daemon, or dimension change runtime - that is `embeddings-runtime-worker-bee`. A dim change is a schema event this Bee executes, but the model decision is theirs.
- The user wants the TypeScript DeeplakeApi consumption patterns - co-owned, but the implementation idioms are `typescript-node-worker-bee`.
- The user wants PRD authoring of the schema - that is `library-worker-bee`.
- The user wants a security audit of creds, `creds_key`, or PII - surface and hand off to `security-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The table or column in scope, or a description of the data being modeled.
- Access to `src/deeplake-schema.ts` and the healing/validation helpers.
- Optional: the query pattern that will read the data (drives the index decision), and the target storage backend.

If the schema file or table context is missing, do not invoke yet - ask the user to point at it.

## Outputs the Bee produces

- Schema designs and `ColumnDef` edits (single-sourced, additive, NOT NULL columns carrying a DEFAULT).
- The additive heal shape and the indexing decision (BM25 / vector / hybrid) with rationale.
- Versioning and BYOC storage recommendations, each cited to a guide or Deep Lake/Activeloop docs URL.

## Multi-Bee sequences this Bee participates in

- **Schema-touching feature** - `deeplake-dataset-worker-bee` designs the table, columns, indexing, and additive heal shape first; the implementation Bee then builds the DeeplakeApi side; `embeddings-runtime-worker-bee` is pulled in on an EMBEDDING dimension change.
- **Memory / retrieval feature** - designs or heals the tables and columns the feature reads or writes, underneath `retrieval-worker-bee` and `embeddings-runtime-worker-bee`.

## Critical directives the orchestrator should respect

- **Single-source the schema in `deeplake-schema.ts`.** `buildCreateTableSql` and `healMissingColumns` both read from one `readonly ColumnDef[]`.
- **Heal additively, never blanket.** The diff against `information_schema.columns` is the guard.
- **Never `ADD COLUMN IF NOT EXISTS`.** Deep Lake returns HTTP 500 (not 409) on a duplicate add, so the diff is the only safe guard.
- **Every NOT NULL column gets a DEFAULT.**
- **Edits version-bump, they do not UPDATE.** skills/rules/goals/kpis INSERT version+1 and read latest via `ORDER BY version DESC`.
- **Guard every dynamic SQL fragment** (`sqlIdent`/`sqlStr`/`sqlLike`) and **cite every claim**.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
