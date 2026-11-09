# 01 - Build and Bundle

How Hivemind turns TypeScript source into shippable artifacts.

## The two-step build

`npm run build` = `tsc && node esbuild.config.mjs`.

1. **`tsc`** type-checks the whole tree and emits plain JS to `dist/` (per `tsconfig.json`). This is the type-safety gate baked into the build itself.
2. **`node esbuild.config.mjs`** bundles the emitted `dist/*.js` entrypoints into per-harness output directories, sets executable bits on the CLI/hook bundles, and writes the ESM `package.json` marker into each bundle dir.

Both steps run. A change that proposes shipping raw `dist/` or skipping the type-check is a **Must-fix** - the bundles are the product, and the type-check is the floor.

`npm run bundle` runs only the esbuild step (fast iteration once `dist/` is fresh). `npm run dev` is `tsc --watch` for the inner loop. `npm run shell` / `npm run cli` run source directly via `tsx` (no build needed) for manual exercise.

## The bundle outputs

esbuild emits a bundle per harness plus the shared CLI / MCP / embeddings bundles. The `outdir`s are the contract:

| Output | Purpose |
|---|---|
| `harnesses/claude-code/bundle` | Claude Code hook + worker bundles |
| `harnesses/codex/bundle` | Codex hook + worker bundles |
| `harnesses/cursor/bundle` | Cursor hook bundles |
| `harnesses/hermes/bundle` | Hermes hook bundles |
| `harnesses/pi/bundle` | Pi hook bundles |
| `harnesses/openclaw/dist` | openclaw plugin bundles (audited by ClawHub scanner) |
| `mcp/bundle` | MCP server bundle |
| `bundle` | The `hivemind` CLI (`bundle/cli.js`, the `bin`) |
| `embeddings` | embeddings daemon bundle |

Each harness has many entrypoints (`session-start`, `capture`, `pre-tool-use`, `wiki-worker`, etc.); esbuild takes them via `entryPoints: Object.fromEntries(...)` so each lands as its own file in the `outdir`.

## Version inlining via `define`

Every esbuild target sets:

```js
define: {
  __HIVEMIND_VERSION__: JSON.stringify(hivemindVersion),
}
```

`hivemindVersion` is read from root `package.json`; the openclaw bundle additionally reads `openclawVersion` from `harnesses/openclaw/package.json`. This is why **the version must be single-sourced** (see `guides/02-sync-versions.md`): `define` bakes whatever the manifest says into the bundle at build time. A drifted manifest produces a bundle that reports the wrong version.

## Bundle hygiene

What to check when auditing a bundle change:

- **Every esbuild output is in the `files` allowlist.** A bundle built but not listed in `files` never ships - **Should-refactor** at minimum, **Must-fix** if it's a load-bearing harness. Cross-check `outdir`s in `esbuild.config.mjs` against the `files` array in `package.json`. Run `scripts/audit-bundle.sh`.
- **`define` is set on every target.** A target missing `__HIVEMIND_VERSION__` will fail at runtime or report `undefined`.
- **Executable bits are set** on CLI/hook bundles that are spawned directly (esbuild config calls `chmodSync(..., 0o755)`). A missing chmod breaks spawn on POSIX.
- **No source maps or `dist/` leaking into the published tarball** unless intended - `dist/` is an intermediate, not a ship artifact. Only the bundle dirs ship.
- **ESM only.** `"type": "module"`; each bundle dir gets an ESM `package.json` marker. Do not introduce a CJS output path.

## When a build "works locally but not in CI"

The build is deterministic given the same Node and the same `dist/`. The usual divergence is a stale `dist/` locally (you ran `npm run bundle` without re-running `tsc`). CI always runs the full `npm run build`. Tell the user to run `npm run build`, not `npm run bundle`, before comparing. See `guides/07-failure-modes.md`.
