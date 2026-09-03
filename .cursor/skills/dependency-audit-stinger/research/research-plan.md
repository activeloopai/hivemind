# Research Plan: dependency-audit-stinger (retargeted to @deeplake/hivemind)

- **Retargeted:** 2026-06-16
- **Scope:** npm supply-chain hygiene for the `@deeplake/hivemind` package only (npm + package-lock.json, Node >=22, ESM). Cross-ecosystem breadth (PyPI, Cargo, Java/Maven) is out of scope; references to other ecosystems are kept only as "we use npm, not X" context.
- **Depth tier:** normal
- **Time window:** roughly 6 months (2025-12 to 2026-06-16)
- **Source breadth target:** official docs, practitioner blogs, GitHub READMEs, changelogs, security advisories

## Core questions (npm-scoped)

1. Renovate vs Dependabot for a single npm package with a large native-dependency tree
2. socket.dev npm behavioral coverage and the install-script / postinstall threat class
3. SBOM (Syft / CycloneDX) for a published npm tarball
4. npm provenance (`npm publish --provenance`) and `npm audit signatures`
5. `npm audit` noise vs real signal; gating on high/critical only

## Hivemind-specific questions

- How dangerous is the tree-sitter + `@huggingface/transformers` `optionalDependencies` surface, given the `scripts/ensure-tree-sitter.mjs` postinstall and the `overrides` pins?
- What controls catch a malicious native-grammar release before it auto-merges? (Answer: `minimumReleaseAge` + socket.dev `install-scripts`.)
- What guards the published tarball? (Answer: the `files` allowlist, `scripts/pack-check.mjs`, `npm run audit:openclaw`, CodeQL.)

## Out of scope (dropped on retarget)

- PyPI / PEP 740 attestations, pip-audit, uv/poetry lockfiles
- Cargo / crates.io provenance, cargo audit vs cargo-deny
- OWASP Dependency-Check (Java/.NET), Maven/Gradle SBOM plugins
- pnpm / yarn (this package uses npm)
