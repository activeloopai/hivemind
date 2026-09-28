# 05 - Querying through DeeplakeApi

Every read and write goes through `DeeplakeApi` in `src/deeplake-api.ts`. It is a thin, hardened client over the Activeloop HTTP SQL API. Dynamic SQL fragments are guarded by `sqlStr` / `sqlLike` / `sqlIdent` from `src/utils/sql`.

Source: `research/2026-06-16-deeplakeapi-retry-semaphore-402.md`.

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

The body carries the SQL query (and parameters). There is no persistent connection - each query is one HTTP round-trip. That shapes everything below.

## Retry policy

DeeplakeApi retries on transient failures: **429, 500, 502, 503, 504**, up to `MAX_RETRIES = 3`. This matters for schema healing: because a duplicate `ADD COLUMN` surfaces as a 500 (not a 409), the retry layer would retry a blind add three times and still fail. That is exactly why heals diff first and never use `IF NOT EXISTS` - see `guides/03-schema-healing.md`.

## Concurrency - the Semaphore

A `Semaphore(MAX_CONCURRENCY = 5)` gates outstanding requests, so the client never fires more than five concurrent queries at the API. When you write a bulk loop (ingest, re-embed, backfill verification), respect the Semaphore - do not spawn unbounded parallel queries; let the client throttle. An unbounded fan-out that ignores the Semaphore is a should-refactor finding.

## 402 - balance exhausted

The Activeloop API returns **HTTP 402** when the org's balance is exhausted. DeeplakeApi detects this specifically and surfaces it as a "balance exhausted" condition rather than retrying (402 is not in the retry set - retrying would not help). When you see a 402 path in code or logs, the fix is account balance, not query tuning.

## SQL guards - never interpolate raw

Every dynamic fragment goes through a guard from `src/utils/sql`:

| Guard | Use for | Behavior |
|---|---|---|
| `sqlIdent()` | Table and column names | Rejects anything not `[A-Za-z_][A-Za-z0-9_]*` |
| `sqlStr()` | String literals | Escapes / quotes a string value safely |
| `sqlLike()` | `LIKE` patterns | Escapes a value for a `LIKE` predicate |

The table-name rule is the load-bearing one: table names come from env (`HIVEMIND_TABLE`, `HIVEMIND_SESSIONS_TABLE`, `HIVEMIND_SKILLS_TABLE`, `HIVEMIND_RULES_TABLE`) and MUST pass `sqlIdent` before they reach a query. A raw interpolated table name is both an injection vector and a 500 waiting to happen - it is a must-fix.

```ts
const table = sqlIdent(process.env.HIVEMIND_TABLE ?? 'memory');
const sql = `SELECT * FROM "${table}" WHERE session_id = ${sqlStr(sessionId)}`;
```

## Putting it together

A typical guarded vector query through DeeplakeApi:

```ts
const table = sqlIdent(tableName);
const sql = `
  SELECT * FROM "${table}"
  ORDER BY message_embedding <#> $vec::float4[]
  LIMIT ${limit}
`;
const rows = await deeplakeApi.query(sql, { vec });   // gated by Semaphore, retried on 5xx/429
```

The operator choice (`<#>` vs BM25 vs hybrid) is `guides/02-indexing.md`; this guide is about getting the query to the API safely.

## Cross-references

- `02-indexing.md` - which operator the query should use.
- `03-schema-healing.md` - why the 500 retry behavior forces the diff-first heal.
- `08-storage-backends.md` - the backend behind the workspace the API targets.
