# 08 - Issue and PR Templates Audit

*Research basis: `research/external/04-issue-pr-templates-docs.md`*

## Issue templates

**Location:** `.github/ISSUE_TEMPLATE/` (directory with multiple `.md` or `.yml` templates)

Minimum for a healthy repo:
- `bug_report.md` (or `bug_report.yml`) - structured fields for reproduction steps, expected vs. actual behavior, environment
- `feature_request.md` - fields for use case, proposed solution, alternatives considered

A `config.yml` in the template directory can disable blank issues and add external links:
```yaml
blank_issues_enabled: false
contact_links:
  - name: Support
    url: https://support.example.com
    about: Please use support for questions, not issues.
```

## PR template

**Location:** `.github/pull_request_template.md` (single) or `.github/PULL_REQUEST_TEMPLATE/` (multiple, selectable)

Minimum quality signals for the PR template:
- Description / motivation section
- Checklist (tests added, docs updated, breaking changes noted)
- Link to related issue (e.g., `Closes #`)
- Type of change (bug fix, feature, refactor, etc.)

Empty or placeholder PR templates ("Add description here") score 0 for quality and count as missing.

## Scoring rubric

See `research/external/04-issue-pr-templates-docs.md`. Summary:

| Condition | Score |
|---|---|
| Bug + feature issue templates + substantive PR template | 10 |
| Issue templates only (substantive) | 6 |
| PR template only (substantive) | 6 |
| Templates exist but are empty/placeholder | 2 |
| No templates | 0 |

## Report section template

```markdown
### Issue and PR Templates (Score: X/10)

**Issue templates:**
| Template | Present | Substantive? |
|---|---|---|
| Bug report | ✅ | ✅ (has reproduction steps, environment) |
| Feature request | ✅ | ✅ |
| Blank issue | Disabled (config.yml) | N/A |

**PR template:** ✅ Present at `.github/pull_request_template.md`
| Section | Present |
|---|---|
| Description / motivation | ✅ |
| Checklist | ✅ (tests, docs, breaking changes) |
| Related issue link | ✅ |
| Type of change | ❌ Missing |

**Findings:**
- RECOMMEND: Add a "Type of change" section to the PR template (bug fix / feature / refactor / breaking change) - 5 minutes to add.
```
