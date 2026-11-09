# Requirements Traceability Matrix (RTM)

**Sources:**
- https://www.testrail.com/blog/requirements-traceability-matrix/
- https://www.perforce.com/resources/alm/requirements-traceability-matrix
- https://www.projectmanager.com/blog/requirements-traceability-matrix
- https://stell-engineering.com/blog/requirements-traceability-matrix
- https://www.geeksforgeeks.org/software-testing/requirement-traceability-matrix/

**Retrieved:** 2026-04-24
**Query used:** `acceptance criteria verification traceability matrix requirements to code`

## Summary

A Requirements Traceability Matrix (RTM) is a structured document that maps every requirement to the verification artifacts that prove it was met (design elements, test cases, source code). In Agile, user stories replace requirements and acceptance criteria serve as the verification points. Bi-directional RTMs trace both forward (requirement → code) and backward (code → requirement) - the backward trace is how you catch scope creep.

## Core columns in a canonical RTM

| Column | Contents |
|---|---|
| ID | Unique identifier (e.g., REQ-001, US-14, AC-3.2) |
| Requirement | Short description or user story |
| Acceptance Criteria | How we know it's done |
| Design Artifact | Link to design spec or diagram (if any) |
| Implementation Location | `path/to/file.ts:LN-LN` |
| Test Coverage | Link to test file or test ID |
| Status | Pass / Fail / Partial / Not Implemented |
| Notes | Anomalies, workarounds, follow-ups |

## Key quotations

> "A requirements traceability matrix (RTM) is a structured document that maps each project requirement to the corresponding test cases, design elements, and verification steps that confirm it's been met."

> "A bi-directional traceability matrix (BDTM) tracks both the forward and backward traceability of requirements in a project, giving testers complete pipeline visibility-from customer needs to requirements to coding, testing, change implementation, and defect management."

> "In agile projects, user stories replace traditional requirements, while acceptance criteria serve as validation points, with the matrix often linking user stories to epics and features."

## Adaptation for `quality-worker-bee`

The Command Brief specifies a "Plan Item Traceability" table. That's an RTM in plain-markdown form. Minimum columns to keep it lightweight:

| # | Plan Requirement | Status | Implementation Location | Notes |

Drop the `Test Coverage` column by default - tests appear under the Gaps axis. Drop the `Design Artifact` column unless the plan cited specific wireframes. Add the column if the Bee finds itself referring to a diagram in the plan.

For extraction, a user story in a PRD typically follows the form "As a [user], I want [action] so that [outcome]" with acceptance criteria as bullets. The scripted helper `scripts/extract-plan-items.py` should parse those patterns out of the plan markdown and emit a skeleton table with `Status` and `Implementation Location` empty.

## Relevance to this stinger

Direct source for `templates/traceability-table.md` and `guides/03-cross-reference-audit.md`. Also the basis for the `scripts/extract-plan-items.py` helper suggested in the Command Brief's IDEAS section - an RTM-style skeleton extractor reduces the Bee's cognitive load materially.
