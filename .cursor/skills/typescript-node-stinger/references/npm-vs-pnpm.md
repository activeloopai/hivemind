# pnpm / yarn - preserved alternative

> Demoted in favor of **npm** (see `guides/14-npm-and-publishing.md`). This repo is npm: a `package-lock.json`, `npm run ...` scripts, and `npm ci` in the gate.

## Why npm is canonical

- **The lockfile and lifecycle are npm.** `package-lock.json` is the source of truth; `prepare`, `prepack`, `prebuild`, `postinstall` are npm lifecycle hooks the build and publish chain depend on (`guides/18`). Swapping the package manager means re-deriving all of that.
- **`npm run ci` is the gate.** `typecheck && dup && test` runs through npm scripts (`guides/13`). CI invokes `npm ci` for reproducible installs.
- **Scoped publish via npm.** `@deeplake/hivemind` with `publishConfig.access: public` publishes through npm (`guides/14`). The `files` allowlist and `npm pack` / `pack-check` flow are npm-shaped.
- **Optional-dep handling is well-trodden.** The native `optionalDependencies` (tree-sitter grammars) and `overrides` block are written for npm's resolution (`guides/19`).

## What pnpm/yarn are good at (and why it doesn't tip here)

- **pnpm** - content-addressed store, strict hoisting, faster cold installs in a monorepo. Hivemind is a single package with per-harness *outputs*, not a workspace monorepo, so the monorepo wins do not apply.
- **yarn (berry)** - PnP and constraints. Also more machinery than a single-package ESM library needs.

Either could work, but the cost is real: re-do the lockfile, re-validate every lifecycle hook, re-test the `optionalDependencies` + `overrides` resolution, and re-confirm the publish flow. That is an ADR-level change (`guides/01` substitution policy), not a casual swap.

## Command map

| npm (Hivemind) | pnpm | yarn |
|---|---|---|
| `npm ci` | `pnpm install --frozen-lockfile` | `yarn install --immutable` |
| `npm run build` | `pnpm build` | `yarn build` |
| `npm run ci` | `pnpm ci` (script) | `yarn ci` |
| `npm pack` | `pnpm pack` | `yarn pack` |

## If you find pnpm/yarn in a repo

Fine - just use that repo's manager consistently. For Hivemind, it is npm, and the `overrides` block plus the lifecycle scripts assume it.

## Sources

- `package.json` (`overrides`, lifecycle scripts, `publishConfig`), `package-lock.json`, `guides/14`, `guides/18`.
- `research/2026-06-16-npm-publish-files-allowlist.md`.
