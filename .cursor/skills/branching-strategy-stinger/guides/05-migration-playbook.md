# Migration Playbook: Moving Between Branching Models

**Research sources:** `research/external/2026-03-29-branching-strategies-hotfix-codelit.md` (3-rule migration guidance), `research/external/2026-04-04-tbd-discipline-codecraftdiary.md` (3-rule TBD discipline for active repos).

> TODO: open question - migration playbook depth. The current research corpus has only brief treatments of GitFlow-to-trunk migration in active repos. A targeted search for "GitFlow to trunk-based migration active repo 2025 2026" would produce better source material. The playbook below is based on research available but should be considered a starting point, not a comprehensive guide. (`research/research-summary.md` open question 5)

---

## Key principle: migrate shipping teams without stopping ships

The golden rule of branching model migration: **the team keeps deploying throughout the migration.** Any migration plan that requires a "feature freeze" of more than one sprint is too aggressive.

The migration is a series of incrementally tightened constraints, not a flag-day cutover.

---

## Migration 1: Ad-hoc / no model → GitHub Flow

This is the most common migration. The team has no formal branching conventions and wants to establish GitHub Flow.

**Timeline:** 1-2 days of setup + 1-2 sprints of enforcement.

**Steps:**

1. **Enable main branch protection.** Require PR reviews before merge. Block force-pushes to main. Route the ruleset configuration to `github-repo-health-worker-bee`.
2. **Agree on branch naming conventions.** `feat/`, `fix/`, `chore/`, `hotfix/` prefixes. Enforce with a branch naming lint in CI or a repository ruleset.
3. **Enable squash-merge only** in the repository settings. Disable "Allow merge commits" and "Allow rebase merging" to prevent mixed histories.
4. **Delete branches on merge.** Enable the GitHub "Automatically delete head branches" setting to prevent abandoned branches from accumulating.
5. **Hold a short team sync.** Walk through one example PR end-to-end with the new model. Answer "what do we do if the branch is older than 2 days?" before the first violation happens.

---

## Migration 2: GitFlow → GitHub Flow (most common painful migration)

**Timeline:** 2-4 sprints for active repos.

**Steps:**

1. **Stop creating new `feature/` branches from `develop`.** New feature work starts from `main` with the 2-day branch-lifetime target.
2. **Shorten existing branches.** Review all open feature branches. If any branch is > 5 days old, split it: merge what is ready (behind a feature flag if incomplete), and re-scope the remainder as a smaller next branch.
3. **Introduce feature flags** for any in-progress work that cannot merge in its current state. This is the prerequisite for Step 1 to work.
4. **Merge `develop` into `main` when it is empty.** Once all feature branches have migrated to start from `main`, merge `develop` to `main` and delete `develop`. This is the flag-day moment - coordinate with the release team.
5. **Archive `develop`.** Rename it to `archive/develop-pre-migration-YYYY-MM-DD` and set it to protected/read-only. Do not delete it - the history is auditable.

*Source: "Gradually shorten feature branch lifetimes. Introduce feature flags for incomplete work. Merge develop into main and delete develop once the team is comfortable." - `research/external/2026-03-29-branching-strategies-hotfix-codelit.md`*

**Handle the `release/` and `hotfix/` branches:**
- Existing `release/X.Y.Z` branches: let them complete their current lifecycle normally. Do not merge them to main early.
- After the migration, use the hotfix-as-fast-track-PR model (see `guides/02-release-and-hotfix.md`).

---

## Migration 3: GitHub Flow → Trunk-Based Development

**Prerequisites (must all be true before starting):**

- Feature flag infrastructure is live and the team uses it for ≥ 1 feature already.
- CI runs in < 10 minutes reliably.
- The team is comfortable with the GitHub Flow model (merge conflicts are rare, PRs are small).

**Steps:**

1. **Set a branch-age target of 1 day.** Not 2 - 1. This is the discipline shift that makes TBD real.
2. **Add a branch-age CI check.** Fail the PR (or add a warning comment) if the branch creation date is > 1 day old. This is the fastest feedback loop.
3. **Pair feature flags with every feature that spans > 1 day.** The pattern: merge the first increment behind a flag on day 1, continue on a new branch on day 2.
4. **Graduate to direct commits to main for small changes.** Once the team is comfortable with step 3, encourage committing small changes (typos, config, dependency bumps) directly to main without a branch.
5. **Enforce CI on every commit to main.** Direct commits mean your main protection must be extremely strong: required CI checks that cannot be bypassed by admins for new commits.

*"The three disciplines of TBD: (1) Every engineer merges to main at least daily. (2) Feature flags gate incomplete work. (3) CI is the gatekeeper - no human can merge failing code." - `research/external/2026-04-04-tbd-discipline-codecraftdiary.md`*

---

## Common migration failure modes

| Failure mode | Root cause | Fix |
|---|---|---|
| "We migrated but our branches are still old" | Team adopted the name but not the 2-day constraint | Add branch-age enforcement to CI; make the constraint visible and automatic |
| "We can't merge because the feature isn't done" | Features are too large for the new model | Split features at PR boundaries; use feature flags for incomplete work |
| "We went back to GitFlow after two weeks" | Migration started without team buy-in | Re-run the team sync; make the constraints visible as CI checks, not social norms |
| "`develop` was deleted but now hotfixes are confusing" | Hotfix protocol not established before migration | Implement fast-track PR hotfix process per `guides/02-release-and-hotfix.md` before deleting `develop` |
