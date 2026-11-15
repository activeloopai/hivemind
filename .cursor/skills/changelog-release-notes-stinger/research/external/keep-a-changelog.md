---
source: external
type: standard
authority: high
relevance: high
topic: changelog-format-standard
url: https://keepachangelog.com
---

# Source: Keep a Changelog

**URL:** https://keepachangelog.com  
**Author:** Olivier Lacan  
**Why it matters:** The de-facto community standard for markdown-based changelogs. Establishes the vocabulary and hierarchy that most changelog tools understand or import.

## Core conventions

- Changelog entries go in `CHANGELOG.md` at the project root.
- Sections per release: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Latest release at the top; `[Unreleased]` section above it for in-progress changes.
- Semantic versioning links in the footer: each version heading links to a GitHub compare URL.
- Human-readable prose, not machine-generated commit lists.

## Guiding philosophy (from the site)

> "Don't let your friends dump git logs into changelogs." - the canonical anti-pattern.

- Changelogs are FOR humans, not machines.
- Every version should be linkable.
- Latest always at top.
- Use ISO dates (YYYY-MM-DD) - unambiguous internationally.
- Use semantic versioning.

## Limitations / when NOT to follow

- Keep a Changelog is format-only; it says nothing about distribution or how the version is cut. For @deeplake/hivemind, distribution is GitHub Releases (cut by `release.yaml`) plus README/Slack for breaks, and the version is single-sourced by `package.json` -> `scripts/sync-versions.mjs`.
- The prescribed categories (Added/Changed/Deprecated/Removed/Fixed/Security) fit a CLI/library well; within a section, organize by the surface the user touches (CLI, library API, harness contract, MCP tool, Deep Lake schema).
- It is format-only - pair it with Semantic Versioning (`semver.md`) for the bump decision.

## Applicability to stinger guides

- `guides/00-principles.md` - cite the "not for machines" philosophy (pri