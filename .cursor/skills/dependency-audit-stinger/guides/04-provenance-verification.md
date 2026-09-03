# Provenance Verification + Publish-Time Guards

> **Research source:** `research/external/04-npm-provenance-sigstore-2026.md` (HIGH)

Two things protect the integrity of what `@deeplake/hivemind` ships: npm provenance (proof of where the package was built) and the repo's own publish-time guards (proof that nothing unexpected got into the tarball). This guide covers both.

---

## npm provenance (Sigstore-backed)

Provenance is cryptographic proof of where a package was built and from what source. It answers: "was this tarball actually built from the claimed repo, or tampered with post-build?"

### Publishing with provenance

```bash
# From GitHub Actions (OIDC-enabled runner)
npm publish --provenance --access public
```

Requirements:
- Must run from GitHub Actions (or another Sigstore-supported CI) with `id-token: write` permission
- Generates a Sigstore attestation automatically - no signing keys to manage
- The attestation is stored in the npm registry and visible at `npmjs.com/package/@deeplake/hivemind/v/<version>`

`publishConfig.access` is already `public` in `package.json`, so adding `--provenance` to the release publish step is the only change needed. Wire it into the existing `release.yaml` publish step.

### Verifying provenance as a consumer

```bash
# Basic verification of the resolved tree
npm audit signatures

# Full Sigstore bundle output (March 2026 addition) - for CI integration
npm audit signatures --json --include-attestations
```

`npm audit signatures` checks registry ECDSA signatures and SLSA provenance attestations against the Sigstore trust root. The `--include-attestations` flag (merged March 2026) emits the full bundle as JSON for automated verification. Source: `research/external/04-npm-provenance-sigstore-2026.md`.

### What provenance does and does not tell you

- **Does:** the source repo URL + commit SHA the tarball was built from, the workflow run that produced it, that it was not modified after CI.
- **Does NOT:** vouch that the source code itself is trustworthy. Provenance is a transport guarantee, not a content guarantee - a compromised repo produces valid provenance.

---

## The publish-time guards (this repo's own controls)

Provenance proves the build pipeline; these guards prove the *contents* of the tarball. They are already wired into `package.json` and must not be weakened.

### Guard 1: the `files` allowlist

`package.json` `files` is an allowlist, not a denylist. Only the listed paths ship: `bundle`, the harness bundles (`codex`, `cursor`, `hermes`, `pi`, `openclaw`), `mcp/bundle`, `.claude-plugin`, `scripts`, `README.md`, `LICENSE`. Anything not listed - source, tests, secrets, scratch files - never reaches the registry. Adding a broad entry (or a `.npmignore` that fights the allowlist) is a supply-chain regression: review any change here.

### Guard 2: `pack-check.mjs`

`npm run pack:check` runs `scripts/pack-check.mjs`, which inspects what `npm pack` would publish and blocks the release if secrets or unexpected files slipped past the allowlist. Run it before any manual publish and keep it in the release pipeline.

### Guard 3: `audit:openclaw`

`npm run audit:openclaw` runs `scripts/audit-openclaw-bundle.mjs`, which replicates the static scan that ClawHub performs on the OpenClaw bundle. Run it before publishing the OpenClaw harness so a rejection surfaces locally, not after publish.

### Guard 4: CodeQL

`.github/workflows/codeql.yaml` scans `javascript-typescript`. It is application-code SAST, not dependency scanning - but it is part of the pre-release defense, so confirm it is green before a release tag.

---

## Pre-publish checklist for a release

| Step | Command / check |
|---|---|
| Reproducible install | `npm ci` (not `npm install`) |
| CVE baseline | `npm audit --audit-level=high` clean or triaged (see `guides/01`) |
| Tarball contents safe | `npm run pack:check` passes |
| OpenClaw bundle safe | `npm run audit:openclaw` passes |
| SAST green | CodeQL workflow passing |
| Provenance | publish with `npm publish --provenance --access public` from CI |
| Consumer verification | `npm audit signatures` after publish |

---

*Previous: `guides/03-lockfile-discipline.md`. Return to `SKILL.md` for the full guide map.*
