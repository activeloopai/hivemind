---
source_url: https://peps.python.org/pep-0740/
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: high
topic: provenance-verification
stinger: dependency-audit-stinger
---

# Python Supply Chain 2026: pip-audit, PEP 740 Attestations, and the State of PyPI Provenance

**Primary source:** PEP 740 specification (peps.python.org)
**Secondary source:** Trail of Bits blog - "Attestations: A new generation of signatures on PyPI" (2024-11-14)
**Tertiary source:** pypa/pip-audit releases (v2.10.0, December 2025)
**Context source:** DEV Community - PyPI Package Growth Surge (2026-05-18)

## Summary

PEP 740 brought Sigstore-backed attestations to PyPI in 2024. As of late 2024, the official PyPI publishing workflow has attestation support enabled by default for GitHub Actions Trusted Publishing users. By the research date (2026-05), an estimated 20,000+ packages carry attestations. However, **pip and uv do not yet verify attestations at install time** - this remains an open gap. This informs `guides/04-provenance-verification.md`.

### PEP 740 Attestation State (2026-05)

**ANSWER to command brief question about PyPI attestation (PEP 740) adoption:**

**Publisher side - widely adopted for GitHub Actions workflows:**
- Anyone using the PyPA publishing action `pypa/gh-action-pypi-publish@v1` with Trusted Publishing gets attestations by default (no changes needed)
- Attestations are Sigstore-backed (in-toto v1 format via Fulcio + Rekor), not PGP
- PyPI verifies attestations on upload and makes them available via `provenance` key in the JSON Simple API
- As of October 2024 launch: ~20,000 packages with attestations, growing steadily

**Consumer side - NOT yet verified at install time:**
- `pip` and `uv` do NOT yet verify attestations during `pip install` / `uv add`
- Trail of Bits is working on a pip plugin architecture to enable verification
- Manual verification is possible via `pypi_attestations` library
- Short-term: attestations provide transparency (knowing WHICH Trusted Publisher identity published a package) but not enforced verification

**The PEP 751 connection:**
- Trail of Bits is following PEP 751 (standardized Python lockfiles) as the mechanism to store expected distribution identities - enabling "trust on first use" semantics similar to SSH known_hosts
- This is the path to eventual enforced verification at install time

### pip-audit 2026 state

**pip-audit** (pypa/pip-audit) is the PyPA-maintained scanner for Python environments:

**Recent releases:**
- **v2.10.0** (December 2025): Added `--osv-url URL` flag for custom OSV service (useful for organizations hosting their own OSV mirror), dropped Python 3.9 support (minimum now 3.10)
- **v2.9.0** (November 2025): Added `--locked` flag to support PEP 751 lockfile auditing
- **v2.8.0** (earlier 2025): Added `--vulnerability-service=esms` for Ecosyste.ms vulnerability service

**What pip-audit does:**
- Checks Python environments, requirements files, and dependency trees against OSV database via PyPI JSON API
- Supports auto-fix: `pip-audit --fix`
- Outputs CycloneDX JSON/XML for SBOM integration
- Supports custom OSV service via `--osv-url`

**What pip-audit does NOT do:**
- Not a static code analyzer - cannot detect malicious packages without a CVE entry
- Cannot protect against behavioral/zero-day supply chain attacks (use socket.dev for PyPI behavioral analysis)

### Python dependency scanning stack (2026 recommendation)

1. **pip-audit** in CI: catches known CVEs against OSV database, PyPA-maintained, low false-positive rate
2. **Lockfile with hashes** (`uv lock`, `pip-tools`, Poetry): `uv lock` recommended for 2026 (fastest, strictest)
3. **socket.dev** for new additions: surfaces behavioral signals (install-time scripts, network behavior, maintainer count, package age) - also covers PyPI now
4. **Private index** for production deployments: `devpi`, JFrog, AWS CodeArtifact - freeze point + revocation capability

### Practical attestation verification (2026)

For teams already using Trusted Publishing on GitHub Actions - attestations are automatic. For consumers:
```python
# Manual verification via pypi_attestations library
from pypi_attestations import verify
# Check if a downloaded distribution has valid provenance
```

Attestation metadata is visible on the PyPI project page (green shield icon similar to npm's green checkmark).

## Key quotations / statistics

- "Roughly 20,000 packages can now attest to their provenance by default, with no changes needed." (Trail of Bits, 2024-11-14, launch date)
- "As of October 29 [2024], attestations are the default for anyone using Trusted Publishing via the PyPA publishing action for GitHub." (Trail of Bits)
- "As specified, PEP 740 concerns only the index itself [...] downstream clients still need to trust PyPI itself to serve attestations honestly." (PEP 740 spec)
- "Move toward signed artifacts. PEP 740 brought sigstore attestations to PyPI in 2024 [...] If you publish, adopt it. If you only consume, prefer packages that already do." (DEV Community, 2026-05-18)
- "`pip-audit` is NOT a static code analyzer. It analyzes dependency trees, not code, and it cannot guarantee that arbitrary dependency resolutions occur statically." (pip-audit README)
- "pip-audit now supports PEP 751 lockfiles. These lockfiles can be audited in 'project' mode by passing `--locked` to pip-audit." (v2.9.0 release)

## Annotations for stinger-forge

- **`guides/04-provenance-verification.md`:** Clearly distinguish publisher side (opt-in for Trusted Publishing via GitHub Actions - automatic) vs consumer side (NOT yet enforced at install time by pip/uv). The gap is important - PyPI attestations are currently a transparency improvement, not an enforcement control.
- **`guides/01-vulnerability-triage.md`:** Add pip-audit to the Python scanner list with the `--osv-url` flag note for organizations running private OSV mirrors. Also note that v2.9.0 added PEP 751 lockfile support via `--locked`.
- **Open question for stinger-forge to address:** When PEP 751 lockfiles gain wider tooling support, the provenance verification story for Python changes significantly. The guide should note this as "watch this space" with the PEP 751 reference.
- **Template note:** `templates/github-actions-sbom-workflow.yml` should include a Python-specific path using `cyclonedx-py` (`pip install cyclonedx-bom`) as the preferred generator for Python projects, based on sbomify's priority matrix.
