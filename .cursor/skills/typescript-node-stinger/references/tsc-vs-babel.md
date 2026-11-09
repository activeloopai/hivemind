# Babel - preserved alternative

> Demoted in favor of **tsc for types + esbuild for bundling** (see `guides/01-stack-enforcement.md`, `guides/04-esbuild-bundling.md`). Babel is not in the Hivemind pipeline.

## Why tsc + esbuild is canonical

- **Type-checking is the point.** `strict: true` (`guides/12`) is enforced by `tsc --noEmit` in `npm run typecheck` and the husky hook. Babel strips types without checking them - you would lose the gate the repo relies on.
- **esbuild handles transpile + bundle in one fast pass.** The build is `tsc && node esbuild.config.mjs`: tsc emits `dist/` (and type-checks), esbuild reads `dist/` and produces the per-harness bundles. Babel would add a third tool with no benefit.
- **Node 22 + ES2022 target means little to downlevel.** `target: ES2022` runs natively (`guides/16`); there is almost nothing for Babel to transform.

## What Babel is good at (and why it doesn't apply here)

- **JSX / framework transforms** - Hivemind has no React/JSX (it is a CLI + hooks + MCP server, not a web app).
- **Cutting-edge proposal syntax** via plugins - the repo does not use stage-N proposals.
- **Browser downleveling to old targets** - irrelevant; the target is Node >=22.

## If you find Babel in a repo

It is usually doing JSX or aggressive browser downleveling. The TS-native equivalent is tsc (types) + esbuild/swc (transpile). For a Node 22 ESM library like Hivemind, tsc + esbuild is strictly simpler.

## Command map

| Babel-world | Hivemind |
|---|---|
| `babel src -d dist` | `tsc` (emit + type-check) |
| bundling via webpack/babel-loader | `node esbuild.config.mjs` |
| `@babel/preset-typescript` (strip types, no check) | `tsc --noEmit` (actually checks) |

## Sources

- `package.json` (`build`, `typecheck`), `esbuild.config.mjs`, `tsconfig.json`.
- `research/2026-06-16-hivemind-stack-survey.md`.
