# 07 - Common Failure Modes

The diagnosis guide. When something is broken, match the symptom here first.

## 1. Version drift across manifests

**Symptom:** a bundle reports a different version than `package.json`, or harness manifests disagree.
**Cause:** someone hand-edited a manifest version, or the build was skipped after a bump.
**Fix:** never hand-edit; bump root `package.json` and run `npm run build` (prebuild syncs). Run `scripts/check-version-sync.sh` to locate the drift. See `guides/02-sync-versions.md`.

## 2. Stale bundle published

**Symptom:** the published npm package runs old code despite a version bump.
**Cause:** publish ran with `--ignore-scripts` or otherwise bypassed `prepack`, so the tarball carries a stale build.
**Fix:** publish must run `prepack` (`npm run build`). The release publish job relies on this. See `guides/05-release-flow.md`.

## 3. Allowlist ships junk (or omits a bundle)

**Symptom:** the tarball is bloated, contains source/fixtures, or a harness is missing at the consumer.
**Cause:** the `files` allowlist drifted from the esbuild `outdir`s, or a forbidden path slipped in.
**Fix:** diff `outdir`s vs. `files` with `scripts/audit-bundle.sh`; pack-check catches forbidden filenames. See `guides/06-npm-release.md`.

## 4. Native-dep ABI break on install

**Symptom:** consumer `npm i @deeplake/hivemind` fails on tree-sitter, or tree-sitter throws an ABI/version mismatch at runtime (often arm64).
**Cause:** the prebuilt tree-sitter native binding doesn't match the consumer's Node ABI or arch.
**Fix:** `postinstall` runs `scripts/ensure-tree-sitter.mjs`, which heals this. If install broke, the postinstall hook was skipped (`--ignore-scripts`) or the heal logic regressed. The grammars are `optionalDependencies` - install must degrade gracefully, not hard-fail. See `guides/08-native-deps.md`.

## 5. jscpd false-block

**Symptom:** CI `duplication` job fails on a legitimately-intentional near-duplicate (e.g. a new harness hook mirroring an existing one).
**Cause:** the clone exceeds threshold 7 / minLines 10 / minTokens 60 but is intentional cross-harness mirroring.
**Fix:** add the specific file to the `.jscpd.json` `ignore` list with a justifying note (the existing list already excludes cursor/hermes/pi mirrored hooks). Do *not* raise `threshold` globally. See `guides/03-quality-gate.md`.

## 6. Windows-only CI break

**Symptom:** `windows-smoke` or `windows-test` fails while Linux CI is green.
**Cause:** Windows process-spawn semantics, path separators, or shell differences - Hivemind spawns hook processes, so these surface on Windows.
**Fix:** reproduce against the Windows-relevant suites (spawn + hook dedup + wiki-worker). This is exactly why those jobs exist as a separate gate; don't disable them to get green. See `guides/04-workflows.md`.

## 7. cross-node-install failure

**Symptom:** the `cross-node-install` matrix fails on Node 24 (or 22) while the pinned-22 jobs pass.
**Cause:** a dependency or API incompatible with one Node in the supported range.
**Fix:** fix the incompatibility, or - if a Node version is transiently broken upstream - gate that matrix entry off with a comment (the workflow documents this pattern) rather than dropping the canary. Never widen `engines.node` to dodge it. See `guides/04-workflows.md`.

## 8. "Works locally, fails in CI" (build)

**Symptom:** local build looks fine; CI build differs.
**Cause:** usually a stale local `dist/` - you ran `npm run bundle` (esbuild only) without re-running `tsc`. CI always runs full `npm run build`.
**Fix:** run `npm run build` (not `npm run bundle`) before comparing. See `guides/01-build-and-bundle.md`.

## 9. Gate parity drift

**Symptom:** `npm run ci` is green locally but CI fails (or vice versa).
**Cause:** a CI job invokes a different command than the local script, or installs differently (`npm ci` vs `npm install`).
**Fix:** CI jobs must mirror `npm run` scripts. Reconcile the job step with the local script. See `guides/03-quality-gate.md`.
