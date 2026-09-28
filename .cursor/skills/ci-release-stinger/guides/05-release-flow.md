# 05 - Release Flow

How an `@deeplake/hivemind` release actually gets cut. The mechanics live in `release.yaml`; the prose lives with `changelog-release-notes-worker-bee`.

## The release.yaml shape

Two jobs:

1. **Release job** ("Auto-bump version and create release") - bumps the version, builds, commits, and creates the GitHub Release.
2. **Publish job** ("Publish to npm + ClawHub") - publishes the built package to npm and ClawHub.

### Release job, step by step

- **Checkout with a persisted `GITHUB_TOKEN`.** The job force-tracks the built bundles and pushes a release commit back to `main`, so it legitimately persists credentials. **This is correct - do not flag it as a secret leak.** GitHub's loop-prevention rule means pushes made with the default `GITHUB_TOKEN` do not retrigger workflows, which is exactly why this design works.
- **Setup Node** `@v6.4.0`, Node 22.
- **Check if version was already bumped** in this push (idempotency guard - avoids double-bumping).
- **Bump version + build.** `npm run build` runs `prebuild` (`sync-versions.mjs`) -> `tsc` -> esbuild. sync-versions propagates the new version into the harness manifests; `define` inlines it into the bundles. (See `guides/02-sync-versions.md`.)
- **Commit 1 - release commit with bundles force-tracked.** The bundles are normally gitignored; the release commit force-adds them so the marketplace/plugin consumers can resolve a release SHA.
- **Commit 2 - untrack bundles + point marketplace at the release sha.** Bundles are untracked again (kept on disk for npm publish) and the marketplace manifest is pointed at the release SHA.
- **Extract version, check release doesn't already exist, get merged PR title, create GitHub Release.** The release name is `<version> - <PR title>`.

### Publish job

- Checkout with `persist-credentials: false` (no token needed in `.git/config` for publish).
- Setup Node `@v6.4.0`, Node 22.
- Publish to npm (`prepack` runs `npm run build` again as the npm lifecycle guard - the tarball is always built from a clean build) and to ClawHub.

## The publish lifecycle guards

Two npm lifecycle hooks protect the publish:

- **`prepack`** = `npm run build`. Runs automatically before `npm pack` / `npm publish`. Guarantees the tarball contains a fresh build, never stale bundles. A publish path that bypasses `prepack` (e.g. `npm publish --ignore-scripts`) is a **Must-fix** - it can ship stale or wrong-version bundles.
- **`prepare`** = `husky && npm run build`. Runs on local install and before publish from a git source.

## The release-only GITHUB_TOKEN is not a finding

The single most common false-positive on this repo: flagging the persisted `GITHUB_TOKEN` in `release.yaml`. It is scoped to the release job, required to push the release commit, and protected by GitHub's own loop-prevention. The publish job uses `persist-credentials: false`. This split is the correct design. Document it as expected; do not raise it.

## Ordering invariant

`sync-versions` (via prebuild) -> `tsc` -> esbuild -> pack-check -> publish. The version is synced before bundling; the bundles are built before pack-check inspects the tarball; pack-check passes before publish. Any reordering that publishes before pack-check, or builds before syncing, is a finding.

## Cross-reference

- `guides/06-npm-release.md` - the `files` allowlist, pack-check, audit:openclaw.
- `guides/02-sync-versions.md` - the version propagation the bump relies on.
- `templates/release-checklist.md` - the ordered gate list for cutting a release.
- `examples/cut-a-release.md` - a full walkthrough.
