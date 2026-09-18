# 17 - Secrets & SQL Guards

Two boundaries this Stinger guards on every review: where secrets enter, and where untrusted input gets concatenated into SQL. The deep security audit belongs to `security-worker-bee`; this Bee ensures the baseline is in place and hands off.

## Secrets: env / config only, never hardcoded, never logged

Hivemind needs an Activeloop token, an org id, and a workspace id to reach Deep Lake, plus an Anthropic key for skillify. The rules:

- **Tokens come from env or the user config**, never a string literal in `src/`. A hardcoded token / key / bearer is a **must-fix**.
- **Never log a token.** The Deep Lake client sets `Authorization: Bearer <token>` on the request - it must not appear in a `console.log` / stderr line. A log statement that interpolates a token or a full `Authorization` header is a **must-fix**.
- **Config loading is centralized** (`src/config.ts`, `src/user-config.ts`). Read credentials there, not by sprinkling `process.env.ACTIVELOOP_TOKEN` across modules.
- **No secrets in the published tarball.** The `files` allowlist ships bundles, not config; double-check a new artifact does not embed a credential (`guides/14`).

## SQL guards: the Deep Lake endpoint has no parameters

Because `query()` interpolates SQL strings (no parameterized queries), every value and identifier that touches a query must be guarded with `src/utils/sql.ts`:

- **`sqlStr(value)`** - single-quoted literal escaping (quotes, backslashes, NUL, control chars). Use for any interpolated string value.
- **`sqlLike(value)`** - `sqlStr` plus `%` / `_` escaping for `LIKE` / `ILIKE` patterns. Pair with `ESCAPE '\\'`. Without it, an LLM-supplied `prefix='%'` matches every row - the canonical injection here.
- **`sqlIdent(name)`** - validates a table/column identifier against `^[a-zA-Z_][a-zA-Z0-9_]*$` and throws otherwise. Use for any dynamic table or column name.

```ts
const sql = `SELECT path, summary::text AS content
             FROM "${sqlIdent(table)}"
             WHERE path = '${sqlStr(path)}' LIMIT 200`;

const where = `WHERE path LIKE '${sqlLike(prefix)}%' ESCAPE '\\'`;
```

Any interpolation of outside data into SQL without the matching guard is a **must-fix**. "It's an internal call" is not a defense - the path/prefix/query in the MCP tools comes from an agent, which is untrusted.

## Audit script

`scripts/audit-hardcoded-secrets.mjs` flags high-entropy string literals, common token prefixes, and `Authorization`/`Bearer` literals in `src/`, plus `console.*` lines that interpolate a variable named like a token/key/secret. See `scripts/README.md`.

## Handoff

The full security audit (secret scanning across history, injection-vector review, the auth surface) is `security-worker-bee`. This Bee's job is to ensure: secrets are env/config-only, no token is logged, and every SQL interpolation is guarded. Surface anything deeper and hand off.

## Common findings

- A hardcoded token / key / bearer in `src/` - **must-fix**.
- A log line interpolating a token or `Authorization` header - **must-fix**.
- Un-guarded interpolation of a path / prefix / query into SQL - **must-fix**.
- A dynamic table/column name not run through `sqlIdent` - **must-fix**.
- `process.env` reads scattered across modules instead of centralized config - **should-refactor**.

## Sources

- `src/utils/sql.ts` (`sqlStr`, `sqlLike`, `sqlIdent`), `src/deeplake-api.ts` (auth headers), `src/config.ts` / `src/user-config.ts`.
- `research/2026-06-16-deeplake-sql-api.md`.
