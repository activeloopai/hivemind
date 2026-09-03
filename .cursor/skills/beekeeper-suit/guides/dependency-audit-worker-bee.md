# Dependency Audit Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `dependency-audit-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/dependency-audit-worker-bee.md`](../../../agents/dependency-audit-worker-bee.md)
**Stinger:** [`.cursor/skills/dependency-audit-stinger/`](../../dependency-audit-stinger/)
**Trigger policy:** proactive

---

## Domain

`dependency-audit-worker-bee` owns the npm supply-chain surface for the `@deeplake/hivemind` package: dependency update tooling (Renovate grouping and `minimumReleaseAge`, Dependabot as the zero-ops fallback, socket.dev behavioral threat intel), `npm audit` triage (severity, exploitability, direct vs transitive, justified ignores with expiry), `package-lock.json` discipline (`npm ci` enforcement, lockfile drift), the `optionalDependencies` plus tree-sitter native ABI risk (the `scripts/ensure-tree-sitter.mjs` postinstall and the `overrides` pins), SBOM generation (Syft, CycloneDX 1.6 JSON, Sigstore attestation), npm provenance (`npm publish --provenance`, `npm audit signatures`), and the publish-time guards (the `files` allowlist, `scripts/pack-check.mjs`, `npm run audit:openclaw`, CodeQL).

## Trigger phrases

Route to `dependency-audit-worker-bee` when the user says any of:

- "Audit our dependencies" / "is our publish safe"
- "Set up Renovate" / "Renovate vs Dependabot" / "socket.dev"
- "npm audit is noisy" / "lockfile hygiene"
- "Generate an SBOM"
- "npm provenance"
- "tree-sitter postinstall" / "tree-sitter postinstall failing"
- "audit:openclaw"

Or when any npm dependency update or audit-triage task lands on the table.

## Do NOT route when

- The user wants application-code vulnerability remediation (a CVE that requires patching code, not just bumping a dep) - that is `security-worker-bee`.
- The user wants the build/CI/release topology or the publish pipeline itself - that is `ci-release-worker-bee`. (This Bee owns dependency hygiene and the publish-time guards as a security posture; ci-release owns the workflow mechanics.)
- The user wants license-compliance legal review.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The dependency or audit concern (a noisy `npm audit`, a Renovate setup, an SBOM request, a tree-sitter postinstall failure).
- Access to `package.json`, `package-lock.json`, `scripts/ensure-tree-sitter.mjs`, and the publish guards.
- Optional: the specific advisory or CVE being triaged.

If the concern is unclear, do not invoke yet - ask the user what they are auditing.

## Outputs the Bee produces

- `npm audit` triage with direct-vs-transitive reachability and justified ignores carrying an expiry and a tracking issue.
- Renovate/Dependabot configuration and lockfile-hygiene findings.
- SBOMs (Syft/CycloneDX), provenance guidance, and publish-time guard reviews.

## Multi-Bee sequences this Bee participates in

- **Ship a release** - feeds the publish-time guard posture (files allowlist, pack-check, audit:openclaw) that `ci-release-worker-bee` enforces in the workflow.
- Hands off any CVE requiring application-code patching to `security-worker-bee`.

## Critical directives the orchestrator should respect

- **Never recommend ignoring a CVE without an expiry date and a tracking issue link.**
- **Always differentiate direct vs transitive exposure before recommending an upgrade.**
- **Treat the tree-sitter / optionalDependencies surface as the primary install-time risk** - keep `ensure-tree-sitter.mjs` intact and the `overrides` pins justified.
- **Prefer Renovate over Dependabot for this repo** (grouping plus `minimumReleaseAge`).
- **Always validate `package-lock.json` integrity after any dependency change** (`npm ci`).
- **Gate CI only on `high` and `critical`**, and **never weaken the publish-time guards**.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
