# The release-only GITHUB_TOKEN persistence is legitimate

**Date:** 2026-06-16
**Feeds:** `guides/05-release-flow.md`, `guides/06-npm-release.md`

## Claim

`release.yaml`'s release job persists the `GITHUB_TOKEN` on checkout on purpose, and that is correct - not a secret leak.

## Evidence (from the repo, `.github/workflows/release.yaml`)

- The release job checks out with the token persisted (`token: ${{ secrets.GITHUB_TOKEN }}`), because it pushes commits back to `main`: Commit 1 force-tracks the built bundles, Commit 2 untracks them and points the marketplace manifest at the release SHA.
- The workflow comments that pushes made with the default `GITHUB_TOKEN` do **not** retrigger workflows (GitHub's built-in loop-prevention), which is exactly why pushing from inside the workflow is safe here.
- The separate publish job checks out with `persist-credentials: false` - it does not need the token in `.git/config` to run `npm publish`.

## Why it matters

- This is the single most common false-positive when auditing this repo. A naive "no persisted credentials in CI" rule would flag it. The correct verdict: expected, scoped to the release job, protected by loop-prevention, and split away from the publish job which uses `persist-credentials: false`.
- The general principle: a token that *must* push has to persist; the right control is scoping (one job, minimum permissions) and the platform's loop-prevention, not refusing the pattern.

## Sources

- GitHub: automatic token authentication + loop prevention: https://docs.github.com/en/actions/security-guides/automatic-token-authentication
- Repo: `.github/workflows/release.yaml`.
