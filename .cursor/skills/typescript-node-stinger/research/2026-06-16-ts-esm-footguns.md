# 2026-06-16 - Recurring TS/ESM/Deep Lake footguns

Authored 2026-06-16 synthesizing the other notes against the Hivemind repo. Repo is the source of truth.

## Sources

- The other 2026-06-16 research notes in this folder.
- `src/`, `tsconfig.json`, `package.json`, `esbuild.config.mjs`.

## Summary

The recurring, high-frequency failure modes when working in this codebase, in rough order of how often they bite:

1. **Hand-rolled `fetch` to Deep Lake** - bypasses retry + Semaphore + auth headers. Must-fix.
2. **Un-guarded SQL interpolation** - LLM-supplied path/prefix/query without `sqlStr`/`sqlLike`/`sqlIdent`; `prefix='%'` matches every row. Must-fix.
3. **Swallowed catch** - empty `catch {}` or dropping `err` silently turns a Deep Lake failure into data loss. Must-fix.
4. **`any` at a boundary** - defeats strict mode downstream. Must-fix.
5. **zod v4 in the MCP inputSchema path** instead of `zod/v3` - silently breaks SDK inference. Must-fix.
6. **Missing `.js` extension** on a relative import - breaks under Node16 at runtime. Must-fix when it would break.
7. **Hardcoded version string** - defeats sync-versions + esbuild define. Must-fix.
8. **Hand-rolled ALTER / a second copy of the schema** - schema is single-sourced. Must-fix.
9. **Un-batched query in a loop** - serializes through the Semaphore. Should-refactor / must-fix on a hot path.
10. **Hard import of an optional dep** (tree-sitter, HF transformers) - crashes installs that skipped it. Must-fix.
11. **Adding ESLint/Prettier** - the gate is tsc + jscpd + husky on purpose. Should-refactor (push back).
12. **CJS in an ESM module** (`require`, `module.exports`, `__dirname`). Must-fix.
13. **Missing `files` entry / leaked source** - ships broken or leaks. Must-fix; pack-check catches it.
14. **Detached worker with a hardcoded path** instead of `import.meta.url` - wrong per harness. Must-fix.

## Triage order

On any review: raw fetch -> un-guarded SQL -> swallowed catch -> `any` at boundary -> zod v4/v3 -> missing `.js` -> hardcoded version -> hand-rolled ALTER -> un-batched query -> optional-dep hard import. That covers most real findings.

## Relevance

- `guides/22-common-failure-modes.md`, and cross-references every other guide.
