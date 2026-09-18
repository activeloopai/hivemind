# 03 - Deep Lake SQL API

All persistence in Hivemind goes through one client: `src/deeplake-api.ts`. This is the ORM-equivalent discipline for this repo. There is no Postgres, no Prisma, no Drizzle - there is Activeloop Deep Lake reached over an HTTP SQL API.

## The endpoint

`query()` POSTs to `${apiUrl}/workspaces/${workspaceId}/tables/query` with:

- `Authorization: Bearer <token>`
- `X-Activeloop-Org-Id: <orgId>`
- a JSON body carrying the SQL string.

There are **no parameterized queries**. You build the SQL string yourself, which is exactly why the `sqlStr` / `sqlLike` / `sqlIdent` guards exist (`guides/17`).

## The three rules

### 1. Never hand-roll a `fetch` to the query endpoint

The client already gives you, for free:

- **Retry on transient failures.** `RETRYABLE_CODES = {429, 500, 502, 503, 504}`, plus a narrow retryable-403 case, with exponential backoff (`MAX_RETRIES` attempts).
- **Bounded concurrency.** A module-level `Semaphore(5)` (`MAX_CONCURRENCY`) caps in-flight requests so a burst of hook activity does not get the org rate-limited.
- **Consistent headers and error surfacing.**

A bare `fetch` to the endpoint loses all of that. It is a **must-fix**: import and call the client.

```ts
import { DeeplakeApi } from "./deeplake-api.js";

const api = new DeeplakeApi(apiUrl, workspaceId, orgId, token);
const rows = await api.query(sql);   // retried, concurrency-bounded
```

### 2. Batch round-trips; do not loop one query per item

The Deep Lake round-trip is the expensive thing. A loop that fires one `SELECT` per id is the local equivalent of an N+1: it serializes through the Semaphore and burns latency. Fold it into a single statement:

```ts
// BAD - one round-trip per path, serialized through the Semaphore
for (const path of paths) {
  const rows = await api.query(`SELECT * FROM "${table}" WHERE path = '${sqlStr(path)}'`);
}

// GOOD - one round-trip
const list = paths.map(p => `'${sqlStr(p)}'`).join(", ");
const rows = await api.query(`SELECT * FROM "${table}" WHERE path IN (${list}) LIMIT 200`);
```

An un-batched query that should be one round-trip is a **should-refactor** (a **must-fix** when it is on a hot path like a SessionStart hook).

### 3. Guard every interpolated value and identifier

Because there are no params, untrusted input (an LLM-supplied path, a user prefix) is concatenated into SQL. Run it through the guards from `src/utils/sql.ts`:

- `sqlStr(value)` - escapes single quotes, backslashes, NUL, control chars for a single-quoted literal.
- `sqlLike(value)` - `sqlStr` plus escaping `%` and `_` so a `LIKE` pattern can't be widened (`prefix='%'` would otherwise match every row). Pair with `ESCAPE '\\'`.
- `sqlIdent(name)` - validates a table/column name against `^[a-zA-Z_][a-zA-Z0-9_]*$` and throws otherwise.

Un-guarded interpolation is a **must-fix** (`guides/17`).

## Missing-table / missing-column errors

The client and schema module expose `isMissingTableError(msg)` and `isMissingColumnError(msg)`. The MCP tools use the first to turn a missing-table error into a friendly "no matches yet, fresh org" hint instead of a stack trace. When you add a read path, handle these the same way - do not let a fresh-org empty state surface as a crash.

## Audit script

`scripts/audit-unbatched-queries.mjs` flags `await api.query(` (or raw `fetch(` to a `/tables/query` URL) inside a `for` / `while` / `.map(` loop, and flags any `fetch(` whose URL contains `tables/query`. See `scripts/README.md`.

## Sources

- `src/deeplake-api.ts` (the client, `Semaphore`, `RETRYABLE_CODES`, retry loop).
- `src/utils/sql.ts` (the guards).
- `src/mcp/server.ts` (real call sites).
- `research/2026-06-16-deeplake-sql-api.md`.
