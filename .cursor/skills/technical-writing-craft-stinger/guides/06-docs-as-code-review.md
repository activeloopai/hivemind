# 06 - Docs-as-Code Review

> Source: `research/external/05-docs-as-code-workflow.md`, `research/external/08-vale-linter-prose-quality.md`

In a docs-as-code workflow, documentation changes travel through the same PR process as code changes. The Bee's role in this workflow is the *writing-quality review* -- the judgment calls that automated tools (Vale, link checkers, spell checkers) cannot make.

---

## The two review entry points

### Standalone docs review

The user hands the Bee a document or set of documents to review outside of a PR. This is the primary mode: apply the full 8-step review workflow from `SKILL.md`.

### Inline docs PR review

The user hands the Bee a PR diff that touches documentation files. Apply the same criteria, but scope the review to changed files only. Flag regressions (the new version is worse than the old) as Blockers. Flag new issues introduced in the diff as Suggestions or higher. Do not review unchanged sections unless they directly relate to changed sections.

---

## The docs-as-code writing-quality checklist (for PR review)

Apply this checklist to every documentation file changed in a PR:

| Check | Severity if failing | Notes |
|---|---|---|
| Diataxis mode is consistent within the file | Blocker | Mode-mixing introduced by this PR |
| Opening sentence follows inverted pyramid | Suggestion | Lead with outcome/answer, not tool/history |
| Headings predict section content accurately | Suggestion | Mismatched heading is a navigation failure |
| Every code block has an introductory sentence | Suggestion | Isolated code blocks confuse readers |
| Code blocks are language-tagged | Nit | Missing fence tag: ` ```python ` etc. |
| Code omissions marked with language comments | Suggestion | Ellipsis used instead of `# ...` |
| Active voice dominant | Nit | Unless house style differs |
| Second person in procedural sections | Nit | "users" instead of "you" |
| Prerequisites stated (for how-tos and tutorials) | Suggestion | New procedure with no prerequisites |
| New jargon defined on first use | Suggestion | Term introduced without inline definition or link |

---

## What the Bee reviews vs. what Vale reviews

This distinction is important: the Bee should not duplicate Vale's job, and Vale should not be expected to do the Bee's job.

| Concern | Owner | Tool |
|---|---|---|
| Passive voice (systematic) | Vale | Style rule |
| Capitalization (headings) | Vale | Style rule |
| Defined terms (must use, not improvise) | Vale | Vocabulary rule |
| Broken links | CI pipeline | Link checker |
| Spelling | CI pipeline | Spell checker |
| Markdown lint | CI pipeline | Markdownlint |
| Diataxis mode classification | Bee | Judgment |
| Opening sentence quality | Bee | Judgment |
| Code example correctness | Bee + author | Judgment + testing |
| Reader-lens calibration | Bee | Judgment |
| Voice consistency (within a doc) | Bee | Judgment (Vale handles patterns) |

Note: No Diataxis-specific Vale ruleset exists as of May 2026 (`research/research-summary.md` open question 3). Diataxis mode classification is a semantic judgment that pattern-matching linters cannot make reliably.

---

## Documentation drift: the "docs in same PR" principle

From `research/external/05-docs-as-code-workflow.md`: "Documentation changes should be reviewed alongside code changes in the same PR rather than separately, preventing documentation drift."

When reviewing a code PR that also changes documentation:
1. Verify the documentation change is scoped to what the code change actually affects.
2. Flag documentation that is still correct but describes changed behavior incompletely as Blocker.
3. Flag documentation that describes changed behavior incorrectly as Blocker.
4. Flag documentation that was not updated for a relevant code change as Suggestion.

The Bee is not responsible for technical accuracy (the code author and technical reviewer own that). The Bee is responsible for whether the documentation is well-written, regardless of whether the facts are correct.

---

## AI-generated docs: heightened review standards

In 2026, AI tools generate increasing amounts of initial documentation content. AI-generated docs tend to exhibit specific failure modes:

- **Mode-mixing:** AI frequently mixes tutorial narrative with reference tables in the same document.
- **Passive voice overuse:** AI defaults to passive constructions ("can be configured by").
- **Vague pronoun references:** AI uses "it", "this", and "that" without clear antecedents.
- **Generic openings:** AI often opens with "This document describes..." instead of the most important fact.
- **Omission of prerequisites:** AI generates steps assuming knowledge it did not explain.

When a PR description or commit message suggests AI-generated content, apply the full 8-step review workflow rather than a lighter pass.
