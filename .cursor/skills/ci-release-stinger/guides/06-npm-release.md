# 06 - npm Release Discipline

What ships, and what stops the wrong thing from shipping. This is the analogue of "image hygiene + image scanning" - but for an npm tarball.

## The `files` allowlist is the ship contract

`package.json` `files` is an allowlist. Only what it names lands in the published tarball, regardless of what is on disk. The current allowlist:

```
bundle
harnesses/codex/bundle
harnesses/codex/skills
harnesses/cursor/bundle
harnesses/hermes/bundle
mcp/bundle
harnesses/pi/extension-source
harnesses/openclaw/dist
harnesses/openclaw/skills
harnesses/openclaw/openclaw.plugin.json
harnesses/openclaw/package.json
.claude-plugin
scripts
README.md
LICENSE
```

Auditing a release means auditing this list, not running `ls`. Two failure shapes:

- **Built but not shipped.** An esbuild `outdir` (see `guides/01-build-and-bundle.md`) that is not covered by `files` never reaches consumers. For a load-bearing harness this is **Must-fix**; otherwise **Should-refactor**. Run `scripts/audit-bundle.sh` to diff `outdir`s against `files`.
- **Shipped but shouldn't be.** Source, test fixtures, `.env`, keys, or `dist/` leaking into `files` bloats the tarball and risks shipping secrets. Forbidden filenames are caught by pack-check (below).

Note `scripts` is shipped (the postinstall `ensure-tree-sitter.mjs` must be present in the consumer's install) - so `scripts` must stay clean of anything secret.

## pack-check: the secret-scan gate

`npm run pack:check` = `node scripts/pack-check.mjs`. It inspects the `npm pack` output and refuses forbidden filenames before publish. This is the "we leaked a secret in CI" defense: a secret, key, or env file that sneaks into the packed tarball is caught here and the publish fails closed.

In `ci.yaml`'s `test` job, pack-check runs as a step ("Pack-check (refuse forbidden filenames in tarball)"), so the gate fires on every PR, not just at release time. A change that defeats pack-check - widening the allowlist to include a secret-bearing path, or bypassing the step - is **Must-fix**, and you surface it to `security-worker-bee`.

## audit:openclaw: the ClawHub scanner replica

`npm run audit:openclaw` = `node scripts/audit-openclaw-bundle.mjs`. It replicates the ClawHub static-scan rules over the openclaw bundle (`harnesses/openclaw/dist`) locally, so a bundle that would be rejected by ClawHub on publish is caught in CI first. It runs in both the `test` and `windows-test` jobs. Treat a new openclaw-bundle finding the way you'd treat a failed scan: block until resolved.

## The three publish-surface scanners, together

| Scanner | Scope | Catches |
|---|---|---|
| CodeQL (`codeql.yaml`) | TS source | code-level vulnerabilities |
| `audit:openclaw` | openclaw bundle | ClawHub rule violations in the shipped plugin |
| `pack-check` | the packed tarball | forbidden / secret filenames before publish |

Together these are the "nothing dangerous ships" layer. A release passes only when all three are green.

## prepack / prepare

- **`prepack`** = `npm run build` - rebuilds before pack/publish so the tarball is never stale.
- **`prepare`** = `husky && npm run build` - hooks + build on local install.

A publish that runs `--ignore-scripts` skips both and is a **Must-fix**.

## publishConfig

`publishConfig.access: public` - this is a public scoped package (`@deeplake/hivemind`). Confirm it stays `public`; a scoped package defaults to restricted and would fail to publish openly without it.

## Cross-reference

- `research/2026-06-16-npm-files-allowlist-prepack.md` - the allowlist + prepack/prepare lifecycle.
- `research/2026-06-16-pack-check-secret-scan.md` - scanning a pack for secrets.
- `guides/05-release-flow.md` - where these run in the release.
- `templates/bundle-audit.md` - the allowlist/bundle audit skeleton.
