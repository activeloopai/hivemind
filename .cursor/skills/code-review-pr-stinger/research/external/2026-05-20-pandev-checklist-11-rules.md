---
source_url: https://pandev-metrics.com/docs/blog/code-review-checklist-2026
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: review-checklist
stinger: code-review-pr-stinger
published: 2026-04-24
---

# Code Review Checklist: 11 Rules That Cut Review Time in Half (PanDev Metrics)

## Summary

An eleven-rule framework structured across three phases (author discipline, reviewer discipline, team discipline), backed by external research citations. The most practically structured checklist source in the research set. Key contributions: the three-severity comment tagging system (`must-fix` / `should-fix` / `nit`); the two-reviewer maximum (bystander effect proof); the "author merges, not reviewer" rule; the 48-hour PR escalation trigger; and the ready-to-print checklist card. References Latané & Darley bystander research and Google's median 4-hour review benchmark.

## Key quotations / statistics

- "The median review at Google completes in less than 4 hours. In most teams we see, that number is 4 days - a 24x gap explained almost entirely by process, not talent."
- **Three-tier tagging system:**
  - `must-fix`: blocks merge
  - `should-fix`: worth doing, not a blocker
  - `nit`: preference, safe to ignore
- "Teams that adopt this convention report review turnaround improvements of 30-40% in the first month."
- **Two-reviewer maximum rule:** "Adding a third reviewer feels safer but makes reviews slower AND lower quality. Once three people are assigned, the bystander effect kicks in; each reviewer assumes someone else is doing the careful read." (Cites Latané & Darley bystander research)
- "The right combination: one domain expert (for correctness) + one peer (for maintainability and knowledge-sharing)."
- **Author-merges rule:** "After approval, the author merges. This preserves ownership: the author confirms they agree with all resolved discussion, they verify the branch is still green against main, and they own the consequences. Reviewer-merge creates zombie PRs."
- **48-hour escalation rule:** "If a PR has been open for 48 business hours without either a merge or an explicit 'don't merge this,' the EM escalates."
- **Review session limit:** "Limit review sessions to 60 minutes."
- **Self-review rule:** "Author self-reviews before requesting others." (Reviewer should never burn time on issues author could have caught.)
- **Ready-to-print checklist card:**
  - Author: PR under 400 lines; description tells what/why; self-reviewed
  - Reviewer: Session ≤ 60 min; every comment tagged must-fix/should-fix/nit; one sentence on what was verified if approving; at most 2 reviewers
  - Team: First review within 4 business hours; all automated checks pass first; author merges; escalate at 48 hours

## Annotations for stinger-forge

- **Primary source for `templates/review-checklist.md`**: The three-phase printable checklist (author / reviewer / team) is the best structured checklist template in the research set. Adapt directly.
- **Three-tier tagging names** (`must-fix` / `should-fix` / `nit`) should be compared with ARDURA's (`[blocker]` / `[suggestion]` / `[nit]`) and Google's (`Nit:` / `Optional:` / `FYI:`). The Bee should standardize on one convention with a cross-reference table.
- **30-40% turnaround improvement from tagging**: Strong ROI justification for the three-tier taxonomy. Include in the reasoning section of `guides/06-comment-coaching.md`.
- **Bystander effect citation** is the strongest research basis for the "two reviewers max" rule. Include in the culture scorecard rubric.
- **"Zombie PRs"** (approved but abandoned because reviewer merged and author moved on) is a vivid named anti-pattern worth including in the rubber-stamp/culture guide.
- **Escalation protocol** (48 business hours without merge or explicit "don't merge" → EM escalates) is the most concrete SLA enforcement mechanism in the research. Include as a named escalation trigger in the culture scorecard.
