> **DEPRECATED** - per-stinger `reports/` folders have been retired. Security audit reports now live in the host repo's `library/` tree:
>
> - **Feature-tied audits:** `library/requirements/features/feature-<###>-<title>/reports/<date>-security-audit.md`
> - **Issue-tied audits:** `library/requirements/issues/issue-<###>-<title>/reports/<date>-security-audit.md`
> - **Standalone audits:** `library/qa/security/<date>-security-audit.md`
>
> The audit-report template lives at [`../templates/security-audit-report.md`](../templates/security-audit-report.md). Deterministic scan outputs from `../scripts/scan.sh` are ephemeral - re-create per audit; don't commit. This stub remains so existing references don't 404 - it can be removed via `git rm` when convenient.
