# CodeQL for javascript-typescript

**Date:** 2026-06-16
**Feeds:** `guides/04-workflows.md`

## Claim

Hivemind runs CodeQL static analysis over its TypeScript source using the default `javascript-typescript` pack.

## Evidence (from the repo)

- `.github/workflows/codeql.yaml` runs CodeQL with the `javascript-typescript` language.

## Why it matters

- CodeQL is the source-level static-analysis layer. In a containerless npm project it plays the role "image scanning" plays in a container world - except it scans the TypeScript, while `audit:openclaw` and `pack-check` scan the *publish* surface (the bundle + the tarball).
- The default pack is the contract. Authoring custom queries is out of scope for this Bee (judgment call recorded in `open-questions.md`); the value here is keeping the default pack wired and green, not extending it.

## Sources

- GitHub code scanning / CodeQL: https://docs.github.com/en/code-security/code-scanning
- Repo: `.github/workflows/codeql.yaml`.
