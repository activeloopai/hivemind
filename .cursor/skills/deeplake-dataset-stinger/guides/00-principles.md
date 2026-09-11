# 00 - Principles

The non-negotiables. Read on every invocation.

## The layering

deeplake-dataset-worker-bee thinks in five layers, top-down for a new table, bottom-up when a query is wrong:

```
┌─────────────────────────────┐
│  Storage                    │  al:// / s3:// / gcs:// / azure:// / file:// / mem://
├─────────────────────────────┤
│  Versioning                 │  commit / branch / merge / tag / revert_to
├─────────────────────────────┤
│  Healing                    │  healMissingColumns (additive ALTER ADD COLUMN)
├─────────────────────────────┤
│  Indexes                    │  ensureLookupIndex / deeplake_index BM25 / <#> vector / hybrid
├─────────────────────────────┤
│  Schema                     │  ColumnDef[], USING deeplake, NOT NULL + DEFAULT
└─────────────────────────────┘
```

New table: schema first; everything else follows. "A query is wrong": querying / DeeplakeApi first; chase the architectural cleanup once stable.

## The ten principles

### 1. Read the inputs first - always

Before recommending anything, read:
- `src/deeplake-schema.ts` - the `readonly ColumnDef[]` for the table(s) in play.
- `src/deeplake-api.ts` - the DeeplakeApi access pattern (retry set, Semaphore, 402).
- The healing / index / query code that touches the table.
- `package.json` for the Deep Lake / Activeloop client and Node / TS versions.

A recommendation against the wrong schema shape is wrong advice. Source: `research/deeplake-stack-version-log.md`.

### 2. Single-source the schema

Every column is one `ColumnDef` in `src/deeplake-schema.ts`. `buildCreateTableSql` and `healMissingColumns` both read from it:

- `CREATE TABLE IF NOT EXISTS "<name>" (...) USING deeplake` is the only DDL shape.
- Columns (a.k.a. tensors) are typed: `message` is JSONB; `message_embedding` / `summary_embedding` are `FLOAT4[]` (768-dim, nomic-embed-text-v1.5).
- The SEVEN tables: memory, sessions, skills, rules, goals, kpis, codebase.

Source: `research/2026-06-16-no-orm-columndef-deeplakeapi.md`.

### 3. Heal additively, never blanket

`healMissingColumns()` runs one `SELECT column_name FROM information_schema.columns`, diffs against the ColumnDef list, and `ALTER TABLE ADD COLUMN` only the missing ones. Never blanket re-add. Never `ADD COLUMN IF NOT EXISTS` (Deep Lake returns HTTP 500, not 409). A blind add is a must-fix.

Source: `research/2026-06-16-additive-schema-healing-500-not-409.md`. Detail: `guides/03-schema-healing.md`.

### 4. Every NOT NULL column gets a DEFAULT

`validateSchema()` requires it. Adding a NOT NULL column with no default to a populated table breaks every existing row. State the default in the ColumnDef.

The heal procedure lives in `guides/03-schema-healing.md`.

### 5. Edits version-bump; they do not UPDATE

skills / rules / goals / kpis are append-only: INSERT version+1, read latest via `ORDER BY version DESC`. A true UPDATE hits a Deep Lake UPDATE-coalescing quirk and silently loses writes.

Source: `research/2026-06-16-deeplake-types-jsonb-embedding-versioning.md`. Detail: `guides/06-embeddings-jsonb-versioning.md`.

### 6. Guard every dynamic SQL fragment

`sqlStr()` / `sqlLike()` / `sqlIdent()` from `src/utils/sql`. Table names go through `sqlIdent`, which rejects anything not `[A-Za-z_][A-Za-z0-9_]*`. Raw interpolation is an injection and a 500.

Source: `research/2026-06-16-deeplakeapi-retry-semaphore-402.md`. Detail: `guides/05-querying-deeplakeapi.md`.

### 7. Pick the right search operator

| Want... | Pick |
|---|---|
| Hot equality filter on a non-vector column | Lookup index via `ensureLookupIndex` (marker-cached) |
| Full-text relevance | BM25 via `CREATE INDEX ... USING deeplake_index` (NOT on memory - oid bug) |
| Semantic similarity | `<#>` cosine on a `FLOAT4[]` column |
| Both relevance and similarity | `deeplake_hybrid_record($vec::float4[], $text, w1, w2)` |

No single operator is universally right. Source: `research/2026-06-16-deeplake-indexing-bm25-vector-hybrid.md`.

### 8. Cite every finding

Two citations per finding:

- **Where in the schema / code** - `src/deeplake-schema.ts:42`.
- **Why it's a finding** - guide section (`guides/02-indexing.md SShybrid`), research note (`research/2026-06-16-deeplake-indexing-bm25-vector-hybrid.md`), or Deep Lake / Activeloop docs URL.

### 9. Severity discipline

| Severity | Example | Blocks PR? |
|---|---|---|
| Must-fix | Column defined outside `deeplake-schema.ts`, blanket heal or `IF NOT EXISTS`, NOT NULL column with no DEFAULT, true UPDATE on an append-only table, raw interpolated table name, BM25 index on the memory table | Yes |
| Should-refactor | Vector-only where hybrid clearly wins, ColumnDef ordering mismatched to query pattern, unbounded query ignoring the Semaphore, missing `creds_key` where BYOC would rotate cleanly | No - open follow-up |
| Style | Comment density, column ordering, naming | No - suggestion only |

Calling a style nit "must-fix" is reviewer error. It erodes trust.

### 10. Surface, don't audit, what other Bees own

Below is what you *do not own*. Hand off when the question is primarily:

| Question type | Owner |
|---|---|
| Schema PRD authoring (translating product intent into a schema spec) | `library-worker-bee` (you implement after) |
| TypeScript data-access consumption (DeeplakeApi call sites, read-amplification) | `typescript-node-worker-bee` (you flag read-amplification) |
| Creds / `creds_key` / token handling / PII compliance | `security-worker-bee` (you design the storage shape; surface PII) |
| Recall retrieval, chunking, reranking, eval | `retrieval-worker-bee` (you pick the `FLOAT4[]` shape and stop) |
| Post-heal verification | `quality-worker-bee` (you write the queries) |

You *surface* concerns in these areas with file:line and a short note, but don't author the audit.

---

## First-move checklist

Before writing findings, confirm:

- [ ] `src/deeplake-schema.ts` read; the ColumnDef(s) in play captured.
- [ ] `src/deeplake-api.ts` access pattern captured.
- [ ] Deep Lake / Activeloop client versions captured from `package.json`.
- [ ] Invocation classified (design / review / healing / indexing / querying / versioning / storage).
- [ ] Routing table in `SKILL.md` checked for primary guide(s).
- [ ] Severity rubric in mind.

## Scope explicitly excluded (v1)

- **Non-Deep-Lake vector stores.** Hivemind persistence is Activeloop Deep Lake over the HTTP SQL API. Other stores go to a stack-specific reviewer.
- **Relational engines.** No relational DB is in scope; the Deep Lake SQL surface is its own model.
- **Retrieval / recall pipelines.** The `FLOAT4[]` shape and search operator are in scope; chunking and reranking route to `retrieval-worker-bee`.

## Example in action

`examples/new-deeplake-table.md` shows these principles applied to a fresh Deep Lake table. `examples/schema-heal-add-column.md` shows an additive NOT NULL column add via `healMissingColumns`. `examples/storage-backend-choice-walkthrough.md` shows the storage-choice matrix.
