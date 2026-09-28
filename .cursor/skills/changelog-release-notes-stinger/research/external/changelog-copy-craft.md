---
source: external
type: best-practices
authority: medium
relevance: high
topic: changelog-copy-craft
url: community-synthesis
retrieved: 2026-06-16
---

# Source: Release-Note Copy Craft Best Practices (2026 Community Synthesis)

**Origin:** Synthesis of developer-tool release-note practice (Keep a Changelog guidance, well-run OSS CLI/library projects, and changelog discussions) as of 2026-06-16.

## The core tension

A CHANGELOG for a CLI/library serves two readers:
1. **The next engineer** wants an accurate record (commit-level detail, PRs, issues).
2. **The person installing or upgrading** wants to know what changed for them and whether the upgrade is safe.

A good CHANGELOG is written for the upgrader and linked to the engineering record; it is not a re-export of git history.

## Proven copy patterns

### Impact-first structure

```
## [Version] - YYYY-MM-DD

One-sentence summary of the most important thing that changed.

### Added / Changed / Fixed / ... (Keep a Changelog sections)
- "[Who can now do what]" or "[What was broken is now fixed]"
- For a CLI/library, name the surface: CLI flag, library export, MCP tool, harness contract, schema.

### Migration (only for breaking changes)
- Numbered steps the upgrader follows.
```

### Impact verbs, not implementation verbs

Use: added, improved, fixed, made faster, reduced, removed, enabled.
Avoid: refactored, optimized, bumped, migrated, patched, "resolved #1234".

### The honest scope note

Naming what did NOT ship - and a brief "why not" - builds trust and prevents "where is X?" issues. It is not a date commitment.

> "We started work on cross-repo recall but it is not ready for the quality bar we want. No ETA yet."

### Tone calibration

Read the last couple of entries before writing; match register and length. For a developer tool, keep it concise and concrete - no marketing adjectives.

## Cadence for an auto-releasing package

- A pipeline that auto-patches on every push (like Hivemind's `release.yaml`) will ship many versions. Land an `[Unreleased]` bullet per user-facing PR so each release inherits documentation; do not write an entry for purely internal patches.
- Promote `[Unreleased]` to a dated heading when a release cuts; the GitHub Release body is that entry.

## Distribution-or-it-didn't-happen

A CHANGELOG entry no one is pointed at has zero ROI. The minimum is a GitHub Release cut from the entry. Significant or breaking releases also get a README callout and a post in the Slack community so harness users see a contract change before they upgrade.

## Applicability to stinger guides

- `guides/00-principles.md` - the core tension and impact-first principle.
- `guides/03-copy-craft.md` - the template, verb list, and honest scope note.
- `guides/04-release-mechanics.md` - cadence and distribution.
- `examples/minor-release.md`, `examples/breaking-change.md` - applied here.
