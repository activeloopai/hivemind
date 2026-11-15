---
source_url: https://github.com/thomvaill/log4brains
retrieved_on: 2026-05-20
source_type: github-readme
authority: official
relevance: critical
topic: tooling
stinger: adr-writing-stinger
---

# Log4brains - Architecture Decision Records (ADR) Management Tool (v1.1.0, Dec 2024)

## Summary

Log4brains is a docs-as-code ADR management tool built on Next.js, distributed as a global npm package (`npm install -g log4brains`). It provides: local preview with Hot Reload, interactive CLI-based ADR creation (`log4brains adr new`), static site generation for publishing to GitHub/GitLab Pages or S3, timeline menu, and full-text search. v1.1.0 was released December 17, 2024, after a series of alpha releases through Dec 2024. Configured via `.log4brains.yml`. Supports mono and multi-package projects. Language-agnostic (requires Node/npm, works for any project type).

## Key quotations / statistics

- Latest release: v1.1.0, December 17, 2024
- "Docs-as-code: ADRs are written in markdown, stored in your git repository, close to your code"
- Installation: `npm install -g log4brains` then `log4brains init`
- Create ADR: `log4brains adr new`
- Configuration file: `.log4brains.yml` with required fields: `project.name`, `project.tz`, `project.adrFolder`
- Multi-package support: add `project.packages` array with `name`, `path`, `adrFolder` per package
- GitHub Actions publish workflow: `.github/workflows/publish-log4brains.yml` using `log4brains-web build`
- "Superseeded [sic] by log4brains" appears in the adr/adr-tools repo, indicating log4brains is the current recommended tool
- Credits Nygard for ADR methodology, MADR for template, npryce for adr-tools CLI inspiration

## Annotations for stinger-forge

- `guides/05-tooling-integration.md`: This is the primary source for the Log4brains section. Include: installation steps, `log4brains init` wizard walkthrough, `log4brains adr new` workflow, `.log4brains.yml` schema with all fields (required and optional), GitHub Pages CI/CD example.
- The `project.tz` field is worth calling out - it affects how dates appear in the published UI.
- The multi-package support is a key differentiator for monorepos; include the `packages` array example.
- Note for stinger-forge: v1.1.0 was a December 2024 release after a long gap. The tool is active but not under heavy development velocity. The `adr/adr-tools` repo notes log4brains supersedes it.
- `guides/06-adr-as-onboarding-tool.md`: The static site generation (GitHub Pages / S3) pattern turns the ADR log into a browsable knowledge base - mention this as the highest-ROI onboarding pattern.
