# Scripts

Three deterministic helpers for ci-release-worker-bee. Each runs in CI or locally. These are the Stinger's own audit helpers - distinct from the repo's real `scripts/` (sync-versions, pack-check, ensure-tree-sitter, audit-openclaw), which they reason about.

## `audit-bundle.sh`

Diffs the esbuild `outdir`s in `esbuild.config.mjs` against the `files` allowlist in `package.json`. Flags a bundle that is built but not shipped (built-but-unshipped) and a `files` entry that points at nothing.

```bash
bash scripts/audit-bundle.sh                 # audits repo at CWD
bash scripts/audit-bundle.sh /path/to/repo
```

Exit 0 = aligned. Exit 1 = findings. Requires `node`. Reference: `guides/01-build-and-bundle.md`, `guides/06-npm-release.md`.

## `audit-workflow.sh`

Static GitHub Actions audit. Catches actions pinned to `@main`/`@master` or a floating major, a floating `node-version`, a workflow with no `permissions:` block, and obvious secret echoing.

```bash
bash scripts/audit-workflow.sh               # audits .github/workflows/
bash scripts/audit-workflow.sh path/to/dir
```

Exit 0 = clean. Exit 1 = must-fix findings. Reference: `guides/04-workflows.md`.

## `check-version-sync.sh`

Reads root `package.json` version and diffs it against every harness / plugin manifest. Any mismatch is version drift - someone hand-edited a manifest or skipped the build.

```bash
bash scripts/check-version-sync.sh           # checks repo at CWD
bash scripts/check-version-sync.sh /path/to/repo
```

Exit 0 = all match. Exit 1 = drift. Requires `node`. Reference: `guides/02-sync-versions.md`.

## CI integration

Run them as fast pre-checks in a workflow, mirroring the local invocation (local == CI):

```yaml
- name: Audit bundle vs allowlist
  run: bash scripts/audit-bundle.sh

- name: Audit workflows
  run: bash scripts/audit-workflow.sh

- name: Check version sync
  run: bash scripts/check-version-sync.sh
```
