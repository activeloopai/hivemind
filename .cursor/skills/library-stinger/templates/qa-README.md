# library/qa/

QA reports - audits that verify an implementation against its source plan.

## Where reports live

- **Tied to a feature:** `library/requirements/features/feature-<###>-<title>/reports/<date>-qa-report.md`
- **Tied to an issue:** `library/requirements/issues/issue-<###>-<title>/reports/<date>-qa-report.md`
- **Standalone (no source plan):** `library/qa/<domain>/<date>-qa-report.md` - this folder.

When the audit is tied to a feature or issue, the report lands inside that doc's `reports/` subfolder so the plan and its evidence travel together (especially when the feature folder later moves to `features/completed/`).

This folder (`library/qa/`) is reserved for **standalone audits** - broad sweeps that do not map to a single feature or issue. Group them by domain (e.g., `auth/`, `payments/`, `seo/`).

## Filename

```
<YYYY-MM-DD>-qa-report.md
```

If two audits run on the same date in the same domain, suffix the second with a slug: `2026-04-26-qa-report-post-security-fixes.md`.

## Report structure

Every QA report:

1. **Header** with auditor, date, plan source, commit range, verdict.
2. **Summary** with finding counts by severity.
3. **Acceptance criteria matrix** - every AC from the plan, with code evidence and status (Pass / Fail / Partial).
4. **Findings** - one entry per defect, with severity, location, what, why it matters, recommendation.
5. **Evidence appendix** - test results, lint output, key diffs.
6. **Verdict** - Pass | Pass with findings | Fail.
7. **Next steps** - concrete follow-up actions.
8. **Related** - link the plan, related issues, follow-up QA reports.

## Severity scale

- **Critical** - blocks merge. Data loss, security exposure, P0/P1 AC failed.
- **High** - must fix before calling it done. Missing AC, missing test for key path, obvious bug.
- **Medium** - should fix. Observability gap, error-handling miss, style inconsistency.
- **Low** - nice to have. Dead code, minor naming, doc polish.
- **Info** - no action. Observation for context.

## Authorship and workflow

QA reports - wherever they land - are authored by the **`quality-worker-bee`** agent (`.cursor/agents/quality-worker-bee.md`), not by `library-worker-bee`. The `library-worker-bee` agent owns the surrounding folder structure (the `reports/` subfolders inside feature/issue folders, this `library/qa/` tree, and the domain subfolders) - but the audit content itself (findings, verdict, acceptance-criteria matrix) is produced by `quality-worker-bee`.

Typical flow:

1. **Trigger** - user says "write a QA report for <plan>" or "audit this implementation".
2. **Handoff** - `library-worker-bee` (if invoked) hands off to `quality-worker-bee`.
3. **Audit** - `quality-worker-bee` walks through the plan, matches against `git diff`, files findings, writes the report to the matching path:
   - Feature audit → `library/requirements/features/feature-<###>-<title>/reports/<date>-qa-report.md`
   - Issue audit → `library/requirements/issues/issue-<###>-<title>/reports/<date>-qa-report.md`
   - Standalone audit → `library/qa/<domain>/<date>-qa-report.md`
4. **Archive** - feature reports follow the feature folder when it moves to `features/completed/`. Standalone reports stay in `library/qa/<domain>/`.

See the `quality-worker-bee` agent (`.cursor/agents/quality-worker-bee.md`) for the full authoring workflow and report format.

## Invariants

- Every finding cites a file + line range.
- Every report has a clear verdict.
- Every feature/issue folder has a `reports/` subfolder (even when empty).
