---
source_type: official_docs
authority: high
relevance: branch_protection
topic: GitHub Rulesets GA (2025)
url: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets
fetched: 2026-05-20
---

# GitHub Rulesets - Synthesis

## Key facts for guides/02-branch-protection.md

**Rulesets GA (2025):** GitHub Rulesets became generally available in 2025 as the recommended replacement for legacy branch protection rules. Key differences:

- **Layered enforcement:** Rulesets can be applied at the organization or repository level. Organization-level rulesets cascade to all repos.
- **Bypassable actors:** Rulesets support explicit bypass lists (users, teams, apps) that can override enforcement - legacy rules had no equivalent.
- **Required workflows:** Rulesets can require specific GitHub Actions workflows to pass as status checks, decoupled from branch-specific status check lists.
- **Rule types available (2026):**
  - `required_signatures` (signed commits)
  - `required_linear_history` (no merge commits)
  - `required_pull_request` (must open PR before merging)
  - `required_status_checks` (must pass named checks or required workflows)
  - `non_fast_forward` (no force pushes)
  - `required_deployments` (deployment environments must succeed)
  - `tag_name_pattern` (enforce tag naming conventions)
  - `branch_name_pattern` (enforce branch naming conventions)

## 2026 best-practice floor for a healthy repo

Minimum ruleset on the default branch (`main`):
- `required_pull_request` with at least 1 required reviewer (teams with >3 engineers: 2 reviewers)
- `required_status_checks` with at least: linting, test suite, build
- `non_fast_forward` (block force pushes to main)
- `dismiss_stale_reviews` (re-request review when new commits push)

Nice-to-have (high-value, low-friction):
- `required_linear_history` (enforces clean squash/rebase history)
- `required_signatures` (enforce GPG or SSH signed commits)

## API surface for data collection

```
GET /repos/{owner}/{repo}/rulesets
GET /repos/{owner}/{repo}/rules/branches/{branch}
gh ruleset list --repo owner/repo
```

## Scoring rubric (used in audit report)

| Points | Condition |
|---|---|
| 10 | All minimum + at least 2 nice-to-have rules active |
| 8 | All minimum rules active |
| 6 | required_pull_request + required_status_checks only |
| 4 | required_pull_request only |
| 2 | Default branch exists but no ruleset |
| 0 | No branch protection of any kind |
