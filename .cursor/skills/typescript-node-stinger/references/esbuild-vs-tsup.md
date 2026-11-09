# tsup - preserved alternative

> Demoted in favor of a **hand-written `esbuild.config.mjs`** (see `guides/04-esbuild-bundling.md`). tsup is an esbuild wrapper; Hivemind drives esbuild directly.

## Why raw esbuild config is canonical

Hivemind's build is not "bundle one library". It is "produce a different bundle per harness (claude-code, codex, cursor, openclaw, hermes, pi, mcp, cli), each with its own entry-point list, output dir, externals, and a version `define`". That is exactly the shape `esbuild.config.mjs` expresses with a `build({...})` call per output:

- **Per-harness entry lists.** Each harness bundles a different set of hooks/workers (`guides/07`). A flat tsup `entry` array does not map cleanly to "these entries here, those entries there".
- **Version `define`.** esbuild's `define` inlines the single-sourced version into bundles (`guides/04`). Doing this through tsup means threading `esbuildOptions` anyway - at which point tsup is just indirection.
- **Externals per target.** Native/optional deps (`deeplake`, `@huggingface/transformers`, `tree-sitter*`) are externalized so esbuild does not bundle a `.node` binary. The explicit `external` arrays make this obvious.
- **Top-level await + readFileSync at build time.** The config reads `package.json` for the version and `await`s each build - plain esbuild API, no wrapper.

## What tsup is good at (and why it doesn't fit)

- **Zero-config single-package builds** - the common case (one entry, dual CJS/ESM, `.d.ts`). Hivemind is multi-target ESM-only, so the "zero-config" win evaporates.
- **dts generation** - Hivemind already emits declarations via `tsc` (`declaration: true`), so tsup's dts plugin would duplicate that.

## If you find tsup in a repo

It is a fine choice for a single-output library. For Hivemind's many-targets-one-source model with version inlining, the raw esbuild config is clearer than a tsup config plus `esbuildOptions` overrides.

## Sources

- `esbuild.config.mjs`, `package.json` (`build`, `bundle`), `guides/04`, `guides/07`.
- `research/2026-06-16-esbuild-multi-target-bundling.md`.
