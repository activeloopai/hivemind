# 2026-06-16 - esbuild multi-target bundling + sync-versions/define

Authored 2026-06-16 from `esbuild.config.mjs` and `scripts/sync-versions.mjs`. Repo is the source of truth.

## Sources

- `esbuild.config.mjs`, `scripts/sync-versions.mjs`, `package.json` (`prebuild`, `build`).
- https://esbuild.github.io/api/

## Summary

The build is `tsc && node esbuild.config.mjs`: tsc emits `dist/` and type-checks; esbuild reads `dist/**/*.js` and produces a separate bundle per harness via one `build({...})` call per output dir (claude-code, codex, cursor, openclaw/dist, hermes, pi, mcp/bundle, bundle/cli.js). Each call sets `bundle: true`, `platform: "node"`, `format: "esm"`, an `outdir`/`outfile`, and an `external` list that keeps `node:*` and native/optional deps out of the bundle.

Version single-sourcing has two halves:

1. **`sync-versions.mjs`** (prebuild) reads `package.json#version` and propagates it to `SCALAR_TARGETS` (each harness manifest / plugin JSON) and the marketplace JSON. Idempotent (skips matching targets), exits non-zero on a missing target, and exports `syncVersions({ root, log })` so it is testable.
2. **esbuild `define`** reads `package.json#version` at build time and inlines it, so bundles carry the literal version without reading `package.json` at runtime.

Detached workers (graph builder, skillopt worker) resolve siblings via `import.meta.url` because the bundle dir differs per harness.

## Key facts the guides depend on

- Never hardcode a version string (`guides/04`).
- New native/optional deps go in the `external` list or the build breaks (`guides/04`, `guides/21`).
- New harness manifests go in `SCALAR_TARGETS` (`guides/07`).

## Relevance

- `guides/04-esbuild-bundling.md`, `guides/07-harness-model.md`, `examples/06`, `examples/08`, `templates/esbuild-entry.mjs`.
