---
source_type: official_docs
authority: high
relevance: templates
topic: GitHub Issue/PR templates and community health files
url: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests
fetched: 2026-05-20
---

# GitHub Issue/PR Templates - Synthesis

## Issue templates location

`.github/ISSUE_TEMPLATE/` directory - supports multiple templates (bug_report.md, feature_request.md, etc.)

YAML front matter per template:
```yaml
---
name: Bug Report
about: Report a reproducible bug
title: "[BUG] "
labels: bug
assignees: ''
---
```

## PR template location

`.github/pull_request_template.md` (single template) or `.github/PULL_REQUEST_TEMPLATE/` (multiple)

## Community health files (score for docs presence)

| File | Location | Purpose |
|---|---|---|
| `README.md` | Root | Project overview |
| `CONTRIBUTING.md` | Root or `.github/` | How to contribute |
| `CODE_OF_CONDUCT.md` | Root or `.github/` | Community standards |
| `SECURITY.md` | Root or `.github/` | Security disclosure policy |
| `LICENSE` | Root | Legal terms |
| `SUPPORT.md` | Root or `.github/` | Where to get help |
| `CODEOWNERS` | Root, `.github/`, or `docs/` | Code ownership |

## Scoring rubric

| Templates dimension | Score |
|---|---|
| Issue template(s) + PR template, all substantive | 10 |
| Issue template(s) only, substantive | 7 |
| PR template only, substantive | 6 |
| Templates exist but are empty/placeholder | 3 |
| No templates | 0 |

| Docs presence dimension | Score |
|---|---|
| README + CONTRIBUTING + SECURITY + LICENSE + CODE_OF_CONDUCT | 10 |
| README + CONTRIBUTING + LICENSE | 7 |
| README + LICENSE | 5 |
| README only | 3 |
| No README | 0 |
