# 14 - npm & Publishing

The package is `@deeplake/hivemind`, published to npm as a public scoped package. The package manager is **npm** - not pnpm, not yarn. Everything below reflects the real `package.json`.

## npm, not pnpm/yarn

The repo has a `package-lock.json` and all scripts are `npm run ...`. Use `npm install`, `npm ci`, `npm run build`. Proposing pnpm/yarn is an ADR-level decision (`references/npm-vs-pnpm.md`), not a casual swap - the lockfile, the CI, and the lifecycle scripts all assume npm.

## The publish contract is `files`

Only what is listed in `package.json#files` ships to npm. The current allowlist ships the built bundles and skills per harness, plus the plugin manifests, scripts, README, and LICENSE - and nothing else (no `src/`, no `tests/`, no `dist/` beyond what each harness bundle needs):

```json
"files": [
  "bundle",
  "harnesses/codex/bundle", "harnesses/codex/skills",
  "harnesses/cursor/bundle",
  "harnesses/hermes/bundle",
  "mcp/bundle",
  "harnesses/pi/extension-source",
  "harnesses/openclaw/dist", "harnesses/openclaw/skills",
  "harnesses/openclaw/openclaw.plugin.json", "harnesses/openclaw/package.json",
  ".claude-plugin",
  "scripts", "README.md", "LICENSE"
]
```

When you add a new harness output or a new shippable artifact, add it here. A missing entry ships a broken package; an extra entry leaks source. Both are **must-fix**.

## The bin

```json
"bin": { "hivemind": "bundle/cli.js" }
```

`bundle/cli.js` is the esbuild output for `src/cli/index.ts`. The bin must point at a built, shipped path - never at `src/` or `dist/`.

## Lifecycle scripts

- **`prepare`** = `husky && npm run build` - runs on install (dev) and sets up the git hooks plus a build.
- **`prepack`** = `npm run build` - guarantees the tarball is built before `npm pack` / `npm publish`.
- **`prebuild`** = `node scripts/sync-versions.mjs` - single-sources the version before every build (`guides/04`).
- **`postinstall`** = `node scripts/ensure-tree-sitter.mjs` - native-dep setup for the optional graph grammars.
- **`publishConfig.access` = `public`** - the scope publishes publicly.

## Semver and the single-sourced version

Bump `package.json#version`; `sync-versions` propagates it and esbuild `define` inlines it (`guides/04`). Never hand-edit a downstream manifest's version or hardcode a version string in `src/`.

## Common findings

- A new shippable artifact missing from `files` - **must-fix** (ships broken).
- `src/` or `tests/` accidentally added to `files` - **must-fix** (leaks source).
- `bin` pointing at `src/` or `dist/` instead of the bundled `bundle/cli.js` - **must-fix**.
- A hand-edited downstream version - **must-fix** (breaks single-sourcing).
- Swapping in pnpm/yarn without an ADR - **should-refactor** (push back).

## Sources

- `package.json` (`files`, `bin`, lifecycle scripts, `publishConfig`).
- `guides/18-publish-and-pack-check.md`.
- `research/2026-06-16-npm-publish-files-allowlist.md`.
