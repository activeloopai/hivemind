# 22 - Common Failure Modes

The recurring footguns in this codebase. When you review TS/Node here, scan for these first - they account for most real findings.

## 1. Missing `.js` extension on a relative import

```ts
import { sqlStr } from "./utils/sql";       // BAD - breaks under Node16 at runtime
import { sqlStr } from "./utils/sql.js";    // GOOD
```

tsc may pass it; the bundle or `tsx` run fails. **Must-fix** when it would break at runtime; **should-refactor** when a bundler currently papers over it. (`guides/01`, `guides/02`)

## 2. The zod v4 / v3 mix-up

Importing the app's `zod` (v4) into the MCP `inputSchema` path instead of `zod/v3` silently breaks the SDK's type inference. The MCP server imports `zod/v3`; everything else imports `zod`. **Must-fix.** (`guides/05`, `guides/12`)

## 3. Swallowed catch

`catch {}` or `catch (e) {}` that drops the error hides a Deep Lake failure as silent data loss. Narrow on `err instanceof Error` and surface or rethrow. **Must-fix.** (`guides/09`)

## 4. Hand-rolled fetch to Deep Lake

A bare `fetch("${apiUrl}/.../tables/query", ...)` escapes the Semaphore, the retry, and the auth headers. Always go through the client. **Must-fix.** (`guides/03`)

## 5. Un-batched query (the N+1 of this repo)

`for (const id of ids) await api.query(...)` serializes through the Semaphore. Batch into one `IN (...)` statement or `Promise.all`. **Should-refactor**, **must-fix** on a hot hook path. (`guides/03`, `guides/08`)

## 6. Un-guarded SQL interpolation

Interpolating an LLM-supplied path / prefix / query without `sqlStr` / `sqlLike` / `sqlIdent`. `prefix='%'` matching every row is the canonical injection. **Must-fix.** (`guides/17`)

## 7. Hardcoded version string

A version literal in `src/` instead of letting `sync-versions` + esbuild `define` carry it from `package.json`. **Must-fix.** (`guides/04`)

## 8. Hand-rolled ALTER / a second copy of the schema

An `ALTER TABLE ADD COLUMN` outside `healMissingColumns`, or a column list mirrored outside `deeplake-schema.ts`. The schema is single-sourced; column adds go through healing. **Must-fix.** (`guides/15`)

## 9. `any` at a boundary

One `any` crossing a signature defeats strict mode downstream. Use `unknown` + narrow, or a zod schema. **Must-fix.** (`guides/12`)

## 10. Hard import of an optional dep

A top-level `import` of `@huggingface/transformers`, `tree-sitter`, or a grammar on a path everyone runs crashes installs that skipped the optional dep. Load behind a dynamic import / try-catch. **Must-fix.** (`guides/19`, `guides/21`)

## 11. Adding ESLint / Prettier

The gate is tsc + jscpd + husky, on purpose. Adding a linter/formatter is an ADR-level decision, not a drive-by, and usually just noise. **Should-refactor** (push back). (`guides/13`)

## 12. CJS sneaking into an ESM module

`require(...)`, `module.exports`, `__dirname` in a `.ts` file. Use `import`, `export`, `import.meta.url`. **Must-fix.** (`guides/16`)

## 13. Missing `files` entry / leaked source

A new harness artifact not in `package.json#files` ships broken; `src/` accidentally added leaks source. `pack-check` catches it - run it. **Must-fix.** (`guides/14`, `guides/18`)

## 14. Detached worker with a hardcoded path

A worker spawned detached must resolve its sibling via `import.meta.url`, because the bundle dir differs per harness. A hardcoded path works in one harness, breaks the rest. **Must-fix.** (`guides/07`)

## Quick triage order

On any TS/Node review here, scan in this order: (1) hand-rolled Deep Lake fetch, (2) un-guarded SQL, (3) swallowed catch, (4) `any` at a boundary, (5) zod v4/v3 mix, (6) missing `.js` extension, (7) hardcoded version, (8) hand-rolled ALTER, (9) un-batched query, (10) optional-dep hard import. That covers the majority of real findings.

## Sources

- Every guide cross-referenced above.
- `research/2026-06-16-ts-esm-footguns.md`.
