# 04 - Workflows (GitHub Actions architecture)

The real `.github/workflows/` layout. This is the "CI architecture" of Hivemind.

## The five workflows

| File | Role |
|---|---|
| `ci.yaml` | The main gate on push/PR - duplication, smoke, test, cross-node |
| `codeql.yaml` | CodeQL static analysis (`javascript-typescript`) |
| `pr-checks.yaml` | PR-specific checks |
| `publish-smoke-test.yaml` | Validates the published package installs/runs |
| `release.yaml` | Auto-bump version, build, GitHub Release, npm + ClawHub publish (see `guides/05-release-flow.md`) |

All jobs pin `actions/setup-node@v6.4.0` and an explicit `node-version`. The top-level `permissions:` in `ci.yaml` is `contents: read` + `pull-requests: write` (the latter for the coverage PR comment).

## ci.yaml jobs

- **`duplication`** - `runs-on: ubuntu-latest`, Node 22. Installs deps, runs `jscpd`, uploads the `jscpd-report` artifact.
- **`windows-smoke`** - `runs-on: windows-latest`, Node 22. Runs the Windows-relevant suites (spawn + hook dedup + wiki-worker) - the cross-platform path that Linux CI would not catch. Hivemind spawns hook processes, so Windows process semantics get their own smoke.
- **`test`** ("Typecheck and Test") - `runs-on: ubuntu-latest`, Node 22. The heavy job. It: builds (typecheck + emit bundle artefacts), audits the openclaw bundle against ClawHub static-scan rules (`npm run audit:openclaw`), runs tests with coverage, writes a coverage summary to the job page, builds + posts the PR coverage comment, smoke-tests that the built bundles parse cleanly, and runs **pack-check** (refuses forbidden filenames in the tarball, `npm run pack:check`).
- **`windows-test`** ("Typecheck and Test (Windows)") - `runs-on: windows-latest`, Node 22. The Windows mirror of `test` (build, audit:openclaw, coverage).
- **`cross-node-install`** ("Cross-Node install canary") - `strategy.matrix.node-version: [22, 24]`. Proves a clean install + build works across the supported Node range, not just the pinned 22. The matrix is the engine-compatibility canary; if a Node version is temporarily broken, the job is gated off with a comment rather than dropped silently.

## codeql.yaml

Runs the default CodeQL pack for `javascript-typescript`. This is the static-analysis layer (the analogue of "image scanning" in a container world - here it scans the TS source, while `audit:openclaw` + `pack-check` scan the publish surface). Do not author custom CodeQL queries; the default pack is the contract.

## Workflow audit checklist

When auditing or designing a workflow, check:

- **Action pinning.** `actions/setup-node@v6.4.0`, not `@v6` or `@main`. An unpinned major is a **Must-fix** (non-reproducible, supply-chain surface). Run `scripts/audit-workflow.sh`.
- **Node pinning.** Explicit `node-version: 22` (or the matrix on `cross-node-install`). A floating version is a **Must-fix**.
- **`permissions:` block.** Every workflow declares least-privilege permissions. A job that mutates state (posts a comment, pushes, publishes) must have exactly the permission it needs and no more. A missing block is a **Should-refactor** (inherits the repo default, which may be broader than intended).
- **No secret echoing.** No `run:` step prints a secret or a token.
- **Local parity.** A CI job that runs a check should map to an `npm run` script a developer can run locally (`duplication` -> `npm run dup`, `test` -> `npm run ci` + build, pack-check -> `npm run pack:check`). A CI-only check with no local path is a **Should-refactor** - it breaks the "local equals CI" principle.

## Adding a new job

Use `templates/new-actions-job.yaml` and the walkthrough in `examples/add-ci-job.md`. The canonical shape: pinned `setup-node@v6.4.0`, explicit `node-version` (or matrix), a `permissions:` block, `npm ci` install, and a step that mirrors a local `npm run` script.

## Cross-reference

- `research/2026-06-16-github-actions-node-matrix.md` - setup-node, the Node matrix, cross-node install canary pattern.
- `research/2026-06-16-codeql-js-ts.md` - CodeQL for javascript-typescript.
- `guides/05-release-flow.md` - release.yaml in depth.
- `guides/06-npm-release.md` - pack-check + audit:openclaw as the publish-surface scanners.
