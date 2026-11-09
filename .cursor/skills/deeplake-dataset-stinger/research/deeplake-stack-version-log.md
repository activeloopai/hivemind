# Deep Lake + Hivemind Stack Version Log

**Forged:** 2026-06-16

What was current at the time each guide was authored. The Deep Lake SQL surface, the embedding model, and the DeeplakeApi behavior gate the assumptions baked into each guide.

## Hivemind stack

| Component | Value @ 2026-06-16 | Notable |
|---|---|---|
| Language | TypeScript ^6 | strict; no codegen for the data layer |
| Runtime | Node >=22, ESM | |
| Build | tsc + esbuild | |
| Test | Vitest ^4 | `mem://` Deep Lake datasets for isolation |
| Quality | `tsc --noEmit` + jscpd + husky lint-staged | no ESLint / no Prettier |
| Persistence | Activeloop Deep Lake over an HTTP SQL API | NOT a relational engine |

## Deep Lake data layer

| Concern | Value @ forge time | Notes |
|---|---|---|
| Tables | 7 (memory, sessions, skills, rules, goals, kpis, codebase) | single-sourced in `src/deeplake-schema.ts` as `ColumnDef[]` |
| DDL | `CREATE TABLE IF NOT EXISTS "<name>" (...) USING deeplake` | rendered by `buildCreateTableSql` |
| Embedding | `FLOAT4[]`, 768-dim, nomic-embed-text-v1.5 | searched with `<#>` cosine |
| Schemaless payload | `message` as JSONB | 80/20 rule for column vs blob |
| Schema evolution | additive `healMissingColumns()` | no migrations framework; diff information_schema, ADD only missing, NEVER `IF NOT EXISTS` (500-not-409) |
| Validation | `validateSchema()` | every NOT NULL column must have a DEFAULT |
| Edits | append-only version-bump (skills/rules/goals/kpis) | INSERT version+1; latest via `ORDER BY version DESC`; dodges UPDATE-coalescing quirk |

## Search / indexing

| Strategy | Mechanism | Notes |
|---|---|---|
| Lookup | `ensureLookupIndex` | marker-cached; hot equality filters |
| BM25 | `CREATE INDEX ... USING deeplake_index` | DISABLED on the memory table (oid bug) |
| Vector | `<#>` cosine on `FLOAT4[]` | query vector cast `::float4[]` |
| Hybrid | `deeplake_hybrid_record($vec::float4[], $text, w1, w2)` | start 0.7 vector / 0.3 text |

## DeeplakeApi (`src/deeplake-api.ts`)

| Concern | Value @ forge time |
|---|---|
| Endpoint | `${apiUrl}/workspaces/${workspaceId}/tables/query` (fetch POST) |
| Auth | `Authorization: Bearer` + `X-Activeloop-Org-Id` |
| Retry | 429 / 500 / 502 / 503 / 504, `MAX_RETRIES=3` |
| Concurrency | `Semaphore(MAX_CONCURRENCY=5)` |
| Balance | 402 "balance exhausted" detected (not retried) |
| Guards | `sqlStr` / `sqlLike` / `sqlIdent` from `src/utils/sql` |

## Storage backends (BYOC)

| Scheme | Backend |
|---|---|
| `al://org/dataset` | Activeloop-managed (default) |
| `s3://` / `gcs://` / `azure://` | your cloud object store |
| `file://` | local filesystem (dev) |
| `mem://` | in-memory (tests) |

Credentials: raw cloud creds (quick start) or `creds_key` (production, central rotation).

**Env table names:** `HIVEMIND_TABLE` (memory), `HIVEMIND_SESSIONS_TABLE`, `HIVEMIND_SKILLS_TABLE`, `HIVEMIND_RULES_TABLE`.

**Versioning note:** This log is the single source of truth for "what was current when the guide was authored" - refresh it when refreshing any guide.
