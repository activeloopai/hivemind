# Research Plan - typescript-node-stinger

Forge date: 2026-06-16

## Goal

Ground every active guide in `typescript-node-stinger/guides/` against (a) the Hivemind repo itself (the authoritative source for "how this codebase ships"), (b) the upstream docs for the toolchain (TypeScript, Node, esbuild, Vitest, zod, the MCP SDK, jscpd), and (c) the Activeloop Deep Lake SQL-API behavior. Each note documents what was confirmed, the source, and the guides it informs. The notes were authored on 2026-06-16 from the repo source plus the author's working knowledge of the toolchain; treat the repo files as the primary source of truth where any note and the code disagree.

## Primary source: the repo

The load-bearing files every note returns to:

- `package.json`, `tsconfig.json`, `esbuild.config.mjs`
- `scripts/sync-versions.mjs`, `scripts/pack-check.mjs`, `scripts/ensure-tree-sitter.mjs`
- `src/deeplake-api.ts`, `src/deeplake-schema.ts`, `src/utils/sql.ts`, `src/mcp/server.ts`, `src/shell/deeplake-shell.ts`
- the `tests/` tree (229 `*.test.ts` mirroring harnesses)

## Upstream anchor sources

- **TypeScript** - https://www.typescriptlang.org/docs/handbook/modules/reference.html (Node16 resolution)
- **Node.js** - https://nodejs.org/api/esm.html (ESM, `node:` builtins, top-level await)
- **esbuild** - https://esbuild.github.io/api/ (`define`, externals, format/platform)
- **Vitest** - https://vitest.dev/guide/ , https://vitest.dev/guide/coverage
- **zod** - https://zod.dev/ (v4) and the `zod/v3` subpath
- **MCP SDK** - https://github.com/modelcontextprotocol/typescript-sdk (`McpServer.registerTool`, zod inputSchema)
- **jscpd** - https://github.com/kucherenko/jscpd
- **Activeloop Deep Lake** - https://docs.deeplake.ai/ (the dataset SDK + the SQL/query surface)

## Notes authored (2026-06-16)

| # | Topic | Note file | Primary guides informed |
|---|---|---|---|
| 1 | ESM + Node16 module resolution (`.js` extensions, no CJS) | `2026-06-16-esm-node16-resolution.md` | `01-stack-enforcement.md`, `02-project-layout-esm.md`, `16-node22-runtime.md` |
| 2 | The Hivemind stack survey (package.json / tsconfig ground truth) | `2026-06-16-hivemind-stack-survey.md` | `01-stack-enforcement.md`, `20-cli-and-scripts.md` |
| 3 | Deep Lake SQL API: retry, Semaphore, batching, guards | `2026-06-16-deeplake-sql-api.md` | `03-deeplake-sql-api.md`, `08-async-concurrency.md`, `17-secrets-and-sql-guards.md` |
| 4 | esbuild multi-target bundling + sync-versions/define | `2026-06-16-esbuild-multi-target-bundling.md` | `04-esbuild-bundling.md`, `07-harness-model.md` |
| 5 | MCP SDK tools + the zod/v3 requirement | `2026-06-16-mcp-sdk-zod-v3.md` | `05-mcp-sdk-tools.md` |
| 6 | just-bash as the VFS shell over Deep Lake | `2026-06-16-just-bash-vfs.md` | `06-just-bash-vfs.md` |
| 7 | Strict TS error narrowing (`err instanceof Error`) | `2026-06-16-strict-error-narrowing.md` | `09-error-handling.md` |
| 8 | Vitest ESM discipline (`vitest run`, coverage-v8, mocking) | `2026-06-16-vitest-esm-discipline.md` | `10-vitest-discipline.md`, `11-vitest-async-fixtures.md` |
| 9 | zod v4 vs v3 and the MCP coupling | `2026-06-16-zod-v4-vs-v3-mcp.md` | `12-strict-types-and-zod.md` |
| 10 | jscpd + husky/lint-staged gate (no ESLint/Prettier) | `2026-06-16-jscpd-husky-gate.md` | `13-jscpd-and-quality-gate.md` |
| 11 | npm publish `files` allowlist + pack-check | `2026-06-16-npm-publish-files-allowlist.md` | `14-npm-and-publishing.md`, `18-publish-and-pack-check.md` |
| 12 | Deep Lake schema healing (single-source + healMissingColumns) | `2026-06-16-deeplake-schema-healing.md` | `15-deeplake-schema-healing.md` |
| 13 | Optional native deps (tree-sitter, HF transformers) | `2026-06-16-optional-native-deps.md` | `19-tree-sitter-graph.md`, `21-deeplake-sdk-and-hf.md` |
| 14 | Recurring TS/ESM/Deep Lake footguns | `2026-06-16-ts-esm-footguns.md` | `22-common-failure-modes.md` |

## Open questions

- Whether to promote a type-aware boundary audit (ts-morph) over the heuristic `audit-untyped-boundaries.mjs` - left heuristic for now to keep the Stinger dependency-free.
- The exact Deep Lake SQL dialect surface (which functions/operators the query endpoint supports) - the guides stay conservative and defer dialect specifics to `deeplake-dataset-worker-bee`.
- Whether the embedding model/dimensionality belongs in this Stinger or `embeddings-runtime-worker-bee` - the schema mechanics (the `FLOAT4[]` ColumnDef) are here; the model choice is `embeddings-runtime-worker-bee`.
