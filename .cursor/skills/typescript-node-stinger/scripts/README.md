# scripts/ - typescript-node-stinger audit scripts

Heuristic / static scans surfaced as quick first-pass findings. Each script is
non-destructive ESM (`.mjs`, run with `node`) and prints findings to stdout;
combine with `npm run typecheck` and `npm run dup` for a full audit pass.

| Script | What it finds | Invocation |
|---|---|---|
| `audit-untyped-boundaries.mjs` | `any` / `as any` at signatures, `JSON.parse` with no zod validation | `node scripts/audit-untyped-boundaries.mjs src/` |
| `audit-unbatched-queries.mjs` | `await ...query()` inside loops, raw `fetch` to the Deep Lake query endpoint | `node scripts/audit-unbatched-queries.mjs src/` |
| `audit-hardcoded-secrets.mjs` | Hardcoded tokens/keys, Authorization/Bearer literals, logged secrets | `node scripts/audit-hardcoded-secrets.mjs src/` |
| `audit-swallowed-catch.mjs` | Empty `catch {}` / catches that drop the error with no comment | `node scripts/audit-swallowed-catch.mjs src/` |
| `audit-schema-drift.mjs` | `ALTER TABLE` / `ADD COLUMN` outside `deeplake-schema.ts`, duplicated column lists | `node scripts/audit-schema-drift.mjs src/` |
| `check-esm-node22.mjs` | CJS, extensionless relative imports, fetch polyfills, bare builtin imports, Node-version drift | `node scripts/check-esm-node22.mjs src/` |

## Conventions

- Scripts are ESM `.mjs`, run on Node >=22 (the repo's runtime).
- They take repo-relative paths and print `path:line: severity: message` lines.
- Exit code: 0 if no findings, 1 if any finding, 2 on a usage error.
- They walk a directory recursively, skipping `node_modules`, `dist`, `bundle`.

## Severity output

- `error:` - must-fix (block CI).
- `warning:` - should-refactor (open follow-up).
- `info:` - informational (style or context).

## Running everything

```bash
for s in audit-untyped-boundaries audit-unbatched-queries audit-swallowed-catch audit-schema-drift check-esm-node22; do
  node scripts/$s.mjs src/ && echo "OK: $s" || echo "FINDINGS: $s"
done

node scripts/audit-hardcoded-secrets.mjs src/
```

## Limitations

These are heuristic line scans, not type-aware analysis. They will produce
false positives (a documented already-exists catch, an intentional `Promise.all`
near a loop). Each finding should be inspected before acting. They are a triage
tool for a large codebase, not a replacement for `tsc`, `jscpd`, `vitest run`,
or code review.
