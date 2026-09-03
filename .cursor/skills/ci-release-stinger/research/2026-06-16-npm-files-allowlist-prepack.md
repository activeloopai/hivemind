# npm `files` allowlist + prepack/prepare lifecycle

**Date:** 2026-06-16
**Feeds:** `guides/06-npm-release.md`

## Claim

What Hivemind publishes is governed by the `files` allowlist, and `prepack`/`prepare` guarantee a fresh build is what gets packed.

## Evidence (from the repo)

- `package.json` `files` array lists exactly the publishable paths: `bundle`, `harnesses/codex/{bundle,skills}`, `harnesses/cursor/bundle`, `harnesses/hermes/bundle`, `mcp/bundle`, `harnesses/pi/extension-source`, `harnesses/openclaw/{dist,skills,openclaw.plugin.json,package.json}`, `.claude-plugin`, `scripts`, `README.md`, `LICENSE`.
- `"prepack": "npm run build"` - npm runs this automatically before `npm pack`/`npm publish`.
- `"prepare": "husky && npm run build"` - runs on local install and before publish from git.
- `publishConfig.access: public` - required for a scoped package to publish openly.

## Why it matters

- `files` is an allowlist: anything not listed is excluded from the tarball regardless of disk state. So "what ships" is auditable from `package.json` alone, and a built-but-unlisted bundle silently never ships.
- `prepack` removes the "stale tarball" failure mode - the tarball is always built from a clean build, never from whatever happened to be on disk.
- `scripts` is intentionally shipped so the consumer's `postinstall` (`ensure-tree-sitter.mjs`) exists; that means `scripts` must stay free of secrets.

## Sources

- npm files field: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files
- npm lifecycle (prepare/prepack): https://docs.npmjs.com/cli/v10/using-npm/scripts#life-cycle-scripts
- Repo: `package.json`.
