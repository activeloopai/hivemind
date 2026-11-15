---
source_url: https://daily.dev/es/blog/best-practices-for-github-markdown-badges
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: badges
stinger: readme-writing-stinger
---

# Best Practices for GitHub Markdown Badges (daily.dev, 2025-2026)

## Summary

Practitioner guide on badge strategy for GitHub READMEs, covering optimal quantity, placement, content selection, and maintenance. The consensus position: 3-5 badges maximum in the header, positioned immediately after title and tagline. Badges should communicate health and status (CI, coverage, version, downloads, license) - not decorate the page. The guide draws a hard line between "status badges" (which earn their place by informing the reader) and "vanity badges" ("made with love", "PRs welcome" without evidence) which add noise without signal. Shields.io is the canonical badge provider. GitHub Actions can automate badge data currency.

## Key quotations / statistics

- "Use 3-5 badges maximum in your README header."
- "Position badges immediately after your title and tagline, before the description, for immediate visibility."
- Approved badge types: CI/CD build status, license, version number, download count, code coverage.
- Vanity anti-patterns: "made with ❤️", "PRs welcome" (without supporting documentation), broken badges (dead CI pipelines, outdated numbers).
- "Only include badges meaningful to your specific project."
- "Use GitHub Actions to keep badge data current."
- Shields.io official docs (https://shields.io/docs/) confirm: the platform supports CI, package registries, code coverage services, and provides a builder tool for custom colors, logos, and styles.

## Annotations for stinger-forge

- **`guides/02-badges.md`**: This is the primary source for the badge guide. Structure the guide around: (1) the 3-5 rule, (2) approved categories, (3) anti-pattern catalog, (4) Shields.io URL patterns, (5) dynamic vs static badge choice, (6) automated currency via GitHub Actions.
- The vanity badge anti-pattern list ("made with ❤️", "PRs welcome" without substance) should become a "do not add" checklist item in `guides/05-done-checklist.md`.
- Shields.io URL pattern for CI: `https://img.shields.io/github/actions/workflow/status/{user}/{repo}/{workflow}.yml` - include this concrete pattern in the badge guide.
- Placement rule (after title, before description) is a structural constraint that should propagate to `guides/01-structure-checklist.md`.
