# 04 - esbuild Bundling

`build` = `tsc && node esbuild.config.mjs`. tsc emits `dist/`; esbuild reads `dist/**/*.js` and produces the per-harness bundles. This is the equivalent of the build/packaging discipline for this repo.

## The bundle model

`esbuild.config.mjs` defines entry-point lists per harness and calls `build({...})` for each output directory. The outputs:

- `harnesses/claude-code/bundle` - hooks, shell, commands, embeddings daemon.
- `harnesses/codex/bundle`, `harnesses/cursor/bundle` - per-harness bundles.
- `harnesses/openclaw/dist` - the OpenClaw plugin.
- `mcp/bundle` - the MCP server.
- `bundle/cli.js` - the `hivemind` bin.

Each `build()` call sets `bundle: true`, `platform: "node"`, `format: "esm"`, an `outdir` (or `outfile`), and an `external` list. The entry points come from `dist/`, so tsc must run first - `build` enforces the order with `&&`.

## Version inlining via `define`

The version is single-sourced. Two mechanisms keep it consistent:

1. **`prebuild` runs `scripts/sync-versions.mjs`** - reads `package.json#version` and propagates it to every manifest (`.claude-plugin/plugin.json`, the marketplace JSON, each harness `package.json` / plugin JSON). It is idempotent (skips writes when a target already matches) and exits non-zero if a target is missing.

2. **esbuild `define` inlines the version into bundles** - `esbuild.config.mjs` reads `package.json#version` at build time and passes it as a `define` so any `getVersion()`/version reference compiles to the literal. That is why the MCP server can do `version: getVersion()` and ship the right string in the bundle without reading `package.json` at runtime.

The rule: **never hardcode a version string.** Bump `package.json`; `sync-versions` and `define` carry it everywhere. A hardcoded version is a **must-fix**.

## Externals

The `external` list keeps native and optional deps out of the bundle (`node:*`, `node-liblzma`, the tree-sitter native bindings, etc.). When you add a dependency that has a native addon or is an `optionalDependency`, add it to the relevant `external` array - otherwise esbuild tries to bundle a `.node` binary and the build fails. Bundling a native/optional dep instead of externalizing it is a **must-fix**.

## Adding a bundle entry

To ship a new hook or worker (see `examples/08`):

1. Write the source under `src/` (e.g. `src/hooks/my-hook.ts`).
2. Add `{ entry: "dist/src/hooks/my-hook.js", out: "my-hook" }` to the right entry-list in `esbuild.config.mjs`.
3. If it is spawned detached (like the graph workers), resolve it relative to `import.meta.url`, not a hardcoded path - the bundle dir differs per harness.
4. Add it to `package.json#files` if it must ship to npm (`guides/18`).
5. Add a `*.test.ts` under the mirroring `tests/` folder (`guides/10`).

## Common findings

- A hardcoded version literal anywhere in `src/` - **must-fix**.
- A new native/optional dep not added to `external` - **must-fix** (build breaks).
- A detached worker resolved via a hardcoded relative path instead of `import.meta.url` - **must-fix** (wrong per harness).
- A new entry point with no test in the mirroring `tests/` folder - **should-refactor**.

## Sources

- `esbuild.config.mjs`, `scripts/sync-versions.mjs` in the repo.
- `package.json` `scripts` (`prebuild`, `build`, `bundle`).
- `research/2026-06-16-esbuild-multi-target-bundling.md`.
