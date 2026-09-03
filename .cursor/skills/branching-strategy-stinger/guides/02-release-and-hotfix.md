# Release and Hotfix Patterns

**Research sources:** `research/external/2026-03-29-branching-strategies-hotfix-codelit.md` (primary - hotfix step-by-step, release branch rules), `research/external/2026-02-17-release-branch-pattern-azure-devops.md` (cherry-pick-back pattern, Azure DevOps official), `research/external/2026-05-20-release-hotfix-branch-patterns.md` (2026 synthesis).

**Example:** `examples/happy-path-github-flow.md` (hotfix in GitHub Flow context)

---

## Release branches (GitFlow and GitHub Flow with releases)

A release branch is cut from the integration branch (`develop` in GitFlow, `main` in GitHub Flow) when the team enters a release-candidate phase. Its purpose is to isolate stabilization work from ongoing feature development.

**Rules (non-negotiable):**

1. **Bug fixes only.** Never merge new features into a release branch. Feature freeze is enforced the moment the branch is cut.
2. **Back-merge every fix.** Every commit merged into a release branch MUST be back-merged (or cherry-picked) to the integration branch to prevent regression. Automate this check with CI.
3. **Name consistently.** Use `release/2.4.0` (semantic version) or `release/2026-03-29` (date-based) - pick one format and enforce it.
4. **Tag at merge.** When the release branch merges to main, create a version tag (`v2.4.0`) at that commit.
5. **Delete after EOL.** Delete release branches after the associated version reaches end-of-life to prevent confusion.

**In TBD / GitHub Flow without versioned releases:** If the team deploys from main on every merge, a dedicated release branch is rarely needed. Instead:
- Tag the commit being deployed: `git tag -a v1.2.3 -m "Release 1.2.3"`
- If a "release freeze" window is needed, use a deployment lock mechanism (feature flag, environment-level hold), not a branch.

---

## Standard hotfix process (GitFlow model)

When a production bug requires an emergency fix that cannot wait for the next regular release:

1. **Branch from the production tag.** `git checkout -b hotfix/fix-description v2.4.0` - NOT from develop. You want to apply the fix to what is live, not to whatever is in develop.
2. **Apply the minimal fix.** Do not bundle unrelated changes. The hotfix should be the smallest possible diff that resolves the production issue.
3. **Run the full test suite.** CI must pass on the hotfix branch before any merge. Hotfix urgency does not justify skipping tests.
4. **Merge to main AND to develop.** First merge to main and tag a new patch version (`v2.4.1`). Then merge (or cherry-pick) to develop to prevent regression in the next planned release.
5. **Notify the release branch (if active).** If a `release/2.5.0` branch is currently in stabilization, cherry-pick the hotfix there too.

**Source:** `research/external/2026-03-29-branching-strategies-hotfix-codelit.md`

---

## Simplified hotfix for GitHub Flow / TBD teams

In trunk-based or GitHub Flow teams, hotfix branches are usually unnecessary:

1. **Open a PR to main.** Label it `hotfix` and mark it for expedited review.
2. **Request at least one review.** Expedite does not mean skip. One review of a small diff takes minutes.
3. **Merge and deploy immediately.** CI must pass. Deploy right after merge.
4. **Protect against regression.** If the bug exposed a missing test, add it in the same PR.

"In trunk-based development, a hotfix is simply a fast-tracked PR to main with an expedited review." - `research/external/2026-03-29-branching-strategies-hotfix-codelit.md`

---

## Cherry-pick-back discipline

Cherry-picking back hotfixes to the integration branch is the most commonly skipped step and the most common source of regressions:

- If the fix resolves a crash in `v2.4.0`, the same crash exists in `develop` unless you cherry-pick back.
- Use CI automation: add a branch protection rule that requires a matching commit SHA or a linked PR in develop before closing the hotfix branch.
- If cherry-pick produces conflicts, resolve them immediately - do not defer. The longer you wait, the harder the resolution.

**Source:** `research/external/2026-02-17-release-branch-pattern-azure-devops.md`

---

## GitHub Merge Queue and releases

For teams running GitHub Merge Queue, release branches interact with the queue in a specific way:

- The merge queue targets a specific base branch. If you want the queue for both `main` and `release/2.4.0`, you need separate queue configurations per branch.
- For hotfixes, bypass the queue if the fix is urgent and the queue has significant depth - use the "Skip queue" option with admin approval, not the "jump to front" option (which triggers a full rebuild of all in-flight PRs).

See `guides/06-merge-queue.md` for full queue configuration.

---

## Release cadence and model alignment

| Cadence | Recommended model | Release branch needed? |
|---|---|---|
| Continuous (multiple/day) | TBD or GitHub Flow | Rarely - tag on deploy |
| Sprint (bi-weekly) | GitHub Flow | Sometimes - if sprint has a review/UAT phase |
| Quarterly / versioned | GitFlow or GitHub Flow + release branch | Yes - cut on feature freeze |
| Hotfix-heavy | GitHub Flow + hotfix process | Optional - fast-track PR is usually sufficient |
