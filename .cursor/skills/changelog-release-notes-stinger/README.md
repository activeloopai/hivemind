# changelog-release-notes-stinger

A Cursor skill that writes the CHANGELOG.md and release notes for the **@deeplake/hivemind** npm package and CLI - Activeloop's cloud-backed shared memory for coding agents.

Paired with `changelog-release-notes-worker-bee`, the specialist that turns merged PRs into a Keep-a-Changelog entry, picks the right semver bump, and drafts the GitHub Release.

## What it covers

- **Changelog format** - Keep a Changelog `CHANGELOG.md` at the repo root, GitHub Releases as the distribution surface. No SaaS changelog tool.
- **Semver decisions** - patch vs minor vs breaking for an agent-memory CLI/library, with the wide contract surface: CLI, library API, harness contracts, MCP tool surface, and Deep Lake schema.
- **Copy craft** - impact-first release notes, the Hivemind verb table, the honest scope note, the before/after test.
- **Release mechanics** - how `package.json` -> `scripts/sync-versions.mjs` (prebuild) -> esbuild `define` single-sources the version, how `release.yaml` and `publish-smoke-test.yaml` cut and verify a release, and where the CHANGELOG plugs in.
- **Audit** - a five-dimension scoring framework (cadence, 