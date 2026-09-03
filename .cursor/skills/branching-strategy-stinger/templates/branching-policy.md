# Branching Policy - [PROJECT NAME]

> **Instructions for `branching-strategy-worker-bee`:** Replace every `[PLACEHOLDER]` with team-specific values. Delete sections that do not apply. Commit this document to `docs/engineering/branching-policy.md` (or equivalent). Route branch-protection ruleset changes to `github-repo-health-worker-bee`.

---

**Model:** [GitHub Flow | Trunk-Based Development | GitLab Flow | GitFlow]
**Date adopted:** [YYYY-MM-DD]
**Owner:** [Team or person responsible for enforcing this policy]
**Last reviewed:** [YYYY-MM-DD]

---

## Core rules

- `main` is always deployable. A broken main is a production incident.
- All work happens on [short-lived feature branches | direct commits to main with flags for incomplete work].
- Target branch lifetime: ≤ [2 working days | 1 day for TBD].
- Every branch requires [1 | 2] PR review(s) before merge.
- Merge strategy: [squash-merge only | merge commit | rebase-then-merge]. Configure in repository settings.
- Delete branches on merge (enable "Automatically delete head branches" in GitHub repository settings).

---

## Branch naming conventions

| Prefix | Purpose | Example |
|---|---|---|
| `feat/` | New feature | `feat/user-search-autocomplete` |
| `fix/` | Bug fix | `fix/login-redirect-loop` |
| `chore/` | Maintenance, refactor, dependency bump | `chore/upgrade-node-20` |
| `hotfix/` | Emergency production fix | `hotfix/payment-timeout` |
| `release/` | Release stabilization (if applicable) | `release/2.4.0` |

[Delete `release/` row if team does not use release branches.]

---

## Hotfix process

[Choose one of the following based on your model:]

**GitHub Flow / TBD (fast-track PR):**
1. Open a PR to `main` with the label `hotfix`.
2. Request expedited review: minimum 1 reviewer.
3. CI must pass.
4. Merge and deploy immediately.

**GitFlow (hotfix branch):**
1. Branch from the production tag: `git checkout -b hotfix/description vX.Y.Z`
2. Apply the minimal fix.
3. Run full CI.
4. Merge to `main` and tag (`vX.Y.Z+1`).
5. Back-merge or cherry-pick to `develop`.

---

## Release process

[Delete this section if the team deploys directly from main without a release step.]

1. **Cut release branch** from `[develop | main]` when entering release-candidate phase: `git checkout -b release/X.Y.Z`
2. **Bug fixes only** on the release branch - no new features.
3. **Back-merge every fix** from the release branch to `[develop | main]`.
4. **Tag on merge** to main: `git tag -a vX.Y.Z -m "Release X.Y.Z"`
5. **Delete after EOL.**

---

## Feature flag policy

[Populate if the team uses feature flags; delete if not.]

- Feature flags are required for any feature that cannot be merged to main in ≤ [2 working days].
- Flag types in use: [Release | Experiment | Ops | Permission] (see Fowler taxonomy).
- Cleanup SLA for Release flags: remove within [2 weeks] of full rollout. A cleanup ticket must be created BEFORE the flag is turned on in production.
- Flag management platform: [LaunchDarkly | Unleash | Statsig | home-grown].

---

## Merge queue

[Delete if not using GitHub Merge Queue.]

- GitHub Merge Queue is enabled on `main`.
- Merge method: [squash | merge commit].
- Build concurrency: [N].
- All GitHub Actions workflows include the `merge_group:` event trigger.
- To bypass for hotfixes: use the "Skip queue" option with admin approval. Do NOT use "Jump to front" for non-emergencies (it triggers a full rebuild of in-progress entries).

---

## Branch protection rules

> Route all ruleset configuration to `github-repo-health-worker-bee`.

Required status checks:
- [ci-build]
- [ci-test]
- [linter] (if applicable)

Rules:
- Require PR reviews before merge: [1 | 2]
- Dismiss stale reviews on new commits: [yes | no]
- Require branches to be up to date before merging: [yes if no merge queue | no if merge queue is enabled]
- Block force-push to main: yes
- Block deletion of main: yes

---

## Model-specific addendum

[GitFlow only - delete for other models:]

### GitFlow branch map

| Branch | Source | Merges into | Lifetime |
|---|---|---|---|
| `main` | - | - | Permanent |
| `develop` | `main` | - | Permanent |
| `feature/X` | `develop` | `develop` | ≤ [2 working days] |
| `release/X.Y.Z` | `develop` | `main` + `develop` | Duration of release candidate phase |
| `hotfix/X` | `main` (tag) | `main` + `develop` | Hours |

---

*Policy authored by `branching-strategy-worker-bee`. Last forged: [YYYY-MM-DD].*
