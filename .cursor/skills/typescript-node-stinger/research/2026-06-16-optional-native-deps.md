# 2026-06-16 - Optional native deps (tree-sitter, HF transformers)

Authored 2026-06-16 from `package.json`, `src/graph/`, `src/embeddings/`, `esbuild.config.mjs`. Repo is the source of truth.

## Sources

- `package.json` (`optionalDependencies`, `overrides`, `postinstall`, `rebuild:native`).
- `src/graph/`, `src/embeddings/`, `esbuild.config.mjs` (externals), `scripts/ensure-tree-sitter.mjs`.

## Summary

Two heavy/native deps are optional, not hard:

- **`tree-sitter ^0.21` + grammars** (`tree-sitter-{c,cpp,go,java,javascript,python,ruby,rust,typescript}`) power the codebase graph (`src/graph/`, the `graph-on-stop` / `graph-pull-worker` hooks). `overrides` pins exact versions for `tree-sitter-c`, `tree-sitter-python`, `tree-sitter-rust` to keep native ABI compatibility. Crucially, `tree-sitter-python` is a *parser* for user repos - there is no Python application code in Hivemind.
- **`@huggingface/transformers ^3`** powers local embeddings (`src/embeddings/`, the embed daemon).

Because they are `optionalDependencies` (native addons that may fail to build, or be skipped), they must be loaded defensively - a dynamic `await import(...)` behind a try/catch, with a feature-detect before use. A hard top-level import on a hot path crashes installs that skipped the optional dep. They are also in the esbuild `external` list so esbuild does not try to bundle a `.node` binary. `postinstall` runs `ensure-tree-sitter.mjs` and `rebuild:native` exists for rebuilds - both must degrade gracefully when a grammar is unavailable.

The codebase graph builds at SessionEnd, gated on a 10-min rate limit, HEAD changing, and at least one source-file diff; the async pull runs on SessionStart.

## Key facts the guides depend on

- Guard optional-dep loading; never hard-import on a hot path (`guides/19`, `guides/21`).
- Add native/optional deps to the esbuild `external` list (`guides/04`).
- Query-shaped work uses the SQL-API client; reach for the raw `deeplake` SDK only where the SQL surface cannot express it (`guides/21`).

## Relevance

- `guides/19-tree-sitter-graph.md`, `guides/21-deeplake-sdk-and-hf.md`.
