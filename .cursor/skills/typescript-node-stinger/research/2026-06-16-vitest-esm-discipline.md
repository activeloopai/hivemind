# 2026-06-16 - Vitest ESM discipline

Authored 2026-06-16 from `package.json`, the `tests/` tree, and Vitest docs. Repo is the source of truth.

## Sources

- https://vitest.dev/guide/ , https://vitest.dev/guide/coverage
- `package.json` (`test` = `vitest run`, `ci`, `@vitest/coverage-v8`), `tests/` (229 `*.test.ts`).

## Summary

Tests are Vitest ^4. `npm test` runs `vitest run` (single non-interactive pass, exits with a status), chained in `npm run ci` as `typecheck && dup && test`. Coverage is `@vitest/coverage-v8` (`vitest run --coverage`). The `tests/` tree mirrors `harnesses/` (`tests/claude-code`, `tests/codex`, `tests/cursor`, `tests/hermes`, `tests/openclaw`, `tests/pi`) plus `tests/cli`, `tests/scripts`, `tests/shared`.

Discipline observed / enforced:

- **`vitest run`, not watch, in CI** - watch hangs the runner.
- **No real network** - units accept the Deep Lake client (or a context) so tests inject a fake (`vi.fn` for `query`). For client-internal tests, `vi.spyOn(globalThis, "fetch")` with fake timers exercises the 429-then-200 retry/backoff path.
- **Order independence** - `vi.restoreAllMocks()` (or `clearMocks`/`restoreMocks` in config) between tests; an order-dependent test is a must-fix.
- **Temp dirs, not the repo tree** - `mkdtempSync` + cleanup in `afterEach`.
- **`.js` extensions on relative imports** apply in tests too (same ESM rule).

## Key facts the guides depend on

- New exported functions / MCP tools / hooks get a test in the mirror (`guides/10`).
- Mock the injected client, not global fetch, for unit tests of consumers (`guides/11`).

## Relevance

- `guides/10-vitest-discipline.md`, `guides/11-vitest-async-fixtures.md`, `templates/vitest.config.ts`, `templates/example.test.ts`.
