# Internal: Stinger Scope Boundaries

## What branching-strategy-stinger OWNS

| Topic | Owned by this stinger |
|---|---|
| Branching model selection (TBD vs GitHub Flow vs GitLab Flow vs GitFlow) | Yes |
| Model-selection decision tree (team size, release cadence, environment count, maintenance obligations) | Yes |
| Release branch lifecycle (cut, stabilize, tag, merge back) | Yes |
| Hotfix branch protocol (cut from tag, merge to main and to current release branch) | Yes |
| Feature-flag vs feature-branch trade-off decision | Yes |
| Long-lived-branch trap definition, threshold (2 working days), and anti-pattern catalog | Yes |
| Merge-vs-rebase strategic choice (when to use each) | Yes |
| Branching policy document template (naming conventions, merge strategy, protected-branch rules, hotfix/release process) | Yes |
| GitHub Merge Queue conceptual setup and when to use it | Yes |
| GitLab Merge Trains conceptual overview | Yes |
| Migration playbook (GitFlow → GitHub Flow → TBD) | Yes |

## What branching-strategy-stinger DOES NOT OWN

| Topic | Owned by whom |
|---|---|
| Rebase mechanics (interactive rebase, squash, fixup, reword) | git-worker-bee |
| Conflict resolution mechanics | git-worker-bee |
| History rewriting (git filter-repo, BFG) | git-worker-bee |
| Git hook script authoring (Husky, lefthook) | git-worker-bee |
| Branch protection ruleset configuration in GitHub/GitLab UI | github-repo-health-worker-bee |
| CI/CD pipeline topology and pipeline-as-code authoring | ci-release-worker-bee |
| Feature flag platform setup and SDK integration | (generic platform setup) |
| Release communication / changelogs | changelog-release-notes-worker-bee |

## Key cross-references for stinger-forge

- `git-worker-bee` stinger: for rebase/merge mechanics that feed into merge strategy decisions
- `github-repo-health-worker-bee` stinger: for branch protection ruleset setup that enforces the chosen model
- `ci-release-worker-bee` stinger: for CI/CD pipeline shape that enables TBD (fast tests, deployment gates)
- `changelog-release-notes-worker-bee` stinger: for the release communication step downstream of the release branch lifecycle

## Routing rules in the SKILL.md
The stinger must include explicit routing rules:
1. "If the user asks HOW to rebase or resolve a conflict → route to git-worker-bee"
2. "If the user asks HOW to configure branch protection in GitHub settings → route to github-repo-health-worker-bee"
3. "If the user asks HOW to speed up their CI pipeline → route to ci-release-worker-bee"
4. "If the user asks WHICH branch protection settings to use → answer using this stinger, then hand off to github-repo-health-worker-bee for implementation"
