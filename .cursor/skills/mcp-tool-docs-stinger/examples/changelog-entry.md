# Example: Changelog Entry for a Version Bump

A worked changelog entry tied to a real `@deeplake/hivemind` version bump.

**Demonstrates:** `guides/05-changelog.md` (impact-first format, version single-sourced by `sync-versions`)

---

## Scenario

A release adds the `prefix` filter to `hivemind_index`, lowers the `hivemind_search` `limit` ceiling, and fixes the fresh-org error surfacing. The version in `package.json` is bumped; `scripts/sync-versions.mjs` propagates it to every manifest on the next build.

## Bad changelog entry (before)

```markdown
## Latest

- Updated search and index tools
- Bug fixes
```

**Problems:** No version (the changelog must track the published `@deeplake/hivemind` version). No `[BREAKING]` tag on the lowered `limit`. No migration guidance. "Bug fixes" is unparseable.

## Good changelog entry (after)

```markdown
## [0.9.0] - 2026-06-16

### [BREAKING] hivemind_search - `limit` max lowered from 100 to 50

**Who is affected:** Callers passing `limit > 50` to `hivemind_search`.
**Migration:** Cap `limit` at 50. The server now rejects higher values per the zod schema.
**Why:** Backend page-size guardrail.

### Added: `hivemind_index` `prefix` filter

`hivemind_index` now accepts an optional `prefix` (e.g. `/summaries/alice/`) to scope
results to one user's summaries. Omitting it keeps the previous behavior. No migration needed.

### Fixed: fresh-org reads no longer surface raw backend errors

A missing-table 400 on a fresh org is now reported as "Hivemind memory is empty ..."
instead of the raw backend error (issue #252).
```

## CHANGELOG.md placement

```markdown
# Changelog

All notable changes to `@deeplake/hivemind` are documented here.
The version at the top of each section matches `package.json`
(single-sourced across manifests by scripts/sync-versions.mjs).

## [0.9.0] - 2026-06-16

### [BREAKING] hivemind_search - `limit` max lowered from 100 to 50
...

## [0.8.2] - 2026-06-01
...
```

## The version chain

1. Bump `version` in `package.json`.
2. The `prebuild` hook runs `scripts/sync-versions.mjs`, propagating the version to `.claude-plugin/plugin.json`, the harness manifests, and `.claude-plugin/marketplace.json`.
3. The changelog's top heading is set to the same version.

The top of the changelog and `package.json` must always agree.

*References: `guides/05-changelog.md`, `scripts/sync-versions.mjs`*
