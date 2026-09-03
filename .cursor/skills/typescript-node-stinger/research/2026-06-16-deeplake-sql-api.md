# 2026-06-16 - Deep Lake SQL API: retry, Semaphore, guards

Authored 2026-06-16 from `src/deeplake-api.ts` and `src/utils/sql.ts`. Repo is the source of truth.

## Sources

- `src/deeplake-api.ts`, `src/utils/sql.ts`, `src/mcp/server.ts` (call sites).
- https://docs.deeplake.ai/

## Summary

All persistence flows through one client. `query()` POSTs to `${apiUrl}/workspaces/${workspaceId}/tables/query` with `Authorization: Bearer <token>` and `X-Activeloop-Org-Id: <orgId>`. Observed behavior in the source:

- **Retry:** `RETRYABLE_CODES = {429, 500, 502, 503, 504}` plus a narrow retryable-403 case, with exponential backoff up to `MAX_RETRIES`. An "already exists" 403 from a concurrent ALTER is treated as terminal (not retried).
- **Concurrency:** a module-level `Semaphore(5)` (`MAX_CONCURRENCY`) gates every request so a burst does not get the org rate-limited. `acquire()` returns a release function; waiters queue.
- **No parameterized queries:** SQL is built as a string, so `src/utils/sql.ts` provides `sqlStr` (single-quoted literal escaping), `sqlLike` (adds `%`/`_` escaping; pair with `ESCAPE '\\'`), and `sqlIdent` (validates `^[a-zA-Z_][a-zA-Z0-9_]*$`, throws otherwise).
- **Missing-table/column detection:** `isMissingTableError` / `isMissingColumnError` let callers turn a fresh-org empty state into a friendly hint.

## Key facts the guides depend on

- A hand-rolled `fetch` to the endpoint loses retry + Semaphore + guards - a must-fix (`guides/03`).
- Per-item query loops serialize through the Semaphore - batch with `IN (...)` or `Promise.all` (`guides/08`).
- Every interpolated value/identifier is guarded (`guides/17`).

## Relevance

- `guides/03-deeplake-sql-api.md`, `guides/08-async-concurrency.md`, `guides/17-secrets-and-sql-guards.md`, `scripts/audit-unbatched-queries.mjs`.
