---
source: internal
type: command-brief
authority: authoritative
relevance: high
topic: bee-identity-and-scope
---

# Source: changelog-release-notes-worker-bee Command Brief

**Path:** `ai-tools/command-briefs/changelog-release-notes-worker-bee-command-brief.md`

## Summary

`changelog-release-notes-worker-bee` owns release communication for the **@deeplake/hivemind** npm package and CLI - Activeloop's cloud-backed shared memory for coding agents. The domain spans:

1. **Changelog format** - Keep a Changelog `CHANGELOG.md` at the repo root; GitHub Releases as the distribution surface. No SaaS changelog tool.
2. **Semver decisions** - patch vs minor vs breaking for an agent-memory CLI/library, across a wide contract surface: CLI, library API, harness contracts, MCP tool surface, Deep Lake schema.
3. **Copy craft** - impact-first release notes, user-centric language, honest scope.
4. **Release mechanics** - `package.json` -> `scripts/sync-versions.mjs` (prebuild) -> esbuild `define`; `release.yaml` cuts the release, `publish-smoke-test.yaml` verifies the publish.
5. **Audit** - scoring an existing CHANGELOG for cadence, language, semver accuracy, distribution, and honest scope.

## Key constraints captured

- Never paste raw commit logs into the CHANGELOG.
- Name the user-visible behavior, not the implementation.
- Get the semver bump right - a harness/MCP/schema contract change is the breaking-change surface.
- Include honest scope when users expect something that did not ship.
- One source of truth for the version; the CHANGELOG heading must match what ships.
- Distribute the release (GitHub Release minimum; README + Slack for breaks).

## Stinger structure

- `guides/00-principles.md` - core doctrine
- `guides/01-changelog-format.md` - K