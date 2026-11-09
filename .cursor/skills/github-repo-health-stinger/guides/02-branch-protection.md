# 02 - Branch Protection and Rulesets Audit

*Research basis: `research/external/01-github-rulesets-docs.md`*

## Context: legacy rules vs. Rulesets (2025 GA)

GitHub Rulesets became generally available in 2025 and are the recommended enforcement mechanism going forward. Legacy branch protection rules still work but lack organization-level cascade, bypassable-actor support, and required-workflow enforcement. Check which system the repo uses and note it in the report.

## Data collection

```bash
# List rulesets (modern)
gh api /repos/{owner}/{repo}/rulesets --jq '.[] | {id, name, enforcement, target}'

# Check rules active on a branch
gh api /repos/{owner}/{repo}/rules/branches/main

# Legacy branch protection (fallback)
gh api /repos/{owner}/{repo}/branches/main/protection
```

## 2026 minimum floor (default branch)

| Rule | Minimum | Nice-to-have |
|---|---|---|
| `required_pull_request` | Required (1+ reviewer) | 2 reviewers for teams > 3 |
| `required_status_checks` | Lint + test + build | Add security-scan stage |
| `non_fast_forward` (block force push) | Required | |
| `dismiss_stale_reviews` | Required | |
| `required_linear_history` | Nice-to-have | Enforces clean history |
| `required_signatures` | Nice-to-have | GPG/SSH signed commits |
| `branch_name_pattern` | Nice-to-have | Enforce naming convention |

## Scoring rubric

| Points | Condition |
|---|---|
| 10 | All minimum rules + 2+ nice-to-have |
| 8 | All minimum rules |
| 6 | `required_pull_request` + `required_status_checks` only |
| 4 | `required_pull_request` only |
| 2 | Default branch exists, no protection |
| 0 | No branch protection at all |

## Report section template

```markdown
### Branch Protection / Rulesets (Score: X/10)

**Enforcement mechanism:** GitHub Rulesets (modern) / Legacy branch protection rules / None

**Default branch (`main`) ruleset:**
| Rule | Status | Notes |
|---|---|---|
| required_pull_request | ✅ Enabled (2 reviewers) | |
| required_status_checks | ✅ Enabled (lint, test, build) | Missing security-scan |
| non_fast_forward | ✅ Enabled | |
| dismiss_stale_reviews | ⚠️ Disabled | Recommend enabling |
| required_linear_history | ❌ Disabled | Low-effort improvement |
| required_signatures | ❌ Disabled | Consider for regulated environments |

**Bypass actors:** @org/platform-leads (admin bypass)

**Findings:**
- RECOMMEND: Enable `dismiss_stale_reviews` - takes 2 minutes in Settings > Branches.
- CONSIDER: Enable `required_linear_history` to enforce clean merge history.
```

## Handoffs

- Required status check gaps (missing CI stages): surface finding, hand to `ci-release-worker-bee` for CI architecture.
- Force-push incident investigation: hand to `security-worker-bee