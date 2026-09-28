# dependency-audit-stinger

npm supply-chain hygiene playbook for the `dependency-audit-worker-bee` Bee, scoped to the `@deeplake/hivemind` package. Encodes the 2026-current tooling decision matrix (Renovate vs Dependabot, npm audit, socket.dev), `npm audit` triage, the tree-sitter / optionalDependencies native-dependency risk, SBOM generation for the published tarball (Syft + CycloneDX + Sigstore), `package-lock.json` discipline, npm provenance, and the repo's publish-time guards (files allowlist, pack-check, audit-openclaw, CodeQL).

See `SKILL.md` for the full guide map and `guides/00-scanner-decision-matrix.md` as the entry point.

**Research Summary:** `research/research-summary.md`
