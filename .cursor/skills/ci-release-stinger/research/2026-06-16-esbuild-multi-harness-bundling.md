# esbuild multi-harness bundling + define inlining

**Date:** 2026-06-16
**Feeds:** `guides/01-build-and-bundle.md`

## Claim

Hivemind bundles many entrypoints per harness into per-harness `outdir`s and inlines the version at build time via esbuild's `define`.

## Evidence (from the repo)

- `esbuild.config.mjs` builds discrete targets, each with its own `outdir`: `harnesses/{claude-code,codex,cursor,hermes,pi}/bundle`, `harnesses/openclaw/dist`, `mcp/bundle`, `bundle`, `embeddings`.
- Each harness has many entrypoints (`session-start`, `capture`, `pre-tool-use`, `wiki-worker`, `skillify-worker`, etc.) passed as `entryPoints: Object.fromEntries(list.map(h => [h.out, h.entry]))`, so each lands as its own file.
- Every target sets `define: { __HIVEMIND_VERSION__: JSON.stringify(hivemindVersion) }`; the openclaw target also reads `openclawVersion` from `harnesses/openclaw/package.json`.
- After bundling, the config `chmodSync(..., 0o755)` on spawned CLI/hook bundles and writes an ESM `package.json` marker into each bundle dir.

## Why it matters

- `define` does textual constant replacement at build time, so the bundle's version is whatever the manifest said *when esbuild ran*. This is the mechanical reason the version must be single-sourced and synced before esbuild (see `2026-06-16-version-single-sourcing.md`).
- The `outdir` set is the source of truth for "what gets built." It must be cross-checked against `package.json` `files` (what ships).

## Sources

- esbuild docs: define (https://esbuild.github.io/api/#define), entry points (https://esbuild.github.io/api/#entry-points).
- Repo: `esbuild.config.mjs`, `package.json`.
