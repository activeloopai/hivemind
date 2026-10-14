# 01 - Branching Strategy Audit

*Research basis: `research/external/09-trunk-based-development.md`*

## What to assess

Branching strategy is assessed qualitatively rather than scored. Produce a narrative section in the report that answers:

1. What strategy is the team using in practice (observed from branch names and merge patterns)?
2. Is it documented anywhere (CONTRIBUTING.md, wiki, ADR)?
3. Is practice consistent with documentation?
4. What is the stale branch count, and what is the oldest stale branch age?

## Strategy signatures (observable from the repo)

| Strategy | Branch pattern evidence |
|---|---|
| **Trunk-based development (TBD)** | Short-lived feature branches (< 2 days old at merge), very few open branches, frequent merges to `main` |
| **GitHub Flow** | Feature branches from `main`, PR-based merges, no `develop` branch |
| **Gitflow** | `develop`, `release/`, `hotfix/`, `feature/` branches; `main` is release-only |
| **Ad-hoc (no strategy)** | Mixed branch naming, long-lived branches (> 2 weeks), orphaned branches |

## Data collection

```bash
# Branch count and names (gh CLI)
gh api /repos/{owner}/{repo}/branches --paginate --jq '.[].name'

# Stale branches (branches not updated in 30+ days)
git for-each-ref --format='%(refname:short) %(committerdate:iso8601)' refs/remotes/origin | \
  awk '$2 < "'$(date -d "30 days ago" +%Y-%m-%d)'"'

# Open PRs age
gh pr list --state open --json title,createdAt --jq '.[] | {title, age: (now - (.createdAt | fromdateiso8601) | . / 86400 | floor)}'
```

## Narrative structure for the report

```markdown
### Branching Strategy

**Observed strategy:** GitHub Flow (feature branches from main, no develop branch)
**Documented strategy:** Yes (CONTRIBUTING.md §2) / No

**Branch inventory:**
- Total branches: 12
- Open feature branches: 4 (avg age: 3 days)
- Stale branches (> 30 days): 2 (oldest: 47 days - `feat/old-analytics-refactor`)

**Assessment:** Practice is consistent with GitHub Flow. Two stale branches warrant cleanup.
**Recommendations:**
1. Delete or close stale branches (`feat/old-analytics-refactor`, `chore/dep-audit-jan`).
2. Consider adding a branch naming convention to CONTRIBUTING.md to enforce `feat/`, `fix/`, `chore/` prefixes.
```

## Handoffs

- Stale branch cleanup: human action (no Bee owns branch deletion).
- Branch naming convention enforcement (via Rulesets `branch_name_pattern`): see `guides/02-branch-protection.md`.
