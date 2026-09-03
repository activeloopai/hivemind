# 09 - Repository Settings Audit

*Research basis: `research/external/05-repo-security-settings.md`, `research/external/10-auto-delete-merge-settings.md`*

## Settings to audit

### Merge settings (Settings > General > Pull Requests)

| Setting | Recommended | Why |
|---|---|---|
| Allow merge commits | Disable | Merge commits pollute history; prefer squash or rebase |
| Allow squash merging | Enable | Clean, linear history per feature |
| Allow rebase merging | Enable (optional) | Replays commits cleanly; preserves granular CC history |
| Automatically delete head branches | Enable | Eliminates stale branch accumulation |
| Allow auto-merge | Enable | Allows PRs to self-merge when all checks pass; reduces toil |
| Always suggest updating branches | Enable | Reduces merge conflicts |

### Security settings (Settings > Security / Code security)

| Setting | Recommended | Why |
|---|---|---|
| Secret scanning | Enable | Detects committed secrets |
| Push protection | Enable | Blocks pushes containing detected secrets |
| Dependency review | Enable (GitHub Advanced Security or public repos) | Blocks vulnerable dependency introductions |
| Dependabot alerts | Enable | Alerts on known vulnerable dependencies |
| Dependabot security updates | Enable | Auto-opens PRs to fix vulnerable deps |
| Dependabot version updates | Configure (`.github/dependabot.yml`) | Keeps dependencies current |

## Data collection

```bash
# Repository settings (requires API with repo scope)
gh api /repos/{owner}/{repo} --jq '{
  delete_branch_on_merge,
  allow_merge_commit,
  allow_squash_merge,
  allow_rebase_merge,
  allow_auto_merge
}'

# Security settings
gh api /repos/{owner}/{repo} --jq '{
  has_issues,
  security_and_analysis
}'
```

## Scoring rubric

See `research/external/05-repo-security-settings.md`. Summary:

| Condition | Score |
|---|---|
| Auto-delete on + squash/rebase only + secret scanning + push protection + dependency review | 10 |
| Auto-delete + secret scanning + push protection | 7 |
| Auto-delete on, security settings configured | 5 |
| All three merge types allowed, no auto-delete, no security settings | 3 |
| Completely default settings | 2 |

## Report section template

```markdown
### Repository Settings (Score: X/10)

**Merge settings:**
| Setting | Status | Recommendation |
|---|---|---|
| Allow merge commits | ✅ Enabled | RECOMMEND disabling - prefer squash/rebase only |
| Allow squash merging | ✅ Enabled | Good |
| Allow rebase merging | ✅ Enabled | Good |
| Auto-delete head branches | ❌ Disabled | RECOMMEND enabling (effort: 30 seconds) |
| Allow auto-merge | ❌ Disabled | CONSIDER enabling for teams with strong CI |

**Security settings:**
| Setting | Status | Recommendation |
|---|---|---|
| Secret scanning | ✅ Enabled | |
| Push protection | ✅ Enabled | |
| Dependency review | ❌ Disabled | RECOMMEND enabling - requires GitHub Advanced Security or public repo |
| Dependabot alerts | ✅ Enabled | |
| Dependabot security updates | ⚠️ Disabled | RECOMMEND enabling |

**Findings (ranked by priority):**
1. Enable auto-delete-head-branches - Settings > General > Pull Requests (effort: 30 seconds, impact: eliminates stale branch accumulation).
2. Disable "allow merge commits" - enforce squash or rebase only.
3. Enable Dependabot security updates to auto-fix known CVEs.
```
