---
title: ADR template - Michael Nygard lightweight format
date: 2026-04-29
sources:
  - http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions
  - https://github.com/joelparkerhenderson/architecture-decision-record
  - https://adr.github.io/adr-templates/
---

# ADR template - Michael Nygard format

## Summary
Michael Nygard's 2011 "Documenting Architecture Decisions" defines the canonical lightweight ADR shape: a short markdown file with five sections (Title, Status, Context, Decision, Consequences). wiki-worker-bee's `decisions/<short-title>.md` template should match this exactly - it's the lingua franca every senior engineer expects, and the joelparkerhenderson/architecture-decision-record collection (3,400+ stars) treats it as the default. Two evolutions are common: MADR (Markdown ADR) adds metadata blocks; Y-Statements compress to one sentence. Stick with classic Nygard for v1 because it's the universally recognized shape and wiki-worker-bee wants ADR pages that survive any stakeholder reading.

## Key facts
- File naming convention: numbered + slug, e.g. `0001-record-architecture-decisions.md`, `0002-switch-to-jwt.md`. Numbers monotonic per project.
- Five canonical sections (in order):
  1. **Title** - short noun phrase prefixed with ADR number (e.g., "ADR 9: LDAP for Multitenant Integration").
  2. **Status** - `proposed | accepted | rejected | deprecated | superseded by ADR-NNNN`.
  3. **Context** - value-neutral description of the forces in tension. Facts, not opinions.
  4. **Decision** - full sentences in active voice: "We will...".
  5. **Consequences** - all consequences (positive, negative, neutral).
- Total length target: 1-2 pages. Bullets allowed only for visual style, not for replacing prose.
- Status transitions are append-only: when superseded, do NOT delete the old ADR - change its status to `Superseded by ADR-NNNN` and link forward.
- Common extensions seen in the wild (joelparkerhenderson template):
  - `Date: YYYY-MM-DD` - when last updated.
  - `Deciders: [list]` - who signed off.
  - `Technical Story: [ticket URL]` - link to source issue.
- MADR (alternative) adds: "Considered Options", "Pros and Cons of the Options", "Decision Outcome" - useful when comparing alternatives, but verbose.
- Y-Statement (alternative): "In context of {use case}, facing {concern}, we decided for {option} and against {alternatives}, to achieve {quality}, accepting {downside}." - one sentence, hard to fit code wikis.
- `adr-tools` is a CLI for managing ADRs; the relevant insight for us is its convention of using `adr new <title>` to mint the next number - wiki-worker-bee must implement equivalent numbering.

## Recommended approach for wiki-worker-bee

Use **classic Nygard** as the `templates/decision.md` shape. The frontmatter wraps the prose:

```yaml
---
type: decision
status: accepted              # proposed | accepted | rejected | deprecated | superseded
adr_number: 0007
decision_date: 2026-04-29
deciders: [mario@olliebot.ai]
commit_sha: abc123
supersedes: [decisions/0003-rest-api.md]
superseded_by: null
related: [[entities/auth-middleware]], [[concepts/session-flow]]
tags: [auth, security]
---

# ADR 0007: Switch to JWT for Session Auth

## Status
Accepted - 2026-04-29

## Context
[Forces in tension, value-neutral]

## Decision
We will [active voice].

## Consequences
- [positive]
- [negative]
- [neutral]

## Sources
- Commit [`abc123`](path/to/commit) - message text
```

Filename: `library/knowledge/private/architecture/ADR-<n>-<slug>.md` where `NNNN` is a zero-padded monotonically increasing number scoped to the knowledge area (the graph driver allocates the next number in the post-pass to avoid collisions during parallel ingestion). Use the title-as-noun-phrase rule from Nygard. Never delete a superseded ADR - flip its `status` to `superseded` and append `superseded_by` frontmatter.

## Sources
- [Documenting Architecture Decisions](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions) - Michael Nygard, 2011-11-15 - the canonical source. Defines the five-section template.
- [joelparkerhenderson/architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record) - date retrieved 2026-04-29 - community ADR template collection; reference implementation of Nygard format with metadata extensions.
- [ADR Templates landing page](https://adr.github.io/adr-templates/) - date retrieved 2026-04-29 - comparative view of Nygard, MADR, Y-Statement.

## Quotes worth preserving
> "An architecture decision record is a short text file in a format similar to an Alexandrian pattern. ... Each record describes a set of forces and a single decision in response to those forces." - Michael Nygard
> "Decision: This section describes our response to these forces. It is stated in full sentences, with active voice. 'We will …'" - Michael Nygard
> "If an ADR changes or supersedes a decision, it may be 'Deprecated' or 'Superseded by ADR-NNN'." - Michael Nygard

## Open questions / gaps
- Numbering: should `adr_number` be allocated by wiki-worker-bee or by the graph driver? Recommend driver - parallel ingestion can collide on numbers, and the driver runs a serial post-pass anyway. wiki-worker-bee writes a placeholder (`adr_number: <pending>`) and the driver fills in the next value.
- Should low-confidence ADRs (filed in `questions/`) inherit the Nygard shape or use the question template? Recommend question template for low-confidence - once a human confirms, promote to `library/knowledge/private/architecture/` with full Nygard shape. Avoid hybrid form.
