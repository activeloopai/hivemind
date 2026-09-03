# Happy Path: Setting Up Dependency Tooling for @deeplake/hivemind

> **Guides demonstrated:** `guides/00-scanner-decision-matrix.md`, `guides/03-lockfile-discipline.md`
> **Template used:** `templates/renovate-base-config.json`

## Scenario

`@deeplake/hivemind` (ESM, TypeScript ^6, Node `>=22`, npm + `package-lock.json`) has no automated dependency tooling yet. The team wants grouped update PRs, a CVE baseline in CI, and behavioral threat intel - with special care for the tree-sitter native grammars that run install-time code.

## Step 1: Choose the stack

Applying `guides/00-scanner-decision-matrix.md`:

- Update PRs -> **Renovate** (grouping + `minimumReleaseAge`; the native-dep surface needs the release-age delay that Dependabot lacks)
- CVE baseline -> **npm audit** (`--audit-level=high`), free and built in
- Behavioral intel -> **socket.dev GitHub App**, free tier (the `install-scripts` control for tree-sitter)
- SBOM -> add later, on release (see `guides/02-sbom-workflow.md`)

**Result:** Renovate + npm audit + socket.dev.

## Step 2: Install Renovate

1. Install the Renovate GitHub App on the repo.
2. Add `renovate.json` to the repo root from `templates/renovate-base-config.json`. Key pieces it brings:
   - `minimumReleaseAge: "7 days"` globally, `14 days` for native deps
   - grouping (all patches in one PR, devDependency patch/minor automerge)
   - a **guarded rule** that disables automerge for `tree-sitter-c`, `tree-sitter-python`, `tree-sitter-rust` (the `overrides`-pinned grammars) and labels them `review-required`
3. Verify the Renovate onboarding PR opens within 24 hours.

## Step 3: Enforce lockfile discipline

In `.github/workflows/ci.yaml`, confirm every node-version install uses:

```yaml
- run: npm ci   # NOT npm install
```

Confirm `package-lock.json` is committed and not in `.gitignore`. Add a lockfile-drift check to the existing `husky` + `lint-staged` setup (see `guides/03-lockfile-discipline.md` Rule 3).

## Step 4: Add the npm audit gate

In the same CI job that runs `npm ci`:

```yaml
- run: npm audit --audit-level=high
```

This gates CI on high/critical only - never on low/moderate (alert fatigue). Triage findings per `guides/01-vulnerability-triage.md`.

## Step 5: Install the socket.dev GitHub App

1. Install the socket.dev GitHub App.
2. No config needed - it comments on PRs introducing packages with behavioral signals.
3. Leave enabled: `malware`, `install-scripts`, `network`, `obfuscated-code`. The `install-scripts` category is exactly the tree-sitter `postinstall` risk - do not disable it.

## Step 6: Verify the setup

Open a PR that bumps a minor devDependency. Verify:
- [ ] Renovate opened the PR (grouped where applicable)
- [ ] `npm ci` passed across all tested node versions
- [ ] `npm audit --audit-level=high` reported clean or listed actionable findings
- [ ] socket.dev passed silently or commented a relevant alert
- [ ] a tree-sitter bump, if any, landed in the guarded "manual review" group, not an automerge

## Expected outcome

From week 1 the package has:
- Grouped automated update PRs with `minimumReleaseAge` protection and the native grammars held for manual review
- A CVE compliance baseline in CI (high/critical only)
- Behavioral threat intelligence on every new package and grammar release
- Reproducible builds enforced via `npm ci`
