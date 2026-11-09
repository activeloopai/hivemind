# Example: cutting an `@deeplake/hivemind` release (walkthrough)

Scenario: `main` is green and we want to ship 0.7.97. Most of this is automated by `release.yaml`; this walks the mechanics so you can verify (or hand-cut) correctly. Pair with `templates/release-checklist.md` and `guides/05-release-flow.md`.

## 1. Confirm the gate is green on the release SHA

```bash
npm run ci          # typecheck + jscpd dup + vitest - must pass
```

And in CI on the SHA: `duplication`, `windows-smoke`, `test`, `windows-test`, `cross-node-install` (Node 22 + 24), plus `codeql.yaml`. The `test` job already ran `audit:openclaw` and `pack:check`, so the publish surface is pre-vetted. Do not cut a release on a red `cross-node-install` - that's the engine-compat canary.

## 2. Bump the version (single source only)

```bash
# root package.json is the ONLY place a human touches the version
npm version 0.7.97 --no-git-tag-version   # or let release.yaml's auto-bump do it
```

Do **not** edit any harness manifest version. They are owned by `sync-versions.mjs`.

## 3. Build (this propagates the version everywhere)

```bash
npm run build
# prebuild -> scripts/sync-versions.mjs propagates 0.7.97 into the harness manifests
# tsc      -> emits dist/
# esbuild  -> bundles + inlines __HIVEMIND_VERSION__ = "0.7.97" into every output
```

Verify propagation:

```bash
bash scripts/check-version-sync.sh    # every harness manifest must read 0.7.97
```

## 4. Verify the ship contract

```bash
bash scripts/audit-bundle.sh          # every esbuild outdir is in `files`
npm run pack:check                    # no forbidden filenames in the tarball
npm run audit:openclaw                # ClawHub rules clean over openclaw/dist
npm pack --dry-run                    # eyeball the file list - only bundles + scripts + README + LICENSE
```

If `pack:check` fails, a secret or forbidden file reached the tarball - **stop**, fix the `files` allowlist, and surface to `security-worker-bee`.

## 5. Publish

The `release.yaml` publish path does this:

- **`prepack`** (`npm run build`) runs automatically before publish - the tarball is always a fresh build, never stale.
- Release job force-tracks the bundles and pushes the release commit with a persisted `GITHUB_TOKEN` (**expected, not a leak** - GitHub's loop-prevention stops it from retriggering workflows).
- Publish job checks out with `persist-credentials: false` and publishes to npm + ClawHub.

Hand-publish equivalent (only if the workflow is unavailable):

```bash
npm publish      # prepack rebuilds; publishConfig.access=public ships it openly
```

Never `npm publish --ignore-scripts` - that skips `prepack` and can ship a stale bundle (**Must-fix**).

## 6. Post-publish verification

```bash
npm i -g @deeplake/hivemind@0.7.97
hivemind --version            # reports 0.7.97 (proves define inlining + sync)
# fresh install heals tree-sitter via postinstall with no manual native rebuild
```

Then `publish-smoke-test.yaml` confirms the published package installs and runs.

## 7. Close out

- Release-notes prose -> `changelog-release-notes-worker-bee` (this Bee owns the cut, not the copy).
- `security-worker-bee` - publish-surface / secret check.
- `quality-worker-bee` - gate parity verification.
