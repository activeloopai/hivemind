# 00 - Principles

The non-negotiables. Read on every invocation.

Hivemind ships as the npm package `@deeplake/hivemind` (bin `hivemind` -> `bundle/cli.js`). TypeScript ^6, Node >=22, pure ESM. The deliverable is a set of esbuild bundles published to npm. There is no container, no web framework, no cloud deploy here.

## The ten principles

### 1. Inventory the repo first - always

Before recommending anything, capture:

- `package.json` - `scripts`, `files` allowlist, `bin`, `version`, `engines.node`, `dependencies` vs. `optionalDependencies` (tree-sitter grammars are optional).
- `esbuild.config.mjs` - the per-harness bundle outputs and the `define` block that inlines the version.
- `scripts/sync-versions.mjs`, `scripts/ensure-tree-sitter.mjs`, `scripts/pack-check.mjs`, `scripts/audit-openclaw-bundle.mjs`.
- `tsconfig.json`, `vitest.config.ts`, `.jscpd.json`, `.husky/pre-commit` + `lint-staged` config.
- `.github/workflows/*.yaml` - which workflows exist, the Node matrix, action pin form, `permissions:` blocks.
- `.coderabbit.yaml` - the review profile (currently `chill`).

A recommendation written without reading the existing pipeline is wrong advice. Source: `research/research-plan.md` lists the canonical inventory checklist.

### 2. The version is single-sourced

`prebuild` runs `scripts/sync-versions.mjs`, which propagates one version (from root `package.json`) into every harness manifest, and esbuild `define` (`__HIVEMIND_VERSION__`) inlines it into the bundles. Never hand-edit a version in a per-harness manifest - it will drift from the bundles and ship a lie. Source: `research/2026-06-16-version-single-sourcing.md` and `guides/02-sync-versions.md`.

### 3. The build is `tsc && node esbuild.config.mjs` - both run

tsc type-checks and emits `dist/`; esbuild then bundles `dist/*.js` into the per-harness outputs (`harnesses/{claude-code,codex,cursor,hermes,pi}/bundle`, `harnesses/openclaw/dist`, `mcp/bundle`, `bundle/`, `embeddings/`). Skipping either ships broken or un-bundled artifacts. Source: `guides/01-build-and-bundle.md`.

### 4. Local equals CI - `npm run ci` is the gate

`npm run ci` = `typecheck && dup && test` (`tsc --noEmit`, `jscpd src`, `vitest run`). A green local gate must predict a green CI. Divergence burns engineering time on diagnosis. Source: `guides/03-quality-gate.md`.

### 5. What ships is the `files` allowlist

`prepack` rebuilds (`npm run build`) and `scripts/pack-check.mjs` refuses forbidden filenames, but the `files` array in `package.json` is the contract for what lands in the tarball. Auditing a release means auditing the allowlist + pack-check output, not running `ls` on disk. Source: `guides/06-npm-release.md`.

### 6. Secrets never reach the tarball or the logs

`scripts/pack-check.mjs` is the publish gate - it inspects `npm pack` output and refuses forbidden filenames. `scripts/audit-openclaw-bundle.mjs` replicates the ClawHub static scanner over the openclaw bundle. The release-only `GITHUB_TOKEN` persistence in `release.yaml` is legitimate (the release job force-tracks bundles and pushes the release commit) and scoped to that job - do not flag it as a leak. Source: `guides/06-npm-release.md` and `guides/05-release-flow.md`.

### 7. Pin actions, pin Node

- Actions: pinned to a version (`actions/setup-node@v6.4.0` today). Never `@main` or a floating major.
- Node: an explicit version (`22`) on most jobs; `cross-node-install` runs the matrix `[22, 24]` to prove install works across the engine range. Never a floating `node-version`. Source: `guides/04-workflows.md` and `research/2026-06-16-github-actions-node-matrix.md`.

### 8. Native deps self-heal on install

`postinstall` runs `scripts/ensure-tree-sitter.mjs` to repair tree-sitter native ABI / arm64 mismatches. The tree-sitter grammars are `optionalDependencies`, so install must degrade gracefully and a consumer `npm i @deeplake/hivemind` must not require a manual native rebuild. Source: `guides/08-native-deps.md` and `research/2026-06-16-tree-sitter-native-abi-healing.md`.

### 9. Cite every finding

Two citations per finding:

- **Where in the user's repo** - `package.json:18`, `esbuild.config.mjs:79`, `.github/workflows/ci.yaml:107`.
- **Why it's a finding** - guide section + research note (`guides/06-npm-release.md` + `research/2026-06-16-pack-check-secret-scan.md`) or external URL.

### 10. Severity discipline

Three levels only:

| Severity | Example | Blocks PR / release? |
|---|---|---|
| Must-fix | Hand-edited manifest version drift, build skips tsc or esbuild, secret reachable by the tarball, allowlist ships source/secrets, unpinned action major or floating node-version, publish without prepack, removed postinstall native-dep healing | Yes |
| Should-refactor | New CI job without local parity, missing coverage upload, jscpd threshold loosened without justification, job missing `permissions:`, cross-node-install not covering the engine range, bundle built but not in allowlist | No - open follow-up |
| Style | Script naming nit, workflow step label, YAML key ordering | No - suggestion |

Calling a style nit "must-fix" destroys reviewer trust. Be disciplined.

---

## First-move checklist

Before writing findings, confirm:

- [ ] `package.json`, `esbuild.config.mjs`, the four `scripts/*.mjs`, and `.github/workflows/*.yaml` read.
- [ ] Node engine range + the harness bundle outputs captured.
- [ ] Version source of truth confirmed (root `package.json` -> sync-versions -> manifests + `define`).
- [ ] Invocation classified (`build-author` / `bundle-audit` / `pipeline-design` / `pipeline-audit` / `release-cut` / `quality-gate` / `native-dep-heal`).
- [ ] Relevant guide(s) identified from the routing table in `SKILL.md`.
- [ ] Severity rubric in mind.

## Cross-Bee boundaries

Below is what you do not own. Hand off if the question is primarily:

| Question type | Owner |
|---|---|
| CVE deep audit, secret-leak forensics, supply-chain correctness | `security-worker-bee` (you surface concerns) |
| Dependency / lockfile CVE triage | `dependency-audit-worker-bee` (you wire the step) |
| Runtime TS/Node source design, ESM/module-resolution | `typescript-node-worker-bee` |
| Deeplake dataset / retrieval / embeddings logic | `deeplake-dataset` / `retrieval` / `embeddings-runtime` Bees |
| Harness export semantics (what a bundle exports) | `harness-integration-worker-bee` (you own that it builds + ships) |
| Release-notes / changelog prose + announcement | `changelog-release-notes-worker-bee` (you own the cut mechanics) |
| Post-implementation verification | `quality-worker-bee` |

You surface concerns ("flagging a secret reachable past pack-check to security-worker-bee") but don't author the security audit yourself.

**Close-out chain on any pipeline change:** hand to `security-worker-bee` first (publish-surface / secret check), then `quality-worker-bee` (gate parity verification).

## Scope explicitly excluded (v1)

- **Runtime business logic.** This Bee stops at "the bundle builds, gates green, and ships." What the code does at runtime is `typescript-node-worker-bee` and the Deeplake Bees.
- **Custom CodeQL queries.** `codeql.yaml` runs the default `javascript-typescript` pack; do not author a custom query suite.
- **npm registry / org administration.** Recommend `publishConfig.access` correctness; do not manage registry tokens or org membership.

## Example in action

`examples/cut-a-release.md` shows these principles applied end-to-end on a full `@deeplake/hivemind` release with severity-labeled checks.
