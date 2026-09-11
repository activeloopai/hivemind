---
name: code-review-pr-stinger
description: Code review culture and PR lifecycle specialist -- PR description templates (six-element structure), review checklists (three-tier taxonomy: blocker/suggestion/nit), async-first review norms for remote teams, the small-PR discipline (400-line threshold backed by DORA 2025 data), rubber-stamp anti-pattern detection, and the review-as-mentorship lens. Use when the user says "audit our PR culture", "write a PR description", "create a review checklist", "coach this review comment", "is this PR too large?", "how do we improve code review on our team?", or when code-review-pr-worker-bee is invoked. Do NOT use for security audit findings (security-worker-bee), implementation correctness (typescript-node-worker-bee), CI/CD pipeline setup (ci-release-worker-bee), or branch protection configuration (github-repo-health-worker-bee).
license: MIT
---

# code-review-pr-stinger

Code review as a culture, not a gate. This skill encodes the full PR lifecycle from description quality through review execution to cultural health: the six-element PR description structure, the three-tier comment taxonomy, the 400-line small-PR threshold with DORA-backed justification, async-first review norms for distributed teams, rubber-stamp detection signals, and the review-as-mentorship lens. All factual claims trace to `research/` source files.

**Read this file first.** Then navigate to the guide or template relevant to your current task.

---

## When to activate

Activate `code-review-pr-stinger` when the user or orchestrator invokes `code-review-pr-worker-bee` for any of:

- **PR description authoring or audit** -- the author needs a structured, reviewable description
- **Review checklist generation** -- the reviewer needs a context-specific checklist
- **Comment coaching** -- a review comment is vague, aggressive, or ambiguous
- **Small-PR evaluation** -- a PR is large and may need to be split
- **Rubber-stamp diagnosis** -- the team's reviews are approvals-without-substance
- **Culture audit** -- team lead wants a 30-PR culture scorecard

Do NOT activate for security finding remediation, logic correctness review, CI pipeline authoring, or repo settings.

---

## The three cultural axioms

Everything in this skill flows from three axioms backed by the research corpus:

1. **Small PRs are a forcing function for good design.** PRs of 200-400 lines achieve 75%+ defect detection; PRs over 1,000 lines drop to 31%. AI-assisted coding (2025 DORA Report) caused a 91% increase in review time, making this more urgent than ever. Source: `research/external/2026-05-20-gitautoreview-pr-size-metrics.md`.

2. **A PR description is a first-class communication artifact.** A description that explains the motivation, context, what changed, and what did NOT change lets reviewers do their job without a synchronous call. Source: `research/external/2026-05-20-tenthirtyam-pr-template-guide.md`, `research/external/2026-05-20-pullpanda-pr-description-templates.md`.

3. **Review comments have tiers; ambiguous comments erode trust.** Every comment is either a blocker (must fix before merge), a suggestion (nice to have), or a nit (cosmetic / optional). A comment that does not state its tier forces the author to guess. Source: `research/external/2026-05-20-google-eng-practices-comments.md`, `research/external/2026-05-20-pillaiinfotech-comment-taxonomy.md`.

---

## Canonical taxonomy: three-tier comment system

The Bee uses this taxonomy everywhere. It is derived from Google Engineering Practices, ARDURA, PanDev, and Pillai Infotech research. See `guides/00-principles.md` for the full decision tree.

| Tier | Label | Meaning | Author must act? |
|---|---|---|---|
| 1 | **`blocker:`** | Must fix before merge. Safety, correctness, or design invariant violated. | Yes |
| 2 | **`suggestion:`** | Improvement worth doing, but merge can proceed. | Author's call |
| 3 | **`nit:`** | Cosmetic, style, minor. Low cognitive cost, easy to batch. | Optional |
| + | **`question:`** | Seeking understanding, not requesting a change. | Answer only |
| + | **`praise:`** | Positive reinforcement. Names a good decision explicitly. | No action |

All five tiers are valid. `blocker:` and `nit:` are the most commonly used and the most commonly confused.

---

## Canonical PR description structure (six elements)

Every PR description the Bee produces contains these six elements. See `guides/01-pr-description.md` for the full guide and `templates/pr-description.md` for the fill-in template.

1. **Motivation** -- Why does this PR exist? What problem does it solve?
2. **Context** -- What should the reviewer know before reading the diff? (Links, prior PRs, ADR references.)
3. **What changed** -- The "what" of the diff in human terms. One bullet per logical change.
4. **What did NOT change** -- Explicit scope boundary. Names things a reviewer might look for that are intentionally excluded.
5. **Testing proof** -- How was this tested? Screenshots, CI links, manual steps.
6. **Reviewer hints** -- Where to focus attention; which files are boilerplate; specific concerns to probe.

---

## PR size heuristics (small-PR discipline)

Default threshold: **400 changed lines**. This is configurable per team (300 for aggressive TBD teams). Source: `research/external/2026-05-20-gitautoreview-pr-size-metrics.md`, `research/external/2026-05-20-ardura-implementation-guide.md`.

| Signal | Threshold | Action |
|---|---|---|
| Line count | > 400 lines | Flag; suggest splits per `guides/03-small-prs.md` |
| Concern count | > 5 unrelated logical concerns | Flag; suggest split by concern |
| Review time | > 60 minutes expected | Flag; schedule sync review session |
| Files changed | > 20 files | Audit for mixed concerns |

---

## Quick navigation

| Task | Guide | Template / Example |
|---|---|---|
| Author or audit a PR description | `guides/01-pr-description.md` | `templates/pr-description.md` |
| Generate a review checklist | `guides/02-review-checklist.md` | `templates/review-checklist.md` |
| Evaluate PR size / suggest splits | `guides/03-small-prs.md` | `examples/large-pr-split.md` |
| Review async-first norms | `guides/04-async-review.md` | -- |
| Diagnose rubber-stamp culture | `guides/05-rubber-stamp-detection.md` | `examples/happy-path-pr-review.md` |
| Coach a review comment | `guides/06-comment-coaching.md` | `examples/happy-path-pr-review.md` |
| Foundational principles | `guides/00-principles.md` | -- |

---

## Open questions (from research; requires human decision)

These questions survived the scripture-historian sweep. They are documented rather than guessed:

1. **Taxonomy naming:** Should the Bee default to plain-English labels (`blocker:` / `suggestion:` / `nit:`) or emoji labels (🔴 / 🟡 / 💡)? Default: plain-English unless the team has an existing emoji convention.
2. **Size threshold:** Is 400 lines the right default, or should it vary by project type (e.g., 200 for security-critical code)? Default: 400, configurable.
3. **Review captain scope:** The review captain pattern works well for teams of 10+. For smaller teams, the Bee should recommend shared triage rather than a dedicated role. See `guides/04-async-review.md`.
4. **GitHub API audit methodology:** The culture scorecard audit uses GitHub API to pull 30 PR timelines. The exact API queries are documented in `guides/05-rubber-stamp-detection.md` based on first-principles design; no research precedent exists for this specific audit workflow.
5. **"What did NOT change" format:** This section is novel to this Bee (not found in research corpus). The six-element template treats it as a named H3 section. Teams may prefer an inline note style instead. See `templates/pr-description.md`.

> These are flags for the user, not prompts to invent answers. Surface them when they become relevant to a specific request.

---

## Research trail

All factual claims in this skill derive from sources in `research/`. See `research/index.md` for the full manifest and `research/research-summary.md` for the executive summary and the 5 most influential sources.

Key sources:
- `research/external/2026-05-20-google-eng-practices-standard.md` -- canonical authority
- `research/external/2026-05-20-google-eng-practices-comments.md` -- comment-writing norms
- `research/external/2026-05-20-stackfyi-best-practices-guide.md` -- 2026 synthesis, rubber-stamp signals
- `research/external/2026-05-20-gitautoreview-pr-size-metrics.md` -- 400-line threshold data, DORA 2025
- `research/external/2026-05-20-pillaiinfotech-comment-taxonomy.md` -- five-tier taxonomy with worked rewrites
