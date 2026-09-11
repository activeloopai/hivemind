# Bundle / Allowlist Audit - {{project-name}}

**Date:** {{YYYY-MM-DD}}
**Reviewer:** ci-release-worker-bee
**Scope:** {{full publish surface / a bundle change / a new harness}}

The question this answers: *does what esbuild builds match what the `files` allowlist ships, and does nothing dangerous ride along?* See `guides/01-build-and-bundle.md` and `guides/06-npm-release.md`.

---

## esbuild outputs (from `esbuild.config.mjs`)

| outdir | In `files` allowlist? | Notes |
|---|---|---|
| `harnesses/claude-code/bundle` | {{yes / no}} | {{shipped via .claude-plugin? load-bearing?}} |
| `harnesses/codex/bundle` | {{yes / no}} | |
| `harnesses/cursor/bundle` | {{yes / no}} | |
| `harnesses/hermes/bundle` | {{yes / no}} | |
| `harnesses/pi/bundle` | {{yes / no}} | {{pi ships extension-source, not bundle - confirm intent}} |
| `harnesses/openclaw/dist` | {{yes / no}} | audited by `audit:openclaw` |
| `mcp/bundle` | {{yes / no}} | |
| `bundle` | {{yes / no}} | the `hivemind` bin (`bundle/cli.js`) |
| `embeddings` | {{yes / no}} | {{shipped? optional runtime?}} |

Run `scripts/audit-bundle.sh` to generate this automatically.

## `files` allowlist entries (from `package.json`)

| Entry | Backed by an esbuild output / real path? | Risk |
|---|---|---|
| {{entry}} | {{yes / no}} | {{ships source? secrets? fine}} |

## `define` / version

- [ ] `__HIVEMIND_VERSION__` set on every esbuild target
- [ ] version matches root `package.json` after `npm run build` (`scripts/check-version-sync.sh`)

## Hygiene checks

- [ ] No `dist/` or source-only paths in the tarball (only bundle dirs ship)
- [ ] `scripts/` (shipped, for postinstall) contains no secrets
- [ ] Executable bits set on spawned CLI/hook bundles (`chmodSync 0o755` in esbuild config)
- [ ] ESM `package.json` marker present in each bundle dir
- [ ] `npm run pack:check` clean (forbidden filenames)
- [ ] `npm run audit:openclaw` clean

## Findings

### Built but not shipped ({{count}})
1. **`{{outdir}}`** - not in `files`. Severity: {{Must-fix if load-bearing / Should-refactor}}. Fix: add to `files`.

### Shipped but shouldn't be ({{count}})
1. **`{{path}}`** - ships {{source/secret/fixture}}. Severity: Must-fix. Fix: {{remove from files / pack-check rule}}. Surface to `security-worker-bee` if secret.

### Version / define ({{count}})
1. ...

## References

- `guides/01-build-and-bundle.md`, `guides/06-npm-release.md`
- `research/2026-06-16-npm-files-allowlist-prepack.md`, `research/2026-06-16-pack-check-secret-scan.md`

---

*Produced by ci-release-stinger.*
