# Guide 04: Release Mechanics

> Use when tying a CHANGELOG entry to the release pipeline, or when asked how the version is set and shipped.

*Derived from: repo ground truth (`scripts/sync-versions.mjs`, `.github/workflows/release.yaml`, `.github/workflows/publish-smoke-test.yaml`, `package.json`)*

---

## One source of truth for the version

`package.json` `version` is the single source. Current line: `0.7.x`.

- `scripts/sync-versions.mjs` runs as the **`prebuild`** hook (`"prebuild": "node scripts/sync-versions.mjs"`). It copies the `package.json` version into the tracked manifests:
  - `.claude-plugin/plugin.json`
  - `harnesses/claude-code/.claude-plugin/plugin.json`
  - `harnesses/openclaw/openclaw.plugin.json`, `harnesses/openclaw/package.json`
  - `harnesses/codex/package.json`
  - `.claude-plugin/marketplace.json` (both `metadata.version` and every `plugins[].version`)
- It is idempotent (skips writes when a target already matches) and exits non-zero if a target is missing or the version is absent.
- `build` is `tsc && node esbuild.config.mjs`; esbuild's `define` inlines the same version into the bundles. So `prebuild` -> `build` guarantees every manifest and bundle carries one version.
- `prepack` runs `npm run build`, so `npm publish` always packs a freshly built, version-synced artifact.

**Consequence for the changelog:** the CHANGELOG version heading must match what ships. Do not hand-edit a manifest version; change `package.json` and let `sync-versions` propagate.

## How a release cuts (`release.yaml`)

Triggered on push to `main`. Key facts:

1. **Auto-bump.** The release job runs `npm version patch --no-git-tag-version`, then `npm ci --ignore-scripts`, `node scripts/ensure-tree-sitter.mjs`, and `npm run build` (which fires `prebuild`/sync-versions and bakes the new version into bundles). So routine pushes default to a **patch** bump.
2. **Two-commit pattern.** A release commit (bundles force-tracked) followed by a cleanup commit (untrack bundles, bump the `marketplace.json` sha). The job is serialized via a concurrency group so releases never interleave.
3. **Re-run safety.** It checks `origin/main` HEAD for a `release: v` or `chore: untrack bundles` commit to avoid double-bumping on a workflow re-run.
4. **GitHub Release.** When the release step runs, it creates the GitHub Release and tag. This job legitimately persists `GITHUB_TOKEN` (it pushes the bump commits back to `main`); that is expected, not a leak.
5. **Node pinned to 22** to match the tree-sitter 0.21 prebuild ABI.

**The CHANGELOG's job here:** because the pipeline defaults to a patch bump, a release that is actually a **minor or breaking** change must have its version set deliberately (bump `package.json` in the PR, or override the auto-patch) and its CHANGELOG heading must reflect the real semver decision from `guides/02-semver-decisions.md`. Do not let a minor feature or a contract break ship under an auto-incremented patch.

## Where the CHANGELOG plugs in

1. During development, land bullets under `## [Unreleased]` as PRs merge (`guides/01-changelog-format.md`).
2. Before/at release, promote `[Unreleased]` to the dated version heading that matches the version `sync-versions` will ship.
3. The **GitHub Release body** is that CHANGELOG entry. GitHub Releases is the primary distribution channel - it is what `release.yaml` creates.
4. Update the compare-URL footer.

## Verifying a publish (`publish-smoke-test.yaml`)

Manually triggered dry-run that exercises the full publish pipeline without uploading to npm or ClawHub. Use it to confirm `NPM_TOKEN` / `CLAWHUB_TOKEN` validity, the production environment wiring, and that build/pack/provenance succeed end-to-end before a real publish. It is fully reversible - no bump, no release, no public artifact.

## Distribution after the release

GitHub Releases is the minimum and is automatic via `release.yaml`. Beyond that, match channel to significance:

| Release significance | Channels |
|---|---|
| Patch (bug fix) | GitHub Release (automatic). CHANGELOG entry. |
| Minor (new capability) | GitHub Release + README note if it changes the install/usage story. |
| Major / breaking (CLI, library, harness, MCP, or schema contract) | GitHub Release + README migration callout + a post in the Slack community so harness users see it before they upgrade. |

Tailor the Slack post: short, conversational, lead with the user impact and the upgrade implication, link the GitHub Release. No marketing tone - this is a developer audience.

## Anti-patterns

- Hand-editing a manifest version instead of `package.json` (sync-versions will fight you, or you ship a mismatch).
- Shipping a minor or breaking change under the pipeline's default auto-patch bump.
- A CHANGELOG heading that does not match the published tag / npm version.
- A breaking harness/MCP/schema change that never gets a Slack heads-up to the people running the harnesses.
