# QA Report: Repo Sweep C11 - CLI + per-agent tests (quality pass)

**Plan document:** repo-sweep chunk C11 (standalone audit; no PRD/IRD)
**Audit date:** 2026-06-16
**Base branch:** `main` (merge-base `c8cda4f`)
**Head:** `pr/05-security-quality-repo-sweep`
**Auditor:** quality-worker-bee

## Summary

Pass with two coverage gaps closed. The in-scope test files (`tests/cli/`, `tests/codex/`, `tests/hermes/`, `tests/cursor/`, `tests/openclaw/`, `tests/pi/`, `tests/scripts/`, root `tests/*.ts`) are high quality: no vacuous assertions, every file asserts, isolation is clean (per-test `mkdtemp` sandboxes, `vi.resetModules()`, `afterEach` teardown), and mocks are faithful to the production boundary. The audit found that the C3 sweep fixes (the resumed-session "stale summary" upload guard and the 0700/0600 token-config file modes) were behaviorally verified only on the base/claude helpers; the cursor and hermes forks carried the identical new logic untested. I added targeted coverage for both forks. `tsc --noEmit` is clean before and after. Security pass (commit `f9deb12`) ran first, so ordering is correct.

Note: the in-scope integration suites that exercise the real on-disk bundles (`tests/cli/install-end-to-end`, `install-consent-bundle`, `cli-install-mcp-shared`, `tests/codex/codex-hooks`, `codex-integration`, `tests/openclaw/install-openclaw`, `openclaw-embed-bundle`) fail in this environment because `harnesses/*/bundle/`, `harnesses/openclaw/dist/`, and `mcp/bundle/` do not exist (no `npm run build`, which was out of scope per the task). These are environmental, self-documenting ("build must run before test"), and are NOT test-quality findings.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | C2 cursor `harnesses/cursor/bundle/` path covered; C3 guards now covered on cursor + hermes forks |
| Correctness   | ✅ | Mocks match production boundaries; assertions tie to behavior, not surface |
| Alignment     | ✅ | New tests mirror the codex original and the existing source-lock-in convention |
| Gaps          | ⚠️ | Two C3 fork-coverage gaps found; both closed in scope. Codex spawn-mode + base helpers behaviorally covered only in C9-scoped file (noted, not owned here) |
| Detrimental   | ✅ | No regressions, no anti-patterns, no leftover debug artifacts |

## Critical Issues (must fix)

None.

## Warnings (should fix)

- [x] **C3 resumed-session upload guard untested on cursor + hermes forks** (closed), `tests/cursor/cursor-wiki-worker.test.ts:147-164`, `tests/hermes/hermes-wiki-worker.test.ts:149-166`

  The C3 quality fix added a guard to all four wiki-worker forks: on a resumed session `tmpSummary` is pre-seeded with the existing summary, and if the agent CLI fails without rewriting it, re-uploading the unchanged summary + calling `finalizeSummary` advances the JSONL offset and silently marks unsummarized events as done. The codex original is covered by "does not re-upload a stale existing summary after a failed regeneration" (`tests/codex/codex-wiki-worker.test.ts:284-294`). The cursor and hermes tests only covered the "spawn throws with NO pre-seeded summary" path, which short-circuits at `if (existsSync(tmpSummary))` and never reaches the new `summaryChanged` branch. I added a mirrored test to each fork that returns an existing summary, throws on exec, and asserts both `uploadSummary` and `finalizeSummary` are skipped (proving the offset is not advanced).

  ```ts
  // src/hooks/cursor/wiki-worker.ts:207-213 (the now-covered branch)
  const summaryChanged = summaryBeforeExec === null
    ? text.trim().length > 0
    : text !== summaryBeforeExec;
  if (!execSucceeded && !summaryChanged) {
    wlog("cursor-agent --print failed without producing a new summary; skipping upload");
    return;
  }
  ```

- [x] **C3 token-config file modes (0700/0600) untested on cursor + hermes forks** (closed), `tests/cursor/cursor-wiki-worker-source.test.ts:61-71`, `tests/hermes/hermes-wiki-worker-source.test.ts:65-75`

  The C3 security fix writes the wiki-worker `config.json` (which carries the Activeloop token in cleartext, in the shared predictable tmpdir) with `mode: 0o600` inside a `mkdirSync(..., { mode: 0o700 })` dir, in all four spawn helpers. Only the base `spawnWikiWorker` is behaviorally verified (`tests/claude-code/spawn-wiki-worker.test.ts:184-207`, C9 scope). The cursor/hermes forks are independent source files carrying the identical 2-line change with no mode coverage. I added a source-level lock-in assertion to each fork's existing `*-wiki-worker-source.test.ts` (the file whose stated purpose is to guard fork drift against the codex template), pinning both mode bits.

## Suggestions (consider improving)

- [ ] **Codex spawn-helper file-mode coverage lives only in the C9-scoped shared file**, `tests/claude-code/spawn-wiki-worker.test.ts:184-207`

  The behavioral 0700/0600 mode test exists once, for the base `spawnWikiWorker`. The shared file imports all four spawn helpers but does not parameterize the mode assertion across `spawnCodexWikiWorker` / `spawnCursorWikiWorker` / `spawnHermesWikiWorker`. Parameterizing it (e.g. `it.each` over the four helpers) would give behavioral, not just source-level, coverage of every fork. Left as a suggestion because (a) that file is outside C11's declared scope (it belongs to C9, already passed), and (b) the cursor/hermes forks now have source-level lock-in here. Recommend the C9 owner parameterize on a future pass.

## Plan Item Traceability

| #   | Plan Requirement | Status | Implementation Location | Notes |
|-----|------------------|--------|--------------------------|-------|
| 1   | Run `tsc --noEmit` | ✅ | repo root | Clean before and after edits (exit 0) |
| 2   | CLI installer tests cover C2 `harnesses/cursor/bundle/` path | ✅ | `tests/cli/cli-install-cursor-fs.test.ts:24-29,102-118` | Plants `harnesses/cursor/bundle/`, drives `installCursor`, asserts bundle copy + "Cursor bundle missing" throw when absent |
| 3   | Per-agent tests cover C3 tmp file modes (0700/0600 on config.json) | ⚠️→✅ | `tests/cursor/cursor-wiki-worker-source.test.ts:65-71`, `tests/hermes/hermes-wiki-worker-source.test.ts:69-75` | Base covered behaviorally in C9; cursor+hermes forks now source-locked. Codex fork = Suggestion above |
| 4   | Per-agent tests cover C3 exec-failure upload guard | ⚠️→✅ | `tests/cursor/cursor-wiki-worker.test.ts:166-194`, `tests/hermes/hermes-wiki-worker.test.ts:168-196` | Resumed-session stale-summary branch now covered on both forks (mirrors codex original) |
| 5   | Test quality: vacuous assertions | ✅ | all in-scope files | None found (grep for `expect(true)`, sole-`toBeDefined`, `.skip`, `it.todo` clean) |
| 6   | Test quality: isolation | ✅ | all in-scope files | Per-test `mkdtemp` sandboxes, `vi.resetModules()`, `afterEach` rm + `restoreAllMocks` + env unstub |
| 7   | Test quality: mock faithfulness | ✅ | wiki-worker + spawn tests | Mocks mirror the real `child_process` / `fetch` / `summary-state` surface (e.g. spawn child returns `.on()`+`.unref()`) |
| 8   | Write report to `library/qa/repo-sweep/c11/quality.md` | ✅ | this file | - |
| NG  | Do not run `npm install` / build | ✅ | - | Honored; integration suites that need built bundles fail environmentally and are excluded from findings |

## Files Changed

- `tests/cursor/cursor-wiki-worker-source.test.ts` (M), added source-level lock-in asserting the C3 0700/0600 token-config modes on the cursor spawn fork.
- `tests/cursor/cursor-wiki-worker.test.ts` (M), added a resumed-session test proving the C3 stale-summary guard skips both upload and finalize on a failed regeneration.
- `tests/hermes/hermes-wiki-worker-source.test.ts` (M), added source-level lock-in asserting the C3 0700/0600 token-config modes on the hermes spawn fork.
- `tests/hermes/hermes-wiki-worker.test.ts` (M), added the resumed-session stale-summary guard test for the hermes fork.
