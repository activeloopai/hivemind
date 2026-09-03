# 00 - Principles

The non-negotiables. Read on every invocation.

## The fourteen principles

### 1. Read `package.json` and `tsconfig.json` first - always

A recommendation for the wrong toolchain is wrong advice. Before anything else, capture:

- `"type": "module"` (it is always ESM here) and `engines.node` (`>=22`).
- The `scripts` block: `build` (`tsc && node esbuild.config.mjs`), `test` (`vitest run`), `typecheck`, `dup`, `ci`, `prebuild` (`node scripts/sync-versions.mjs`), `prepack`, `pack:check`.
- The dependency split: `zod ^4`, `deeplake ^0.3.30`, `@modelcontextprotocol/sdk ^1.29`, `just-bash`, `js-yaml`, `yargs-parser`; optional `@huggingface/transformers`, `tree-sitter` + grammars.
- The compiler config: `module: Node16`, `moduleResolution: Node16`, `target: ES2022`, `strict: true`, `outDir: dist`.

Source: every guide in this Stinger assumes you've done step 1. Read `package.json` and `tsconfig.json`.

### 2. Stack is canon, not recommendation

The active guides encode one toolchain - the one the repo already runs. Substitution requires an ADR with eval evidence and a migration plan. The `references/` folder catalogs the alternatives we don't pick (Babel, Jest, tsup, valibot, pnpm). Read them for context, not as invitations to substitute. Source: `guides/01-stack-enforcement.md`.

### 3. ESM only

`"type": "module"`, relative imports carry a `.js` extension (Node16 resolution will not find them otherwise at runtime), no `require`, no `module.exports`. CJS in this package is a **must-fix**. Source: `guides/01-stack-enforcement.md`, `research/2026-06-16-esm-node16-resolution.md`.

### 4. tsconfig is canon; never loosen it

`module: Node16`, `moduleResolution: Node16`, `target: ES2022`, `strict: true`. When an import fights the config, fix the import - do not flip `strict` off or downgrade resolution. Source: `tsconfig.json`, `guides/01-stack-enforcement.md`.

### 5. zod at every external boundary

MCP tool input, parsed JSON, environment variables, file contents, third-party API responses - all validated with zod at entry. The app is on `zod ^4`; the MCP server imports `zod/v3` (`import * as z from "zod/v3"`) because the MCP SDK speaks v3. Mixing the majors in one module silently breaks `inputSchema` inference. Untyped boundaries are a **must-fix**. Source: `guides/12-strict-types-and-zod.md`, `src/mcp/server.ts`.

### 6. No `any` at boundaries

`unknown` then narrow, or a zod schema. `any` crossing a function signature defeats strict mode for everything downstream and is a **must-fix**. Source: `guides/12-strict-types-and-zod.md`.

### 7. Deep Lake queries go through the SQL-API client

`src/deeplake-api.ts` already bounds concurrency with `Semaphore(5)` and retries 429/5xx with exponential backoff. A hand-rolled `fetch` to `${apiUrl}/workspaces/${workspaceId}/tables/query` loses retry, concurrency bounding, and the auth headers - a **must-fix**. Source: `guides/03-deeplake-sql-api.md`.

### 8. SQL interpolation is guarded

The Deep Lake HTTP endpoint has no parameterized queries. Every value goes through `sqlStr` / `sqlLike`; every table/column identifier through `sqlIdent` (`src/utils/sql.ts`). Un-guarded interpolation of untrusted input is a **must-fix**. Source: `guides/17-secrets-and-sql-guards.md`.

### 9. Schema is single-sourced

Deep Lake columns are defined once in `src/deeplake-schema.ts` (`MEMORY_COLUMNS`, `SESSIONS_COLUMNS`, ...). Adding a column is one edit there; the add reaches existing tables through `healMissingColumns` (SELECT-first diff, targeted ALTER). A hand-rolled `ALTER TABLE` is a **must-fix**. Source: `guides/15-deeplake-schema-healing.md`.

### 10. The version is single-sourced

`package.json` is the source of truth. `scripts/sync-versions.mjs` propagates it to every manifest as a `prebuild` step, and esbuild `define` inlines it into bundles. A hardcoded version string is a **must-fix**. Source: `guides/04-esbuild-bundling.md`, `guides/18-publish-and-pack-check.md`.

### 11. Tests mirror harnesses

`*.test.ts` under `tests/` mirrors `harnesses/{claude-code,codex,cursor,hermes,openclaw,pi}` (plus `tests/cli`, `tests/scripts`, `tests/shared`). `vitest run` (not watch) for CI; `@vitest/coverage-v8` for coverage. No order-dependent tests. Source: `guides/10-vitest-discipline.md`.

### 12. The quality gate is tsc + jscpd + husky - nothing else

`npm run ci` = `typecheck && dup && test`. The husky pre-commit hook runs `tsc --noEmit --skipLibCheck` on staged `.ts` via lint-staged. There is no ESLint and no Prettier in this repo. Adding one is a **should-refactor** at best and usually just noise. Source: `guides/13-jscpd-and-quality-gate.md`.

### 13. jscpd threshold is 7

`npm run dup` runs jscpd over `src` with threshold 7 (minLines 10 / minTokens 60). Copy-paste over that fails the gate; extract the shared helper. Source: `guides/13-jscpd-and-quality-gate.md`.

### 14. No swallowed errors; the publish contract is the `files` allowlist

Empty `catch {}` or a `catch` that drops the error without a documented reason is a **must-fix** - narrow on `err instanceof Error` and surface a message. And only what is listed in `package.json#files` ships to npm; `prepack` builds, `scripts/pack-check.mjs` verifies. Source: `guides/09-error-handling.md`, `guides/18-publish-and-pack-check.md`.

---

## First-move checklist

Before writing findings, confirm:

- [ ] `package.json` + `tsconfig.json` read; stack map captured.
- [ ] Invocation classified per the routing table in `SKILL.md`.
- [ ] Severity rubric in mind (must-fix / should-refactor / style).
- [ ] Cross-Bee handoff lines clear - escalate at the boundary, don't author work the other Bee owns.

## Cross-Bee boundaries

The full table lives in `SKILL.md`. The short version: surface concerns at the boundary; don't author work the other Bee owns.

| Question | Owner |
|---|---|
| Deep Lake table/index design from a data-engineering POV | `deeplake-dataset-worker-bee` |
| Security audit (token handling, secret scanning, injection vectors, auth/credential lifecycle) | `security-worker-bee` |
| Recall ranking, embeddings strategy, evals | `retrieval-worker-bee` and `embeddings-runtime-worker-bee` |
| Docker, CI runners, release automation, cloud | `ci-release-worker-bee` |
| PRD authoring | `library-worker-bee` |
| Post-implementation QA | `quality-worker-bee` |

## Severity rubric (rephrased for clarity)

| Severity | Examples | Blocks merge? |
|---|---|---|
| **Must-fix** | `any` crossing a boundary; missing zod on external input; un-guarded SQL interpolation; hand-rolled Deep Lake `fetch`; hardcoded token/key; hand-rolled `ALTER TABLE`; CJS in an ESM module; loosened tsconfig; hardcoded version string; empty/swallowed `catch` | Yes |
| **Should-refactor** | Duplication near the jscpd threshold; an un-batched query that should be one round-trip; a missing test for a new exported function; an optional dep imported unguarded off the hot path; a missing `.js` extension that only works by luck | No - opens follow-up |
| **Style** | Naming nit; import grouping; comment wording | Never - the gate is tsc + jscpd, not a linter |

Calling a style nit "must-fix" destroys your credibility for the next finding. Be disciplined.

## Citation discipline

Every finding has two citations:

1. **Where in the user's codebase** - `src/mcp/server.ts:74`.
2. **Why it's a finding** - guide section (`guides/03-deeplake-sql-api.md`) or a source file in the repo (`src/deeplake-api.ts`).

No citations means the finding is opinion, not enforcement.

## Scope explicitly excluded (v1)

- **Recall and embeddings layer.** TypeScript is the runtime, but recall ranking / embeddings strategy / evals belong to `retrieval-worker-bee` (recall) and `embeddings-runtime-worker-bee` (the embedding model). Surface the TS implementation patterns; don't author the recall design.
- **Deep Lake schema engineering.** Indexing strategy, table partitioning, and the data model belong to `deeplake-dataset-worker-bee`. The TS access patterns, the `deeplake-schema.ts` mechanics, and `healMissingColumns` are here.
- **Security audit.** The sqlStr/sqlLike/sqlIdent guards and env-only secrets are flagged and ensured here; the audit is `security-worker-bee`.

When in doubt, escalate.
