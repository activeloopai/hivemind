# Research Index: dependency-audit-stinger (retargeted to @deeplake/hivemind)

Retargeted 2026-06-16 to the npm supply chain of `@deeplake/hivemind`. External source files below are dated captures (retrieved 2026-05-20); the skill's posture and the summary/plan were re-scoped to npm-only on 2026-06-16.

**Depth tier:** normal
**Scope:** npm + package-lock.json, Node >=22, ESM (single published package)

## Internal files

| File | Source type | Authority | Relevance | Topic |
|---|---|---|---|---|
| `internal/01-command-brief.md` | internal | official | critical | command-brief |

## External source files

| File | Source type | Authority | npm relevance | Topic |
|---|---|---|---|---|
| `external/01-renovate-vs-dependabot-2026.md` | blog | practitioner | critical | scanner-decision-matrix |
| `external/02-socket-dev-supply-chain-2026.md` | official-docs | official | critical (npm behavioral / install-scripts) | scanner-decision-matrix |
| `external/03-sbom-cyclonedx-spdx-2026.md` | blog | practitioner | critical | sbom-workflow |
| `external/04-npm-provenance-sigstore-2026.md` | changelog | official | high | provenance-verification |
| `external/05-python-pip-audit-pypi-attestations-2026.md` | official-docs | official | context only (out of scope - npm package) | cross-ecosystem reference |

## Source -> guide mapping (npm-scoped)

### `guides/00-scanner-decision-matrix.md`
- `external/01` (Renovate vs Dependabot feature comparison, minimumReleaseAge)
- `external/02` (socket.dev npm behavioral coverage, install-script threat class)

### `guides/01-vulnerability-triage.md`
- `external/04` (what `npm audit` cannot detect - the axios case)
- `external/02` (socket.dev behavioral coverage as the complementary control)

### `guides/02-sbom-workflow.md`
- `external/03` (5-step SBOM workflow, generate-from-artifact rule, Syft + CycloneDX)

### `guides/03-lockfile-discipline.md`
- `external/01` (minimumReleaseAge pattern)
- `external/04` (npm audit vs supply-chain gap; provenance signals)

### `guides/04-provenance-verification.md`
- `external/04` (npm `--provenance`, `npm audit signatures --include-attestations`)

### `templates/`
- `external/01` -> `renovate-base-config.json` (minimumReleaseAge, grouping, guarded tree-sitter rule)
- `external/03` -> `github-actions-sbom-workflow.yml` (5-step workflow, pack-then-scan)

## Out of scope on retarget

`external/05` (PyPI/PEP 740/pip-audit) is retained only as a cross-ecosystem record. Hivemind is npm; do not derive Python, Cargo, or Java guidance from the source set.
