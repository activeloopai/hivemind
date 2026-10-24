# Changelog / Release Notes Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `changelog-release-notes-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/changelog-release-notes-worker-bee.md`](../../../agents/changelog-release-notes-worker-bee.md)
**Stinger:** [`.cursor/skills/changelog-release-notes-stinger/`](../../changelog-release-notes-stinger/)
**Trigger policy:** proactive

---

## Domain

`changelog-release-notes-worker-bee` owns release communication for `@deeplake/hivemind` - Activeloop's cloud-backed shared memory for coding agents, shipped as a TypeScript library plus a CLI on npm. It turns a set of merged PRs into a Keep-a-Changelog CHANGELOG.md entry, picks the correct semver bump across this tool's contract surfaces (the CLI, the library API, the six harness contracts, the MCP tool surface, and the Deep Lake schema), drafts impact-first GitHub Release notes, confirms the change against the `sync-versions` plus release.yaml mechanics, and points the change at the right channels (GitHub Releases, README, and the community).

## Trigger phrases

Route to `changelog-release-notes-worker-bee` when the user says any of:

- "Write a changelog entry" / "write the changelog entry"
- "Version bump" / "what version bump is this"
- "Semver decision" / "is this a breaking change"
- "Release notes" / "draft the release notes"
- "We just shipped" / "we just shipped X"

Or when a release is about to cut and the change needs to be communicated to npm consumers and the six-harness users.

## Do NOT route when

- The user wants the build, CI workflows, or the npm publish pipeline itself - that is `ci-release-worker-bee`. This Bee writes the prose and picks the bump; ci-release drives the mechanics.
- The user wants dependency CVE triage or SBOMs - that is `dependency-audit-worker-bee`.
- The user wants MCP tool reference docs - that is `mcp-tool-docs-worker-bee`.
- The user wants a marketing launch campaign or internal sprint retrospectives.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The set of merged PRs or the change being released.
- Which contract surface the change touches (CLI, library API, harness contract, MCP tools, Deep Lake schema) - this drives the semver bump.
- Access to CHANGELOG.md and `package.json` (the version source of truth).

If the change set is missing, do not invoke yet - ask the user what shipped.

## Outputs the Bee produces

- A Keep-a-Changelog CHANGELOG.md entry framed for the person installing or upgrading, not the next engineer.
- The semver bump decision tied to the contract surface, matching what `sync-versions.mjs` inlines.
- Impact-first GitHub Release notes and a distribution plan (Releases minimum; README note and community post for significant releases).

## Multi-Bee sequences this Bee participates in

- **Ship a release** - after the implementation Bees pass the Plan execution loop, `changelog-release-notes-worker-bee` writes the CHANGELOG entry and confirms the semver bump; `ci-release-worker-bee` then drives the build, workflows, and npm publish.

## Critical directives the orchestrator should respect

- **Never paste raw commit logs into the CHANGELOG** - re-frame for the installer/upgrader.
- **Name the user-visible behavior, not the implementation.**
- **Get the semver bump right** - a harness contract, MCP tool-surface, or Deep Lake schema change is the breaking-change surface.
- **Include honest scope when relevant.**
- **One source of truth for the version** - the CHANGELOG heading must match `sync-versions.mjs`.
- **Distribute the release** - GitHub Releases is the minimum.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
