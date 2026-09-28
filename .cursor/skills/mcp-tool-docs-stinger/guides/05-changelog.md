# 05 - Changelog Discipline (tied to @deeplake/hivemind)

Writing a changelog for Hivemind that consumers can pin against. The changelog tracks `@deeplake/hivemind` releases - one entry per published version, not arbitrary dates.

## The version is single-sourced

`scripts/sync-versions.mjs` reads the version from `package.json` and propagates it across every manifest: `.claude-plugin/plugin.json`, `harnesses/claude-code/.claude-plugin/plugin.json`, `harnesses/openclaw/openclaw.plugin.json`, `harnesses/openclaw/package.json`, `harnesses/codex/package.json`, and both the metadata and per-plugin versions in `.claude-plugin/marketplace.json`. It runs as a `prebuild` hook so esbuild inlines the same value into the bundles. It is idempotent and exits non-zero if a target is missing or `package.json` has no version.

**Implication for the changelog:** the version at the top of the changelog must equal `package.json`'s version. Never write a changelog version that does not correspond to a real release. The single source is `package.json`; everything else, including the changelog heading, follows it.

## The [BREAKING] convention

Any change that breaks a consumer MUST be prefixed `[BREAKING]`. For Hivemind, the consumer-facing surfaces are the MCP tools, the TS public API, and the CLI.

**Breaking changes include:**

- Removing or renaming an MCP tool, or changing its input schema (a new required field, a removed field, a tightened constraint).
- Changing a tool's output shape that consumers parse.
- Removing or renaming an exported TS symbol, or changing a public signature.
- Removing or renaming a CLI command or flag, or changing a flag's meaning.

**Non-breaking changes (no prefix):**

- Adding a new MCP tool.
- Adding a new optional schema field.
- Adding a new exported symbol or a new CLI command/flag.
- Bug fixes that restore documented behavior.

Use `@deprecated` in the TS source (and a `[DEPRECATED]` changelog note) for symbols that still work but will be removed.

## Impact-first format

```markdown
## [0.9.0] - 2026-06-16

### [BREAKING] hivemind_search - `limit` max lowered from 100 to 50

**Who is affected:** Callers passing `limit > 50` to `hivemind_search`.
**Migration:** Cap `limit` at 50; the server now rejects higher values.
**Why:** Backend page-size guardrail.

### Added: `hivemind_index` `prefix` filter

`hivemind_index` now accepts an optional `prefix` to scope results to one user's summaries. No migration needed.

### Fixed: fresh-org reads no longer surface raw backend errors

A missing-table 400 on a fresh org is now reported as "memory is empty" (issue #252).
```

**Rules:**

1. Lead with impact: who is affected and what breaks.
2. Include migration steps for every `[BREAKING]` entry.
3. Group by surface (MCP tools / TS API / CLI) when an entry spans several.
4. Newest version at the top.

## Semantic versioning for `@deeplake/hivemind`

| Change type | Version bump |
|---|---|
| Breaking change to a tool, public type, or CLI command | MAJOR |
| New tool, new optional field, new command, non-breaking addition | MINOR |
| Bug fix, doc-only, internal-only change | PATCH |

Bump the version in `package.json`, run the build (which runs `sync-versions` as a `prebuild` hook), and add the matching changelog entry in the same change.

## Changelog placement

Single repo, single package: a `CHANGELOG.md` at the repo root, one section per `@deeplake/hivemind` version. The top heading must match `package.json`. See `templates/changelog-entry.md` and `examples/changelog-entry.md`.
