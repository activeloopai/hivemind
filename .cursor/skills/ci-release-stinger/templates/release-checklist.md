# Release Checklist - `@deeplake/hivemind`

Ordered gates for cutting a release. Most of this is automated by `release.yaml`; this checklist is for verifying a release (or cutting one by hand if the workflow is unavailable). See `guides/05-release-flow.md`.

**Release:** {{version}}  |  **Date:** {{YYYY-MM-DD}}  |  **Cut by:** {{name / workflow run}}

## Pre-cut gates (must all be green on `main`)

- [ ] `npm run ci` green (typecheck + jscpd dup + vitest) - `guides/03-quality-gate.md`
- [ ] `ci.yaml` green on the release SHA: `duplication`, `windows-smoke`, `test`, `windows-test`, `cross-node-install` (Node 22 + 24)
- [ ] `codeql.yaml` clean (javascript-typescript)
- [ ] `npm run audit:openclaw` clean (ClawHub rule replica over `harnesses/openclaw/dist`)
- [ ] `npm run pack:check` clean (no forbidden filenames in the tarball)

## Version

- [ ] Root `package.json` `version` bumped to **{{version}}** (this is the single source - `guides/02-sync-versions.md`)
- [ ] No harness manifest version hand-edited (sync-versions owns those)
- [ ] `scripts/check-version-sync.sh` shows every manifest matching root after build

## Build

- [ ] `npm run build` run clean = `prebuild` (sync-versions) -> `tsc` -> esbuild
- [ ] `define` inlined `__HIVEMIND_VERSION__` = {{version}} into the bundles
- [ ] All esbuild outdirs present: `harnesses/{claude-code,codex,cursor,hermes,pi}/bundle`, `harnesses/openclaw/dist`, `mcp/bundle`, `bundle`, `embeddings`

## Ship contract

- [ ] `files` allowlist covers every shipped bundle - `scripts/audit-bundle.sh` shows no built-but-unshipped gap
- [ ] No source / fixtures / secrets in the tarball (pack-check enforces; spot-check `npm pack --dry-run`)
- [ ] `scripts/` is clean of secrets (it ships, for the postinstall heal)
- [ ] `publishConfig.access` = `public`

## Publish (release.yaml does this)

- [ ] `prepack` (= `npm run build`) ran before publish - tarball is fresh, not stale
- [ ] Release job's persisted `GITHUB_TOKEN` is expected (force-tracks bundles, pushes release commit) - **not** a finding
- [ ] Publish job uses `persist-credentials: false`
- [ ] Published to npm + ClawHub
- [ ] `publish-smoke-test.yaml` green (the published package installs + runs)

## Post-publish

- [ ] `npm i -g @deeplake/hivemind@{{version}}` then `hivemind --version` reports {{version}}
- [ ] tree-sitter postinstall healed cleanly on a fresh install (no manual native rebuild needed) - `guides/08-native-deps.md`
- [ ] GitHub Release created, named `{{version}} - <PR title>`
- [ ] Release-notes prose handed to / produced by `changelog-release-notes-worker-bee`

## Close-out

- [ ] `security-worker-bee` - publish-surface / secret check
- [ ] `quality-worker-bee` - gate parity verification
