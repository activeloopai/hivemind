# 02 - Sync Versions (single-sourcing the version)

The single most-violated invariant in a multi-manifest repo: the version.

## The problem

Hivemind ships one logical version (`@deeplake/hivemind@0.7.x`) but carries multiple manifests - the root `package.json` plus each harness's plugin manifest (`.claude-plugin`, codex plugin, cursor, hermes, pi, openclaw `package.json` + `openclaw.plugin.json`). If a human edits one and forgets the others, the bundles report mismatched versions, the marketplace manifests disagree, and a published release lies about what it is.

## The fix: one source, propagated mechanically

- **Source of truth:** the `version` field in root `package.json`.
- **Propagation:** `prebuild` runs `node scripts/sync-versions.mjs`, which writes that version into every harness manifest. The release workflow comments that sync-versions propagates the new version into the harness manifests as part of `npm run build`.
- **Inlining:** esbuild's `define` block bakes `__HIVEMIND_VERSION__` into every bundle at build time (see `guides/01-build-and-bundle.md`).

Because `prebuild` is an npm lifecycle hook, **any `npm run build` re-runs sync-versions first.** You cannot build without syncing. That is the whole point.

## Hard rule

**Never hand-edit a version in a per-harness manifest.** Bump root `package.json` (or let the release workflow bump it), then build. The build propagates. A PR that edits a harness manifest version directly is a **Must-fix** - it will be silently overwritten on the next build, or worse, ship drifted if the build is skipped.

## Ordering

`prebuild` (sync-versions) -> `tsc` -> esbuild. The version must be synced into the manifests *before* esbuild reads them for `define` and before the manifests get packed. Any reordering that runs esbuild before sync-versions is a bug.

## Auditing version sync

Run `scripts/check-version-sync.sh`: it reads the root `package.json` version and diffs it against every harness manifest. Any mismatch is a finding. In a clean tree right after `npm run build`, all should match. A mismatch in a committed tree means someone hand-edited a manifest or skipped the build.

## Cross-reference

- `guides/01-build-and-bundle.md` - how `define` consumes the synced version.
- `guides/05-release-flow.md` - how the release workflow bumps root version then builds.
- `research/2026-06-16-version-single-sourcing.md` - the single-sourcing pattern and why generated-not-edited config wins.
