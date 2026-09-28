# Schema Spec - {{table-or-feature-name}}

**Date:** {{YYYY-MM-DD}}
**Author:** deeplake-dataset-worker-bee
**Persistence:** Activeloop Deep Lake over the HTTP SQL API
**Storage backend:** {{al:// / s3:// / gcs:// / azure:// / file:// / mem://}}
**Embedding model:** nomic-embed-text-v1.5 (768-dim, FLOAT4[])

---

## Context

{{One paragraph: what is this table for, who consumes it, what is the workload shape (read/write ratio, search patterns), and which of the 7 tables it is or relates to (memory, sessions, skills, rules, goals, kpis, codebase).}}

## Source PRD

{{Link to the `library-worker-bee` PRD if it exists. deeplake-dataset-worker-bee implements; library-worker-bee authored.}}

## Table

### `{{table-name}}`

**Purpose:** {{one sentence}}
**Append-only / version-bumped?** {{yes for skills/rules/goals/kpis - INSERT version+1; no for memory/sessions/codebase}}
**Read pattern:** {{e.g., equality lookup by session_id; vector similarity; hybrid keyword+semantic}}
**Write pattern:** {{e.g., append on index; version-bump on edit}}

### ColumnDef (single source in `src/deeplake-schema.ts`)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `TEXT` | NOT NULL DEFAULT '' | |
| `message` | `JSONB` | | schemaless payload |
| `{{name}}_embedding` | `EMBEDDING` | | -> FLOAT4[] 768-dim |
| `version` | `BIGINT` | NOT NULL DEFAULT 1 | append-only history (if applicable) |
| `created_at` | `TIMESTAMP` | NOT NULL DEFAULT now() | |
| ... | ... | ... | ... |

> Every NOT NULL column MUST carry a DEFAULT (`validateSchema()` gate). Every column / table name MUST pass `sqlIdent`.

### Index / search plan

| Search | Operator / index | Reason |
|---|---|---|
| Equality lookup | `ensureLookupIndex(table, '{{col}}')` | hot equality filter, marker-cached |
| Keyword relevance | `CREATE INDEX ... USING deeplake_index ({{col}})` | BM25 - NOT on the memory table (oid bug) |
| Semantic similarity | `ORDER BY {{col}}_embedding <#> $vec::float4[]` | cosine on FLOAT4[] |
| Combined | `deeplake_hybrid_record($vec::float4[], $text, w1, w2)` | tune w1/w2 (start 0.7/0.3) |

### JSONB vs columns

- **In JSONB:** {{the genuinely schemaless fields, e.g. `message`}}
- **Promoted to columns:** {{fields filtered/sorted/searched more than once a week}}

### PII columns

- `{{column}}` - {{type of PII; flagged for `security-worker-bee` audit}}

---

(Repeat per table if more than one.)

## Storage backend + credentials

- **Backend:** {{al:// / s3:// / gcs:// / azure:// / file:// / mem://}}
- **Credential model:** {{`creds_key` (production) / raw creds (quick start only)}}
- **Residency / compliance notes:** {{any account/region constraint}}

## Dataset versioning

{{Commit / branch / tag policy: when to commit, whether risky work gets a branch, which checkpoints get tagged. See guides/04-versioning-branches.md.}}

## Open questions

- [ ] {{any user-judgment calls}}

## Handoffs

- **`library-worker-bee`** - PRD update if scope changed during design.
- **`typescript-node-worker-bee`** - read-amplification callouts at the TypeScript data-access edge.
- **`security-worker-bee`** - creds / `creds_key` / token handling, PII columns.
- **`retrieval-worker-bee`** - embedding storage decisions and dimension for retrieval.
- **`quality-worker-bee`** - verification queries after the heal / first ingest.

## References

- `guides/01-schema-design.md`
- `guides/02-indexing.md`
- {{external Deep Lake / Activeloop docs URLs}}

---

*Template from `deeplake-dataset-stinger/templates/schema-spec.md`. See `examples/new-deeplake-table.md` for a filled example.*
