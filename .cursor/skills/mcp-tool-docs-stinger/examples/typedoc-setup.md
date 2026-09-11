# Example: TypeDoc Setup for the TS Public API

End-to-end setup for rendering Hivemind's TypeScript public API with TypeDoc.

**Demonstrates:** `guides/02-typedoc.md`, `templates/typedoc-json.md`

---

## Scenario

Hivemind (`@deeplake/hivemind`, TypeScript `^6`, ESM, Node `>=22`) exposes a public API a consumer imports. The team wants a generated API reference that can never contradict the types.

## Step 1: Install TypeDoc

```bash
npm install --save-dev typedoc
```

## Step 2: typedoc.json

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

Choose the entry point deliberately - `src/index.ts` (the package entry), not a `src/**` wildcard, so internal modules do not leak into the public reference. Mark any exported-but-internal helper with `@internal`.

## Step 3: npm script

```json
{
  "scripts": {
    "docs:api": "typedoc"
  }
}
```

## Step 4: Doc comments at the source

```ts
/**
 * Read the full content of a Hivemind memory path.
 *
 * @param path - Absolute memory path, e.g. `/summaries/alice/abc.md`.
 * @returns The stored content, or a not-found message.
 * @throws If credentials are missing.
 *
 * @example
 * const text = await read("/summaries/alice/abc.md");
 */
export async function read(path: string): Promise<string> { ... }
```

Fix wrong reference text by editing the comment here and regenerating - never by hand-editing `docs/api/`.

## Step 5: Generate

```bash
npm run docs:api
# -> docs/api/
```

## Step 6: Gate in CI

Run `typedoc` in CI and fail on warnings, so a newly exported symbol without a doc comment breaks the build instead of shipping undocumented. See `guides/04-doc-sync.md` and `templates/docs-sync-workflow.yml`.

## Result

- A generated API reference in `docs/api/` that inherits the compiler's type guarantees.
- One source of truth: the TS source and its TSDoc comments.
- `npm run docs:api` regenerates in one command.

*References: `guides/02-typedoc.md`, `research/external/2026-06-16-typedoc-typescript-api-docs.md`*
