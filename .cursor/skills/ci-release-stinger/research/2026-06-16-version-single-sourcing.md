# Single-sourcing a version across many manifests

**Date:** 2026-06-16
**Feeds:** `guides/02-sync-versions.md`

## Claim

Hivemind keeps one logical version across the root package and all harness manifests by generating, not hand-editing, the per-harness versions.

## Evidence (from the repo)

- `package.json` scripts: `"prebuild": "node scripts/sync-versions.mjs"`, `"build": "tsc && node esbuild.config.mjs"`. Because `prebuild` is an npm lifecycle hook, every `npm run build` syncs versions first.
- `release.yaml` comments that `npm run build` runs `prebuild` (sync-versions) then tsc then esbuild, and that sync-versions propagates the new version into the harness manifests.
- `esbuild.config.mjs` reads the version from `package.json` and inlines it via `define`.

## Why it matters

- A repo with N manifests has N chances to forget one on a bump. Generating the satellites from a single source (root `package.json`) removes the class of "version drift" bug entirely - provided nobody hand-edits a satellite.
- The pattern generalizes: config that is *derived* should be *generated*, and the generation step should be a build prerequisite so it cannot be skipped.

## Audit hook

`scripts/check-version-sync.sh` (this Stinger) diffs every manifest against root and flags drift - which in a committed tree means a hand-edit or a skipped build.

## Sources

- npm lifecycle scripts (prebuild/prepack/prepare): https://docs.npmjs.com/cli/v10/using-npm/scripts#life-cycle-scripts
- Repo: `package.json`, `esbuild.config.mjs`, `.github/workflows/release.yaml`.
