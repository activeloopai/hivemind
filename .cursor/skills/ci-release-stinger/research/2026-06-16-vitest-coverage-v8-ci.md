# Vitest + coverage-v8 in CI

**Date:** 2026-06-16
**Feeds:** `guides/03-quality-gate.md`

## Claim

Hivemind tests with Vitest ^4, measures coverage with the v8 provider, and surfaces coverage on the CI job page and as a PR comment.

## Evidence (from the repo)

- `package.json`: `"test": "vitest run"`; dev dep `@vitest/coverage-v8`; config in `vitest.config.ts`.
- `ci.yaml` `test` job: "Run tests with coverage" (`vitest run --coverage`), "Write coverage summary to job page", "Build PR coverage comment", "Post coverage comment on PR" via `davelosert/vitest-coverage-report-action`. The top-level `permissions: pull-requests: write` exists to allow that comment.
- Windows mirror in the `windows-test` job.

## Why it matters

- The v8 provider uses the engine's built-in coverage, so it's fast and needs no instrumentation transform.
- Coverage-as-PR-comment turns the metric into review signal without a separate dashboard. The `pull-requests: write` permission is the minimum needed and is scoped at the workflow level.

## Sources

- Vitest coverage docs: https://vitest.dev/guide/coverage
- vitest-coverage-report-action: https://github.com/davelosert/vitest-coverage-report-action
- Repo: `package.json`, `vitest.config.ts`, `.github/workflows/ci.yaml`.
