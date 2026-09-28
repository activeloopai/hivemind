# typescript-node-stinger

Cursor skill that equips **typescript-node-worker-bee** to be the authority on modern TypeScript/Node as it is actually written in Hivemind (`@deeplake/hivemind`) - opinionated, modern, grounded in the repo's own patterns rather than generic tutorial tropes. Encodes the real Hivemind stack as enforcement, applied across the `src/` layout, the Deep Lake SQL-API access patterns, the esbuild multi-harness bundle model, Vitest discipline, strict types + zod boundaries, the lean quality gate, and the npm publish contract.

Entry point: `SKILL.md`.

## Canonical stack (the Hivemind reality)

The product is opinionation. There is exactly one answer per slot, and it is whatever the repo already does:

| Slot | Pick | Reasoning |
|---|---|---|
| Language | TypeScript ^6, `strict: true` | The whole repo is TS; strict is non-negotiable |
| Module system | ESM (`"type": "module"`) | Node16 resolution; `.js` extensions on relative imports |
| Runtime | Node >=22 | `engines.node`; built-in `fetch`, top-level await, `node:` builtins |
| Compiler config | tsconfig `module: Node16`, `target: ES2022` | Read it; never loosen it |
| Bundler | esbuild (`esbuild.config.mjs`) | Per-harness bundles; version inlined via `define` |
| Tests | Vitest (`vitest run`) + `@vitest/coverage-v8` | `tests/` mirrors `harnesses/` |
| Boundary validation | zod ^4 (app), zod/v3 (MCP server) | The MCP SDK speaks v3; the app is on v4 |
| Duplication gate | jscpd (threshold 7, minLines 10 / minTokens 60) | `npm run dup` over `src` |
| Pre-commit | husky -> lint-staged (`tsc --noEmit --skipLibCheck`) | No ESLint, no Prettier |
| Persistence | Activeloop Deep Lake over an HTTP SQL API | `src/deeplake-api.ts`; not Postgres/Prisma/Drizzle |
| Shell engine | just-bash (VFS) | The Deep Lake-backed shell |
| Optional deps | `@huggingface/transformers`, `tree-sitter` + grammars | Guarded loading only |

Substitution requires an ADR (`library/architecture/ADR-<n>-*.md`) with eval evidence and a migration plan.

## Scope

- **Owns:** the `src/` layout and ESM import discipline, Deep Lake SQL-API access patterns, the single-sourced schema and `healMissingColumns`, the MCP server tools, the esbuild bundle model and `sync-versions.mjs`, Vitest discipline, strict-type + zod-boundary enforcement, the jscpd/husky/tsc gate, the `hivemind` CLI and `scripts/*.mjs`, and the npm publish contract.
- **Does not own:** Deep Lake table/index design from a data-engineering POV (`deeplake-dataset-worker-bee`), security audit including auth/credential lifecycle (`security-worker-bee`), recall ranking and the embeddings strategy (`retrieval-worker-bee` and `embeddings-runtime-worker-bee`), Docker / CI / cloud deploys (`ci-release-worker-bee`), PRD authoring (`library-worker-bee`), post-implementation QA (`quality-worker-bee`).

## Layout

```
typescript-node-stinger/
  SKILL.md                Navigation, hard rules, severity rubric, routing table
  README.md               This overview
  guides/                 23 numbered guides (00-principles -> 22-failure-modes)
  templates/              7 templates (tsconfig, vitest.config, schema.ts, esbuild-entry, example.test, husky/lint-staged, package-scripts)
  scripts/                6 audit scripts + README
  examples/               6 worked examples (zod MCP tool, Deep Lake query, Vitest suite, healMissingColumns, harness wiring, esbuild entry)
  references/             5 demoted-alternatives files + README
  research/               Research plan + dated notes
```

## Reading order

Pick the entry path that matches the task:

- **Reviewing TS/Node code for the first time** -> `guides/00-principles.md` -> `guides/02-project-layout-esm.md` -> `guides/12-strict-types-and-zod.md` -> `guides/22-common-failure-modes.md`.
- **Adding an MCP tool** -> `guides/05-mcp-sdk-tools.md` -> `examples/01-zod-validated-mcp-tool.md` -> `templates/schema.ts`.
- **Deep Lake query work** -> `guides/03-deeplake-sql-api.md` -> `examples/02-deeplake-query-with-retry-and-semaphore.md` -> `guides/08-async-concurrency.md`.
- **Schema change** -> `guides/15-deeplake-schema-healing.md` -> `examples/05-add-a-column-via-healmissingcolumns.md` -> `scripts/audit-schema-drift.mjs`.
- **esbuild / bundle change** -> `guides/04-esbuild-bundling.md` -> `examples/08-add-an-esbuild-bundle-entry.md` -> `templates/esbuild-entry.mjs`.
- **Harness wiring** -> `guides/07-harness-model.md` -> `examples/06-wire-a-new-harness-install-path.md`.
- **Vitest setup** -> `guides/10-vitest-discipline.md` -> `guides/11-vitest-async-fixtures.md` -> `templates/vitest.config.ts` + `templates/example.test.ts` -> `examples/03-vitest-suite-for-a-recall-function.md`.
- **Strict-types / zod adoption** -> `guides/12-strict-types-and-zod.md` -> `templates/schema.ts` -> `scripts/audit-untyped-boundaries.mjs`.
- **jscpd / gate failure** -> `guides/13-jscpd-and-quality-gate.md` -> `templates/package-scripts.json` + `templates/husky-pre-commit`.
- **Publish / pack-check** -> `guides/14-npm-and-publishing.md` -> `guides/18-publish-and-pack-check.md`.
- **ESM / import breakage** -> `guides/01-stack-enforcement.md` -> `guides/16-node22-runtime.md` -> `scripts/check-esm-node22.mjs`.
- **Secrets / SQL guards** -> `guides/17-secrets-and-sql-guards.md` -> `scripts/audit-hardcoded-secrets.mjs`.

## Cross-Bee handoffs

| Concern | Owner |
|---|---|
| Deep Lake table/index design from a data-engineering POV | `deeplake-dataset-worker-bee` |
| Security audit (token handling, secret scanning, injection vectors, auth/credential lifecycle) | `security-worker-bee` |
| Recall ranking, embeddings strategy, evals | `retrieval-worker-bee` and `embeddings-runtime-worker-bee` |
| Docker, CI runners, release automation, cloud | `ci-release-worker-bee` |
| PRD authoring | `library-worker-bee` |
| Post-implementation QA | `quality-worker-bee` |

## Output convention

Reports are written into the **host repo's `library/` tree**, never inside this Stinger (there is no `reports/` subfolder in the Stinger):

- **Standalone reviews** -> `library/qa/typescript/<date>-<topic>.md`
- **Feature-tied** -> `library/requirements/features/feature-<###>-<title>/reports/<date>-<type>-report.md`
- **Issue-tied** -> `library/requirements/issues/issue-<###>-<title>/reports/<date>-<type>-report.md`
- **ADRs** -> `library/architecture/ADR-<n>-<topic>.md`

Cursor sees this Stinger at `.cursor/skills/typescript-node-stinger/` once deployed.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*