# 05, Severity Classification

The Command Brief uses three tiers: Critical / Warning / Suggestion. This guide turns that into a decision tree so classification is reproducible across audits.

Anchoring source: industry bug-severity norms (`research/2026-04-24-bug-severity-levels.md`), adapted for plan-relative auditing.

---

## The three tiers

### 🔴 Critical (must fix, blocks ship)

Use when **any one** of the following is true:

1. **Plan-required behavior is missing or broken.** A user story, acceptance criterion, or explicit requirement from the plan is not met and the feature cannot function as specified.
2. **User-visible breakage.** A core flow (search, embed, retrieval, MCP tool dispatch, the primary feature) does not work under normal input.
3. **Data-integrity risk.** Code path can corrupt, lose, or expose data, e.g., a missing gate on a state-changing tool call, a partition/scope leak, unvalidated input reaching a dataset write.
4. **Security smell (obvious).** Hardcoded secret or API key, `eval` of user-supplied code, `child_process` exec on unescaped input, a tool call that bypasses the pre-tool-use gate.
5. **Production regression.** Modified function's callers (visible in grep, unmodified in diff) now break against the new contract.
6. **Build breakage.** Type errors, missing imports, `tsc --noEmit` failures, a CommonJS `require` in an ESM module, a leaked `src/internal/*` import in the published surface.

Do **not** inflate to Critical for:
- Missing tests (unless the plan explicitly required them for ship).
- Code-health issues (naming, dead code, leftover logs).
- Performance anti-patterns on cold paths.
- Accessibility issues the plan did not require.

### 🟡 Warning (should fix)

Use when **any one** of the following is true:

1. **Implied-but-missing behavior.** The plan didn't spell it out, but a reasonable reader would expect it (error handling, empty states, loading states, input validation beyond the basics).
2. **Partial implementation.** The feature works for the happy path but edge cases the plan called out are unhandled.
3. **Scope creep.** Files changed that the plan didn't authorize, and the change isn't risky (if risky, escalate to Critical).
4. **Performance anti-pattern on a non-hot path.** N+1 in an admin view, unbounded loop in a one-off script.
5. **Alignment drift.** Naming doesn't match the plan's vocabulary. File in the wrong directory per repo convention.
6. **Test gap the plan specified.** Plan said "include tests"; no tests shipped.

Warnings typically do not block merge on their own. But ≥5 Warnings on a single PR is a ship-readiness signal, note it in the report Summary.

### 🔵 Suggestion (consider improving)

Use when **all** of the following are true:

1. The plan is satisfied.
2. The code works correctly.
3. There's an opportunity to improve readability, performance, or future-proofing that the plan neither required nor prohibited.

Examples:
- Extract a repeated block into a helper.
- Replace a `switch` with a lookup object for readability.
- Add a JSDoc comment on a complex function.
- Consider moving to `relationLoadStrategy: "join"` for a small further perf gain when the current code is fine.

Suggestions never block merge. They are opt-in improvements.

---

## Decision tree

Work top-down. First match wins.

```
Is a plan requirement missing or broken?
  └─ YES → CRITICAL

Does the finding break the build?
  └─ YES → CRITICAL

Does it corrupt data, leak data, or expose a secret?
  └─ YES → CRITICAL

Does it cause a user-visible core-flow failure?
  └─ YES → CRITICAL

Does a modified function's caller now break?
  └─ YES → CRITICAL

Is a reasonable reader's implied expectation unmet (error handling, validation, auth, empty states)?
  └─ YES → WARNING

Is there scope creep or partial implementation?
  └─ YES → WARNING

Is there a perf anti-pattern on a non-hot path, or test gap the plan specified?
  └─ YES → WARNING

Is the code correct, plan-satisfying, but improvable?
  └─ YES → SUGGESTION

Otherwise: not a finding. Do not include in the report.
```

---

## Edge cases

### "This is technically correct but feels wrong"

Not a finding. Opinion without evidence is not actionable. If you can't tie the concern to a plan requirement, an implied expectation, or a detrimental pattern, drop it.

### "This is a style nit"

Usually Suggestion. Elevate to Warning only if the style violation is codified in the repo's lint config and the code would fail CI.

### "The plan is wrong and the code is right"

Not your call. The plan is the source of truth. Note the divergence in the Notes column of the traceability table and escalate to `library-worker-bee` in the Summary. Do not silently re-classify.

### "Security issue, but `security-worker-bee` should have caught this"

If `security-worker-bee` ran and missed it, flag as Critical under Detrimental Patterns and note in the Summary that `security-worker-bee` should be re-run. Do not bury it.

### "Two findings on the same line"

Record separately. Different severities are fine. Example: line 28 has both a missing null check (Warning) and an N+1 (Critical), two entries.

---

## Inflation and deflation antidotes

**Inflation** (Warning → Critical because you want the author to care) is how severity systems degrade. If everything is Critical, the invoker stops reading. Discipline: use the decision tree, and if the finding doesn't match a Critical bullet above, it's not Critical.

**Deflation** (Critical → Warning because you don't want to block ship) is also damaging, it trains the author to expect you to soften hard calls. Don't. If it's Critical by the tree, say so. The author can decide to merge anyway; that's their call, not yours.

---

## See also

- Worked examples with severity rationale: `examples/01-happy-path-clean-audit.md`, `examples/02-blocker-heavy-audit.md`.
- Research: `research/2026-04-24-bug-severity-levels.md`.
