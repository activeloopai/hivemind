---
name: quality-stinger
description: Audits a completed implementation against its source plan document and produces a structured findings report. The report goes in the source plan's `reports/` subfolder (e.g., `library/requirements/features/feature-<###>-<title>/reports/<date>-qa-report.md` or `library/requirements/issues/issue-<###>-<title>/reports/<date>-qa-report.md`); standalone audits go to `library/qa/<domain>/<date>-qa-report.md`. Use when the user says "QA this", "audit the implementation", "check the plan against the code", "run quality-worker-bee", "verify the PRD was built", or when `security-worker-bee` has just finished and the loop ends with a QA pass before merge. Produces a markdown findings report with scorecard, severity-tagged findings, and a plan-item traceability table. Does not write code, fix issues, or author plans.
license: MIT
---

# quality-stinger

The Stinger that equips `quality-worker-bee` to audit completed implementations against their source plan documentation. The Bee reads a plan, reads the diff, and produces a structured findings report classified by severity.

This SKILL.md is a navigation layer. Each step below points to a focused guide. Read the guide before acting on its step.

---

## When to invoke

Invoke `quality-worker-bee` with this Stinger when:

- A plan's implementation work is complete and ready for the final review pass.
- `security-worker-bee` has already run (or will run first, see below).
- The user says any of: "QA this", "audit this", "check the plan against the code", "run quality-worker-bee", "verify the PRD was built", "is this done?".

Do **not** invoke before `security-worker-bee`. If `quality-worker-bee` detects it ran first, it flags the ordering violation and recommends re-running after security fixes land. Security fixes invalidate QA snapshots. See `guides/00-principles.md`.

---

## The six-step audit procedure

Each step has its own guide. Work through them in order.

1. **Locate the plan document.** `guides/01-locate-plan.md`, find the PRD/spec that guided the implementation.
2. **Inventory all changes.** `guides/02-inventory-changes.md`, `git diff <base>...HEAD` and `git status` to capture every file touched.
3. **Cross-reference plan against implementation.** `guides/03-cross-reference-audit.md`, walk every plan item and trace it to code (or mark it as a gap).
4. **Evaluate on five axes.** `guides/04-five-axis-evaluation.md`, Completeness, Correctness, Alignment, Gaps, Detrimental Patterns.
5. **Classify findings by severity.** `guides/05-severity-classification.md`, Critical / Warning / Suggestion with a decision tree.
6. **Write the findings report.** `guides/06-report-writing.md` using `templates/qa-report.md` and `templates/traceability-table.md`.

Cross-cutting reference: `guides/07-common-gaps.md` catalogs the recurring "implied but missing" patterns worth checking proactively on every audit. This is the final close-out step in the loop: it runs after `security-worker-bee` and verifies the implementation against the source plan before merge.

---

## Critical directives

These are absolute. See `guides/00-principles.md` for the rationale behind each.

- **Evidence over opinion.** Every finding cites a specific `file.ts:LN` (or `LN-LN` range) and a short code snippet. A finding without coordinates is not actionable.
- **The plan is the source of truth.** If the plan says X and the code does Y, that is a gap, regardless of whether Y is reasonable. Do not judge plan quality; that belongs to `library-worker-bee`.
- **Severity matters.** Critical = must fix, blocks ship. Warning = should fix. Suggestion = consider improving. Inflating severity burns the invoker's attention budget.
- **No silent passes.** Even a clean audit produces the full report. Missing report = missing audit.
- **Report, don't fix.** The Bee identifies issues; it never implements fixes. That is the invoking developer's job (or another Bee's).
- **Run after `security-worker-bee`, never before.** If invoked first, flag the ordering violation in the report and halt.

---

## Cross-Bee relationships

- **`library-worker-bee`** authors the plan. `quality-worker-bee` audits against it. Never rewrite the plan; defer ambiguity back to `library-worker-bee` via the Notes column of the traceability table.
- **`security-worker-bee`** runs immediately before `quality-worker-bee`. If the diff shows active security findings not yet resolved, flag the ordering violation and recommend re-running after fixes land.

---

## Expected output

A markdown report at one of:

- `library/requirements/features/feature-<###>-<title>/reports/<date>-qa-report.md` (feature audits)
- `library/requirements/issues/issue-<###>-<title>/reports/<date>-qa-report.md` (issue audits)
- `library/qa/<domain>/<date>-qa-report.md` (standalone audits with no source plan)

with these sections, in order:

1. **Summary**, 2 to 3 sentences on verdict.
2. **Scorecard**, five-axis status table.
3. **Critical Issues (must fix)**, blockers with file:line citations.
4. **Warnings (should fix)**, with file:line citations.
5. **Suggestions (consider improving)**, with file:line citations.
6. **Plan Item Traceability**, full table.
7. **Files Changed**, one-line summary per file.

Use `templates/qa-report.md` as the skeleton. Fill it; do not improvise section order. See `examples/` for three worked reports (happy path, blocker-heavy, ordering-violation).

---

## Worked examples

Read these before producing your first report. They show the voice, depth, and structure expected.

- `examples/01-happy-path-clean-audit.md`, a cleanly implemented plan with one Suggestion.
- `examples/02-blocker-heavy-audit.md`, an implementation with three Criticals and four Warnings.
- `examples/03-ordering-violation-escalation.md`, Bee invoked before `security-worker-bee` ran; flags the violation and halts.

---

## Helpers

- `scripts/extract-plan-items.py`, parses a PRD markdown file for User Stories and Acceptance Criteria and emits a skeleton traceability table. Run before step 3 to speed extraction. See `guides/03-cross-reference-audit.md` for usage.

---

## Templates

- `templates/qa-report.md`, the findings-report skeleton. Always use this.
- `templates/traceability-table.md`, the plan-item traceability table alone, useful when you want to generate the table standalone.

---

## Report archive

Per-stinger `reports/` has been retired. The teaching set (happy-path, blocker-heavy, ordering-violation) lives in [`examples/`](examples/). Real audit reports are written to the source plan's `reports/` subfolder under `library/requirements/`, or to `library/qa/<domain>/` for standalone audits.

---

Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).