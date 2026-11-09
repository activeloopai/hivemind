# Google Engineering Practices - Code Review Standard

**Source:** https://google.github.io/eng-practices/review/reviewer/standard.html (and the wider `https://google.github.io/eng-practices/review/` site)
**Retrieved:** 2026-04-24
**Query used:** `Google engineering practices code review developer guide reviewer`
**License on source:** CC-BY 3.0

## Summary

Google's public Engineering Practices documents the mental model the `quality-worker-bee` Bee should operate under. Two documents matter:

1. "How To Do A Code Review" - reviewer's guide
2. "The CL Author's Guide" - author's guide

The reviewer's guide enumerates the categories a reviewer checks: design, functionality, complexity, tests, naming, comments, style, and documentation. The guiding principle is that the primary purpose of code review is to keep overall code health improving - "there is no such thing as perfect code, only better code." Reviewers balance forward progress against the value of requested changes.

## Key quotations

> "Reviewers should favor approving a CL once it is in a state where it definitely improves the overall code health of the system being worked on, even if the CL isn't perfect."

> "In general, reviewers should favor approving a CL once it is in a state where it definitely improves the overall code health of the system being worked on, even if the CL isn't perfect."

> "The primary purpose of code review is to make sure that the overall code health of Google's code base is improving over time."

## Checklist derived from the guide ("what to look for")

- Design - does the change belong, and does it integrate well with the rest of the system?
- Functionality - does the code do what the author intended, for the users?
- Complexity - could it be simpler? Are there speculative features (YAGNI violations)?
- Tests - appropriate unit/integration tests, well-designed and likely to actually fail when the code breaks?
- Naming - are names clear and consistent?
- Comments - useful, necessary, and explain "why" rather than "what"?
- Style - matches the project's style guide?
- Documentation - if the CL changes behavior, is the user-facing documentation updated?

## Relevance to this stinger

This is the canonical source for `guides/00-principles.md` (severity balance) and `guides/04-five-axis-evaluation.md` (Completeness/Correctness/Alignment axes). The "no such thing as perfect code" principle underpins the severity-inflation warning in the Command Brief's SUBAGENT CRITICAL DIRECTIVES. Google's eight review dimensions map cleanly onto our five axes:

- Design + Functionality + Complexity → **Correctness** and **Alignment** axes.
- Tests → **Gaps** axis (tests are an implied requirement).
- Naming + Comments + Style + Documentation → **Alignment** axis.
- Anything not covered by the spec but flagged → **Detrimental Patterns** axis.

Cite this in `guides/00-principles.md` when explaining why `quality-worker-bee` does not demand "perfect" implementations - only implementations that faithfully execute the plan without regressing code health.
