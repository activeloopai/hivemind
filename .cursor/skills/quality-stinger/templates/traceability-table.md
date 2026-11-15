# Plan Item Traceability Table

Use this template standalone when you want to produce the traceability table outside of a full QA report (e.g., to attach to a PR description). For the full report skeleton, see `templates/qa-report.md`.

| ID     | Plan Requirement                                          | Status       | Implementation Location                 | Notes |
|--------|-----------------------------------------------------------|--------------|------------------------------------------|-------|
| {{US-1}}  | {{As a [role], I want [action] so that [outcome]}}    | {{✅ / ⚠️ / ❌ / 🟦}} | `{{path/to/file.ts:LN-LN}}`               | {{optional detail}} |
| {{US-2}}  | {{...}}                                                | {{status}}    | `{{path:LN-LN}}`                          | {{...}} |
| {{AC-1.1}}| {{acceptance criterion}}                              | {{status}}    | `{{path:LN-LN}}`                          | {{...}} |
| {{REQ-1}} | {{numbered requirement}}                              | {{status}}    | `{{path:LN-LN}}`                          | {{...}} |
| {{NG-1}}  | Non-goal: {{item from plan's Non-Goals section}}      | {{✅ / ⚠️}}    |,                                         | {{e.g., "Honored" or "Violated: file at ..."}} |

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Pass, present, correct, matches the plan |
| ⚠️ | Partial, present but incomplete or diverges in detail. Add a Warning finding. |
| ❌ | Fail, absent or broken. Add a Critical finding. |
| 🟦 | Not Applicable, scoped out, or deferred to a later phase |

## ID conventions

- `US-N`, User Story N
- `AC-N.M`, Acceptance Criterion M under Story N
- `REQ-N`, Numbered requirement N
- `NG-N`, Non-Goal N
- `T-N`, Task / checklist item N

Use whatever IDs the plan itself uses; if the plan has none, invent IDs that mirror its structure.

## Extraction helper

The `scripts/extract-plan-items.py` helper parses a PRD markdown file and emits a skeleton of this table with the `Status` and `Implementation Location` columns left blank. Run it to speed the first pass:

```bash
python3 scripts/extract-plan-items.py library/requirements/features/feature-007-search/prd-feature-007-search.md > traceability-skeleton.md
```
