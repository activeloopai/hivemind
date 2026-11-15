# Open Questions for the User

These surfaced during research and should be confirmed before the Stinger is frozen. Judgment calls I made at forge time are noted; the user can override.

---

## 1. Accessibility and internationalization - in scope?

The Command Brief's IDEAS section asks: "Should the Stinger add accessibility or internationalization as explicit axes, or are they out of scope for now?"

**Forge-time decision (reversible):** Not adding as explicit top-level axes. Both are folded into `guides/07-common-gaps.md` as recurring gap patterns to watch for. If the plan explicitly specifies accessibility or i18n requirements, the Bee audits them under the existing **Completeness** and **Alignment** axes. If the plan is silent and an accessibility issue exists, the Bee flags it as a **Suggestion** under Detrimental Patterns (not Warning, not Critical) - the plan is the contract.

**To escalate:** If you want accessibility elevated to a first-class axis (sixth axis), say so and I'll add `guides/08-accessibility-review.md` and expand the five-axis rubric to six.

---

## 2. Is there existing QA report history to mirror?

Reports now land alongside their source plan (e.g., `library/requirements/features/feature-<###>-<title>/reports/<date>-qa-report.md`) or under `library/qa/<domain>/` for standalone audits, but the original brief was silent on whether prior reports exist to set tone.

**Forge-time decision:** Assumed none exist (or that they should not constrain this Stinger's template). The `templates/qa-report.md` in this skill establishes the convention. If prior reports already exist in the host repo and differ materially, point me at one and I'll reconcile.

---

## 3. Severity anchor - user impact, ship impact, or both?

The industry has two common anchors for Critical severity: user-facing impact (does the user hit it?) vs. ship-blocking impact (is the PR mergeable?).

**Forge-time decision:** Both. `guides/05-severity-classification.md` defines Critical as "must fix - blocks ship," which implies ship-blocking. The rubric adds plan-fidelity as a multiplier: a plan requirement missing is Critical even if the code path is low-traffic, because the plan is the contract. See the guide for the full decision tree.

**To escalate:** If you want severity anchored purely to ship-readiness (ignoring plan-fidelity), the rubric simplifies - let me know.

---

## 4. Python helper script - is Python available in the target environment?

The Command Brief's IDEAS section suggests `scripts/extract-plan-items.py`.

**Forge-time decision:** Shipped as a standalone Python 3 script with only stdlib dependencies (no `pip install` needed). If the host dev environment does not have Python 3 readily available (e.g., pure Windows-without-Python setup), the Bee can still do the extraction manually - the script is an accelerator, not a dependency.

**To escalate:** If you prefer this be authored in Node.js (TypeScript) to match the stack of most host tooling, let me know and I'll port it.

---

## 5. Cross-Bee boundary with `library-worker-bee`

The Command Brief asks: "How does `quality-worker-bee` interact with `library-worker-bee`'s QA concerns? The library-worker-bee explicitly defers QA reports to quality-worker-bee - should the Stinger note this boundary?"

**Forge-time decision:** Yes - `guides/00-principles.md` documents the cross-Bee handoff explicitly, including:
- `library-worker-bee` authors the plan; `quality-worker-bee` audits against it.
- `library-worker-bee` does not produce QA reports; `quality-worker-bee` owns that output.
- When a plan is ambiguous, `quality-worker-bee` does NOT rewrite the plan - it reports the ambiguity and defers to `library-worker-bee` (or the human) to tighten the spec.

If you want the Bee to proactively ping `library-worker-bee` when it finds a plan defect (vs. just flagging it in the report), I'll add an escalation path.
