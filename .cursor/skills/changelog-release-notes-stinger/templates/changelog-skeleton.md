# Template: CHANGELOG.md Skeleton

> Use to bootstrap a fresh `CHANGELOG.md` at the repo root for @deeplake/hivemind. Keep a Changelog + Semantic Versioning. Replace the example versions with the real history.

---

```markdown
# Changelog

All notable changes to @deeplake/hivemind are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-05-20
### Added
- Initial public changelog entry. (Replace with the real first documented release.)

[Unreleased]: https://github.com/activeloopai/hivemind/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/activeloopai/hivemind/releases/tag/v0.7.0
```

---

## Notes

- **`[Unreleased]`** is the staging area. Land bullets here as PRs merge; promote to a dated heading when a release cuts (`guides/01-changelog-format.md`).
- **Section order:** `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Omit empty sections.
- **Version heading must match** the version `package.json` -> `scripts/sync-versions.mjs` ships (`guides/04-release-mechanics.md`).
- **Compare-URL footer:** add a link line for every version heading. The newest points at `compare/vPREV...vNEW`; the oldest documented points at its release tag.
- Adjust the GitHub org/repo path in the URLs if the canonical remote differs.
