# 03, Cross-Reference Plan Against Implementation

Walk every requirement, acceptance criterion, and task item in the plan. For each, verify it exists in code with a specific `file:line` reference, or mark it as a gap.

---

## Extract plan items

A plan's items typically appear as:

- Numbered requirements (`1. The system must...`).
- User stories (`As a [role], I want [action] so that [outcome]`).
- Acceptance criteria bullets nested under stories.
- Task checklist items (`- [ ] Implement X`).
- Non-goals (capture these too; they define the Alignment axis boundary).

You can extract manually or use the bundled helper:

```bash
python3 scripts/extract-plan-items.py library/requirements/features/feature-007-search/prd-feature-007-search.md > /tmp/traceability-skeleton.md
```

The helper emits a markdown table skeleton with `ID | Plan Requirement | Status | Implementation Location | Notes` rows and blanks for Status / Implementation Location. See the script header for flags.

Fill in the skeleton as you work. If Python is unavailable or the plan has an unusual structure, extract by hand using the same columns. See `templates/traceability-table.md` for the canonical shape.

---

## For each plan item, trace to code

For every row in the traceability table:

1. Identify the file(s) in the diff most likely to hold the implementation. Start by keyword-grepping function names, type names, and route paths from the requirement text against the diff.
2. Read the implementation. Confirm it does what the requirement says.
3. Record the `Implementation Location` as `path/to/file.ts:LN-LN`, a range that spans the minimal relevant code.
4. Set `Status`:
   - ✅ Pass, present, correct, matches the plan.
   - ⚠️ Partial, present but incomplete or diverges in detail. Add a Warning finding.
   - ❌ Fail, absent or broken. Add a Critical finding.
   - 🟦 Not Applicable, the item was scoped out, or the plan moved it to a later phase.

If a requirement is satisfied across multiple files, list all of them (one per line inside the cell or comma-separated).

## What counts as "implemented"

A requirement is **implemented** when:

- Its stated behavior runs under normal input.
- Its error paths are handled if the plan spelled them out.
- Its acceptance criteria are each observable in code or tests.

A requirement is **NOT** implemented when:

- It exists only in a TODO comment.
- It's stubbed with `throw new Error("not implemented")`.
- It's behind a feature flag that is off and the plan didn't specify an off-by-default rollout.
- Its code path exists but is unreachable (dead code).

Mark the above as ❌ Fail (not ⚠️ Partial), partial means "mostly there but edge cases missing."

## Handling non-goals

A plan's Non-Goals are as important as its Goals. When the diff includes changes that match a Non-Goal, flag them under the Alignment axis. Example:

> Plan §2.2 Non-Goals: "This phase does NOT include embeddings daemon lifecycle changes."
> Diff: `src/embeddings/restart-daemon.ts` added.
> Finding: Warning, Out-of-scope change (§2.2 non-goal). `src/embeddings/restart-daemon.ts:1-52`. The implementation added daemon-restart logic that the plan explicitly deferred. Either remove or justify with a scope-amendment note from the plan author.

## Handling implicit requirements

Some requirements are implied but not spelled out. These are the hardest. Examples:

- The plan adds a paid feature but doesn't say "check the user's subscription." That's implied.
- The plan adds a user-input form but doesn't say "validate input." That's implied.

Implied requirements are audited under the **Gaps** axis, not Completeness. If absent, the finding is usually a Warning (occasionally a Critical if security or data-integrity is at stake). See `07-common-gaps.md` for the common patterns.

## The plan-item traceability table

The completed table is a deliverable, it goes in the report as a full section. Example rendering:

| # | Plan Requirement | Status | Implementation Location | Notes |
|---|---|---|---|---|
| US-1 | "User can run a ranked library search" | ✅ | `src/search/search-command.ts:1-64` |, |
| US-2 | "A result opens to its full entry" | ⚠️ | `src/search/result-view.ts:18-42` | Works, but no gate/validation on the query path |
| US-3 | "Search falls back to BM25 when embeddings off" | ❌ |, | No BM25 fallback in codebase |
| AC-4.1 | "Results stream in capped batches" | ✅ | `src/search/search-service.ts:22-58` |, |
| NG-2.2 | Non-goal: "No daemon lifecycle changes" | ⚠️ | `src/embeddings/restart-daemon.ts:1-52` | Scope violation, daemon restart added |

---

## See also

- Template for the table: `templates/traceability-table.md`.
- Example of a filled-in table: `examples/02-blocker-heavy-audit.md`.
- The helper script: `scripts/extract-plan-items.py`.
- Research: `research/2026-04-24-traceability-matrix.md`.
