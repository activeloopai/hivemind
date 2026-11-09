---
source_url: https://tenthirtyam.org/dispatches/2026/04/04/how-to-write-an-effective-github-pull-request-template/
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: pr-template
stinger: code-review-pr-stinger
published: 2026-04-04
author: Ryan Johnson
---

# How to Write an Effective GitHub Pull Request Template (Hypertext Dispatches)

## Summary

A focused 2026 guide on GitHub pull request template design, covering the seven essential template sections, the philosophy of "shifting the burden upstream," and the compounding returns of consistent templates. The guide is notable for its explicit "do not over-engineer" principle, its treatment of templates as prompts rather than enforced forms, and its argument that well-structured PR descriptions make downstream tools (changelogs, release notes, reporting) more effective.

## Key quotations / statistics

- "A pull request template shifts the burden upstream. It prompts contributors at the moment they open a pull request to provide the context that reviewers need."
- "GitHub does not enforce that contributors fill out the template. It is a prompt, not a form with required fields. The value comes from making it easy to provide the right context rather than easy to skip it."
- "A template with clear section headers and inline comments that explain what belongs in each section gets filled out. A blank description field does not."
- **Seven template sections:**
  1. **Description** - "The most important section in the template. Reviewers read it first."
  2. **Type of change** - Conventional Commits type checklist (feat, fix, refactor, etc.)
  3. **Breaking changes** - Binary checklist + impact description + migration path
  4. **Documentation** - Checklist confirming docs added or updated
  5. **Release notes** - "A short prose entry suitable for inclusion in a changelog." 
  6. **Additional context** - Screenshots, migration instructions, benchmarks, related PRs, approach rationale
  7. **Onboarding reminder block** - HTML comment pointing to CONTRIBUTING.md, code of conduct, Conventional Commits
- **Breaking changes section justification:** "An enhancement that ships without documentation creates a gap between what the project does and what contributors and users know it does."
- "Release notes section is particularly useful when generating release notes from pull request descriptions, as many teams do."
- **Anti-over-engineering principle:** "A template that takes five minutes to fill out will be abandoned. Ask for what reviewers actually need. Start with the sections above and remove the ones that don't apply."
- **Compounding returns:** "The first time someone fills it out, you get a better pull request. The hundredth time, you have a repository where every pull request is linked to an issue, every breaking change is flagged before merge, every bug fix has a test output attached, and your changelog almost writes itself."
- "Tie it to your commit convention. When the Type checklist mirrors your Conventional Commits types, contributors see the connection between their commit messages and the pull request review."

## Annotations for stinger-forge

- **Primary source for `templates/pr-description.md`**: The seven-section structure (description, type, breaking changes, docs, release notes, additional context, onboarding block) is the most complete and principled template structure in the research. Map the Bee's six-element description structure onto this template scaffold.
- **"Shifts the burden upstream"** is the single best justification for why PR templates exist. Include as the opening sentence of the PR description guide.
- **Breaking changes section as first-class element**: The Command Brief's critical directive says "every PR description rewrite must include a 'What did NOT change' section." This template's "breaking changes" section is the complement: what DID change that could break downstream consumers.
- **Conventional Commits integration**: Tying the PR type checklist to Conventional Commits is a lightweight way to enforce commit discipline without additional tooling. Include as a recommended practice in the template.
- **"Template that takes 5 minutes will be abandoned"**: The anti-over-engineering principle is a guard against templates that become copy-paste noise. Include as a design principle in the template README.
- **Compounding returns argument**: The "changelog almost writes itself" payoff is the best downstream ROI argument for PR template adoption. Use in any persuasion context.
