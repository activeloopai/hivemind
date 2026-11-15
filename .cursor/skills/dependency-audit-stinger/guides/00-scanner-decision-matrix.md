# Scanner Decision Matrix (for @deeplake/hivemind)

> **Research sources:** `research/external/01-renovate-vs-dependabot-2026.md` (CRITICAL), `research/external/02-socket-dev-supply-chain-2026.md` (CRITICAL)
> **Example:** `examples/happy-path-node-scanner-setup.md`

This package is a single npm package: ESM, TypeScript ^6, Node `>=22`, installed with `npm ci` against `package-lock.json`, built and published from GitHub Actions. The supply-chain tooling decision is therefore narrow - this guide picks the right combination for an npm-only repo and ignores the broader multi-ecosystem landscape.

The npm supply-chain layers that matter here:

---

## Layer 1: Automated update PRs (Renovate vs Dependabot)

Both watch `package.json` / `package-lock.json` and open PRs when new versions publish. They are not interchangeable.

| Dimension | Dependabot | Renovate |
|---|---|---|
| Cost | Free | Free (self-hosted) or Mend hosted |
| Automerge | Requires third-party Actions workaround | Built-in, configurable by semver range |
| PR grouping | No | Yes - reduces PR volume 3-5x |
| `minimumReleaseAge` | No | Yes - delays PRs for new releases by N days (XZ-style attack protection) |
| Config | YAML, minimal | JSON5, more options |

**Decision for this repo: Renovate.** Hivemind has a large dependency tree (7 runtime deps, 10+ optional native grammars, ~11 devDependencies). Grouping keeps the PR stream readable and `minimumReleaseAge` buys the security community time to flag a malicious release before it auto-merges - the single most valuable control for the tree-sitter / `@huggingface/transformers` install-time surface.

Use Dependabot only as a zero-ops fallback if Renovate cannot be installed. It is GitHub-native and free, but it opens one PR per update with no grouping and no release-age delay.

> **Key finding (2026-02-20):** Renovate grouping cut PR volume 3-5x in measured deployments, and `minimumReleaseAge: "7 days"` directly counters the "rush the merge window" attack pattern. Source: `research/external/01-renovate-vs-dependabot-2026.md`.

See `templates/renovate-base-config.json` for the drop-in config, including the guarded rule that prevents the pinned tree-sitter grammars (`tree-sitter-c`, `tree-sitter-python`, `tree-sitter-rust`) from being auto-bumped past their `overrides` pins.

---

## Layer 2: CVE baseline (npm audit)

`npm audit` ships with the toolchain and answers one question: "is any package in my tree affected by a published CVE?"

**Recommended use for this repo:**

- `npm audit --audit-level=high` - gate CI on high/critical only; do not block on low/moderate
- Run it in the same job that runs `npm ci`, so the audited tree is the resolved lockfile, not a fresh resolution
- It is a compliance baseline, not a supply-chain control - see Layer 3

If the team later wants reachability analysis and IDE integration, Snyk's npm support (`snyk test --severity-threshold=high --fail-on=upgradable`) is the optional upgrade. It is not required; npm audit + socket.dev cover the baseline.

---

## Layer 3: Behavioral threat intelligence (socket.dev)

socket.dev analyzes package behavior, not CVE databases. For an npm package whose `postinstall` runs native build scripts, this is the control that matters most. It catches:

- Typosquatting and package-name confusion
- Obfuscated code, hidden network activity, shell execution in install scripts
- Account takeover (a maintainer account compromised, behavior change detected)
- Supply-chain hijacks BEFORE a CVE is published

**Why this package specifically needs it:** the tree-sitter grammar set and `@huggingface/transformers` execute install-time code via the `scripts/ensure-tree-sitter.mjs` `postinstall` hook. A compromised grammar release would run on every consumer's machine, and `npm audit` would show clean until a CVE existed. The March 2026 axios account hijack (backdoor published in 40 minutes, no CVE at time of attack) is the canonical evidence that npm audit alone is insufficient.

**Integration:** start with the free socket.dev GitHub App - it comments on PRs that introduce packages with behavioral signals. Leave `malware`, `install-scripts`, `network`, and `obfuscated-code` alerts enabled (the `install-scripts` category is exactly the tree-sitter risk).

---

## Layer 4: SBOM generation (Syft + CycloneDX)

An SBOM documents what ships inside the published `@deeplake/hivemind` tarball. It is the inventory other scanners consume, not a scanner itself.

See `guides/02-sbom-workflow.md` for the full workflow. Short version:
- Use Syft as the SBOM generator (CycloneDX 1.6 JSON)
- Generate from the **packed tarball / built bundle**, not the source tree, so the SBOM reflects what the `files` allowlist actually ships
- Attest with Sigstore via `actions/attest-sbom@v2`

---

## The recommended baseline stack for this package

| Layer | Tool | Config |
|---|---|---|
| Update PRs | Renovate | `templates/renovate-base-config.json` with grouping + `minimumReleaseAge: "7 days"` + guarded tree-sitter rule |
| CVE baseline | npm audit | `npm audit --audit-level=high` in the `npm ci` job |
| Behavioral intel | socket.dev GitHub App | free tier; `install-scripts` alerts on (the tree-sitter control) |
| SBOM | Syft + CycloneDX | `templates/github-actions-sbom-workflow.yml`, on tag push |
| Provenance + publish | `npm publish --provenance` + existing guards | see `guides/04-provenance-verification.md` |

Add Snyk only if the team wants reachability analysis beyond npm audit.

---

*Next: `guides/01-vulnerability-triage.md` for handling what these tools find.*
