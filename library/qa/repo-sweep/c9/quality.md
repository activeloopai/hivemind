# QA Report: Repo Sweep C9 - claude-code tests

**Plan document:** none (standalone repo-sweep audit; paired security pass at `library/qa/repo-sweep/c9/security.md`)
**Audit date:** 2026-06-16
**Base branch:** `main`
**Head:** `pr/05-security-quality-repo-sweep`
**Auditor:** quality-worker-bee
**Scope:** all 110 `.ts` files under `tests/claude-code/`

## Summary

Pass. The `tests/claude-code/` suite is well-maintained: zero vacuous assertions, zero leftover focus (`it.only`/`.skip`), zero stray debugging, and every `.test.ts` carries real `expect()` assertions with proper temp-dir and env cleanup. The only actionable gaps were missing coverage for three C1-C8 sweep security fixes, so I added six targeted tests (sqlIdent table-identifier guard, spawn-config file modes, atomic skill write); `tsc --noEmit` passes clean and the three touched files run 82 green tests. No Critical or Warning quality bugs remain.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | Every claimed behavior is asserted; no tests assert less than their name implies. |
| Correctness   | ✅ | Assertions match production signatures; mocks faithful to real interfaces. |
| Alignment     | ✅ | `mkdtemp`+`rmSync` and `try/finally` env-restore conventions followed across the suite. |
| Gaps          | ⚠️ | Three sweep security fixes lacked direct test coverage (now added). |
| Detrimental   | ✅ | No shared mutable global leaks, no isolation breakage, no stale mocks found. |

## Critical Issues (must fix)

None.

## Warnings (should fix)

None. The three coverage gaps below were remediated in this audit's commit rather than left open, because the task explicitly scoped adding tests for the sweep security fixes.

## Suggestions (consider improving)

- [ ] **`real-table-test.mjs` is a manual E2E harness, not a unit test**, `tests/claude-code/real-table-test.mjs:1-240`

  This file hits a live Deeplake table using `~/.deeplake/credentials.json` and prints via `console.log`; it is not a Vitest spec and is excluded from the automated suite. It is correct for what it is (a self-cleaning manual probe), but consider relocating it out of the `tests/claude-code/` spec directory (e.g. `scripts/` or `tests/manual/`) so the directory holds only automated specs. No correctness issue.

## Coverage added for sweep security fixes (C1-C8)

- [x] **sqlIdent guard on config-driven table names**, `tests/claude-code/virtual-table-query.test.ts:265-303`

  The C-sweep fix wired `sqlIdent(memoryTable)` / `sqlIdent(sessionsTable)` into `readVirtualPathContents`, `listVirtualPathRowsForDirs`, and `findVirtualPaths` (`src/hooks/virtual-table-query.ts`). `sqlIdent` itself is unit-tested in `sql.test.ts`, but the *wiring* had no negative test. Added a `describe` block asserting a malicious identifier throws `Invalid SQL identifier` and that `api.query` is never dispatched, for all three entrypoints.

- [x] **Token-config file modes 0o600 / 0o700**, `tests/claude-code/spawn-wiki-worker.test.ts:184-211`

  The fix added `{ mode: 0o700 }` on the tmp dir and `{ mode: 0o600 }` on the cleartext-token `config.json` in `src/hooks/spawn-wiki-worker.ts`. The config-write path was tested for field contents but never for modes. Added a POSIX-gated (`it.skipIf(win32)`) test that stats the spawned config and its parent dir and asserts exact `0o600`/`0o700` plus no group/other bits.

- [x] **Atomic skill write (tmp + rename)**, `tests/claude-code/skillify-skill-writer.test.ts:79-90`

  The fix introduced `atomicWriteFile` (stage `.tmp`, `renameSync` into place) in `src/skillify/skill-writer.ts` for `writeNewSkill`/`mergeSkill`. The functional write was already covered indirectly; added a test asserting no leftover `*.tmp` staging file remains in the skill dir after a successful write (locks the rename-into-place behavior).

## Plan Item Traceability

| #   | Plan Requirement                                                        | Status | Implementation Location | Notes |
|-----|-------------------------------------------------------------------------|--------|-------------------------|-------|
| Q1  | Run `tsc --noEmit`, no type errors                                      | ✅ | n/a | Exit 0 before and after edits. |
| Q2  | Test correctness: no vacuous / always-pass assertions                  | ✅ | suite-wide grep | No `expect(true).toBe(true)`; every file has real `expect`. |
| Q3  | No leftover focus / debugging artifacts                                | ✅ | suite-wide grep | No `.only`/`.skip`/`fit`/`fdescribe`; no `console.log`/`debugger` in specs. |
| Q4  | Test isolation: temp-dir cleanup                                        | ✅ | suite-wide grep | Every `mkdtempSync` paired with `rmSync`. |
| Q5  | Test isolation: env-var restore                                        | ✅ | `dashboard-open`, `grep-core`, `skillify-gate-runner` | All mutate env inside `try/finally` with save+restore (not leaks). |
| Q6  | Mock correctness vs production signatures                              | ✅ | `spawn-wiki-worker.test.ts`, `virtual-table-query.test.ts` | Mocks match current `DeeplakeApi.query` / `child_process.spawn` surfaces. |
| Q7  | Coverage: sqlIdent on table names                                      | ✅ | `virtual-table-query.test.ts:265-303` | Added (negative guard test). |
| Q8  | Coverage: file mode 0600/0700                                          | ✅ | `spawn-wiki-worker.test.ts:184-211` | Added (POSIX-gated mode assertion). |
| Q9  | Coverage: atomicWriteFile in skill-writer                              | ✅ | `skillify-skill-writer.test.ts:79-90` | Added (no-leftover-`.tmp` assertion). |
| NG1 | Do not rewrite tests wholesale                                         | ✅ | n/a | Only additive edits; no existing test logic changed. |
| NG2 | Do not touch `tests/shared/` (C10 owns it)                             | ✅ | n/a | No files outside `tests/claude-code/` modified. |

## Files Changed

- `tests/claude-code/skillify-skill-writer.test.ts` (M), added one atomic-write (no leftover `.tmp`) test for `writeNewSkill`.
- `tests/claude-code/spawn-wiki-worker.test.ts` (M), added one POSIX-gated test asserting the token config is `0o600` inside a `0o700` dir.
- `tests/claude-code/virtual-table-query.test.ts` (M), added a `describe` block (4 tests) asserting the sqlIdent guard rejects malicious table identifiers before any query dispatch.
