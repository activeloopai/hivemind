# 21 - Deep Lake SDK & HF Transformers

Two data/ML dependencies sit alongside the SQL-API client: the `deeplake` SDK (a hard dependency) and `@huggingface/transformers` (an optional one for local embeddings). This guide covers using both without breaking installs.

## The deeplake SDK vs the SQL-API client

There are two ways the repo talks to Deep Lake:

1. **The SQL-API client** (`src/deeplake-api.ts`) - the HTTP query path, with retry + Semaphore + SQL guards. This is the chokepoint for reads/writes of memory and session rows (`guides/03`). Use it for anything query-shaped.
2. **The `deeplake` SDK** (`"deeplake": "^0.3.30"`, a hard dependency) - the dataset/tensor-level SDK, used where the SQL surface is not the right shape (e.g. lower-level dataset operations).

The rule: **query-shaped work goes through the SQL-API client** (so it inherits the guards and rate-limiting); reach for the SDK only where the SQL API genuinely cannot express the operation, and document why. A new raw SDK call that duplicates something the SQL-API client already does is a **should-refactor**.

## HF transformers is an optional dep - guard it

`@huggingface/transformers` (`^3.0.0`) is an `optionalDependency`. It powers local embedding in `src/embeddings/` (the embed daemon, bundled at `embeddings/embed-daemon`). Because it is optional and heavy (model downloads, native bits), it must be loaded defensively:

```ts
let transformers: typeof import("@huggingface/transformers") | undefined;
try {
  transformers = await import("@huggingface/transformers");
} catch {
  // optional dep absent; fall back to remote embeddings or skip the feature
}
```

A hard top-level `import { pipeline } from "@huggingface/transformers"` on a path that runs for every user crashes installs that skipped the optional dep - a **must-fix**. The same posture as the tree-sitter grammars (`guides/19`).

## Embedding columns in the schema

Embeddings land in `FLOAT4[]` columns (`summary_embedding` in `MEMORY_COLUMNS`, etc.) defined in `src/deeplake-schema.ts` (`guides/15`). When you change the embedding model or dimensionality, that is a schema concern - add/adjust the `ColumnDef`, do not write a vector into an ad-hoc column.

## esbuild externals

Both `deeplake` (native bits) and `@huggingface/transformers` belong in the esbuild `external` list so the bundle stays lean and native addons are resolved at runtime, not bundled (`guides/04`). A missing external entry breaks the build.

## Common findings

- A hard top-level import of `@huggingface/transformers` on a hot path - **must-fix** (crashes installs that skipped it).
- A raw `deeplake` SDK call duplicating the SQL-API client's job - **should-refactor**.
- A vector written to an ad-hoc column instead of a `FLOAT4[]` `ColumnDef` - **must-fix** (`guides/15`).
- `deeplake` / HF missing from the esbuild `external` list - **must-fix** (build breaks).

## Sources

- `package.json` (`deeplake` dep, `@huggingface/transformers` optional dep), `src/embeddings/`, `src/deeplake-schema.ts` (embedding columns), `esbuild.config.mjs` (externals).
- `research/2026-06-16-optional-native-deps.md`.
