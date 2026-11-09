# Research Plan - quality-stinger

**Forged:** 2026-04-24

This plan enumerates the search queries, authoritative sources, and open questions that the research pass must resolve before guides can be authored. Every factual claim in the guides must trace back to a dated note in this folder.

---

## Questions the research must answer

1. What does a modern code-review checklist look like for a React/Next.js repository, so `guides/03-cross-reference-audit.md` has a defensible base?
2. How is "acceptance criteria verification" typically automated or semi-automated - what artifacts and patterns exist?
3. What patterns of "implementation drift from specification" recur across published post-mortems and engineering blogs? (Feeds `guides/07-common-gaps.md`.)
4. Is there a canonical QA-report format for autonomous AI implementations? If so, what sections are non-negotiable? (Validates `templates/qa-report.md`.)
5. How do mature engineering orgs define severity levels (Critical / Warning / Suggestion, or Critical / High / Medium / Low)? (Feeds `guides/05-severity-classification.md`.)
6. What are the detection signatures for N+1 queries in Prisma / Next.js / ORM code? (Feeds `guides/04-five-axis-evaluation.md` Detrimental Patterns section.)
7. How do teams detect regressions when a PR ships without test coverage? (Feeds `guides/07-common-gaps.md`.)
8. What does the authoritative `git diff` / `git status` invocation pattern look like for PR-scoped review? (Feeds `guides/02-inventory-changes.md`.)

## Queries to run (pulled directly from the brief's REFERENCE MATERIAL)

1. `code review checklist React Next.js` - modern checklist for the stack the Bee will see most often.
2. `acceptance criteria verification automated` - prior art on plan→code traceability.
3. `implementation drift from specification patterns` - catalog of recurring gaps.
4. `QA report format for autonomous AI implementation` - emerging norms for AI-authored code review output.
5. `severity classification Critical High Medium Low definitions` - canonical severity rubrics to reference.
6. `N+1 query detection patterns Prisma ORM` - detrimental pattern signatures.
7. `regression detection without test coverage` - strategies for auditing untested code.
8. `git diff base branch pull request review commands` - canonical inventory commands.

## Authoritative sources to consult explicitly

- Google Engineering Practices - Code Review Developer Guide (`https://google.github.io/eng-practices/review/`) for the baseline reviewer's mental model.
- Atlassian / GitLab / GitHub code-review documentation for industry-standard severity and reviewer expectations.
- Bug-severity standards (ISTQB / industry) for Critical-vs-Warning thresholds.
- Prisma docs on the N+1 problem and `include` / `findMany` patterns.
- Git documentation on diff and status for PR-scoped invocations.
- Published AI-code-review tool documentation (Graphite, CodeRabbit, Cursor BugBot) for the current shape of AI-produced QA reports.

## Open questions flagged for the user (if unresolved)

Track these in `research/open-questions.md` after the research pass:

- Should the Stinger add Accessibility and Internationalization as explicit evaluation axes, or keep scope to the five in the brief?
- Is there an existing QA report history in the host repo whose tone and depth the Stinger should mirror? (If so, harvest examples; if not, the templates here become the convention.)
- Should the severity rubric be anchored to user-facing impact, ship-blocking impact, or both?

## Stop criteria

Research stops when each ACTION verb in the brief has at least one cited source, and each of the five evaluation axes has defensible material behind its checklist items. Target: 4-8 dated research notes.
