# Dependency Triage Report - @deeplake/hivemind

> Fill one of these per `npm audit` triage pass. File the completed report under
> `reports/YYYY-MM-DD-hivemind-dependency-audit.md`.

- **Date:** YYYY-MM-DD
- **Reviewer:**
- **Node version(s) audited:** (CI tests cross-node; record each)
- **Command run:** `npm ci && npm audit --audit-level=high`
- **socket.dev status:** (PRs clean / alerts noted)

## Summary counts

| Severity | Count | Gated CI? |
|---|---|---|
| critical | | yes |
| high | | yes |
| moderate | | no (backlog) |
| low | | no (track) |

## Findings (critical + high only)

For each, walk the five-question workflow from `guides/01-vulnerability-triage.md`.

### Finding 1: <advisory id / package@version>

- **Direct or transitive:** direct / transitive (path: `... -> ... -> <pkg>`)
- **Severity:**
- **Upgrade path:** available (target version) / overrides needed / breaking / none
- **Reachable in `src/`:** yes / no - (note import / call-site check)
- **Resolution:** upgrade / `overrides` pin / ignore-with-expiry / escalate to security-worker-bee
- **Ignore policy (if any):** expiry date + tracking issue + reviewer (no undated ignores)

## Native-dependency surface check (the tree-sitter / optionalDependencies risk)

- **`scripts/ensure-tree-sitter.mjs` postinstall:** healthy / failing (ABI/build = expected; unexpected source/behavior = incident)
- **`overrides` pins still aligned with `optionalDependencies`:** yes / no
- **New tree-sitter or `@huggingface/transformers` release pending:** held by `minimumReleaseAge` + socket.dev reviewed? yes / no

## Lockfile + publish-guard status

- **`package-lock.json` committed and drift-free:** yes / no
- **CI uses `npm ci` (not `npm install`):** yes / no
- **`npm run pack:check` passes:** yes / no
- **`npm run audit:openclaw` passes:** yes / no
- **CodeQL green:** yes / no
- **Provenance:** publishing with `npm publish --provenance`? yes / no

## Open items requiring human review before next release

1.
2.

## Action items

| # | Action | Owner | Due |
|---|---|---|---|
| 1 | | | |
