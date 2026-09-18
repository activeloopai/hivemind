# 2026-06-16 - Strict TS error narrowing & no swallowed errors

Authored 2026-06-16 from `src/mcp/server.ts`, `src/deeplake-schema.ts`, `src/utils/sql.ts`. Repo is the source of truth.

## Sources

- TypeScript handbook (`useUnknownInCatchVariables`, on under `strict`).
- `src/mcp/server.ts`, `src/deeplake-schema.ts` (the documented already-exists race), `src/utils/sql.ts` (`sqlIdent` throwing).

## Summary

Under `strict`, a caught error is typed `unknown`. The repo's consistent idiom is `const msg = err instanceof Error ? err.message : String(err);` before touching `.message`. Reaching into `err.message` without narrowing lies to strict mode.

Hivemind runs inside an agent lifecycle, so a swallowed error is not a loud crash - it is a silently dropped memory write. The discipline:

- Empty `catch {}` or a catch that discards the error with no log/rethrow/comment is a must-fix.
- The one sanctioned silent catch is the **documented already-exists race** in `healMissingColumns`: a concurrent writer's "already exists" ALTER error is caught and re-verified with a second SELECT. That carries an explanatory comment; a bare swallow is not the same thing.
- MCP handlers return `errorResult`, never throw. The Deep Lake client already retries transient codes - do not stack a second retry layer.
- `sqlIdent` *throws* on a bad identifier, and that is correct: a bad identifier is programmer error, so failing loud at the boundary is right. Distinguish validate-and-throw (programmer error) from validate-and-handle (untrusted input).

## Relevance

- `guides/09-error-handling.md`, `scripts/audit-swallowed-catch.mjs`.
