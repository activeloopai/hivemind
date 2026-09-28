# Research Plan - ci-release-stinger

**Bee:** ci-release-worker-bee
**Retargeted:** 2026-06-16
**Domain:** Hivemind's real build / CI / npm-release pipeline (esbuild multi-harness bundling, sync-versions single-sourcing, the tsc+vitest+jscpd quality gate, the GitHub Actions workflow architecture, the Node matrix + cross-node-install, npm publish discipline, tree-sitter native-dep healing).

Grounded in the actual repo: `package.json`, `esbuild.config.mjs`, `scripts/{sync-versions,ensure-tree-sitter,pack-check,audit-openclaw-bundle}.mjs`, `.jscpd.json`, `vitest.config.ts`, `.husky/pre-commit`, and `.github/workflows/{ci,codeql,pr-checks,publish-smoke-test,release}.yaml`.

## Resolved scope questions

1. Runtime business logic in scope? **No.** This Bee owns build/gate/ship; runtime logic is `typescript-node-worker-bee` + the Deeplake Bees.
2. Custom CodeQL queries? **No.** `codeql.yaml` runs the default `javascript-typescript` pack; that's the contract.
3. ESLint / Prettier? **They do not exist in this repo.** The gate is tsc + jscpd + vitest + husky. Do not invent a formatter/linter step.
4. Promote tree-sitter to a hard dependency to "fix" arm64? **No.** It must stay an `optionalDependency` so install degrades gracefully; `ensure-tree-sitter.mjs` heals on postinstall.

## Authoritative sources to consult

### esbuild
- https://esbuild.github.io/api/#define
- https://esbuild.github.io/api/#entry-points
- https://esbuild.github.io/api/#outdir

### npm publish lifecycle
- https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files
- https://docs.npmjs.com/cli/v10/using-npm/scripts#life-cycle-scripts (prepare / prepack / postinstall)
- https://docs.npmjs.com/cli/v10/commands/npm-pack

### Quality gate
- https://vitest.dev/guide/coverage (v8 provider)
- https://github.com/davelosert/vitest-coverage-report-action
- https://github.com/kucherenko/jscpd

### GitHub Actions
- https://github.com/actions/setup-node
- https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
- https://docs.github.com/en/actions/security-guides/automatic-token-authentication (GITHUB_TOKEN + loop prevention)
- https://docs.github.com/en/code-security/code-scanning (CodeQL javascript-typescript)

### Native deps
- https://github.com/tree-sitter/node-tree-sitter
- https://nodejs.org/api/n-api.html (ABI versioning)

## Search queries executed

1. "esbuild define inline constant version multiple entry points bundle 2026"
2. "npm files allowlist prepack prepare lifecycle publish 2026"
3. "npm pack secret scan refuse forbidden filenames before publish 2026"
4. "vitest v8 coverage report github actions PR comment 2026"
5. "jscpd duplication threshold minLines minTokens CI gate 2026"
6. "github actions setup-node matrix node 22 24 cross version install 2026"
7. "github actions GITHUB_TOKEN persist-credentials loop prevention release push 2026"
8. "tree-sitter native binding ABI mismatch linux arm64 node 22 rebuild from source 2026"
9. "single source version monorepo propagate manifests generated config 2026"
10. "codeql default javascript-typescript pack pull request 2026"

## Inventory checklist (canonical first move on every invocation)

- [ ] `package.json` - scripts, `files`, `bin`, `version`, `engines.node`, deps vs. optionalDependencies.
- [ ] `esbuild.config.mjs` - outdirs, entryPoints, `define` block.
- [ ] `scripts/sync-versions.mjs`, `ensure-tree-sitter.mjs`, `pack-check.mjs`, `audit-openclaw-bundle.mjs`.
- [ ] `tsconfig.json`, `vitest.config.ts`, `.jscpd.json`, `.husky/pre-commit` + `lint-staged`.
- [ ] `.github/workflows/*.yaml` - jobs, action pins, node pins, the matrix, `permissions:`.
- [ ] `.coderabbit.yaml` - review profile.

## Target output

- 10 dated research notes in `research/2026-06-16-<topic>.md`.
- A source note for every factual claim in the guides.
- `open-questions.md` for judgment calls that remain.
