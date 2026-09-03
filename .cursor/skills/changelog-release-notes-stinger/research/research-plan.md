---
research_depth: shallow
time_window: 2026-01 to 2026-06
page_budget: 6
queries:
  - "Keep a Changelog format 2026"
  - "Semantic Versioning breaking change library 2026"
  - "release notes copy craft developer tool 2026"
  - "npm package changelog GitHub Releases workflow"
date: 2026-06-16
---

# Research Plan: changelog-release-notes-stinger

## Scope

Shallow-tier research to support release communication for the @deeplake/hivemind npm package and CLI. Goal: enough evidence to author accurate guides for CHANGELOG format, semver decisions, copy craft, and the release mechanics, with no SaaS changelog-tool catalog.

## Sources to consult

1. **Keep a Changelog** (keepachangelog.com) - format standard and philosophy.
2. **Semantic Versioning 2.0.0** (semver.org) - bump rules; extend to the package's contract surfaces (CLI, library, harness contracts, MCP tools, Deep Lake schema).
3. **Release-note copy-craft practice** - impact-first framing, honest scope, distribution for developer tools.
4. **Repo ground truth** - `scripts/sync-versions.mjs`, `.github/workflows/release.yaml`, `publish-smoke-test.yaml`, `package.json` (read directly, feeds `guides/04-release-mechanics.md`).

## What success looks like

- `research-summary.md` naming the influential sources.
- Source files in `external/` for the format standard, semver, and copy craft.
- An `index.md` manifest linking every file.
- Open questions surfaced for refresh.
