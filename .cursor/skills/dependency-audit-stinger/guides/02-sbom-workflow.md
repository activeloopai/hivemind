# SBOM Workflow (Syft + CycloneDX + Sigstore) for the published package

> **Research source:** `research/external/03-sbom-cyclonedx-spdx-2026.md` (CRITICAL)
> **Template:** `templates/github-actions-sbom-workflow.yml`

A Software Bill of Materials (SBOM) is a machine-readable inventory of every component in your published artifact. For `@deeplake/hivemind` the artifact is the npm tarball that the `files` allowlist ships. In 2026, an SBOM is required or strongly recommended by the EU Cyber Resilience Act (CRA), US Executive Order 14028, and many enterprise procurement checks.

---

## Format selection: CycloneDX 1.6 JSON

Generate **CycloneDX 1.6 JSON** as the primary format. It is the de facto standard for ENISA guidance and most vulnerability tooling (Grype, Dependency-Track), and carries richer provenance/VEX data than SPDX. Add an SPDX 2.3 variant only if a specific consumer or compliance program demands it.

---

## Generator: Syft

| Artifact | Generator |
|---|---|
| The published npm tarball / built `bundle/` | `anchore/syft` (`anchore/sbom-action`) - native CycloneDX output, widest support |
| Single npm package (alternative) | `@cyclonedx/cyclonedx-npm` |

**Key rule:** generate from the **packed tarball or built bundle**, not the raw source tree. The `files` allowlist (`bundle`, `harnesses/*/bundle`, `mcp/bundle`, `scripts`, etc.) decides what actually ships - a source-tree SBOM would list devDependencies and unbundled source that never reach consumers, overstating the surface. Run `npm pack` (or build the bundle) first, then point Syft at the result. Source: `research/external/03-sbom-cyclonedx-spdx-2026.md`.

---

## The 5-step production workflow

1. **Build / pack the artifact** - `npm ci && npm run build`, then `npm pack` to produce the tarball that matches the `files` allowlist
2. **Generate the SBOM** from the packed tarball / `bundle/` using Syft (CycloneDX 1.6 JSON)
3. **Verify the SBOM** - check the component count against expectations; fail if it is implausibly low (generation likely failed)
4. **Attest with Sigstore** using `actions/attest-sbom@v2` (GitHub OIDC-backed, no long-lived keys)
5. **Store** - keep the SBOM as a release asset; extend GitHub artifact retention if a compliance horizon requires it

See `templates/github-actions-sbom-workflow.yml` for the ready-to-use implementation.

---

## Attestation: why and how

An unattested SBOM is a document; an attested SBOM is a signed claim. Sigstore attestation gives:

- Cryptographic proof the SBOM was generated from a specific artifact at a specific time
- An immutable audit trail tied to the GitHub Actions OIDC token (no signing keys to manage)
- Consumer verification via `gh attestation verify`

```bash
# Consumer verification of the published tarball SBOM
gh attestation verify ./deeplake-hivemind-sbom.cdx.json --owner activeloopai
```

---

## When to trigger SBOM generation

- **Trigger on tag push** (`on: push: tags: ['v*']`) or `release: published` - one SBOM per release, matching the npm version published.
- Do NOT trigger on every PR; SBOM generation is slow and only meaningful for release artifacts.
- This pairs naturally with the existing release flow that also runs `npm publish`.

---

*Previous: `guides/01-vulnerability-triage.md`. Next: `guides/03-lockfile-discipline.md`.*
