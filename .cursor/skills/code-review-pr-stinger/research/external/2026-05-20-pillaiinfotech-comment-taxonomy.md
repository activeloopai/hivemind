---
source_url: https://pillaiinfotech.com/article/code-review-best-practices
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: comment-taxonomy
stinger: code-review-pr-stinger
published: 2025-11-26
---

# Code Review Best Practices with Emoji-Prefixed Comment Taxonomy (Pillai Infotech)

## Summary

A comprehensive code review guide notable for its emoji-prefixed five-tier comment taxonomy that is both memorable and unambiguous. The taxonomy adds "praise" (positive reinforcement) and "question" (seeking understanding) as distinct tiers alongside the standard blocker/suggestion/nit three-tier system. Also provides a concise three-section PR template ("What / Why / How / Testing / Checklist") and a structured reviewer priority order (correctness/security first, then design/maintainability, then performance). The anti-pattern catalog includes "nitpick wars," "gatekeeper syndrome," and "commenting on 20 things at once" (which signals the PR is too large).

## Key quotations / statistics

- **Five-tier emoji comment taxonomy:**
  - 🔴 `blocker:` - "Must fix before merge. Bug, security issue, or correctness problem." Example: "blocker: This SQL query is vulnerable to injection. Use parameterized queries."
  - 🟡 `suggestion:` - "Recommended improvement. Author decides whether to adopt." Example: "suggestion: Consider extracting this into a helper function - it's used in 3 places."
  - ❓ `question:` - "Genuine question - reviewer doesn't understand something." Not requesting a change.
  - 💡 `nit:` - "Minor style/preference. Not worth blocking." Example: "nit: I'd name this `userCount` instead of `cnt`, but not a hill I'll die on."
  - 👍 `praise:` - "Something done well. Reinforces good patterns." Example: "praise: Great error handling here. The retry with exponential backoff is exactly right."
- **Reviewer priority order:**
  1. Priority 1: Correctness and Security (SQL injection, XSS, auth bypass, edge cases, race conditions)
  2. Priority 2: Design and Maintainability (right place, testable, understandable, no duplication)
  3. Priority 3: Performance (only when it matters)
- **PR template (three-section minimal):**
  - `## What` - one sentence describing what this PR does
  - `## Why` - link to ticket/issue; context on why this change is needed
  - `## How` - brief description of the approach; call out anything unusual
  - `## Testing` - unit/integration tests added; manually tested locally
  - `## Checklist` - PR under 300 lines; no secrets; migrations backward-compatible; API changes versioned
- **Anti-pattern catalog:** "Nitpick wars (47 comments about naming, formatting); Gatekeeper syndrome (one senior dev blocks every PR with 'I would have done it differently'); commenting on 20 things at once (say 'PR is too large' instead)."
- **Disagreement protocol:** "If it's a style preference, the author wins. If it's a design disagreement, escalate to a 15-minute call. If it's a correctness concern, the reviewer should explain the specific failure case. Never merge with unresolved blockers."
- **Anti-pattern reframes:**
  - "Why didn't you...?" → "Have you considered X? It might handle the edge case where..."
  - "This is wrong." → "This will return null when the user hasn't set their email. We need to handle that case."
  - "I would have done it differently." → Only say this if measurably better.

## Annotations for stinger-forge

- **Best source for `guides/06-comment-coaching.md` comment rewriting examples**: The five anti-pattern rewrites ("Why didn't you..." → "Have you considered...") are the most concrete, copyable examples in the research corpus.
- **Emoji taxonomy is visually distinctive and memorable**: The 🔴🟡❓💡👍 system is more instantly readable in a code review tool than plain-text prefixes. The stinger-forge author should consider offering both a plain-text variant (for teams that prefer it) and an emoji variant in the taxonomy guide.
- **"Praise" tier** is the most explicit articulation of positive reinforcement as a distinct review comment type. The Bee's three-tier taxonomy (blocker / suggestion / thought) should either incorporate praise as a fourth tier or address it as a sub-type of "thought."
- **Reviewer priority order** (correctness → design → performance) is the cleanest hierarchy for the review checklist guide. Use as the structural backbone of `guides/02-review-checklist.md`.
- **"Commenting on 20 things = PR too large"**: This is a feedback pattern that signals the PR itself has a problem, not just individual issues. Include in `guides/03-small-prs.md` as a reviewer-side size signal.
- **"Author wins on style"**: The "style preference → author decides" rule is a conflict-resolution principle that prevents gatekeeper syndrome. Include in `guides/06-comment-coaching.md` under disagreement protocols.
