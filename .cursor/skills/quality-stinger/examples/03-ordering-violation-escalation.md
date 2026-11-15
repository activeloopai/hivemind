# Example 03, Ordering Violation (Invoked Before `security-worker-bee`)

Demonstrates the Bee's behavior when it detects it was invoked before `security-worker-bee` ran. The Bee does NOT proceed with a full audit, it writes a short ordering-violation report and halts.

**Illustrates guides:** `00-principles.md` rule #6 (Run after `security-worker-bee`, never before).

---

## Input, Invocation context

User's message:

> "Hey, can you QA the work on the new admin export feature? I'm in a hurry, let's skip security this time."

Plan file: `library/requirements/features/feature-021-admin-export/prd-feature-021-admin-export.md` (exists, covers an admin data-export feature).

Diff: ~240 lines across 6 files, including a new MCP tool handler and a Deep Lake dataset write.

Signals detected:

- No security report exists in `library/requirements/features/feature-021-admin-export/reports/` (e.g., `<date>-security-report.md`).
- No commits on the branch with `security:` prefix or mentions of `security-worker-bee`.
- The user's message explicitly says "skip security."

---

## Output, Ordering-Violation Report

Written to `library/requirements/features/feature-021-admin-export/reports/2026-04-24-qa-report.md`.

```markdown
# QA Report: feature-021 admin-export, ORDERING VIOLATION

**Plan document:** `library/requirements/features/feature-021-admin-export/prd-feature-021-admin-export.md`
**Audit date:** 2026-04-24
**Base branch:** `main`
**Head:** `feat/admin-export`
**Auditor:** quality-worker-bee
**Status:** HALTED, security-worker-bee has not run

## Summary

This audit was halted because `security-worker-bee` has not run against this implementation. `quality-worker-bee` runs after `security-worker-bee` in the plan -> implement -> security -> QA loop; inverting the order wastes the QA pass, because security fixes routinely invalidate the QA snapshot (e.g., a security fix tightens the pre-tool-use gate, which `quality-worker-bee` already verified). The feature touches a new MCP tool handler and a Deep Lake dataset write, both of which are exactly the surface area a security review must cover first.

## Recommended next step

1. Invoke `security-worker-bee` against this branch.
2. Address any Critical security findings.
3. Re-invoke `quality-worker-bee`. The full QA audit will run at that point.

## Why the "skip security" request was not honored

The ordering constraint is absolute per the `quality-worker-bee` principles (see the Bee's guide `00-principles.md`). "In a hurry" is the most common reason security is skipped, and it's also the most common reason post-deploy security incidents happen. Running QA on an un-securitied implementation produces a false-confidence green scorecard that masks real risk. If a security review is genuinely blocked (e.g., `security-worker-bee` itself is broken), escalate that, don't route around it.

## What was NOT audited

- Completeness against `library/requirements/features/feature-021-admin-export/prd-feature-021-admin-export.md`: not evaluated.
- Correctness of the implementation: not evaluated.
- Traceability table: not produced.
- Files Changed summary: not produced.

A full QA report will be generated when `security-worker-bee` has completed and this skill is re-invoked.

## Signals detected

- No security report present in `library/requirements/features/feature-021-admin-export/reports/`.
- No commits on `feat/admin-export` with a `security:` prefix or `security-worker-bee` mention.
- Invoking user requested "skip security this time."
```

---

## Why the audit looks this way

- **Halt instead of audit.** `guides/00-principles.md` rule #6 says: "If the Bee detects it was invoked first, it flags the ordering violation and recommends re-running after security fixes land." This is that behavior.
- **Short report, not skipped entirely.** A missing report is indistinguishable from a missing audit (`00-principles.md` rule #4). Writing the ordering-violation report gives the invoker a paper trail.
- **Does not override the user.** The user asked to skip security. The Bee refused, kindly but firmly. This is one of the few places the Bee overrides user instructions, and the reason is in the report.
- **No traceability table.** Because the full audit did not run, the table would be misleading (either empty or half-filled). Explicitly stating "not produced" is more honest than producing a partial table.
- **Filename matches a normal QA report.** `library/requirements/features/feature-021-admin-export/reports/2026-04-24-qa-report.md`, a re-run on the same date appends a slug suffix (per `guides/06-report-writing.md`); a re-run on a later date produces a sibling file. The title line makes the halt obvious either way.
