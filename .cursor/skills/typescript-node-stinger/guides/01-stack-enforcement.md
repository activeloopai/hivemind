# 01 - Stack Enforcement

The Hivemind toolchain, slot by slot. One pick per slot, and every pick is what the repo already runs.

## The toolchain

| Slot | Pick | Why |
|---|---|---|
| Language | TypeScript ^6 | The whole `src/` tree is TS |
| Strictness | `strict: true` | Non-negotiable; never flip off |
| Module system | ESM (`"type": "module"`) | Node16 resolution, `.js` extensions |
| Runtime | Node >=22 | `engines.node`; built-in `fetch`, top-level await |
| Module/resolution | `module: Node16`, `moduleResolution: Node16` | Matches Node's real ESM loader |
| Target | `ES2022` | Node 22 supports it natively |
| Bundler | esbuild (`esbuild.config.mjs`) | Fast, per-harness output, `define` for version |
| Test runner | Vitest ^4 (`vitest run`) | TS-native, fast, coverage-v8 |
| Validation | zod ^4 (app) / zod/v3 (MCP server) | MCP SDK speaks v3 |
| Dedup gate | jscpd (threshold 7) | `npm run dup` |
| Pre-commit | husky -> lint-staged (`tsc --noEmit --skipLibCheck`) | No ESLint, no Prettier |
| Persistence | Activeloop Deep Lake over HTTP SQL API | `src/deeplake-api.ts` |
| Shell engine | just-bash ^2.14 | VFS shell over Deep Lake |
| YAML | js-yaml | Frontmatter / config |
| CLI args | yargs-parser | The `hivemind` bin |
| MCP | `@modelcontextprotocol/sdk ^1.29` | The MCP server |
| Anthropic | `@anthropic-ai/sdk` | Skillify / summarization |
| Optional | `@huggingface/transformers`, `tree-sitter` + grammars | Guarded loading only |

## ESM is the whole posture

This is an ESM package. That has concrete consequences you enforce at review time:

- **Relative imports carry `.js`** - `import { sqlStr } from "./utils/sql.js"` even though the source is `sql.ts`. Node16 resolution refuses an extensionless relative specifier at runtime; tsc passes it, then the bundle or the `tsx` run breaks. A missing extension is a finding even if it currently "works" (it works by bundler luck).
- **No `require`, no `module.exports`, no `__dirname`** - use `import`, `export`, and `import.meta.url` -> `fileURLToPath`. The hooks resolve their detached workers via `import.meta.url` (see `esbuild.config.mjs` comments).
- **Top-level await is allowed** - `esbuild.config.mjs` itself uses it (`await build({...})`).
- **`node:` prefix on builtins** - `import { readFileSync } from "node:fs"`, not `"fs"`. The codebase is consistent on this.

## Why not the alternatives

Demoted picks live in `references/`. The short version:

- **Babel** - tsc handles types and esbuild handles bundling; there is no Babel in the pipeline. See `references/tsc-vs-babel.md`.
- **Jest** - Vitest is TS/ESM-native and ships `vitest run` + `@vitest/coverage-v8`; Jest's ESM story is still awkward. See `references/vitest-vs-jest.md`.
- **tsup** - the repo hand-writes `esbuild.config.mjs` because it needs per-harness outputs and `define`-based version inlining that a tsup config would obscure. See `references/esbuild-vs-tsup.md`.
- **valibot** - zod is already pervasive and the MCP SDK couples to zod/v3; switching would fork the validation story. See `references/zod-vs-valibot.md`.
- **pnpm / yarn** - the repo uses npm (`package-lock.json`, `npm run ci`). See `references/npm-vs-pnpm.md`.

## Substitution policy

A push to substitute requires:

1. **An ADR** at `library/architecture/ADR-<n>-<topic>.md` with Context / Decision / Consequences / Alternatives Considered.
2. **Eval evidence** - the substitute beats the canonical pick on a metric the repo cares about (build time, bundle size, test speed, install reliability across harnesses).
3. **A migration plan** - especially for anything touching the per-harness bundles or the Deep Lake client.
4. **Re-demotion** - the previous canonical pick moves into `references/`.

Without all four, the substitution is a finding.

## Sources

- `package.json`, `tsconfig.json`, `esbuild.config.mjs` in the repo.
- `research/2026-06-16-esm-node16-resolution.md`.
- `research/2026-06-16-hivemind-stack-survey.md`.
