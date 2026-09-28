# TypeDoc Config Template

Place `typedoc.json` at the repo root and add the `docs:api` script to `package.json`. Adjust `entryPoints` to the real public entry of `@deeplake/hivemind`.

## typedoc.json

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["src/index.ts"],
  "out": "docs/api",
  "excludeInternal": true,
  "excludePrivate": true,
  "excludeExternals": true,
  "readme": "none",
  "tsconfig": "tsconfig.json",
  "treatWarningsAsErrors": true
}
```

## package.json script

```json
{
  "scripts": {
    "docs:api": "typedoc"
  }
}
```

## Notes

- `entryPoints` - the public entry, not a `src/**` wildcard, so internal modules stay out of the reference. Mark any exported-but-internal symbol with `@internal`.
- `excludeInternal` / `excludePrivate` - keep `@internal` and `private` members out of the public reference.
- `readme: "none"` - the API reference is not the README. The README is owned by `readme-writing-worker-bee`.
- `treatWarningsAsErrors: true` - a newly exported symbol without a doc comment fails the build instead of shipping undocumented. Pairs with the CI gate in `templates/docs-sync-workflow.yml`.
- The output `docs/api/` is a build artifact - regenerate it, do not hand-edit it.
