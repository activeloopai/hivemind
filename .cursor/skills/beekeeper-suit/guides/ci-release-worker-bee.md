# CI / Release Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `ci-release-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/ci-release-worker-bee.md`](../../../agents/ci-release-worker-bee.md)
**Stinger:** [`.cursor/skills/ci-release-stinger/`](../../ci-release-stinger/)
**Trigger policy:** proactive

---

## Domain

`ci-release-worker-bee` is the Army's build, CI, and npm-release engineer for `@deeplake/hivemind` (TS ^6 / Node >=22 / ESM). It owns how Hivemind builds (the esbuild multi-harness bundle, `tsc && node esbuild.config.mjs` producing `harnesses/{claude-code,codex,cursor,hermes,pi}/bundle`, `harnesses/openclaw/dist`, `mcp/bundle`, `bundle/cli.js`, `embeddings/`), how the version is single-sourced (`scripts/sync-versions.mjs` plus esbuild `define`), how it gates (`npm run ci` = typecheck + jscpd dup + vitest, husky pre-commit lint-staged tsc), how it runs in CI (the GitHub Actions architecture: ci.yaml, codeql.yaml, pr-checks.yaml, publish-smoke-test.yaml, release.yaml, plus the Node matrix and cross-node-install smoke), and how it ships to npm (the `files` allowlist, prepack, pack-check secret-scan, audit-openclaw, and native-dep healing via ensure-tree-sitter postinstall). This is a pure-npm, pure-ESM project: no container, no web framework, no cloud deploy.

## Trigger phrases

Route to `ci-release-worker-bee` when the user says any of:

- "The build is slow" / "review our build" / "the bundle is wrong"
- "Design our CI" / "audit our workflows" / "add a CI job"
- "npm release" / "cut a release"
- "Files allowlist" / "the npm pack ships junk"
- "pack-check" / "we leaked a secret on publish"
- "cross-node-install" / "tree-sitter broke on install"
- "sync-versions" / "the version is out of sync"

Or when build, workflow, bundle, or npm-publish concerns are in scope in a PR.

## Do NOT route when

- The user wants runtime TS/Node code design - that is `typescript-node-worker-bee`.
- The user wants Deep Lake dataset or retrieval logic - those are the dataset and retrieval Bees.
- The user wants a security CVE deep audit or secret-leak tracing - surface and hand off to `security-worker-bee`.
- The user wants changelog or release-notes prose - that is `changelog-release-notes-worker-bee`.
- The user wants dependency CVE triage, Renovate setup, or SBOM - that is `dependency-audit-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The build, CI, or release concern in scope (bundle, workflow, version sync, publish, native-dep heal).
- Access to `esbuild.config.mjs`, `scripts/sync-versions.mjs`, `scripts/pack-check.mjs`, `.github/workflows/`, and `package.json#files`.
- Optional: the failing job log or the symptom (slow build, drifted version, junk in the tarball).

If the concern or the symptom is unclear, do not invoke yet - ask the user what is failing.

## Outputs the Bee produces

- Build and bundle fixes (the two-step `tsc && esbuild` model, per-harness outputs).
- CI workflow designs and audits (pinned actions, Node matrix, cross-node-install smoke).
- npm-release discipline findings (files allowlist, prepack, pack-check, audit-openclaw, native-dep heal).

## Multi-Bee sequences this Bee participates in

- **Ship a release** - after the implementation Bees pass the Plan execution loop, `changelog-release-notes-worker-bee` writes the CHANGELOG and confirms the semver bump; `ci-release-worker-bee` then drives the build, the GitHub Actions workflows, and the npm publish.

## Critical directives the orchestrator should respect

- **The version is single-sourced** via `sync-versions.mjs` plus esbuild `define`; never hand-edit a per-harness manifest version.
- **The build is `tsc && node esbuild.config.mjs` - both run.**
- **`npm run ci` is the gate, and local equals CI.**
- **What ships is the `files` allowlist** - auditing a release is auditing the allowlist plus pack-check output.
- **Secrets never reach the tarball or the logs** (pack-check, audit-openclaw); the scoped release-only `GITHUB_TOKEN` is legitimate.
- **Pin actions, pin Node**, and **native deps self-heal on install** via ensure-tree-sitter. The gate is tsc + husky, not ESLint/Prettier.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
