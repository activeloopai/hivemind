---
source_url: https://github.com/npm/cli/commit/8eff5fb31afc996c71c8f159defa324cb86dfc5a
retrieved_on: 2026-05-20
source_type: changelog
authority: official
relevance: high
topic: provenance-verification
stinger: dependency-audit-stinger
---

# npm Provenance + Sigstore 2026: State of the Art

**Primary source:** npm/cli commit 8eff5fb (2026-03-18) - `--include-attestations` flag added
**Secondary source:** npm Docs - Viewing package provenance (current)
**Tertiary source:** npm/provenance GitHub README (SLSA provenance architecture)
**Context source:** npm/rfcs issue #860 (2026-04-02) - Community push to extend npm audit beyond CVEs

## Summary

npm's Sigstore-powered provenance went GA in October 2023, and the feature has continued to evolve in 2025-2026. The `npm audit signatures` command is the consumer-side verification tool. A new `--include-attestations` flag (merged March 2026) exposes full Sigstore bundles in JSON output. This informs `guides/04-provenance-verification.md`.

### Current state of npm provenance (2026-05)

**Publisher side:**
```bash
npm publish --provenance --access public
```
Requirements: must be publishing from a GitHub Actions workflow with `id-token: write` permission. The cloud CI system sends provenance via a signed OIDC JWT to Sigstore's public-good servers.

**Consumer side (verification):**
```bash
npm audit signatures                          # basic verification
npm audit signatures --json --include-attestations   # NEW: full Sigstore bundle output (March 2026)
```

**What `npm audit signatures` checks:**
- Registry ECDSA signatures (all packages on signing registries)
- Provenance attestations (SLSA provenance statement in in-toto v1 format)
- Verifies against Sigstore trust root via TUF
- Validates Fulcio signed certificate, Rekor transparency log entry
- Verifies the signed package name/version/tarball SHA-512 matches the provenance statement subject

### Architecture of npm provenance

The flow: GitHub Actions OIDC token -> Sigstore Fulcio CA issues signing certificate (valid ~10 min) -> signs provenance bundle -> uploaded to Rekor transparency log -> published to npm registry alongside package.

Server-side verifications npm performs on publish:
1. Validate Issuer extension in signing cert is supported
2. Validate provenance was generated on a cloud-hosted runner
3. Validate provenance was generated on a public repository
4. Verify extensions in signing cert match what's in the SLSA provenance statement (falsifiability check)
5. Verify `sigstore.verify()` passes

### Adoption and the gap `npm audit` still has

From npm/rfcs issue #860 (April 2026 - triggered by the axios account compromise):
- `npm audit` only catches known CVEs - it returns clean if no CVEs exist regardless of other signals
- The axios compromise (March 31, 2026): a threat actor hijacked the primary maintainer's npm account and published two backdoored versions within 40 minutes - NO CVE existed at time of publish
- Community RFC asks for `npm audit --supply-chain` to additionally check: whether publish account has previously published that package, whether new post-install scripts were introduced, whether new transitive dependencies appeared, whether valid SLSA provenance exists
- **Implication:** `npm audit` is a compliance tool, not a supply chain security tool. It checks a box. Socket.dev behavioral analysis covers what `npm audit` misses.

### pnpm audit feature parity (2026)

**ANSWER to command brief question:** `pnpm audit` is near-parity with `npm audit` for CVE scanning, but has its own signature verification and a new `--fix=update` mode.

Key 2026 pnpm audit changes:
- Since pnpm v11: queries `/-/npm/v1/security/advisories/bulk` endpoint (same as npm)
- Filters by GHSA identifier (not CVE), so `auditConfig.ignoreCves` replaced by `auditConfig.ignoreGhsas` in v11
- `pnpm audit --fix=update` (added in v11.0.0, merged December 2025 - February 2026): fixes vulnerabilities by updating packages in the lockfile instead of adding `overrides` - more precise than npm's approach
- `pnpm audit --verify-store-integrity`: verifies ECDSA registry signatures (equivalent to `npm audit signatures`) against public keys at `/-/npm/v1/keys`

**Feature gap remaining:** pnpm does not yet have an equivalent of `npm audit signatures --include-attestations` for full Sigstore bundle output.

## Key quotations / statistics

- "npm audit signatures [...] checks the registry signatures and provenance attestations. If a package has missing or invalid signatures or attestations, it returns an error." (npm Docs)
- "feat(audit): add --include-attestations flag to output sigstore bundles (#9049)" merged 2026-03-18
- "The axios compromise on March 31st exposed a gap that `npm audit` can't close on its own [...] There was no CVE at the time of publish." (npm/rfcs #860, 2026-04-02)
- "npm audit looks for CVEs. A well-executed supply chain attack doesn't generate a CVE until after the damage is done. They're different time windows." (DEV Community, 2026-05-07)
- "pnpm audit [...] Since v11, `pnpm audit` queries the registry's `/-/npm/v1/security/advisories/bulk` endpoint." (pnpm docs, 2026-05-11)

## Annotations for stinger-forge

- **`guides/04-provenance-verification.md`:** Encode the full publisher + consumer verification workflow. Key decision point for consumers: run `npm audit signatures --json --include-attestations` in CI to verify the provenance chain, and gate on packages that previously had provenance losing it (regression signal).
- **`guides/01-vulnerability-triage.md`:** Add a section on "what `npm audit` cannot detect" (zero-day account takeovers, behavioral supply-chain attacks before CVE assignment) and point to socket.dev as the complementary control.
- **`guides/03-lockfile-discipline.md`:** Note that pnpm v11 changed `ignoreCves` to `ignoreGhsas` - teams upgrading pnpm must migrate their ignore configs.
- **Contradiction to document:** The command brief describes `npm audit signatures` as the provenance verification command. The March 2026 addition of `--include-attestations` should be included as the enhanced verification path.
