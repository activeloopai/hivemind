# DeeplakeApi - Retry, Semaphore, 402, SQL Guards

**Sources:**
- `src/deeplake-api.ts` - `DeeplakeApi` client
- `src/utils/sql` - `sqlStr` / `sqlLike` / `sqlIdent`
- Activeloop HTTP SQL API behavior
- Hivemind data-layer code review

**Retrieved:** 2026-06-16

## Summary

Every read and write goes through `DeeplakeApi`, a thin hardened client over the Activeloop HTTP SQL API. There is no persistent connection - each query is one HTTP round-trip. The client adds retry, concurrency control, balance detection, and pairs with the SQL guards.

## The access pattern

`DeeplakeApi` issues a `fetch` POST to:

```
${apiUrl}/workspaces/${workspaceId}/tables/query
```

with headers:

```
Authorization: Bearer <token>
X-Activeloop-Org-Id: <org id>
```

The body carries the SQL and parameters.

## Retry policy

Retries on transient failures - **429, 500, 502, 503, 504** - up to `MAX_RETRIES = 3`. This matters for schema healing: a duplicate `ADD COLUMN` surfaces as a 500, so the retry layer would retry a blind add three times and still fail. That is exactly why heals diff first and never use `IF NOT EXISTS` (`research/2026-06-16-additive-schema-healing-500-not-409.md`).

## Concurrency - the Semaphore

A `Semaphore(MAX_CONCURRENCY = 5)` caps outstanding requests at five. Bulk loops (ingest, re-embed, verification) must respect it - do not fan out unbounded parallel queries; let the client throttle. An unbounded fan-out is a should-refactor finding.

## 402 - balance exhausted

The Activeloop API returns **HTTP 402** when the org balance is exhausted. DeeplakeApi detects this specifically and surfaces "balance exhausted" rather than retrying (402 is not in the retry set - retrying would not help). A 402 path means fix the account balance, not the query.

## SQL guards

Every dynamic fragment goes through a guard from `src/utils/sql`:

| Guard | Use for | Behavior |
|---|---|---|
| `sqlIdent()` | table / column names | rejects anything not `[A-Za-z_][A-Za-z0-9_]*` |
| `sqlStr()` | string literals | escapes / quotes safely |
| `sqlLike()` | `LIKE` patterns | escapes for a `LIKE` predicate |

Table names come from env (`HIVEMIND_TABLE`, `HIVEMIND_SESSIONS_TABLE`, `HIVEMIND_SKILLS_TABLE`, `HIVEMIND_RULES_TABLE`) and MUST pass `sqlIdent` before reaching a query. A raw interpolated table name is an injection vector and a 500 - a must-fix.

## Relevance to this stinger

Spine of `guides/05-querying-deeplakeapi.md`. Drives hard rules #6 (guard every fragment) and #8 (cite the DeeplakeApi path). Underpins the 500-retry reasoning in the schema-healing guide.
