# Research Plan - deeplake-dataset-stinger

**Bee:** deeplake-dataset-worker-bee
**Forged:** 2026-06-16
**Source of truth:** the Hivemind codebase - `src/deeplake-schema.ts`, `src/deeplake-api.ts`, `src/utils/sql`, and Activeloop Deep Lake docs.

## Open questions from the brief

1. Should deeplake-dataset-worker-bee own retrieval / RAG? **Resolved: NO.** It picks the `FLOAT4[]` shape and the search operator (`<#>` / hybrid), then hands chunking / reranking / eval to `retrieval-worker-bee`. Noted in `guides/00-principles.md`.
2. Should it author the heal directly when invoked? **Resolved: YES for the additive heal plan; `quality-worker-bee` verifies after.** Heals are additive only - `healMissingColumns()` adds missing columns, never blanket, never `IF NOT EXISTS`.
3. Where does dataset versioning live vs the per-row version-bump? **Resolved:** dataset commit/branch/tag/revert_to in `guides/04-versioning-branches.md`; the append-only per-row version-bump in `guides/06-embeddings-jsonb-versioning.md`. Cross-referenced so they are never conflated.

## Authoritative sources consulted

### Primary (the codebase)
- `src/deeplake-schema.ts` - the `readonly ColumnDef[]` for the 7 tables, `buildCreateTableSql`, `validateSchema`, `healMissingColumns`.
- `src/deeplake-api.ts` - `DeeplakeApi`: fetch POST to `/workspaces/${workspaceId}/tables/query`, `Authorization: Bearer` + `X-Activeloop-Org-Id`, retry on 429/500/502/503/504 (MAX_RETRIES=3), `Semaphore(MAX_CONCURRENCY=5)`, 402 balance detection.
- `src/utils/sql` - `sqlStr` / `sqlLike` / `sqlIdent` guards.

### Deep Lake / Activeloop
- Activeloop Deep Lake docs - dataset model, `USING deeplake`, BYOC backends (`al://` / `s3://` / `gcs://` / `azure://` / `file://` / `mem://`), `creds_key`.
- Deep Lake SQL surface - `FLOAT4[]` tensors, `<#>` cosine, `deeplake_index` (BM25), `deeplake_hybrid_record`, dataset versioning (commit / branch / merge / tag / revert_to).
- nomic-embed-text-v1.5 - 768-dim embedding model used across Hivemind.

## Questions investigated (question-shaped)

1. "How is the Hivemind schema single-sourced and rendered to DDL?"
2. "Why additive schema healing instead of a migrations framework?"
3. "Why does Deep Lake return HTTP 500 (not 409) on a duplicate ADD COLUMN, and what does that mean for IF NOT EXISTS?"
4. "Why are skills/rules/goals/kpis append-only version-bumped instead of UPDATEd?"
5. "When to use BM25 (deeplake_index) vs vector (<#>) vs hybrid, and why is BM25 disabled on the memory table?"
6. "How should hybrid weights w1/w2 be tuned?"
7. "How does DeeplakeApi handle retry, concurrency, and 402 balance exhaustion?"
8. "Which BYOC storage backend and credential model (raw creds vs creds_key) for which deployment?"
9. "How does dataset versioning (commit/branch/tag/revert_to) differ from the per-row version-bump?"

## Target output

- Dated research notes in `research/2026-06-16-<topic>.md`.
- `deeplake-stack-version-log.md` capturing "what was current at author time".
- `open-questions.md` if any user-judgment calls remain.
