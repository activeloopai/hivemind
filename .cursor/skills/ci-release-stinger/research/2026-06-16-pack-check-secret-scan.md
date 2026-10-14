# pack-check: scanning the tarball for secrets before publish

**Date:** 2026-06-16
**Feeds:** `guides/06-npm-release.md`, `guides/05-release-flow.md`

## Claim

Hivemind refuses to publish a tarball that contains forbidden filenames, and runs that check on every PR, not just at release.

## Evidence (from the repo)

- `package.json`: `"pack:check": "node scripts/pack-check.mjs"`.
- `ci.yaml` `test` job has a step "Pack-check (refuse forbidden filenames in tarball)" - so the gate fires on PRs.
- The repo also runs `"audit:openclaw": "node scripts/audit-openclaw-bundle.mjs"`, which replicates the ClawHub static scanner over the openclaw bundle (`harnesses/openclaw/dist`), in both the `test` and `windows-test` jobs.

## Why it matters

- `pack-check` is the "we leaked a secret on publish" defense: it inspects what `npm pack` would ship and fails closed on forbidden/secret filenames. Bypassing it (e.g. publishing with `--ignore-scripts` or widening `files` to include a secret path) defeats the protection.
- Three scanners cover three surfaces: CodeQL (source), `audit:openclaw` (the shipped openclaw plugin bundle, against ClawHub rules), `pack-check` (the packed tarball). A release passes only when all three are green.

## Sources

- npm pack: https://docs.npmjs.com/cli/v10/commands/npm-pack
- Repo: `scripts/pack-check.mjs`, `scripts/audit-openclaw-bundle.mjs`, `.github/workflows/ci.yaml`.
