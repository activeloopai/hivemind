# GitHub Actions: setup-node, the Node matrix, cross-node install canary

**Date:** 2026-06-16
**Feeds:** `guides/04-workflows.md`

## Claim

Hivemind pins its Node setup action and Node version, and runs a cross-version install canary to prove the package installs across the supported engine range.

## Evidence (from the repo)

- Every job uses `actions/setup-node@v6.4.0` (a fixed version, not a floating `@v6`).
- Most jobs pin `node-version: 22`.
- `cross-node-install` job: `strategy.matrix.node-version: [22, 24]`, `fail-fast: false`. It does a clean install + build per Node version. A comment notes that if a Node version is transiently broken, the entry is gated off rather than dropped silently.
- `engines.node` is `>=22`.

## Why it matters

- Pinning the action to a fixed version makes CI reproducible and shrinks supply-chain surface (a retagged major can't change behavior under you).
- The matrix is the *engine-compatibility canary*: pinned-22 jobs prove the happy path; `[22, 24]` proves install/build still works at the top of the range. A native-dep ABI regression (tree-sitter) surfaces here first.

## Sources

- actions/setup-node: https://github.com/actions/setup-node
- GitHub Actions matrix: https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
- Repo: `.github/workflows/ci.yaml`, `package.json`.
