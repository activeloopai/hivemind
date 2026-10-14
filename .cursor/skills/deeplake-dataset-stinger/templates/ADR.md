# ADR-{{NUMBER}}: {{TITLE}}

**Status:** {{Proposed | Accepted | Superseded by ADR-XXX | Deprecated}}
**Date:** {{YYYY-MM-DD}}
**Author:** {{name / role}}
**Stakeholders:** {{eng leads, security lead if creds / data are sensitive}}

---

## Context

{{What is the situation that forces a decision?
Include:
- Which of the 7 tables (memory, sessions, skills, rules, goals, kpis, codebase) is affected.
- Workload shape - read/write ratio, search patterns (equality / vector / hybrid), append-only vs version-bumped.
- Constraints - storage backend and residency, credential model, embedding model / dimension.
- Why the status quo cannot continue.
}}

## Decision

{{What will we do? Be specific. One paragraph + the ColumnDef change or query snippet if helpful.}}

## Consequences

**Positive:**
- {{expected gain, measured or predicted}}

**Negative:**
- {{cost, risk, or trade-off}}

**Neutral:**
- {{a change that is neither a win nor a loss but worth documenting}}

## Alternatives considered

- **{{Alt 1}}** - {{why rejected}}
- **{{Alt 2}}** - {{why rejected}}

## References

- `guides/XX-...md SSsection`
- `research/YYYY-MM-DD-topic.md`
- {{external URL - Deep Lake / Activeloop docs preferred}}

## Verification

{{How do we prove this ADR works? What query, heal outcome, or search result must pass before we mark it "Accepted" / "Implemented"?
For schema decisions: a representative query showing the expected shape and the `validateSchema()` gate passing.
For heal decisions: the information_schema diff and the confirmed additive ALTER.
For storage / versioning choice: the backend reachable, the creds_key resolving, a commit/tag recorded.
}}

---

*Template from `deeplake-dataset-stinger/templates/ADR.md`. See `examples/storage-backend-choice-walkthrough.md` for a filled storage-choice ADR.*
