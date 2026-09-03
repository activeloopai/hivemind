---
name: dependency-audit-stinger
description: npm supply-chain hygiene specialist for the @deeplake/hivemind package. Owns npm dependency update tooling (Renovate vs Dependabot for this repo), package-lock.json lockfile discipline (npm ci, minimumReleaseAge), npm audit triage (noise vs real, direct vs transitive), the optionalDependencies + tree-sitter native ABI risk (ensure-tree-sitter postinstall), SBOM generation for the npm package (Syft / CycloneDX), npm provenance (npm publish --provenance / Sigstore), socket.dev behavioral scanning, and the publish-time guards (files allowlist, pack-check.mjs, audit-openclaw, CodeQL). Use when the user says "audit our dependencies", "set up Renovate", "Renovate vs Dependabot", "socket.dev", "generate an SBOM", "npm audit is noisy", "lockfile hygiene", "npm provenance", "tree-sitter postinstall failing", "is our publish safe", or when dependency-audit-worker-bee is invoked. Do NOT use for application-code vulnerability remediation (security-worker-bee), Docker image scanning pipeline architecture (ci-release-worker-bee), or license compliance legal review (legal counsel).
license: MIT
---

# dependency-audit Stinger

Procedural arsenal for `dependency-audit-worker-bee`, the npm supply-chain hygiene specialist for the `@deeplake/hivemind` package. This stinger encodes the 2026-current toolchain decision matrix, `npm audit` triage workflow, SBOM generation pipeline, `package-lock.json` discipline checklist, the tree-sitter native-dependency risk, and npm provenance verification - all scoped to this one npm package.

**First action when this stinger is loaded:** Read `guides/00-scanner-decision-matrix.md` to orient to the toolchain landscape before doing anything else. Every other guide assumes you have read that decision matrix.

## Repo ground truth (read before acting)

`@deeplake/hivemind` is an ESM, TypeScript ^6, Node `>=22` npm package. The supply-chain facts that matter:

- **Lockfile:** `package-lock.json` (npm - NOT pnpm or yarn). CI installs with `npm ci`.
- **Runtime deps:** `deeplake`, `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, `zod`, `js-yaml`, `just-bash`, `yargs-parser`.
- **optionalDependencies + native ABI risk:** `@huggingface/transformers` plus the full tree-sitter grammar set (c/cpp/go/java/javascript/python/ruby/rust/typescript). Three grammars are version-pinned in `overrides` (`tree-sitter-c`, `tree-sitter-python`, `tree-sitter-rust`). The `postinstall` hook runs `scripts/ensure-tree-sitter.mjs`, which heals native ABI / arm64 build failures. This native-dependency surface is the single biggest supply-chain risk on this package - a compromised or broken grammar build runs install-time code on every consumer's machine.
- **Publish guards:** `prepack` builds; the `files` allowlist controls what ships; `scripts/pack-check.mjs` (`npm run pack:check`) blocks publishing secrets; `scripts/audit-openclaw-bundle.mjs` (`npm run audit:openclaw`) replicates ClawHub's static scan of the OpenClaw bundle.
- **CI:** `.github/workflows/` - `ci.yaml` runs a cross-node install; `codeql.yaml` scans `javascript-typescript`. CodeRabbit profile is `chill`.

---

## When this stinger applies

Load this stinger when `dependency-audit-worker-bee` is invoked. Typical triggers:

- "Set up Renovate for Hivemind / Renovate vs Dependabot for this repo"
- "Our dependency-update PRs are noisy"
- "npm audit returns findings - help me triage"
- "npm audit shows clean but I don't trust it"
- "The tree-sitter postinstall is failing / is it safe?"
- "We need an SBOM for the published package"
- "Generate an SBOM and attest it in CI"
- "Set up socket.dev to catch malicious packages"
- "Should we publish with --provenance?"
- "Is our npm publish safe? / what guards the published bundle?"
- "package-lock.json keeps changing unexpectedly"

Do NOT load it for:

- Application-code CVEs requiring code changes -> `security-worker-bee`
- Container image scanning -> `ci-release-worker-bee`
- License compatibility legal opinions -> legal counsel
- CI/CD pipeline architecture beyond the dependency scanning step -> `ci-release-worker-bee`

---

## Critical directives

These are the non-negotiables. The full rationale lives in each guide.

- **Never recommend ignoring a CVE without requiring an expiry date and a tracking issue link.** See `guides/01-vulnerability-triage.md`.
- **Always differentiate direct vs transitive exposure before recommending an upgrade.** Most `npm audit` findings on this package are transitive and unreachable. See `guides/01-vulnerability-triage.md`.
- **Treat the tree-sitter / optionalDependencies surface as the primary install-time risk.** Any change there must keep `scripts/ensure-tree-sitter.mjs` working and must not loosen the `overrides` pins without justification. See `guides/01-vulnerability-triage.md` and `guides/03-lockfile-discipline.md`.
- **Prefer Renovate over Dependabot for this repo** because of grouping and `minimumReleaseAge`. See `guides/00-scanner-decision-matrix.md`.
- **Always validate `package-lock.json` integrity after any dependency change.** `npm ci` is the enforcement control. See `guides/03-lockfile-discipline.md`.
- **Do not gate CI on `low`/`moderate` `npm audit` findings.** Gate only on `high` and `critical`. See `guides/01-vulnerability-triage.md`.
- **Never weaken the publish guards.** The `files` allowlist, `pack-check.mjs`, and `audit:openclaw` are the publish-time defense. See `guides/04-provenance-verification.md`.
- **Defer to `security-worker-bee` for any CVE that requires patching application code, not just upgrading a package.**

---

## Toolchain overview (2026 state)

| Tool | Role for this package | Limit |
|---|---|---|
| **npm audit** | CVE compliance baseline, zero-config, built into the `npm ci` toolchain | Does not catch supply-chain attacks without a CVE (axios-style account hijack, tree-sitter build tampering) |
| **Renovate** | Grouped update PRs + `minimumReleaseAge` delay; right fit for this single-package npm repo | More config than Dependabot; needs a `renovate.json` |
| **Dependabot** | Free GitHub-native auto-PRs; the zero-ops fallback | No grouping, no `minimumReleaseAge`, one PR per update |
| **socket.dev** | Behavioral threat intel for npm: typosquatting, malicious install scripts, account takeover - the control for the tree-sitter postinstall risk | Not a CVE scanner; complements npm audit, does not replace it |
| **Snyk (optional)** | Richer CVE DB + reachability + IDE integration for npm | Paid tiers for some features; npm audit + socket.dev cover the baseline |
| **Syft + CycloneDX** | SBOM for the published npm package in CycloneDX 1.6 JSON; CI-ready with Sigstore attestation | Does not scan vulnerabilities; pairs with Grype for that |
| **npm `--provenance`** | Sigstore-backed provenance on publish; verifiable with `npm audit signatures` | Transport guarantee only - does not vouch for source-code trust |

> **Key 2026 insight:** `npm audit` is a CVE compliance tool, not a supply-chain security tool. The March 2026 axios maintainer account hijack published a backdoor in 40 minutes with no CVE at time of attack - `npm audit` showed clean throughout. For this package the equivalent nightmare is a tampered tree-sitter grammar running install-time code via `postinstall`. socket.dev behavioral analysis and Renovate `minimumReleaseAge` are the controls that address this class. See `research/external/04-npm-provenance-sigstore-2026.md`.

---

## Guide map

Read the guide matching your task:

| Task | Guide |
|---|---|
| Pick the right tooling for this npm package | `guides/00-scanner-decision-matrix.md` |
| Triage an `npm audit` finding (noise vs real, native-dep risk) | `guides/01-vulnerability-triage.md` |
| Generate and attest an SBOM for the published package | `guides/02-sbom-workflow.md` |
| Harden `package-lock.json` + tree-sitter discipline | `guides/03-lockfile-discipline.md` |
| Verify npm provenance + the publish-time guards | `guides/04-provenance-verification.md` |

---

## Template map

| Template | Use case |
|---|---|
| `templates/renovate-base-config.json` | Drop-in Renovate config for this npm repo: grouping, `minimumReleaseAge`, automerge for devDependencies, and a guarded rule for the pinned tree-sitter grammars |
| `templates/github-actions-sbom-workflow.yml` | SBOM generation + Sigstore attestation for the published `@deeplake/hivemind` tarball on tag push |
| `templates/dependency-triage-report.md` | Markdown template for recording an `npm audit` triage pass on this package |

---

## Folder layout

```text
dependency-audit-stinger/
+- SKILL.md                                   (this file)
+- README.md                                  (one-page human overview)
+- guides/
|  +- 00-scanner-decision-matrix.md           (Renovate vs Dependabot + npm audit + socket.dev for this package)
|  +- 01-vulnerability-triage.md              (npm audit noise vs real, direct vs transitive, tree-sitter native-dep risk)
|  +- 02-sbom-workflow.md                     (Syft + CycloneDX 1.6 + Sigstore for the published tarball)
|  +- 03-lockfile-discipline.md               (npm ci + package-lock.json + minimumReleaseAge + optionalDependencies pins)
|  +- 04-provenance-verification.md           (npm --provenance + audit signatures + files allowlist / pack-check / audit-openclaw / CodeQL)
+- examples/
|  +- happy-path-node-scanner-setup.md        (Renovate + npm audit + socket.dev for @deeplake/hivemind)
|  +- edge-case-critical-cve-triage.md        (triaging a transitive CVE pulled through a Hivemind dependency)
+- templates/
|  +- renovate-base-config.json               (ready-to-use Renovate config for this repo)
|  +- github-actions-sbom-workflow.yml        (SBOM + attestation workflow)
|  +- dependency-triage-report.md             (npm audit triage report template)
+- reports/
|  +- README.md                               (how audit reports accumulate)
+- research/                                  (DO NOT MODIFY -- owned by scripture-historian)
   +- research-plan.md
   +- research-summary.md
   +- index.md
   +- internal/01-command-brief.md
   +- external/ (5 source files)
```

---

## Pairing

| Role | Artifact |
|---|---|
| This stinger | `.cursor/skills/dependency-audit-stinger/` |
| Paired Bee | `.cursor/agents/dependency-audit-worker-bee.md` |

---

*Forged by `stinger-forge`, retargeted to the `@deeplake/hivemind` npm package. Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
