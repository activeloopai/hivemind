# 2026-06-16 - Hivemind stack survey

Authored 2026-06-16 from `package.json` / `tsconfig.json` / `esbuild.config.mjs`. Repo is the source of truth.

## Summary

`@deeplake/hivemind` v0.7.x. The ground-truth stack:

- **Language/runtime:** TypeScript ^6, Node >=22, ESM (`"type": "module"`), tsconfig `module: Node16` / `moduleResolution: Node16` / `target: ES2022` / `strict: true`.
- **Build:** `build` = `tsc && node esbuild.config.mjs`; `prebuild` = `node scripts/sync-versions.mjs`; per-harness bundle outputs.
- **Test:** Vitest ^4 (`vitest run`), `@vitest/coverage-v8`; 229 `*.test.ts` under `tests/` mirroring harnesses.
- **Quality gate:** `tsc --noEmit` (typecheck), `jscpd src` (dup, threshold 7), husky -> lint-staged (`tsc --noEmit --skipLibCheck` on staged `.ts`). No ESLint, no Prettier. `ci` = `typecheck && dup && test`.
- **Deps:** `deeplake ^0.3.30`, `@modelcontextprotocol/sdk ^1.29`, `@anthropic-ai/sdk`, `zod ^4`, `js-yaml`, `just-bash ^2.14`, `yargs-parser`.
- **Optional deps:** `@huggingface/transformers ^3`, `tree-sitter ^0.21` + grammars (with `overrides` pinning a few).
- **Persistence:** Activeloop Deep Lake over an HTTP SQL API (`src/deeplake-api.ts`). Not Postgres/Prisma/Drizzle.
- **CLI:** `bin: { hivemind: "bundle/cli.js" }`, args via `yargs-parser`.

## Key facts the guides depend on

- The whole quality gate is three tools; adding a linter is out of scope (`guides/13`).
- The version is single-sourced via `sync-versions` + esbuild `define` (`guides/04`).
- The `files` allowlist is the publish contract (`guides/14`, `guides/18`).

## Relevance

- `guides/01-stack-enforcement.md`, `guides/20-cli-and-scripts.md`, and the SKILL/README stack tables.
