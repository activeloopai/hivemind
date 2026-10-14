---
title: Conventional Commits + decision-encoding pattern matching
date: 2026-04-29
sources:
  - https://www.conventionalcommits.org/en/v1.0.0/
  - https://github.com/conventional-changelog/commitlint
  - https://en.wikipedia.org/wiki/Conventional_Commits_Specification
---

# Conventional Commits + decision-encoding pattern matching

## Summary
Conventional Commits is the de facto specification for structured commit messages: `type(scope?): description` with optional body and `BREAKING CHANGE` footer. The 11 standard types (`feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert`) cover scope but the decision-encoding patterns wiki-worker-bee needs are mostly free-text in the body, not the type prefix. The high-confidence ADR signals are: explicit `BREAKING CHANGE:` footer, body containing `Decision:` / `Rationale:` / `RFC` / `ADR`, and verb phrases like "switch from X to Y", "deprecate X", "migrate from X to Y", "replace X with Y", "adopt X". A `feat!:` (breaking-change marker) is also high-confidence.

## Key facts
- Standard format: `<type>[optional scope]: <description>\n\n[optional body]\n\n[optional footer(s)]`.
- Standard types (from `commitlint-config-conventional`, Angular convention): `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.
- Breaking-change indicator: `!` immediately before the colon (`feat!: drop Node 14 support`) OR a footer line `BREAKING CHANGE: <description>`. Both are equivalent per spec rule 13.
- Footer format: `<token>: <value>` or `<token> #<value>` (git-trailer style). Tokens are usually `BREAKING CHANGE`, `Refs`, `Reviewed-by`, `Co-authored-by`.
- Type confusion is real: research cited in Wikipedia article notes ~58% of commit-classification issues are about ambiguity between `feat` vs `chore` and overlap between `refactor`, `style`, `perf`. wiki-worker-bee must NOT trust type alone for ADR detection - body text matters.
- `commitlint` is the reference linter (`@commitlint/config-conventional`), useful as a pattern source for deciding what's "conformant" but not directly as a wiki-worker-bee dependency.
- The semver-correlated types: `fix:` -> PATCH, `feat:` -> MINOR, breaking change -> MAJOR.

## Recommended approach for wiki-worker-bee

Implement a two-tier ADR-detection scoring system:

**Tier 1 (high confidence - file as `library/knowledge/private/architecture/`):**
- Commit message contains a footer line matching `^BREAKING CHANGE:` (case-insensitive).
- Subject contains `!:` after the type (`feat!:`, `refactor!:`).
- Body matches any of these regexes (case-insensitive):
  - `\bdecision:\s+`
  - `\brationale:\s+`
  - `\brfc[\s-]?\d+`
  - `\badr[\s-]?\d+`
- Subject matches the **switch verb pattern** with capture groups:
  - `\b(switch(?:ing|ed)?\s+from)\s+(.+?)\s+to\s+(.+)`
  - `\b(replace(?:s|d)?)\s+(.+?)\s+with\s+(.+)`
  - `\b(migrate(?:s|d)?\s+from)\s+(.+?)\s+to\s+(.+)`
  - `\b(deprecate(?:s|d)?)\s+(.+)`
  - `\b(adopt(?:s|ing|ed)?)\s+(.+)`

**Tier 2 (low confidence - file as `questions/` for human confirmation):**
- Subject is `refactor:` or `chore:` AND body is multi-paragraph (>200 chars).
- Subject contains words like "rewrite", "redesign", "rearchitect" but no Tier-1 verb pattern.
- Body mentions a tradeoff phrase ("instead of", "rather than", "we considered") but no clear decision.

**Filter out (do NOT treat as ADR signals):**
- `docs:`, `style:`, `test:`, `chore: bump deps`, dependabot bots.
- Single-line commits with no body (insufficient evidence).
- Commits with `Revert "..."` subject (these update the prior ADR's status to `superseded` instead of filing a new one).

The threshold rule: a commit is an ADR if it matches at least ONE Tier-1 condition. Multiple Tier-1 hits are extra confidence. Tier-2 hits without any Tier-1 always go to `questions/`. Anything with no signals is ignored.

## Sources
- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) - date retrieved 2026-04-29 - canonical specification including the BREAKING CHANGE footer rule.
- [conventional-changelog/commitlint](https://github.com/conventional-changelog/commitlint) - date retrieved 2026-04-29 - reference linter, source of the 11 standard types.
- [Wikipedia: Conventional Commits Specification](https://en.wikipedia.org/wiki/Conventional_Commits_Specification) - date retrieved 2026-04-29 - research summary noting 58% type-confusion rate (justifies "don't trust type alone" rule).

## Quotes worth preserving
> "Breaking changes MUST be indicated in the type/scope prefix of a commit, or as an entry in the footer." - Conventional Commits v1.0.0
> "If included in the type/scope prefix, breaking changes MUST be indicated by a `!` immediately before the `:`. If `!` is used, `BREAKING CHANGE:` MAY be omitted from the footer section, and the commit description SHALL be used to describe the breaking change." - Conventional Commits v1.0.0
> "Type Confusion: The most prevalent challenge (approx. 58% of issues), where developers are unsure which type applies." - Wikipedia (citing CCS usage research)

## Open questions / gaps
- For projects NOT using Conventional Commits, wiki-worker-bee still needs to detect ADR signals from free-form messages. The Tier-1 verb patterns work regardless of prefix - they're the resilient signal. The type prefix is bonus context only.
- Should wiki-worker-bee also scan PR descriptions (GitHub API) when the squash-merge commit message is just the PR title? Brief recommendation: out of v1 scope. The graph driver's git context is the source of truth; it can fetch PR bodies in v2.
- The "considered options" tradeoff signal (Tier 2) is hard to disambiguate from bug-fix narratives. Recommend: only mark as Tier 2 when the body is structured (numbered list of options or `Considered:` header).
