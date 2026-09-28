# 2026-06-16 - npm publish: the files allowlist + pack-check

Authored 2026-06-16 from `package.json` and `scripts/pack-check.mjs`. Repo is the source of truth.

## Sources

- `package.json` (`name @deeplake/hivemind`, `files`, `bin`, lifecycle scripts, `publishConfig.access: public`).
- `scripts/pack-check.mjs`, `scripts/sync-versions.mjs`, `scripts/ensure-tree-sitter.mjs`.

## Summary

The package is a public scoped npm package. The package manager is npm (`package-lock.json`, `npm run ...`, `npm ci`). The publish contract is the `files` allowlist - only listed paths ship. It currently ships the per-harness bundles (`bundle`, `harnesses/*/bundle`, `harnesses/openclaw/dist`, `mcp/bundle`, `harnesses/pi/extension-source`), the openclaw/codex skills, the plugin manifests, `.claude-plugin`, `scripts`, `README.md`, `LICENSE` - and explicitly not `src/` or `tests/`.

Lifecycle chain: `prebuild` (sync-versions) -> `build` (tsc then esbuild) ; `prepack` = `npm run build` guarantees a fresh build before pack/publish ; `prepare` = `husky && npm run build` ; `postinstall` = `ensure-tree-sitter.mjs` (native optional-dep setup). `bin.hivemind` points at the built `bundle/cli.js`, never `src`/`dist`.

`scripts/pack-check.mjs` verifies the would-be tarball resolves the expected artifacts and that nothing unexpected (source, tests, secrets) leaked in. `audit:openclaw` checks the openclaw bundle specifically.

## Key facts the guides depend on

- A missing `files` entry ships broken; an extra entry leaks source - both must-fix (`guides/14`).
- Run `pack:check` before publishing (`guides/18`).
- The version is single-sourced; never hand-edit a downstream manifest version.

## Relevance

- `guides/14-npm-and-publishing.md`, `guides/18-publish-and-pack-check.md`, `references/npm-vs-pnpm.md`.
