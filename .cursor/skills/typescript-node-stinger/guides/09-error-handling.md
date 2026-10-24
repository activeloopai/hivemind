# 09 - Error Handling

Hivemind runs inside an agent's lifecycle. A swallowed error here does not crash loudly - it silently drops a memory write or a capture, which is worse. The discipline is: narrow, surface, never swallow.

## The catch idiom

A `catch` binds `unknown` under strict mode. Narrow it before using it:

```ts
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  // decide: retry? friendly hint? rethrow? structured error?
}
```

This `err instanceof Error ? err.message : String(err)` pattern is used throughout `src/mcp/server.ts` and the hooks. Treating `err` as `any` and reaching into `err.message` directly is a **must-fix** (it lies to strict mode).

## No swallowed errors

- **Empty `catch {}` is a must-fix.** It hides the failure entirely.
- **A `catch` that discards `err` with no log, no rethrow, and no documented reason is a must-fix.** If a catch is genuinely "best effort, ignore failure" (e.g. an optional cache write), say so in a comment explaining why the failure is safe to drop.
- **The one sanctioned silent catch is the already-exists race.** `healMissingColumns` tolerates a concurrent-writer "already exists" error from a parallel ALTER and re-verifies with a SELECT - that is documented in `src/deeplake-schema.ts`. A bare swallow without that kind of reasoning is not the same thing.

## Error shapes by surface

- **MCP tools** return a structured error, never throw out of the handler: `return errorResult(msg)`. Convert a missing-table error into a friendly hint with `isMissingTableError(msg)` (`guides/05`).
- **The Deep Lake client** retries transient codes and only surfaces a hard failure after exhausting `MAX_RETRIES`. Do not add a second retry layer on top - it already retries (`guides/03`).
- **Hooks** must not let an exception abort the agent's session. Catch, log to stderr, and return a non-fatal result. A capture failure should degrade gracefully, not break the session.
- **The CLI** surfaces a readable message and a non-zero exit code; it does not dump a raw stack trace to the user.

## Throwing on programmer error is fine

`sqlIdent` throws on an invalid identifier - that is correct. A bad identifier is a bug in the caller, not untrusted runtime data, so failing loud at the boundary is the right move. Distinguish: validate-and-throw for programmer error, validate-and-handle for untrusted input.

## Audit script

`scripts/audit-swallowed-catch.mjs` flags empty `catch {}` / `catch (e) {}` blocks and `catch` blocks whose body never references the caught binding and carries no explanatory comment. See `scripts/README.md`.

## Common findings

- Empty `catch {}` - **must-fix**.
- `catch (err) {}` that drops `err` with no log/rethrow/comment - **must-fix**.
- Reaching into `err.message` without `err instanceof Error` narrowing - **must-fix**.
- A second retry layer wrapped around `api.query()` - **should-refactor** (the client already retries).
- An MCP handler that `throw`s instead of returning `errorResult` - **must-fix**.

## Sources

- `src/mcp/server.ts` (the narrowing idiom, `errorResult`).
- `src/deeplake-schema.ts` (the documented already-exists race).
- `src/utils/sql.ts` (`sqlIdent` throwing).
- `research/2026-06-16-strict-error-narrowing.md`.
