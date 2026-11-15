# 16 - Node 22 Runtime

`engines.node` is `>=22`. That is a real constraint you can build on, and a real thing to enforce.

## What Node 22 gives you (use it; don't polyfill it)

- **Built-in `fetch`.** `globalThis.fetch` is stable - no `node-fetch`, no `undici` import. The Deep Lake client uses the global `fetch` directly. Adding a fetch polyfill is a **should-refactor** (dead weight).
- **Top-level await.** ESM modules can `await` at the top level. `esbuild.config.mjs` does (`await build({...})`). Use it instead of an IIFE wrapper.
- **`node:` builtins.** Import builtins with the `node:` prefix (`node:fs`, `node:path`, `node:url`, `node:crypto`). The codebase is consistent on this; a bare `"fs"` is a **should-refactor**.
- **Stable `structuredClone`, `Blob`, `ReadableStream`, Web Streams.** Available globally - no import needed.
- **`import.meta.url` / `fileURLToPath`** for a module's own location (no `__dirname` in ESM). Detached workers rely on this (`guides/07`).

## What to enforce

1. **Do not target below Node 22.** Code that polyfills `fetch`, uses a CJS `__dirname`, or pulls a dependency to do what the runtime already does is fighting the engine constraint. Lean on the platform.
2. **`target: ES2022` in tsconfig matches the runtime.** Do not downlevel to ES2017/ES2020 "to be safe" - Node 22 runs ES2022 natively, and downleveling just bloats output.
3. **`node:` prefix is the house style.** Keep it consistent.

## ESM + Node16 resolution recap

The runtime is the reason for the import rules in `guides/01` / `guides/02`:

- Node's ESM loader needs the `.js` extension on relative imports. tsc with `moduleResolution: Node16` mirrors that, so a missing extension fails at runtime even if your editor is quiet.
- No `require` - the loader is ESM. A `require(...)` in a `.ts` file is a **must-fix**.

## Audit script

`scripts/check-esm-node22.mjs` flags: a fetch polyfill import (`node-fetch`, `undici` for fetch), a bare builtin import without `node:`, a `require(` / `module.exports` in `src/`, and an extensionless relative import. It also reads `engines.node` and warns if it drops below 22. See `scripts/README.md`.

## Common findings

- Importing a `fetch` polyfill on Node 22 - **should-refactor**.
- `require(...)` / `module.exports` in an ESM module - **must-fix**.
- Bare builtin import (`"fs"`) instead of `"node:fs"` - **should-refactor**.
- Downleveling `target` below ES2022 with no reason - **should-refactor**.
- `__dirname` in ESM instead of `import.meta.url` - **must-fix**.

## Sources

- `package.json` (`engines.node >= 22`), `tsconfig.json` (`target: ES2022`).
- `src/deeplake-api.ts` (global `fetch`), `esbuild.config.mjs` (top-level await).
- `research/2026-06-16-esm-node16-resolution.md`.
