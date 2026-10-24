# 2026-06-16 - ESM & Node16 module resolution

Authored 2026-06-16 from the Hivemind repo (`tsconfig.json`, `src/`) plus TypeScript/Node docs. Repo is the source of truth on disagreement.

## Sources

- https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-nodenext
- https://nodejs.org/api/esm.html
- `tsconfig.json`, `package.json` (`"type": "module"`), `src/` import sites.

## Summary

Hivemind is a strict ESM package: `"type": "module"` in `package.json`, `module: Node16` + `moduleResolution: Node16` in tsconfig, `target: ES2022`, Node `>=22`. Under Node16/NodeNext resolution, TypeScript mirrors Node's real ESM loader, which means:

- **Relative imports must carry an explicit extension** - and for TS source compiled to JS, that extension is `.js` (not `.ts`): `import { sqlStr } from "./utils/sql.js"`. tsc resolves `./utils/sql.js` back to `sql.ts` at compile time but emits the `.js` specifier, which is what Node loads at runtime.
- **Extensionless relative imports fail at runtime** even when an editor or a bundler tolerates them. This is the single most common porting mistake.
- **No `require` / `module.exports` / `__dirname`** - ESM only. A module's own dir is `fileURLToPath(new URL(".", import.meta.url))`.
- **`node:` prefix on builtins** is the house style and is required by some loaders for clarity.

## Key facts the guides depend on

- A missing `.js` extension is a runtime break, not a style nit (`guides/01`, `guides/02`).
- `target: ES2022` matches Node 22; downleveling is dead weight (`guides/16`).
- Top-level await is available (used in `esbuild.config.mjs`).

## Relevance

- `guides/01-stack-enforcement.md`, `guides/02-project-layout-esm.md`, `guides/16-node22-runtime.md`, and `scripts/check-esm-node22.mjs`.
