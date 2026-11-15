---
type: decision
title: ""
status: proposed
adr_number: <pending>
decision_date: 2026-04-29
commit_sha: ""
superseded_by: ""
supersedes: []
created: 2026-04-29
updated: 2026-04-29
tags:
  - decision
  - adr
related: []
sources: []
---

<!-- File at library/knowledge/private/architecture/ADR-<n>-<slug>.md.
     Write adr_number: <pending> and use a temp ADR-pending-<sha>-<slug>.md filename;
     the graph driver allocates the number and renames in the post-pass. -->


# {Title}

## Status

[proposed | accepted | superseded | deprecated]

## Context

[What problem prompted this decision? Cite the commit message and any prior pages it touches. Be specific - vague context defeats the ADR's purpose.]

## Decision

[The actual choice made. Single declarative paragraph. Active voice. "We are switching from X to Y" - not "It was decided that..."]

## Consequences

- **Positive:** ...
- **Negative:** ...
- **Affected entities:** [[entities/...]], [[entities/...]]
- **Affected concepts:** [[concepts/...]]

## Sources

- **Commit:** `{commit_sha}` by {author} on {YYYY-MM-DD}
- **Message:** "{commit subject line}"
- **Body:**
  > {commit body if present}

---

**Filing rules** (from [`guides/03-the-six-phases.md`](../guides/03-the-six-phases.md), Phase 5):

- Only file an ADR when the commit message language is **high-confidence** for a decision (`switch from X to Y`, `migrate from X to Y`, `replace X with Y`, `deprecate X`, `adopt X`, `BREAKING CHANGE:` footer, `feat!:`/`refactor!:` markers, body containing `Decision:` / `Rationale:` / `RFC:` / `ADR:`).
- For low-confidence signals (`refactor`, `restructure`, `reorganize`), file a `questions/` page instead and ask a human to confirm.
- NEVER fabricate a decision the commit message does not actually express.
