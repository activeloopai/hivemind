# TypeDoc: TypeScript API Documentation Generation

- **Retrieved:** 2026-06-16
- **Topic:** generating a TypeScript API reference from source with TypeDoc
- **Authority:** TypeDoc official documentation + TSDoc conventions
- **Relevance:** critical

## What TypeDoc does

TypeDoc reads a TypeScript project and its TSDoc comments and generates an API reference (HTML, or JSON for further processing). It uses the TypeScript compiler, so the documented types are the real types the compiler enforces - the reference cannot contradict the code. This is the core reason to generate rather than hand-write a public-API reference: there is one source of truth.

## Configuration essentials

- **`entryPoints`** - the modules whose exports become the documented public surface. Choosing a deliberate entry (e.g. the package's `src/index.ts`) rather than a `src/**` wildcard keeps internal modules out of the public reference.
- **`out`** - output directory (e.g. `docs/api`).
- **`excludeInternal`** - drops symbols tagged `@internal`. **`excludePrivate`** drops `private` members.
- **`readme: "none"`** - keeps the README out of the generated reference when the README is owned elsewhere.
- **`treatWarningsAsErrors`** - turns a missing/invalid doc comment into a build failure; pairs well with a CI gate so a newly exported symbol without docs cannot ship.

A minimal `typedoc.json` plus a `"docs:api": "typedoc"` npm script is enough to run `npm run docs:api`.

## TSDoc tags that matter

TypeDoc understands TSDoc block tags. The high-value set:

- `@param` / `@returns` / `@throws` - the call contract.
- `@example` - renders a runnable snippet as a code block in the reference.
- `@deprecated` - marks a symbol deprecated in the rendered output; pair with a changelog entry.
- `@internal` - excludes a symbol from the public reference (with `excludeInternal`).
- `@see` / `{@link ...}` - cross-references between symbols.

## Keeping it honest

- The reference is a **build artifact**. When it is wrong, the doc comment in the `.ts` file is wrong - fix it there and regenerate. Never hand-edit the generated output.
- Run TypeDoc in CI with warnings-as-errors so undocumented exports break the build, not the docs.
- The "public API" is a deliberate choice of entry points, not "everything in the source." Mark exported-but-internal helpers `@internal`.

## Fit for Hivemind

Hivemind is TypeScript `^6`, ESM, Node `>=22`, built with `tsc` + `esbuild`. TypeDoc fits cleanly: point `entryPoints` at the real package entry, exclude internals, and gate the build. The MCP tool docs and CLI reference are documented separately (their contracts are the zod schema and the CLI dispatch, not exported TS signatures), but the importable TS public API belongs in TypeDoc.

## Notes / caveats

- TypeDoc version and plugin ecosystem evolve; pin the version in `devDependencies` and re-verify config keys against the installed version's docs.
- For monorepo-style entry points TypeDoc supports multiple `entryPoints`; Hivemind's single-package layout uses one entry.
