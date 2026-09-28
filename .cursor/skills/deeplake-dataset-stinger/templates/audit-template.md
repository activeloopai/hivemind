# Deep Lake Schema / Query Audit - {{table-or-feature-name}}

**Date:** {{YYYY-MM-DD}}
**Reviewer:** deeplake-dataset-worker-bee
**Scope:** {{schema review / schema-heal plan / indexing audit / query audit / storage-backend choice}}
**Persistence:** Activeloop Deep Lake over the HTTP SQL API
**Storage backend:** {{al:// / s3:// / gcs:// / azure:// / file:// / mem://}}

---

## Executive summary

{{2-4 sentence synthesis. Lead with the headline finding. Mention severity counts.}}

## Pillar ratings

Ratings: Solid / Drifting / Needs work

| Pillar | Rating | Headline finding |
|---|---|---|
| Schema design (`guides/01`) | | |
| Indexing / search (`guides/02`) | | |
| Schema healing (`guides/03`) | | |
| Versioning (`guides/04`) | | |
| Querying / DeeplakeApi (`guides/05`) | | |
| Embeddings / JSONB / version-bump (`guides/06`) | | |
| No-ORM ColumnDef (`guides/07`) | | |
| Storage backends (`guides/08`) | | |

## Findings

### Must-fix ({{count}})

1. **`{{file:line}}`** - {{one-line summary}}
   - Reason: {{citation - guide section, research note, or Deep Lake / Activeloop docs URL}}
   - Fix: {{how, with the ColumnDef change or heal step}}

2. ...

### Should-refactor ({{count}})

1. **`{{file:line}}`** - ...

### Style ({{count}})

1. **`{{file:line}}`** - ...

## Checks captured

| Check | Result | Target |
|---|---|---|
| Columns defined outside `deeplake-schema.ts` | {{N}} | 0 |
| NOT NULL columns missing a DEFAULT | {{N}} | 0 |
| `ADD COLUMN IF NOT EXISTS` in any heal | {{N}} | 0 |
| Blanket re-adds in any heal | {{N}} | 0 |
| True UPDATEs on append-only tables (skills/rules/goals/kpis) | {{N}} | 0 |
| Raw interpolated table names (no `sqlIdent`) | {{N}} | 0 |
| BM25 `deeplake_index` on the memory table | {{N}} | 0 |
| Query vectors missing `::float4[]` cast | {{N}} | 0 |
| BYOC backends using raw creds where `creds_key` fits | {{N}} | 0 |

## Cross-Bee handoffs

- [ ] `library-worker-bee` - {{if any schema-PRD updates needed}}
- [ ] `typescript-node-worker-bee` - {{if any read-amplification risks at the TypeScript data-access edge}}
- [ ] `security-worker-bee` - {{if any creds / creds_key / token / PII findings}}
- [ ] `retrieval-worker-bee` - {{if any embedding-storage / retrieval decisions}}
- [ ] `quality-worker-bee` - {{post-heal verification queries}}

## Recommended next steps

1. {{highest-leverage fix}}
2. {{next}}
3. {{next}}

## References

- `guides/...` ({{list the guides actually cited in findings}})
- `research/...` ({{list the research notes referenced}})
- {{external URLs - Deep Lake / Activeloop docs preferred}}

---

*Produced by deeplake-dataset-stinger. See `SKILL.md` for methodology.*
