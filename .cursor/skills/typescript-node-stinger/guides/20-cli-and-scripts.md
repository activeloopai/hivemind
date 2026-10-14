# 20 - CLI & Scripts

Two flavors of executable code outside the harness bundles: the `hivemind` CLI (shipped) and the `scripts/*.mjs` build/audit helpers (dev/build-time).

## The `hivemind` CLI

`bin: { "hivemind": "bundle/cli.js" }` - the esbuild output of `src/cli/index.ts`. Argument parsing is `yargs-parser` (a thin parser, not the full yargs framework):

```ts
import yargsParser from "yargs-parser";

const argv = yargsParser(process.argv.slice(2), {
  alias: { help: ["h"] },
  boolean: ["help"],
});
const [command] = argv._;
```

CLI conventions:

- **Subcommands live under `src/commands/`** (e.g. `auth-login`). The CLI dispatches to them; it does not inline command bodies.
- **Surface a readable message + non-zero exit on error**, never a raw stack trace (`guides/09`).
- **`tsx src/cli/index.ts`** is the dev entry (`npm run cli`); the bin path is the built bundle.
- **The bin must point at the bundle, not `src`/`dist`** (`guides/14`).

## scripts/*.mjs (build / audit helpers)

These are plain ESM `.mjs` run with `node` (no tsc step), kept simple and dependency-light. The real ones:

| Script | Role |
|---|---|
| `sync-versions.mjs` | Single-source the version across manifests (prebuild). `guides/04` |
| `pack-check.mjs` | Verify the publish tarball. `guides/18` |
| `ensure-tree-sitter.mjs` | Native grammar setup (postinstall). `guides/19` |
| `audit-openclaw-bundle.mjs` | Check the OpenClaw bundle. |

Conventions for `scripts/*.mjs`:

- **ESM, `node:` builtins, top-level await** - same posture as `src/` (`guides/16`), but no `.ts`.
- **Exit non-zero on failure** so they gate CI / lifecycle hooks. `sync-versions` exits non-zero if a target is missing; audits exit non-zero on a finding.
- **Idempotent where they mutate** - `sync-versions` skips writes when a target already matches.
- **Exported logic is testable.** `sync-versions.mjs` exports `syncVersions({ root, log })` so `tests/scripts/` can drive it without touching real files.

## This Stinger's own audit scripts

The `scripts/` folder in this Stinger (`audit-untyped-boundaries.mjs`, `audit-unbatched-queries.mjs`, `audit-hardcoded-secrets.mjs`, `audit-swallowed-catch.mjs`, `audit-schema-drift.mjs`, `check-esm-node22.mjs`) follow the same shape: ESM `.mjs`, take a path, print `path:line: severity: message`, exit 1 on any finding. See `scripts/README.md`.

## Common findings

- A CLI command body inlined in `src/cli/index.ts` instead of `src/commands/` - **should-refactor**.
- A `scripts/*.mjs` that hard-codes a path the lifecycle hook depends on - **should-refactor**.
- A mutating script that is not idempotent (re-writes identical content) - **should-refactor**.
- Build logic with no exported function, so it can't be tested - **should-refactor**.

## Sources

- `package.json` (`bin`, `cli`, `shell` scripts; `yargs-parser`), `src/cli/`, `src/commands/`, `scripts/sync-versions.mjs` (exported `syncVersions`).
- `research/2026-06-16-hivemind-stack-survey.md`.
