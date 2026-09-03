# Guide 01: Changelog Format

> Use when setting up CHANGELOG.md from scratch or when you need the canonical structure for a new entry.

*Derived from: `research/external/keep-a-changelog.md`, `research/external/semver.md`*

---

## The format: Keep a Changelog + Semantic Versioning

@deeplake/hivemind uses a plain Markdown `CHANGELOG.md` at the repo root, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html). No SaaS changelog tool. GitHub Releases is the distribution surface, cut from the same entries.

If anyone asks about a hosted changelog widget or platform: we do not use one. A Markdown CHANGELOG.md plus GitHub Releases is the entire system, and it never needs migrating away.

## File skeleton

```markdown
# Changelog

All notable changes to @deeplake/hivemind are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.3] - 2026-06-16
### Fixed
- Recall no longer drops the most relevant memory when more than 50 match a query.

## [0.7.0] - 2026-05-20
### Added
- `skillify` command: promote a captured session into a reusable skill.

[Unreleased]: https://github.com/activeloopai/hivemind/compare/v0.7.3...HEAD
[0.7.3]: https://github.com/activeloopai/hivemind/compare/v0.7.0...v0.7.3
[0.7.0]: https://github.com/activeloopai/hivemind/releases/tag/v0.7.0
```

The full template is at `templates/changelog-skeleton.md`. A single-entry template is at `templates/changelog-entry.md`.

## Section vocabulary

Use the Keep a Changelog sections, in this order, omitting any that are empty:

| Section | Use for |
|---|---|
| `Added` | New CLI commands/flags, new library exports, new MCP tools, new capture/recall/skillify capabilities. |
| `Changed` | Behavior changes to existing features. If the change is not backward compatible, it is also a breaking change - see `guides/02-semver-decisions.md`. |
| `Deprecated` | Features still working but slated for removal. Always give a removal version/date. |
| `Removed` | Features gone in this release. Note what replaces them. |
| `Fixed` | Bug fixes, described as the symptom the user hit. |
| `Security` | Vulnerability fixes. Name the affected component and severity; do not leak exploit detail before users can upgrade. |

For Hivemind specifically, organize within a section by the surface the user touches: CLI, library API, harness contract, MCP tool, Deep Lake schema.

## Conventions

- **Latest at top.** Newest release heading directly under `[Unreleased]`.
- **ISO dates.** `2026-06-16`, never `June 16, 2026`.
- **One heading per shipped version**, matching exactly what `sync-versions.mjs` will ship (see `guides/04-release-mechanics.md`).
- **Compare-URL footer.** Every version heading gets a link entry at the bottom pointing at the GitHub compare or release URL. This is the audit trail.
- **`[Unreleased]` is a staging area.** Land changelog bullets there as PRs merge; promote them under a dated version heading when the release cuts.

## The Unreleased workflow

1. As each user-facing PR merges, add its bullet under `## [Unreleased]` in the right section.
2. When a release cuts, rename `[Unreleased]` to the new version heading with today's ISO date, and add a fresh empty `[Unreleased]` above it.
3. Update the compare-URL footer.
4. The GitHub Release notes (cut by `release.yaml`) are this entry's body.

## GitHub Releases

GitHub Releases is the distribution channel, not a second source of truth. The release body is the CHANGELOG entry for that version. The `release.yaml` workflow creates the release and tag; `publish-smoke-test.yaml` verifies the published npm package afterward. See `guides/04-release-mechanics.md`.

## Anti-patterns

- A hosted changelog widget/platform - not used; do not recommend one.
- A CHANGELOG heading version that does not match `package.json` / the shipped tag.
- Letting `[Unreleased]` rot for many releases so nobody trusts it.
- Sections full of internal-only changes (refactors, CI, test coverage) that no installer notices.
