# 19 - tree-sitter & the Codebase Graph

Hivemind builds a codebase graph (`src/graph/`, the `graph-on-stop` / `graph-pull-worker` hooks) using tree-sitter. The grammars are `optionalDependencies`. The key thing to internalize: **the Python grammar (`tree-sitter-python`) is a parser, not application code.** There is no Python in Hivemind's app - only grammars that parse user repos.

## The grammars are optional native deps

```json
"optionalDependencies": {
  "tree-sitter": "^0.21.1",
  "tree-sitter-c": "0.23.2",
  "tree-sitter-cpp": "^0.23.4",
  "tree-sitter-go": "^0.23.4",
  "tree-sitter-java": "^0.23.5",
  "tree-sitter-javascript": "^0.23.1",
  "tree-sitter-python": "0.23.4",
  "tree-sitter-ruby": "^0.23.1",
  "tree-sitter-rust": "0.23.1",
  "tree-sitter-typescript": "^0.23.2"
}
```

`overrides` pins a few exact versions (`tree-sitter-c`, `tree-sitter-python`, `tree-sitter-rust`) to keep native ABI compatibility. They are optional because they are native addons that may fail to build on some platforms, and the graph is a value-add, not a hard requirement.

## Guarded loading

Because the grammars are optional, the graph code must load them defensively - the install may have skipped them, or a build may have failed:

```ts
let Parser: typeof import("tree-sitter") | undefined;
try {
  Parser = (await import("tree-sitter")).default;
} catch {
  // tree-sitter not available; graph features degrade, app still runs
}
```

A hard top-level `import Parser from "tree-sitter"` on a code path that runs for every user crashes installs that skipped the optional dep - a **must-fix**. Load behind a dynamic import / try-catch, and feature-detect before using.

## esbuild externals + ensure-tree-sitter

- The native bindings are in the esbuild `external` list (`guides/04`) so esbuild does not try to bundle a `.node` binary.
- `postinstall` runs `ensure-tree-sitter.mjs` and `rebuild:native` rebuilds them - both must degrade gracefully when a grammar is unavailable (`guides/18`).

## Build gating (Phase 1.5)

The graph builds at SessionEnd (`graph-on-stop`), gated on a 10-min rate limit, HEAD changing, and at least one source-file diff - so it is not rebuilt on every event. The async pull (`graph-pull-worker`) fetches the freshest cloud snapshot on SessionStart. When you touch this path, keep the gating and the detached-worker resolution (`import.meta.url`, `guides/07`) intact.

## Common findings

- A hard top-level import of a grammar / `tree-sitter` on a hot path - **must-fix** (crashes installs that skipped it).
- A grammar binding missing from the esbuild `external` list - **must-fix** (build breaks).
- Treating `tree-sitter-python` as if it implied Python app code - a category error; it is a parser.
- `ensure-tree-sitter` / native rebuild that hard-fails the whole install on one missing grammar - **must-fix**.

## Sources

- `package.json` (`optionalDependencies`, `overrides`), `src/graph/`, `esbuild.config.mjs` (externals), `scripts/ensure-tree-sitter.mjs`.
- `research/2026-06-16-optional-native-deps.md`.
