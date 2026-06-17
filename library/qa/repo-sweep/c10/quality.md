# QA Report: Repo Sweep C10 - shared tests

**Plan document:** none (standalone repo-sweep audit; paired security pass at `library/qa/repo-sweep/c10/security.md`)
**Audit date:** 2026-06-16
**Base branch:** `main`
**Head:** `pr/05-security-quality-repo-sweep`
**Auditor:** quality-worker-bee
**Scope:** all 69 `.ts` files under `tests/shared/` (29 top-level + 40 under `tests/shared/graph/`)

## Summary

Pass. The `tests/shared/` suite is healthy: no leftover focus (`it.only`/`.skip`/`fit`/`fdescribe`), no `console.log`/`debugger`, real `expect()` assertions throughout, and per-test `mkdtemp` + env save/restore isolation. The only actionable gap was missing negative-path coverage for the sweep's `sqlIdent` SQL-injection hardening on three shared write paths, so I added four targeted guard tests (`updateColumns` column-key, `updateColumns` table-name, `createIndex` column, `listSkillInvocations` sessions-table). `tsc --noEmit` passes clean, and the two touched files run 88 green tests. No Critical or Warning quality bugs remain; the residual items are two low-severity Suggestions (a survival-style assertion and two un-cleaned temp dirs).

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | Every test asserts what its name claims; no tests assert less than implied. |
| Correctness   | ✅ | Mocks faithful to current `DeeplakeApi`/`fetch`/`child_process` surfaces; SQL assertions match emitted strings. |
| Alignment     | ✅ | `mkdtempSync` + `try/finally` env-restore conventions followed across the suite. |
| Gaps          | ⚠️ | Three `sqlIdent` wiring sites lacked negative coverage (now added). |
| Detrimental   | ✅ | No shared-mutable-global leaks that cross tests; no stale mocks; no regressions. |

## Critical Issues (must fix)

None.

## Warnings (should fix)

None. The coverage gaps below were remediated in this audit's commit rather than left open, because the task explicitly scoped adding tests for the sweep's security fixes.

## Suggestions (consider improving)

- [ ] **Survival-only assertion is vacuous on its own**, `tests/shared/spawn-detached.test.ts:143`

  ```ts
  expect(true).toBe(true); // we got here → no unhandled crash
  ```

  The real check (the in-process call does not crash the runner via an unhandled ENOENT) is implicit in reaching the line. The intent is documented and the surrounding sibling tests assert the observable behavior, so this is not a bug. Consider replacing it with `expect(() => spawnDetachedNodeWorker(...)).not.toThrow()` plus the existing waits, so the assertion names what it guards.

- [ ] **`mkdtemp` dirs created per-test but never removed**, `tests/shared/deeplake-api.test.ts:26`, `tests/shared/skillopt-trigger.test.ts:121`

  ```ts
  // deeplake-api.test.ts
  beforeEach(() => { process.env.HIVEMIND_INDEX_MARKER_DIR = mkdtempSync(join(tmpdir(), "hivemind-index-marker-")); });
  afterEach(() => { delete process.env.HIVEMIND_INDEX_MARKER_DIR; });
  ```

  Each test gets a fresh `mkdtemp` dir and the env override is restored, so there is no cross-test contamination (isolation is sound). But the directory itself is never `rmSync`'d, so the suite leaks one empty temp dir per test into `tmpdir()`. Add `rmSync(dir, { recursive: true, force: true })` in `afterEach` to match the cleanup discipline used elsewhere in the suite.

## Notes (not findings)

- `DeeplakeApi.commit()` wraps `upsertRowSql` in `Promise.allSettled` (`src/deeplake-api.ts:318`), so a `sqlIdent` throw on the upsert/insert table name is swallowed rather than surfaced. This is pre-existing production behavior and outside the C10 (`tests/shared/`) scope. Because of it, the table-name guard is exercised through `updateColumns` (which `await`s `query` directly and propagates), not through `commit()`. Flagging for visibility; no action requested here.

## Coverage added for sweep security fixes (sqlIdent hardening)

- [x] **`updateColumns` column-key sqlIdent guard**, `tests/shared/deeplake-api.test.ts:324-331`

  The sweep wired `sqlIdent(col)` onto every column key in `updateColumns` (`src/deeplake-api.ts:356-362`) so a tainted key cannot break out of the `SET` clause. The existing test only exercised valid keys (`description`, `size_bytes`). Added a negative test asserting a malicious key throws `Invalid SQL identifier` and that `fetch` is never called.

- [x] **`updateColumns` table-name sqlIdent guard**, `tests/shared/deeplake-api.test.ts:332-339`

  Same method also validates `this.tableName` via `sqlIdent` (`src/deeplake-api.ts:356`). Added a test constructing the API with a non-identifier table name and asserting the guard throws before any query dispatch.

- [x] **`createIndex` column sqlIdent guard**, `tests/shared/deeplake-api.test.ts:340-345`

  The sweep changed `createIndex` from `sqlStr(column)` (a value escaper, wrong for a bare identifier) to `sqlIdent(column)` / `sqlIdent(this.tableName)` (`src/deeplake-api.ts:374-378`). Added a negative test asserting a non-identifier column throws and dispatches no query.

- [x] **`listSkillInvocations` sessions-table sqlIdent guard**, `tests/shared/skill-invocations.test.ts:96-102`

  The sweep wired `sqlIdent(sessionsTable)` into `listSkillInvocations` and `windowAroundInvocation` (`src/skillify/skill-invocations.ts:108,147`). Added a test asserting a non-identifier sessions table throws `Invalid SQL identifier` before the query callback runs (`calls.length === 0`).

## Plan Item Traceability

| #   | Plan Requirement                                                  | Status | Implementation Location | Notes |
|-----|------------------------------------------------------------------|--------|-------------------------|-------|
| Q1  | Run `tsc --noEmit`, no type errors                               | ✅ | n/a | Exit 0 before and after edits. |
| Q2  | Test correctness: no vacuous / always-pass assertions            | ✅ | suite-wide grep | One survival-style `expect(true).toBe(true)` (Suggestion); all other files carry real assertions. |
| Q3  | No leftover focus / debugging artifacts                          | ✅ | suite-wide grep | No `.only`/`.skip`/`fit`/`fdescribe`; no `console.log`/`debugger`. |
| Q4  | Test isolation: temp-dir cleanup                                | ⚠️ | `deeplake-api.test.ts:26`, `skillopt-trigger.test.ts:121` | Fresh dir per test (no contamination) but dir not `rmSync`'d (Suggestion). |
| Q5  | Test isolation: env-var restore                                 | ✅ | suite-wide grep | Env overrides captured/restored in `try/finally` or `afterEach`. |
| Q6  | Mock correctness vs production signatures                        | ✅ | `deeplake-api.test.ts`, `skill-invocations.test.ts` | `fetch`/`query` mocks match current surfaces. |
| Q7  | Coverage: sqlIdent on `updateColumns` (table + column)           | ✅ | `deeplake-api.test.ts:324-339` | Added (two negative guards). |
| Q8  | Coverage: sqlIdent on `createIndex`                              | ✅ | `deeplake-api.test.ts:340-345` | Added (negative guard). |
| Q9  | Coverage: sqlIdent on `listSkillInvocations` sessions table      | ✅ | `skill-invocations.test.ts:96-102` | Added (negative guard). |
| NG1 | Do not rewrite tests wholesale                                  | ✅ | n/a | Only additive edits; no existing test logic changed. |
| NG2 | Do not touch C11 dirs (cli/codex/hermes/cursor/openclaw/pi/scripts) | ✅ | n/a | Only files under `tests/shared/` modified. |
| NG3 | Do not run `npm install`                                        | ✅ | n/a | Used the pre-installed `node_modules/.bin/vitest`. |

## Files Changed

- `tests/shared/deeplake-api.test.ts` (M), added a `sqlIdent identifier guards` describe block (3 negative tests) covering `updateColumns` column-key, `updateColumns` table-name, and `createIndex` column.
- `tests/shared/skill-invocations.test.ts` (M), added one negative test asserting `listSkillInvocations` rejects a non-identifier sessions table before any query dispatch.
