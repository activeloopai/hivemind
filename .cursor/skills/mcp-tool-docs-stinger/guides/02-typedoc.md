# 02 - TypeDoc: the TypeScript Public API

Generating Hivemind's TypeScript API reference with TypeDoc. Read `research/external/2026-06-16-typedoc-typescript-api-docs.md` before running this guide.

Hivemind is TypeScript (`^6`), ESM, Node `>=22`, built with `tsc` + `esbuild`. The public API is documented by generating from the TS source, not by hand. TypeDoc reads the same types the compiler enforces, so the reference can never contradict the code.

## What counts as the public API

Document the **exported** symbols a consumer of `@deeplake/hivemind` (or an in-repo module) would call: exported functions, classes, types, interfaces, and enums. Internal helpers and unexported symbols stay out of the reference - mark them `@internal` if TypeDoc would otherwise pick them up.

Pick the entry points deliberately. The public surface is the set of modules you choose to expose, not "every `.ts` file in `src/`."

## Install and configure

```bash
npm install --save-dev typedoc
```

Create `typedoc.json` at the repo root (full template in `templates/typedoc-json.md`):

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["src/index.ts"],
  "out": "docs/api",
  "excludeInternal": true,
  "excludePrivate": true,
  "readme": "none",
  "tsconfig": "tsconfig.json"
}
```

- `entryPoints` - the public modules. Use the package's real entry, not a wildcard, so internal modules do not leak into the reference.
- `excludeInternal` / `excludePrivate` - keep `@internal` and `private` members out.
- `readme: "none"` - the API reference is the reference; the README is owned by `readme-writing-worker-bee`.

## npm script

```json
{
  "scripts": {
    "docs:api": "typedoc"
  }
}
```

Run `npm run docs:api`. Output lands in `docs/api/`.

## Doc-comment conventions

TypeDoc reads TSDoc comments. Fix the comment at the source; never fork the prose into a separate file.

```ts
/**
 * Search Hivemind shared memory by keyword.
 *
 * @param query - Literal substring to match (case-insensitive).
 * @param limit - Maximum hits to return. Defaults to 10.
 * @returns Matching paths and snippets.
 * @throws If credentials are missing.
 */
export async function search(query: string, limit?: number): Promise<SearchHit[]> { ... }
```

Useful tags:

- `@param`, `@returns`, `@throws` - the call contract.
- `@example` - a runnable snippet; TypeDoc renders it as a code block.
- `@deprecated` - marks a symbol deprecated in the rendered reference; pair with a changelog entry.
- `@internal` - excludes a symbol from the public reference.
- `@see` - cross-link to related symbols.

## Keeping it honest

- The reference is **generated**. If it is wrong, the doc comment in the `.ts` file is wrong - fix it there and regenerate.
- Run `typedoc` in CI (see `guides/04-doc-sync.md`) and fail the build on warnings, so a new exported symbol without a doc comment is caught.
- Do not check the generated `docs/api/` output into review as hand-edited - it is a build artifact.

See `examples/typedoc-setup.md` for an end-to-end setup.

*Source: `research/external/2026-06-16-typedoc-typescript-api-docs.md`*
