> **DEPRECATED** - per-stinger `reports/` folders have been retired. Reports now live in the host repo's `library/` tree:
>
> - **Feature-tied reports:** `library/requirements/features/feature-<###>-<title>/reports/<date>-<type>-report.md`
> - **Issue-tied reports:** `library/requirements/issues/issue-<###>-<title>/reports/<date>-<type>-report.md`
> - **Standalone audits:** `library/qa/deeplake/<date>-<topic>.md`
> - **ADRs:** `library/architecture/ADR-<n>-<topic>.md`
>
> Templates that used to live here have moved to `../templates/` (see `../templates/audit-template.md`). This stub remains so existing references don't 404 - it can be removed via `git rm` when convenient.
