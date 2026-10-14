# Guide 00: Principles

> Read this before any other guide. These are the non-negotiables.

*Derived from: `research/external/keep-a-changelog.md`, `research/external/semver.md`, `research/external/changelog-copy-craft.md`, `research/internal/command-brief-notes.md`*

---

## The core problem

A CHANGELOG for a fast-moving CLI/library fails in one of three ways:

1. **Over-automated:** raw `git log` dumped as bullets. Written for the next engineer, not the person upgrading.
2. **Under-communicated:** the package ships new versions but the CHANGELOG goes stale, so users diff source to find out what changed.
3. **Wrong semver:** a contract change shipped as a patch, breaking downstream installs silently.

The goal of `changelog-release-notes-worker-bee` is a human-authored, accurate, user-centric CHANGELOG.md plus matching GitHub Release notes that tell a developer exactly what changed about @deeplake/hivemind and whether the upgrade is safe.

## The principles

### 1. The CHANGELOG is for the person installing or upgrading, not for machines

*Source: `research/external/keep-a-changelog.md`*

> "Don't let your friends dump git logs into changelogs."

The reader runs `npm i -g @deeplake/hivemind` or pins a version in a harness. They want to know: what can I do now, what got fixed, and will upgrading break me?

### 2. Name the user-visible behavior, not the implementation

Good: "Recall no longer drops the most relevant memory when more than 50 match a query."
Bad: "Refactored the recall ranking pipeline to fix an off-by-one in the top-k sort."

The second may be accurate; the first is what the user needs.

### 3. Impact first, details second

Lead with the most meaningful change. If the biggest thing is "capture is now 5x faster on large repos," lead with that, not with the root cause.

### 4. Get the semver bump right - it is a contract, not a vibe

*Source: `research/external/semver.md`*

@deeplake/hivemind is depended on by harnesses and agents. The breaking-change surface is wider than most libraries: CLI flags and commands, library exports, the **harness contracts**, the **MCP tool surface**, and the **Deep Lake schema**. A change to any of those that is not backward compatible is a **major**. Mislabeling it as a patch or minor breaks downstream silently. See `guides/02-semver-decisions.md`.

### 5. Honest scope: name what is NOT in this release

When users have been waiting for something, one sentence prevents issues and builds trust:

> "We started work on cross-repo recall but it is not ready for the quality bar we want. No ETA yet."

This is NOT a date commitment. It is transparency.

### 6. One source of truth for the version

`package.json` is the single source. `scripts/sync-versions.mjs` runs as a `prebuild` hook and copies that version into every manifest (`.claude-plugin/plugin.json`, the harness plugin manifests, `marketplace.json`), and esbuild's `define` inlines it into the bundles. The CHANGELOG version heading **must** match the version that ships. A mismatch ships a lie. See `guides/04-release-mechanics.md`.

### 7. Keep a Changelog format, ISO dates, latest at top

CHANGELOG.md at repo root. Sections per release: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Latest release at the top, `[Unreleased]` above it. ISO dates only (`2026-06-16`). Every version heading links to a GitHub compare URL. See `guides/01-changelog-format.md`.

### 8. Distribution or it didn't happen

A CHANGELOG entry that ships but is never surfaced has zero discovery ROI. The minimum is a **GitHub Release** cut from the entry (the `release.yaml` flow). For significant releases: a README note and a post in the Slack community.

### 9. Respect the team's existing voice

Read the last two or three CHA