# Research Summary: dependency-audit-stinger (retargeted to @deeplake/hivemind)

Retargeted 2026-06-16 to the npm supply chain of the `@deeplake/hivemind` package. Original source captures (`external/01`-`05`, retrieved 2026-05-20) are retained as dated records; this summary reframes them to the npm-only scope and drops the cross-ecosystem breadth.

## Run parameters

- **Depth tier:** normal
- **Scope:** npm + `package-lock.json`, Node >=22, ESM - one published package
- **External source files:** 5 (kept as dated captures; `external/05` retained for cross-ecosystem context only, since this package is npm-only)

---

## Most influential sources (npm-relevant)

### 1. Dependabot vs. Renovate: Operational Experience (safeguard.sh, 2026-02-20)

Primary evidence base for `guides/00-scanner-decision-matrix.md`. Renovate's grouping cuts PR volume 3-5x and `minimumReleaseAge` (a 7-14 day delay on new releases, informed by the XZ backdoor timeline) is the control that protects Hivemind's native-dependency surface. This is why the stinger recommends Renovate for this repo. Source file: `external/01`.

### 2. socket.dev npm behavioral coverage (socket.dev, 2026-01 / 2026-02)

socket.dev provides behavioral / zero-day threat detection for npm: malware, typosquatting, account takeover, and - most relevant here - malicious install scripts. That `install-scripts` class is exactly the tree-sitter / `@huggingface/transformers` `postinstall` risk on this package. socket.dev complements `npm audit` (CVEs); it does not replace it. The source's broader multi-ecosystem coverage is noted but out of scope. Source file: `external/02`.

### 3. SBOM with GitHub Actions in 2026 (safeguard.sh, 2026-03-06)

Canonical 5-step SBOM workflow behind `templates/github-actions-sbom-workflow.yml`: generate on tag push, from the built/packed artifact (not the source tree), CycloneDX 1.6 JSON, `actions/attest-sbom@v2` for Sigstore attestation. For Hivemind the "artifact" is the packed npm tarball that the `files` allowlist ships. Source file: `external/03`.

### 4. npm provenance + Sigstore (npm/cli + npm/rfcs, 2026-03 / 2026-04)

`npm publish --provenance` plus `npm audit signatures --include-attestations` (March 2026) is the provenance story for `guides/04-provenance-verification.md`. The npm/rfcs #860 thread (triggered by the March 2026 axios account hijack - a backdoor published in 40 minutes with no CVE) is the clearest evidence that `npm audit` is a CVE compliance tool, not a supply-chain security tool. The equivalent risk on Hivemind is a tampered tree-sitter grammar. Source file: `external/04`.

### 5. Python attestations (Trail of Bits / PEP 740) - retained for context only

`external/05` covered PyPI attestations and pip-audit. Hivemind is an npm package, so this is out of scope and retained only as a "we use npm, not PyPI" reference. Do not author Python guidance from it.

---

## Open items for the user

- **Snyk:** optional add-on for reachability analysis beyond `npm audit`. Not required for the baseline; confirm whether the team wants it before encoding cost/feature claims.
- **Renovate hosting:** GitHub App (Mend-hosted) vs self-hosted - either works for this single repo; pick based on the team's CI preferences.
- **Native-dependency review cadence:** confirm who owns the manual review of pinned tree-sitter grammar bumps (the guarded Renovate group). This is a human-ownership decision, not a tooling one.
