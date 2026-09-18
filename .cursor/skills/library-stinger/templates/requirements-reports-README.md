---
ai_description: |
  Contains routine code-scan, QA, and security reports NOT tied to any
  specific PRD or IRD. Naming: <YYYY-MM-DD>-<type>-report.md.
  Authored by quality-worker-bee or security-worker-bee.
  Do NOT put per-PRD QA reports here - those go in prd-<###>-<slug>/qa/.
  Do NOT put IRD QA reports here - those go in ird-<###>-<slug>/qa/.
human_description: |
  Routine scan and audit reports not tied to a specific PRD or IRD.
  Examples: weekly security scans, periodic QA sweeps, dependency audits.
  Naming: 2026-05-23-security-scan.md, 2026-06-01-qa-sweep.md.
  Per-PRD QA reports live inside the PRD folder's qa/ subfolder instead.
---

# Requirements - Reports

Routine code-scan and audit reports not tied to any specific PRD.

## Naming

`<YYYY-MM-DD>-<type>-report.md`

Examples:
- `2026-05-23-security-scan.md`
- `2026-06-01-qa-sweep.md`
- `2026-06-15-dependency-audit.md`

## What does NOT belong here

- QA reports for a specific PRD → `requirements/backlog/prd-<###>-<slug>/qa/`
- QA reports for a specific IRD → `issues/backlog/ird-<###>-<slug>/qa/`
