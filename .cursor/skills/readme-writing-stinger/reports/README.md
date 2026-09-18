# reports/

This folder accumulates past README audit summaries produced by `readme-writing-worker-bee`.

Each audit session may append a dated summary file here in the format:

```
YYYY-MM-DD-{project-name}-readme-audit.md
```

## Audit report shape

Each report contains:

- **Project:** repo name and type (OSS / internal)
- **Date:** ISO date of the audit
- **Checklist result:** the 12-point checklist table from `guides/05-done-checklist.md` with pass/fail/warn per item
- **Changes made:** bullet list of substantive edits
- **Outstanding items:** any gaps acknowledged by the user as "good enough for now" with `TODO:` comments placed in the README

The folder is initially empty. Reports accumulate over time as `readme-writing-worker-bee` processes README audits.
