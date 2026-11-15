---
source_url: https://pullpanda.io/blog/pull-request-description-template
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: pr-description
stinger: code-review-pr-stinger
published: 2025-10-26
author: Christoffer Artmann
---

# Pull Request Description Templates That Get Your PRs Reviewed Faster (Pull Panda)

## Summary

A practitioner guide on PR description quality that introduces the "what / why / what to focus on" three-question framework as the minimal mental model for any PR description. The guide distinguishes PR descriptions from commit messages ("commit messages are implementation details; PR descriptions are for humans reviewing the overall change") and provides context-adapted templates for feature PRs, bug fix PRs, and emergency PRs. The "Review Focus" section recommendation (telling reviewers where expertise is most needed) is a distinctive contribution not found in most other sources.

## Key quotations / statistics

- "Good PR descriptions answer the questions reviewers will have before they even have to ask them."
- **Three fundamental questions every PR description must answer:**
  1. **What changed** - "The nature of the change in human terms. 'Added email validation to the registration flow' tells a much clearer story than 'modified user model and controller.'"
  2. **Why it changed** - "The context that diffs can never capture." (Business motivation, feature context, technical debt driver)
  3. **What to focus on** - "Guides the reviewer's attention. Maybe we refactored a large file but only one section needs careful review."
- "Commit messages are implementation details. PR descriptions are for humans reviewing the overall change. Focus on the why and what, not the how."
- **Review Focus section value:** "It tells reviewers where we most need their expertise. Reviewers can provide more valuable feedback instead of getting lost in minor details."
- **Context-adapted templates:**
  - Feature PRs: Establish what is being built, why it matters to users or business, and how the implementation was approached.
  - Bug fix PRs: Describe original bug, root cause, and why this specific fix is correct.
  - Emergency PRs: "Minimal template for hotfixes where speed matters."
- "We're not just writing for our reviewers - we're creating documentation for everyone who will interact with this code in the future. That includes our future selves when we're trying to remember why we made certain decisions months or years ago."
- "Draft our description while we're working on [the feature]... When we finish our implementation, we should read through our draft description with fresh eyes."
- **Anti-pattern of bad description:** "Fixed stuff" or empty descriptions - "left playing detective, trying to understand what changed, why it matters, and what we should focus on."

## Annotations for stinger-forge

- **The "what / why / what to focus on" framework** is the simplest and most memorable mental model for PR description quality. Use as the opening framing of `guides/01-pr-description.md`, before the six-element canonical structure.
- **"Review Focus" section** is a distinctive contribution that maps to the Bee's "reviewer hints" element in the six-element description structure. The Bee should explicitly name this element and this is the best justification for why it exists.
- **Commit messages vs. PR descriptions distinction** is a common confusion that the Bee should address directly. The clarification (commit = implementation details, PR description = human context for the overall change) belongs in the anti-patterns section of the description guide.
- **Context-adapted templates** (feature / bug fix / emergency) suggest the `templates/pr-description.md` should offer three variants rather than a single universal template. The base six-element structure should be adapted for each context.
- **"Draft while working"** is an authoring workflow tip that reduces the cognitive cost of writing the description at the end. Include in the description guide as a recommended practice.
- **PR description as future documentation**: The "future self" framing is the best long-term argument for investment in description quality, complementing the "faster review" short-term argument.
