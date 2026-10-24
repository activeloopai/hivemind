# 18 - Publish & pack-check

Shipping `@deeplake/hivemind` is a chain of lifecycle scripts ending in a verified tarball. This guide is the release-mechanics discipline.

## The chain

```
prebuild   = node scripts/sync-versions.mjs   # single-source the version
build      = tsc && node esbuild.config.mjs   # types, then per-harness bundles
prepack    = npm run build                     # guarantees a fresh build before pack/publish
prepare    = husky && npm run build            # install-time hooks + build
pack:check = node scripts/pack-check.mjs       # verify the tarball contents
```

The order matters: `prebuild` runs as a hook before `build`, so the version is propagated and `define`-inlined into the bundles. `prepack` re-runs the build so `npm pack` / `npm publish` never ships a stale `dist`/bundle.

## pack-check verifies what actually ships

`scripts/pack-check.mjs` inspects the would-be tarball (effectively `npm pack --dry-run` territory) and checks that the `files` allowlist resolves to the expected artifacts - that every harness bundle, the MCP bundle, `bundle/cli.js`, the plugin manifests, and the skills are present, and that nothing unexpected (source, tests, secrets) leaked in.

Run it before publishing:

```bash
npm run build
npm run pack:check
```

A publish that skips `pack:check` is how a missing `files` entry ships a broken package to every user. Treat a red `pack:check` as a **must-fix** blocker.

## What ships vs what doesn't

- **Ships:** `bundle/`, each `harnesses/*/bundle` (and `dist` for openclaw), `mcp/bundle`, `harnesses/pi/extension-source`, the openclaw/codex skills, the plugin manifests, `.claude-plugin`, `scripts`, `README.md`, `LICENSE`. (`guides/14` has the full list.)
- **Does not ship:** `src/`, `tests/`, the top-level `dist/` beyond what bundles need, dev config, the `.cursor/` army.

## ensure-tree-sitter on install

`postinstall` = `node scripts/ensure-tree-sitter.mjs` and `npm run rebuild:native` exist because the tree-sitter grammars are native optional deps. The install path must degrade gracefully when a grammar fails to build (`guides/19`, `guides/21`) - a failed optional native build must not break the whole install.

## audit:openclaw

`npm run audit:openclaw` (`scripts/audit-openclaw-bundle.mjs`) checks the OpenClaw bundle specifically. When you touch the openclaw harness output, run it.

## Common findings

- Publishing without `npm run pack:check` - **must-fix** process gap.
- A new artifact in `files` that `pack-check` can't resolve (path typo, missing build step) - **must-fix**.
- A hardcoded version that defeats `sync-versions` / `define` - **must-fix** (`guides/04`).
- `postinstall` native setup that hard-fails on a missing optional grammar - **must-fix** (`guides/19`).

## Sources

- `package.json` (lifecycle scripts), `scripts/pack-check.mjs`, `scripts/sync-versions.mjs`, `scripts/ensure-tree-sitter.mjs`, `scripts/audit-openclaw-bundle.mjs`.
- `research/2026-06-16-npm-publish-files-allowlist.md`.
