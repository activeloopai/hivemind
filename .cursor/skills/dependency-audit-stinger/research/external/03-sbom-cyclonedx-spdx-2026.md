---
source_url: https://safeguard.sh/resources/blog/how-to-generate-sbom-github-actions-2026
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: sbom-workflow
stinger: dependency-audit-stinger
---

# How to Generate an SBOM with GitHub Actions in 2026

**Primary source:** Safeguard.sh Inc, published 2026-03-06
**Secondary source:** anchore/sbom-action GitHub README (updated v0.24.0, March 2026)
**Tertiary source:** sbomify/sbomify-action GitHub README

## Summary

SBOM generation is "compliance table-stakes" in 2026. This source provides the authoritative production GitHub Actions workflow for generating, signing, and attesting CycloneDX SBOMs on every release. Directly informs `guides/02-sbom-workflow.md` and `templates/github-actions-sbom-workflow.yml`.

### Format guidance for 2026

**Recommended primary format: CycloneDX 1.6 JSON**
- CycloneDX has become the de facto standard for ENISA guidance and most vulnerability tooling
- Carries richer provenance and VEX information than SPDX
- Preferred by tooling consumers (Grype, Dependency-Track)

**Keep SPDX 2.3 as secondary:** for customers or compliance programs that explicitly require it.

**Key rule:** Generate the SBOM from the **built artifact** (container digest, binary), NOT from the source tree. Source-tree SBOMs miss packages actually pulled during `go build`, native libraries in the base image, multi-stage build copies.

### Generator selection matrix

| Ecosystem | Recommended generator | Notes |
|---|---|---|
| General/Container | **Syft** (Anchore) | Widest ecosystem support, native CycloneDX output |
| Java | CycloneDX Maven/Gradle plugins | More accurate than post-build scans |
| Go binaries | Syft + `govulncheck` | Combine for most precise list |
| Python | **cyclonedx-py** | Native Python, priority 10 |
| Rust | **cargo-cyclonedx** | Native Rust, priority 10 |
| Multi-ecosystem | **cdxgen** | Best fallback; supports Java/Gradle, Go, JS, etc. |

Note: Trivy is temporarily disabled in sbomify-action due to security vulnerabilities (as of 2026).

### Canonical 5-step GitHub Actions SBOM workflow

```yaml
# Step 1: trigger on tag push (not branch push) - every SBOM maps to an immutable artifact
on:
  push:
    tags: ['v*']

# Step 2: build and push image with digest pin
# Step 3: generate CycloneDX SBOM from image digest (pin Syft to specific version - never @latest)
- name: Generate CycloneDX SBOM
  uses: anchore/sbom-action@v0.20.0
  with:
    image: ghcr.io/${{ github.repository }}@${{ needs.build.outputs.digest }}
    format: cyclonedx-json
    output-file: sbom.cdx.json
    upload-artifact: false

# Step 4: attest SBOM with GitHub's built-in attestation (Sigstore/Fulcio CA + Rekor transparency log)
- name: Attest SBOM (CycloneDX)
  uses: actions/attest-sbom@v2
  with:
    subject-name: ghcr.io/${{ github.repository }}
    subject-digest: ${{ needs.build.outputs.digest }}
    sbom-path: sbom.cdx.json
    push-to-registry: true

# Step 5: upload SBOMs as release assets AND mirror to cold storage (S3/Azure Blob with immutability)
# GitHub's default artifact retention is 90 days - insufficient for CRA compliance (5 year minimum)
```

### Compliance implications

- EU Cyber Resilience Act (CRA) requires SBOM retention for the full product support period (minimum 5 years)
- Mirror SBOMs to cold storage (S3 with Object Lock, Azure Blob immutable, OCI registry with retention) at the same time as attaching to release

## Key quotations / statistics

- "For 2026, generate CycloneDX 1.6 JSON as the primary format and keep an SPDX 2.3 variant for customers who explicitly ask for it."
- "Generate the SBOM from the built artifact, not from the source tree - source-tree SBOMs miss the packages that actually ended up in the container or binary."
- "GitHub's default artifact retention is 90 days, which is shorter than any meaningful compliance horizon."
- "Trigger SBOM generation on tag pushes (not branch pushes) so that every SBOM maps to an immutable artifact."
- "Pin Syft to a specific release - never use `@latest` in a compliance pipeline."
- anchore/sbom-action released v0.24.0 on March 20, 2026 (latest as of research date)

## Annotations for stinger-forge

- **`guides/02-sbom-workflow.md`:** The 5-step workflow above is the canonical template. Emphasize the "from artifact not source" rule - this is the most common mistake in SBOM workflows.
- **`templates/github-actions-sbom-workflow.yml`:** Base the template directly on the 5-step workflow. Include both CycloneDX and SPDX generation, the `actions/attest-sbom@v2` step, and a cold storage upload step with a comment about CRA compliance requirements.
- **Generator decision tree:** Add to the guide: for Python projects, use `cyclonedx-py`; for Rust, use `cargo-cyclonedx`; for everything else (especially containers), use Syft with cdxgen as fallback.
- **Contradiction to monitor:** sbomify-action disables Trivy by default ("temporarily disabled due to security vulnerabilities") - stinger should not recommend Trivy as a primary SBOM generator until this is resolved.
