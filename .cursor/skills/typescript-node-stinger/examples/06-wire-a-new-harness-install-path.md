# Example 06 - Wire a new harness install path

Goal: add a hypothetical "zed" harness end to end - its esbuild bundle, version single-sourcing, the publish allowlist, and a test mirror. Shows how the per-harness model fits together (`guides/07`).

## 1. Add the bundle in `esbuild.config.mjs`

Give the harness its own entry list and a `build()` call to its own output dir:

```ts
const zedEntries = [
  { entry: "dist/src/hooks/session-start.js", out: "session-start" },
  { entry: "dist/src/hooks/capture.js", out: "capture" },
];

await build({
  entryPoints: Object.fromEntries(zedEntries.map((h) => [h.out, h.entry])),
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "harnesses/zed/bundle",
  external: ["node:*", "deeplake", "@huggingface/transformers", "tree-sitter", "tree-sitter-*"],
  define: { "process.env.HIVEMIND_VERSION": JSON.stringify(hivemindVersion) },
});
```

If the harness spawns a detached worker, resolve it via `import.meta.url`, never a hardcoded path - the bundle dir differs per harness (`guides/07`).

## 2. Single-source the version

Add the harness's manifest to `SCALAR_TARGETS` in `scripts/sync-versions.mjs` so its `version` tracks `package.json`:

```ts
export const SCALAR_TARGETS = [
  ".claude-plugin/plugin.json",
  // ...existing targets...
  "harnesses/zed/package.json",   // <-- new harness manifest
];
```

Now `prebuild` keeps it in lockstep; no hand-edited version (`guides/04`).

## 3. Add to the publish allowlist

In `package.json#files`, list the harness's shippable outputs:

```json
"files": [
  "bundle",
  "harnesses/zed/bundle",
  "harnesses/zed/package.json",
  // ...existing entries...
]
```

A missing entry ships a broken package; `pack-check` catches it (`guides/14`, `guides/18`).

## 4. Mirror it in tests

Create `tests/zed/` with at least one `*.test.ts` exercising the harness's wiring. The tests/ tree mirrors harnesses/ (`guides/10`).

## 5. Verify the whole chain

```bash
npm run build           # prebuild (sync-versions) -> tsc -> esbuild (all harnesses)
npm run pack:check      # verify the tarball resolves every files entry
npm test                # vitest run, including tests/zed/
```

## Checklist

- [ ] esbuild entry list + `build()` to `harnesses/zed/bundle`.
- [ ] Detached workers resolve via `import.meta.url`.
- [ ] Manifest added to `sync-versions` `SCALAR_TARGETS`.
- [ ] Outputs added to `package.json#files`.
- [ ] `tests/zed/` mirror with a test.
- [ ] `npm run build && npm run pack:check && npm test` green.

## See also

- `guides/07-harness-model.md`, `guides/04-esbuild-bundling.md`, `guides/14-npm-and-publishing.md`, `guides/18-publish-and-pack-check.md`.
