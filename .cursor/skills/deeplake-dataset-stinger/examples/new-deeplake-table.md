# Worked Example - New Deep Lake Table

A clean new Deep Lake table for Hivemind: the `codebase` table that holds indexed code chunks, single-sourced as a `ColumnDef[]`, created `USING deeplake`, with an embedding tensor, a JSONB payload, and a vector + hybrid search plan. Source: `guides/01-schema-design.md`, `guides/02-indexing.md`, `guides/06-embeddings-jsonb-versioning.md`.

---

## Context

- **Persistence:** Activeloop Deep Lake over the HTTP SQL API.
- **Table:** `codebase` - one row per indexed code chunk.
- **Embedding model:** nomic-embed-text-v1.5, 768-dim.
- **Storage backend:** `al://` (Activeloop-managed) for the shared dataset; `mem://` in tests.
- **Workload:** write-on-index, read via semantic + keyword search.

## ColumnDef (single source in `src/deeplake-schema.ts`)

```ts
export const codebaseColumns: readonly ColumnDef[] = [
  { name: 'id',         type: 'TEXT',      notNull: true, default: "''" },
  { name: 'repo',       type: 'TEXT',      notNull: true, default: "''" },
  { name: 'path',       type: 'TEXT',      notNull: true, default: "''" },
  { name: 'language',   type: 'TEXT' },
  { name: 'chunk',      type: 'TEXT',      notNull: true, default: "''" },   // the code text
  { name: 'metadata',   type: 'JSONB' },                                    // schemaless: symbols, spans, blame
  { name: 'embedding',  type: 'EMBEDDING' },                                // -> FLOAT4[]  768-dim
  { name: 'version',    type: 'BIGINT',    notNull: true, default: '1' },
  { name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'now()' },
] as const;
```

## DDL rendered by `buildCreateTableSql`

```sql
CREATE TABLE IF NOT EXISTS "codebase" (
  id TEXT NOT NULL DEFAULT '',
  repo TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  language TEXT,
  chunk TEXT NOT NULL DEFAULT '',
  metadata JSONB,
  embedding FLOAT4[],
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT now()
) USING deeplake;
```

The table name passes through `sqlIdent` first. `IF NOT EXISTS` is correct on CREATE TABLE; it is NOT used on `ADD COLUMN` heals (see `examples/schema-heal-add-column.md`).

## Index plan

```ts
// hot equality filter on repo: lookup index, marker-cached
await ensureLookupIndex('codebase', 'repo');
```

```sql
-- keyword relevance over chunk text: BM25 (allowed here - this is NOT the memory table)
CREATE INDEX ON "codebase" USING deeplake_index (chunk);
```

```sql
-- semantic similarity: <#> cosine on the FLOAT4[] embedding
SELECT * FROM "codebase"
ORDER BY embedding <#> $vec::float4[]
LIMIT $k;
```

```sql
-- combined keyword + semantic: hybrid, tuned 0.7 vector / 0.3 text
SELECT * FROM "codebase"
ORDER BY deeplake_hybrid_record($vec::float4[], $text, 0.7, 0.3) DESC
LIMIT $k;
```

## Decision rationale (citations)

| Decision | Source |
|---|---|
| One `ColumnDef[]` is the single source | `guides/07-no-orm-columndef.md` |
| `USING deeplake` on CREATE TABLE | `guides/07-no-orm-columndef.md` SSbuildCreateTableSql |
| Every NOT NULL column carries a DEFAULT | `guides/01-schema-design.md` SSNOT-NULL-DEFAULT - `validateSchema()` gate |
| `metadata` is JSONB (schemaless per-chunk) | `guides/06-embeddings-jsonb-versioning.md` SSjsonb |
| `embedding` is `EMBEDDING` -> `FLOAT4[]` 768-dim | `guides/06-embeddings-jsonb-versioning.md` SSembeddings |
| Lookup index on `repo` via `ensureLookupIndex` | `guides/02-indexing.md` SSlookup - hot equality, marker-cached |
| BM25 `deeplake_index` allowed (not memory) | `guides/02-indexing.md` SSbm25 |
| `<#>` cosine on `FLOAT4[]` | `guides/02-indexing.md` SSvector |
| Hybrid 0.7 / 0.3 weighting | `guides/02-indexing.md` SShybrid + `research/2026-06-16-deeplake-search-hybrid-weighting.md` |
| `version` column for append-only edits | `guides/06-embeddings-jsonb-versioning.md` SSversion-bump |

## Pre-create checklist

- [ ] Every column declared in the `ColumnDef[]`, nowhere else.
- [ ] Every NOT NULL column has a DEFAULT (`validateSchema()` clean).
- [ ] Table and column names pass `sqlIdent`.
- [ ] Embedding is `EMBEDDING` -> `FLOAT4[]`, 768-dim, matching nomic-embed-text-v1.5.
- [ ] JSONB used only for genuinely schemaless `metadata`.
- [ ] Search operators chosen per `guides/02-indexing.md` (lookup / BM25 / vector / hybrid).
- [ ] Storage backend and credential model picked (`guides/08-storage-backends.md`).

## Handoffs from this table

- `security-worker-bee` - audit the BYOC creds / `creds_key` if not on `al://`.
- `typescript-node-worker-bee` - TypeScript data-access plan for surfacing search results.
- `retrieval-worker-bee` - retrieval over `codebase.embedding` (chunking, top-k, reranking).
- `quality-worker-bee` - verification queries after first ingest.

---

*Source: `guides/01-schema-design.md`, `guides/02-indexing.md`, `guides/06-embeddings-jsonb-versioning.md`. Forged 2026-06-16.*
