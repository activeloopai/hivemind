# Example: TypeScript Library Team Migrating from Ad-hoc to GitHub Flow

**Guides demonstrated:** `guides/00-principles.md`, `guides/01-model-selection.md`, `guides/02-release-and-hotfix.md`

---

## Input

> "We're a 12-engineer team building an open-source TypeScript/Node library that ships to npm. We cut a release whenever we're ready, roughly 2-3 times a week. Right now, everyone just works on whatever branch they want - some are weeks old, and we get nasty merge conflicts. We have no formal branching policy. We want to fix this."

---

## What branching-strategy-worker-bee does

**1. Assess the current model.**

No formal model. Branch ages suggest long-lived-branch trap. 12 engineers with 2-3 releases/week = continuous-ish delivery cadence. The library ships a single supported major line to npm, so no multi-version requirement. Feature flag infrastructure: unknown - need to ask.

*Question asked:* "Are you using any feature flags today (LaunchDarkly, Unleash, home-grown, etc.)?"

*Team answers:* "No, nothing like that."

**2. Apply the decision tree (from `guides/01-model-selection.md`):**

- Multi-version support? No.
- Feature flag infra? No.
- Team size? 12.
- Cadence? Continuous-ish.

Result: **GitHub Flow** is the correct model. TBD is ruled out (no flag infra). GitFlow is ruled out (single supported major line, no multi-version).

**3. Diagnose pain points:**

- "Merge conflicts on every PR" -> long-lived branches (> 2 working days). Primary fix: enforce the 2-day rule via branch protection warnings and team norm.
- "Some branches are weeks old" -> features are too large OR team lacks PR review culture. Ask: "What's blocking those branches from merging?"
- *Team answers:* "The features are half-done - we don't want to ship incomplete code."

**4. Deliver the feature-flag insight (from `guides/04-feature-flag-vs-branch.md`):**

> "The root cause is that your features are scoped too large for short-lived branches, and you don't have feature flags to hide incomplete work. Here's your choice: either scope each PR to something completable in 2 days, OR introduce a lightweight feature flag for any feature that spans more than 2 days.

> For your team's size, I'd recommend starting without a flag system - just split features into smaller PRs. If after 4 weeks you still have branches that need to span multiple days, then introduce a simple feature flag solution."

**5. Recommend the migration (from `guides/05-migration-playbook.md`, Migration 1):**

> "Here's your 2-day setup plan:
>
> 1. Enable main branch protection: require 1 PR review, block force-push, block direct commits to main.
> 2. Enable squash-merge only: disable merge commits and rebase-merges in repository settings.
> 3. Enable auto-delete head branches on merge.
> 4. Adopt naming: `feat/`, `fix/`, `chore/`, `hotfix/`.
> 5. Hold a 30-min team sync and walk through one example PR together.
>
> The 2-working-day rule is the only social norm you need to enforce. Branch older than 2 days = split the PR or add a feature flag."

**6. Produce the policy document (from `templates/branching-policy.md`):**

Output: a filled-in `docs/engineering/branching-policy.md` committed to the repo, covering the above decisions.

---

## Output (abbreviated policy document excerpt)

```markdown
# Branching Policy

**Model:** GitHub Flow
**Date adopted:** 2026-05-20
**Owner:** Engineering Lead

## Core rules
- `main` is always deployable.
- All work happens on feature branches.
- Target branch lifetime: ≤ 2 working days.
- Merge strategy: squash-merge only.
- Every branch requires 1 PR review before merge.
- Delete branches on merge (auto-enabled in GitHub settings).

## Naming
- `feat/short-description` - new feature
- `fix/short-description` - bug fix
- `chore/short-description` - maintenance
- `hotfix/short-description` - production emergency

## Hotfix process
Fast-track PR to main. Label: hotfix. Required: 1 expedited review. Deploy immediately after merge.

## Branch protection (configure in GitHub - route to github-repo-health-worker-bee)
- Require PR review: 1
- Dismiss stale reviews: yes
- Require status checks: [ci-pass]
- Block force-push: yes
- Block deletions: yes
```

---

## Notes

This example demonstrates the ~80% case. The key insight the Bee delivers that the team didn't ask for is the feature-flag explana