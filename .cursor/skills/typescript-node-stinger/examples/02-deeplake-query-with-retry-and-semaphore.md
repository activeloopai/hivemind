# Example 02 - A Deep Lake read through the client (with batching)

Goal: read the summaries for a set of session ids. Shows the right way to talk to Deep Lake: through the `DeeplakeApi` client (retry + Semaphore for free), batched into one round-trip, with guarded SQL.

## The wrong way (two findings)

```ts
// BAD 1: hand-rolled fetch - bypasses retry, Semaphore, and the auth headers.
const resp = await fetch(`${apiUrl}/workspaces/${ws}/tables/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ query: `SELECT * FROM "${table}" WHERE id = '${id}'` }),
});

// BAD 2: one round-trip per id, serialized through the Semaphore (the N+1 here).
for (const id of ids) {
  const rows = await api.query(`SELECT summary::text FROM "${table}" WHERE id = '${id}'`);
}
```

The first is a **must-fix** (`guides/03`); the second is a **should-refactor** that becomes a must-fix on a hot hook path (`guides/08`).

## The right way

```ts
import type { DeeplakeApi } from "../deeplake-api.js";
import { sqlStr, sqlIdent } from "../utils/sql.js";

export async function readSummariesByIds(
  api: DeeplakeApi,
  table: string,
  ids: string[],
): Promise<Array<{ id: string; summary: string }>> {
  if (ids.length === 0) return [];

  // Guard every value (sqlStr) and the table name (sqlIdent). The endpoint has
  // no parameterized queries, so this is mandatory (guides/17).
  const inList = ids.map((id) => `'${sqlStr(id)}'`).join(", ");
  const sql =
    `SELECT id, summary::text AS summary ` +
    `FROM "${sqlIdent(table)}" ` +
    `WHERE id IN (${inList}) LIMIT 500`;

  // One round-trip. The client retries 429/5xx and is bounded by Semaphore(5).
  const rows = await api.query(sql);
  return rows.map((r) => ({ id: String(r["id"]), summary: String(r["summary"] ?? "") }));
}
```

## What this demonstrates

- **Go through `api.query`** - retry + concurrency bounding + consistent headers are already there (`guides/03`).
- **Batch with `IN (...)`** - one round-trip instead of N serial ones (`guides/08`).
- **`sqlStr` per value, `sqlIdent` per identifier** - no parameterized queries means you guard everything (`guides/17`).
- **`::text` cast** - the SQL API returns typed columns; cast the text payload explicitly, as the real tools do.

## If the reads were genuinely heterogeneous

When you cannot fold them into one statement, fan out with `Promise.all` - the Semaphore still caps real concurrency at 5:

```ts
const results = await Promise.all(ids.map((id) => readOne(api, table, id)));
```

## See also

- `guides/03-deeplake-sql-api.md`, `guides/08-async-concurrency.md`, `guides/17-secrets-and-sql-guards.md`.
- `src/deeplake-api.ts` (the client, `Semaphore`, retry), `src/utils/sql.ts` (the guards).
