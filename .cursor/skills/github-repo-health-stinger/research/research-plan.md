---
bee: github-repo-health-worker-bee
stinger: github-repo-health-stinger
depth_tier: normal
time_window: 2025-11 to 2026-05
page_budget: 20
conducted_by: scripture-historian (inline synthesis for slot-mode pipeline)
date: 2026-05-20
---

# Research Plan - github-repo-health-stinger

## Depth tier: normal

Normal depth: 10-20 primary sources, 6-month recency window, covers official docs + canonical blog posts + community best-practice guides. Does not require exhaustive literature review (that is `deep` tier).

## Query plan

1. "GitHub repository health audit checklist 2026" - finds current community checklists and scoring frameworks
2. "Branch protection rulesets required reviewers status checks 2026" - covers the 2025 Rulesets GA and 2026 best practice floor
3. "CODEOWNERS patterns monorepo polyrepo 2026" - covers directory ownership patterns, syntax edge cases, team vs. individual ownership
4. "Conventional commits semantic-release automation 2026" - covers commit format scoring, semantic-release compatibility, squash discipline
5. "GitHub issue PR template best practices 2026" - covers template structure, required fields, community health files

## Sources targeted

- GitHub Docs (official, authoritative)
- GitHub Engineering Blog (canonical for new feature rollouts like Rulesets GA)
- Conventional Commits specification (v1.0.0, stable)
- GitHub CLI docs (gh api, gh repo commands)
- GitHub Actions marketplace guides for required status checks
- semantic-release documentation (commit format automation)
- Community: github/gitignore (canonical .gitignore templates)

## Coverage intent

| Dimension | Primary guide | Research depth |
|---|---|---|
| Branching strategy | guides/01-branching-strategy.md | Normal |
| Branch protection rulesets | guides/02-branch-protection.md | Deep (2025 GA changes) |
| Commit quality + Conventional Commits | guides/03-commit-quality.md | Normal |
| CODEOWNERS | guides/04-codeowners.md | Normal |
| CI workflow density | guides/05-ci-workflows.md | Shallow (hands off to ci-release-worker-bee) |
| Docs presence | guides/06-docs-presence.md | Shallow |
| .gitignore coverage | guides/07-gitignore.md | Shallow |
| Issue/PR templates | guides/08-templates.md | Normal |
| Repo settings | guides/09-repo-settings.md | Normal |
