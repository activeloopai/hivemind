# Open questions - ci-release-stinger

Items that needed judgment or could not be definitively resolved at retarget time (2026-06-16).

## Resolved at retarget time

- **Runtime business logic in scope?** Resolved: no. This Bee owns build/gate/ship. Runtime logic is `typescript-node-worker-bee` + the Deeplake Bees (dataset/retrieval/embeddings).
- **Custom CodeQL queries?** Resolved: no. `codeql.yaml` runs the default `javascript-typescript` pack; keep it wired and green, don't extend it.
- **Add an ESLint / Prettier step?** Resolved: no. The gate is deliberately tsc + jscpd + vitest + husky. Inventing a formatter/linter step misreads the repo.
- **Promote tree-sitter to a hard dependency for arm64?** Resolved: no. It must stay an `optionalDependency`; `ensure-tree-sitter.mjs` heals on postinstall and is non-fatal by contract.
- **Is the persisted `GITHUB_TOKEN` in release.yaml a leak?** Resolved: no - it's required to push the release commit, scoped to the release job, and the publish job uses `persist-credentials: false`. See `2026-06-16-release-github-token.md`.

## Open / deferred

1. **publish-smoke-test.yaml depth.** It validates the published package installs/runs. Open question whether to expand it into a per-Node, per-OS install matrix mirroring `cross-node-install`, or keep it a single canary. Current stance: single canary is enough given `cross-node-install` already covers the engine range pre-publish.
2. **pi harness ships `extension-source`, not a `bundle`.** `esbuild.config.mjs` has a `harnesses/pi/bundle` outdir, but `files` ships `harnesses/pi/extension-source`. Confirm this is intentional (pi consumes source, not a bundle) when auditing - flagged as a thing to verify, not yet a finding.
3. **Coverage thresholds.** The `test` job reports coverage and comments it, but whether a coverage floor should *fail* the build (not just report) is a project policy call left to the maintainers.
4. **jscpd ignore-list growth.** The `ignore` list already excludes several mirrored per-harness hooks. As harnesses multiply, the list grows. Open question whether a shared hook abstraction should replace the duplication outright (a `typescript-node-worker-bee` concern) rather than ignoring it.

## Currency notes

- `actions/setup-node` is pinned to `@v6.4.0` today. When that action publishes a new fixed version, refresh the pin and the references in `guides/04-workflows.md` + `2026-06-16-github-actions-node-matrix.md`.
- The Node matrix is `[22, 24]` against `engines.node >=22`. When the floor or the top of the supported range moves, update `cross-node-install` and the matrix note.
- tree-sitter prebuild availability (the no-arm64-prebuild / mislabeled-prebuild situation) may improve upstream. If so, `ensure-tree-sitter.mjs` becomes a no-op more often, but keep it - it's the safety net.

## When to refresh this Stinger

- esbuild outputs change (a new harness `outdir`, a removed one) -> update `guides/01-build-and-bundle.md`, `scripts/audit-bundle.sh`, and the `files` allowlist cross-check.
- A workflow is added/removed/renamed under `.github/workflows/` -> update `guides/04-workflows.md`.
- The release flow changes (bump mechanism, commit shape, publish targets) -> update `guides/05-release-flow.md` + `templates/release-checklist.md`.
- The quality gate changes (a tool added/removed, thresholds moved) -> update `guides/03-quality-gate.md`.
