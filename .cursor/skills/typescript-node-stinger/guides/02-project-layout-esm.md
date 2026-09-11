# 02 - Project Layout & ESM

How Hivemind is organized, and the ESM import rules that hold it together.

## The `src/` tree

`src/` is the TypeScript source. tsc compiles it to `dist/` (`outDir`), then esbuild bundles selected entry points per harness. The subsystems:

| Path | What lives there |
|---|---|
| `src/deeplake-api.ts` | The Deep Lake SQL-API client (`query()`, retry, `Semaphore`, table listing). The single chokepoint for all persistence. |
| `src/deeplake-schema.ts` | The single source of truth for table schemas (`ColumnDef`, `MEMORY_COLUMNS`, `SESSIONS_COLUMNS`, `buildCreateTableSql`, `healMissingColumns`). |
| `src/utils/sql.ts` | `sqlStr`, `sqlLike`, `sqlIdent` - the SQL-injection guards. |
| `src/mcp/server.ts` | The MCP server (`McpServer`, `registerTool`, `hivemind_search` / `_read` / `_index`). Imports `zod/v3`. |
| `src/hooks/` | The agent lifecycle hooks (session-start, capture, pre-tool-use, session-end, graph workers). Bundled per harness. |
| `src/skillify/` | The Codify step - turning captured sessions into skills (skillify-worker, skillopt-worker). |
| `src/shell/` | The just-bash VFS shell (`deeplake-shell.ts`). |
| `src/commands/` | CLI subcommands (e.g. `auth-login`). |
| `src/cli/` | The `hivemind` bin entry. |
| `src/embeddings/` | The embedding daemon (optional HF transformers). |
| `src/graph/` | The codebase graph (tree-sitter grammars, optional). |
| `src/config.ts`, `src/user-config.ts` | Config loading. |

`harnesses/` holds the per-harness packaging (claude-code, codex, cursor, openclaw, hermes, pi) plus `mcp/`. `tests/` mirrors `harnesses/`. `scripts/*.mjs` holds build/audit helpers.

## ESM import rules (enforce these)

1. **`.js` on relative imports.** Source is `.ts`, the import specifier is `.js`:
   ```ts
   import { sqlStr, sqlLike, sqlIdent } from "./utils/sql.js";
   import { healMissingColumns } from "./deeplake-schema.js";
   ```
   Node16 resolution will not find `"./utils/sql"` at runtime. Missing extension = finding.

2. **`node:` prefix on builtins.**
   ```ts
   import { readFileSync, writeFileSync, existsSync } from "node:fs";
   import { resolve } from "node:path";
   import { fileURLToPath } from "node:url";
   ```

3. **No CJS.** No `require`, no `module.exports`, no `__dirname` / `__filename`. For a file's own directory:
   ```ts
   const here = fileURLToPath(new URL(".", import.meta.url));
   ```

4. **Bare specifiers for deps.** `import * as z from "zod/v3"`, `import { build } from "esbuild"`, `import yargsParser from "yargs-parser"`. Subpath imports (`zod/v3`) are how the MCP server pins the zod major.

5. **Type-only imports stay type-only.** `import type { ColumnDef } from "./deeplake-schema.js"` when you only need the type - keeps the runtime import graph honest under `verbatimModuleSyntax`-style discipline.

## Where a new module goes

- A new persistence concern? It calls through `src/deeplake-api.ts`. It does not open its own `fetch`.
- A new schema column? It is a `ColumnDef` in `src/deeplake-schema.ts`. Nothing else mirrors the schema.
- A new MCP tool? It is a `registerTool` call in `src/mcp/server.ts` with a zod/v3 `inputSchema`.
- A new lifecycle behavior? A hook under `src/hooks/`, wired into the harness bundles in `esbuild.config.mjs`.
- A new build/audit helper? A `.mjs` under `scripts/`.

## Common layout findings

- A module under `src/` opening a raw `fetch` to Deep Lake instead of importing the client - **must-fix** (`guides/03`).
- A second copy of a column list outside `deeplake-schema.ts` - **must-fix** (`guides/15`).
- An extensionless relative import - **should-refactor** (works by luck today, breaks on the next resolution change).
- Business logic in `src/cli/` that belongs in a reusable module under `src/` - **should-refactor**.

## Sources

- `src/` tree in the repo.
- `research/2026-06-16-esm-node16-resolution.md`.
