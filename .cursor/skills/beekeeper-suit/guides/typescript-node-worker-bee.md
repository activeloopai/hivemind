# TypeScript/Node Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `typescript-node-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/typescript-node-worker-bee.md`](../../../agents/typescript-node-worker-bee.md)
**Stinger:** [`.cursor/skills/typescript-node-stinger/`](../../typescript-node-stinger/)
**Trigger policy:** proactive

---

## Domain

`typescript-node-worker-bee` is the Army's TypeScript/Node specialist, grounded in how Hivemind (`@deeplake/hivemind`) actually ships rather than generic tutorial tropes. It enforces the real Hivemind stack: strict ESM on Node 22, tsconfig Node16 module resolution with ES2022 target and `strict: true`, esbuild multi-harness bundling with `sync-versions` plus `define`, Vitest discipline (`vitest run` plus coverage-v8, tests mirroring `harnesses/`), zod at every external boundary (zod ^4 in the app, zod/v3 in the MCP server), jscpd duplication at threshold 7, and the lean husky lint-staged plus tsc gate with no ESLint or Prettier. It owns the `src/` layout and ESM import discipline, the Deep Lake SQL-API access patterns (`src/deeplake-api.ts`), the SQL guards (`sqlStr`/`sqlLike`/`sqlIdent`), the single-sourced schema and `healMissingColumns`, the MCP server tools, the esbuild bundle model, and the npm publish contract.

## Trigger phrases

Route to `typescript-node-worker-bee` when the user says any of:

- "Review this TypeScript code" / "Hivemind code review" / "audit this Node code"
- "Fix an ESM import" / "the ESM import broke"
- "Write a Vitest suite"
- "Add a zod-validated MCP tool" / "add a zod schema"
- "Tighten the tsconfig" / "tsconfig strict"
- "jscpd is failing" / "jscpd duplication"
- "Fix the esbuild bundle" / "esbuild bundle"
- Anything touching a `.ts` or `.mjs` file in a PR

Or when the request implicitly involves Hivemind's TypeScript/Node implementation patterns or its lean quality gate.

## Do NOT route when

- The user wants Deep Lake table/index design from a data-engineering POV (schema shape, `ColumnDef`, indexing decision tree) - that is `deeplake-dataset-worker-bee`. (DeeplakeApi data-access patterns stay here; schema design belongs there.)
- The user wants recall tuning, hybrid weighting, or the skillify gate - that is `retrieval-worker-bee`.
- The user wants the embedding model or daemon - that is `embeddings-runtime-worker-bee`.
- The user wants a security audit (SQL injection, the pre-tool-use gate, trace PII) - surface and hand off to `security-worker-bee`.
- The user wants the build/CI/npm-release topology (workflows, files allowlist, pack-check) - that is `ci-release-worker-bee`.
- The user wants PRD or IRD authoring - that is `library-worker-bee`.
- The user wants post-implementation QA against a plan - that is `quality-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup on the TypeScript implementation underneath.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The TypeScript codebase or the specific files/branch in scope.
- Access to `tsconfig.json`, `package.json`, `esbuild.config.mjs`, `vitest.config`, the `src/` tree, and the relevant `tests/` mirror.
- Optional: specific focus (code review, ESM fix, Vitest suite, zod boundary, esbuild entry, tsconfig tightening).

If codebase access is missing, do not invoke yet - ask the user to point at the files in scope.

## Outputs the Bee produces

- Code review findings classified by severity, each citing `path/to/file.ts:LN` plus the relevant guide in `typescript-node-stinger/guides/`.
- Refactored or new TypeScript (ESM, strict, zod-guarded boundaries) in scope.
- Vitest suites under `tests/` mirroring the harness layout.
- A clean diff that keeps the gate green (`npm run ci` = typecheck + dup + test).

## Multi-Bee sequences this Bee participates in

- **Memory / retrieval feature** - `typescript-node-worker-bee` owns the TypeScript implementation patterns underneath the recall and codify pipeline that `retrieval-worker-bee`, `embeddings-runtime-worker-bee`, and `deeplake-dataset-worker-bee` design.
- **Schema-touching feature** - implements the DeeplakeApi data-access side after `deeplake-dataset-worker-bee` designs the table.
- **Plan execution loop** - the implementation Bee whose change `security-worker-bee` then `quality-worker-bee` close out.

## Critical directives the orchestrator should respect

- **Stack is canon, not recommendation.** Strict ESM on Node 22; tsconfig Node16 + ES2022 + strict; esbuild multi-harness bundling; Vitest; zod at boundaries; jscpd + tsc + husky as the gate. Substitutions create drift across the per-harness bundles.
- **ESM only.** `"type": "module"`, `.js` extensions on relative imports, no `require`, no CJS.
- **zod at every external boundary**, and no `any` crossing a function signature - `unknown` then narrow, or a zod schema.
- **Deep Lake queries go through `src/deeplake-api.ts`** (Semaphore(5), retry on 429/5xx), never a hand-rolled `fetch`; every value goes through `sqlStr`/`sqlLike`, every identifier through `sqlIdent`.
- **Schema and version are single-sourced** - columns in `src/deeplake-schema.ts` reach existing tables via `healMissingColumns`; the version flows from `package.json` through `sync-versions`.
- **The gate is tsc + jscpd + husky, nothing else.** No ESLint, no Prettier.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
