---
name: changelog-release-notes-stinger
description: Writes the CHANGELOG.md and release notes for the @deeplake/hivemind npm package and CLI. Use when the user says "write the changelog entry", "what version bump is this", "draft the release notes", "is this a breaking change", "we just shipped X", or when a release is about to cut and the change needs to be communicated to developers who install via npm and to the six-harness users. Covers Keep-a-Changelog format for a CLI/library, semver discipline (what is patch vs minor vs breaking for an agent-memory tool plus its harness contracts, MCP tool surface, and Deep Lake schema), release-note copy craft (impact-first, honest scope), the sync-versions + release.yaml mechanics, and announcing across GitHub Releases, README, and the Slack community. Do NOT use for managing the build/release pipeline itself (ci-release-worker-bee) or marketing launch campaigns (out of scope for this Army).
---

# changelog-release-notes Stinger

You are the playbook for `changelog-release-notes-worker-bee`. Every invocation should leave one concrete artifact: a ready-to-commit CHANGELOG.md entry, a version-bump decision, GitHub Release notes, or a changelog audit. The research in `research/` backs the format and semver claims in these guides.

This skill is specific to **@deeplake/hivemind** - Activeloop's cloud-backed shared memory for coding agents (TypeScript, Node >=22, ESM, published to npm as a library plus a CLI). The audience is developers who run `npm i -g @deeplake/hivemind` and the six-harness users. Release notes speak to capture / recall / skillify / harness changes, not marketing fluff.

## When this stinger applies

Load this stinger for any of:

- Writing a CHANGELOG.md entry for a Hivemind release.
- Deciding the version bump (patch / minor / major) for a set of changes.
- Drafting GitHub Release notes from the CHANGELOG entry.
- Auditing the existing CHANGELOG for quality, cadence, or honest scope.
- Tying a release to the `sync-versions.mjs` + `release.yaml` mechanics.

Do NOT load for:
- The build/release pipeline / CI internals themselves - that is `ci-release-worker-bee`.
- Marketing landing pages or launch campaigns - out of scope for this Army.
- Internal sprint retrospectives - not a changelog.

## First action when this stinger is loaded

1. Read `guides/00-principles.md` - the non-negotiables that govern every output.
2. Match the user's request to one of the four triage intents below.
3. Open the relevant guide(s) before producing any output.

## Folder layout

```text
changelog-release-notes-stinger/
+- SKILL.md                          (this file)
+- README.md                         (one-page human overview)
+- guides/
|  +- 00-principles.md               (core doctrine: user-centric, honest scope, one source of truth)
|  +- 01-changelog-format.md         (Keep-a-Changelog CHANGELOG.md + GitHub Releases for a CLI/library)
|  +- 02-semver-decisions.md         (patch vs minor vs breaking; the contract surfaces that break)
|  +- 03-copy-craft.md               (release-note writing: impact-first, honest scope, the before/after test)
|  +- 04-release-mechanics.md        (sync-versions.mjs + release.yaml; how the changelog ties in)
|  +- 05-audit-playbook.md           (scoring framework for the existing CHANGELOG)
+- examples/
|  +- minor-release.md               (a Hivemind minor-release CHANGELOG entry from raw PRs)
|  +- breaking-change.md             (a harness/MCP/schema contract break with migration notes)
|  +- audit-report-example.md        (filled-in audit of a hypothetical CHANGELOG)
+- templates/
|  +- changelog-skeleton.md          (a fresh CHANGELOG.md skeleton)
|  +- changelog-entry.md             (a single release-notes entry template)
+- reports/
|  +- README.md                      (where past audit reports accumulate)
+- research/
   +- research-plan.md
   +- research-summary.md
   +- index.md
   +- internal/command-brief-notes.md
   +- external/keep-a-changelog.md
   +- external/semver.md
   +- external/changelog-copy-craft.md
```

## Critical directives

These apply on every invocation. Full justifications in `guides/00-principles.md`.

- **Never paste raw commit logs into the CHANGELOG.** Re-frame commits for what changed for the person installing or upgrading the package.
- **Name the user-visible behavior, not the implementation.** "Recall now returns results in relevance order" beats "refactored the recall ranking pipeline."
- **Get the semver bump right.** A harness contract, MCP tool surface, or Deep Lake schema change is the breaking-change surface for this package. See `guides/02-semver-decisions.md`.
- **Include honest scope.** When users expect something that did NOT ship, say so in one sentence.
- **One source of truth for the version.** `package.json` feeds `scripts/sync-versions.mjs` (prebuild), which inlines the version into every manifest and bundle via esbuild `define`. The CHANGELOG version heading must match the version that ships. See `guides/04-release-mechanics.md`.
- **Distribute the release.** A CHANGELOG entry with no GitHub Release and no communit