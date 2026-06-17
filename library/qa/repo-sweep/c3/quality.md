# QA Report: Repo Sweep C3 - Hooks (`src/hooks/`)

**Plan document:** Repo-sweep chunk C3 task spec (quality pass over `src/hooks/`, 47 `.ts` files)
**Audit date:** 2026-06-16
**Base branch:** `main`
**Head:** `pr/05-security-quality-repo-sweep` (security pass `008dc16c`)
**Auditor:** quality-guardian

## Summary

Pass with fixes applied. The `src/hooks/` tree is mature, heavily commented, and `tsc --noEmit` is clean before and after the audit. Two Warning-level correctness divergences were found and fixed directly: (1) four of the five wiki-worker harness forks lacked the exec-failure upload guard that the codex fork already has, which let a failed summary regeneration on a resumed session re-upload stale content and advance the JSONL offset; (2) the cursor and hermes `session-end` hooks leaked the summary lock on spawn failure where their sibling hooks release it. No Critical issues. The four-fork wiki-worker duplication is documented per the chunk brief but intentionally not refactored.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | Every C3 focus area reviewed; all 47 in-scope files read. |
| Correctness   | ✅ | Two fork-divergence bugs found and fixed; behavior now matches the codex reference fork. |
| Alignment     | ✅ | Naming/structure consistent; security-pass `sqlIdent`/tmp-mode hardening intact. |
| Gaps          | ⚠️ | A few low-impact swallow-error and quoting edge cases remain (Suggestions). |
| Detrimental   | ✅ | No regressions; the four-fork duplication is documented, not introduced here. |

## Critical Issues (must fix)

None.

## Warnings (should fix) - FIXED in this pass

- [x] **Wiki-worker re-uploads a stale summary and advances the offset when the agent CLI fails on a resumed session**, `src/hooks/wiki-worker.ts:228-268`, `src/hooks/cursor/wiki-worker.ts:195-235`, `src/hooks/hermes/wiki-worker.ts:202-243`, `src/hooks/pi/wiki-worker.ts:201-242`

  On a resumed session, step 2 pre-seeds `tmpSummary` with the existing summary. If the LLM spawn (`claude -p` / `cursor-agent --print` / `hermes -z` / `pi --print`) then fails, the upload block only checked `existsSync(tmpSummary)` and `text.trim()`, so it re-uploaded the unchanged summary and called `finalizeSummary(sessionId, jsonlLines)`. That advances the sidecar `lastSummaryCount` to the current event count, marking the unsummarized delta as "done" and suppressing the next periodic summary. The codex fork (`src/hooks/codex/wiki-worker.ts:196-222`) already guards this with `execSucceeded` + `summaryChanged`; the other four forks did not.

  Fix: ported the codex guard verbatim to all four forks - capture `summaryBeforeExec` before the spawn, set `execSucceeded` on success, and skip the upload when `!execSucceeded && !summaryChanged`.

  ```ts
  const summaryChanged = summaryBeforeExec === null
    ? text.trim().length > 0
    : text !== summaryBeforeExec;
  if (!execSucceeded && !summaryChanged) {
    wlog("claude -p failed without producing a new summary; skipping upload");
    return;
  }
  ```

- [x] **`session-end` leaks the summary lock on spawn failure (cursor, hermes)**, `src/hooks/cursor/session-end.ts:61-71`, `src/hooks/hermes/session-end.ts:53-63`

  When `spawn*WikiWorker` throws after `tryAcquireLock` succeeded, the worker (which releases the lock in its `finally`) never starts, so the lock stayed held until the 10-minute stale reclaim. A `--resume` inside that window would have its periodic and final summaries suppressed. The main `src/hooks/session-end.ts:110-121` and `src/hooks/codex/stop.ts:175-186` already release the lock in this path.

  Fix: added `releaseLock(sessionId)` (wrapped in a best-effort try/catch, matching the siblings) to the spawn-failure catch in both hooks, plus the `releaseLock` import.

  ```ts
  } catch (e: any) {
    wikiLog(`SessionEnd: wiki spawn failed: ${e?.message ?? e}`);
    try { releaseLock(sessionId); } catch { /* best-effort */ }
  }
  ```

## Suggestions (consider improving)

- [ ] **`esc()` doubles backslashes but several queries use plain (non-`E''`) string literals**, `src/hooks/wiki-worker.ts:142-143,161-164,179-180,192-194`, and the codex/cursor/hermes/pi forks mix `LIKE E'...'` (first query) with `LIKE '...'` (subsequent queries)

  In a standard SQL string literal a backslash is not special, so `esc()`'s backslash-doubling produces two literal backslashes there. This is harmless today because every interpolated value is a UUID-shaped `sessionId` / `userName`, and single-quote escaping (the only injection-relevant char in a plain literal) is correct. Consider standardizing on `E'...'` everywhere `esc()` is used, or splitting `esc()` into E-string vs plain-string variants, so the escaping always matches the literal type.

- [ ] **`catch { /* no existing summary */ }` swallows backend errors during the resumed-summary read**, `src/hooks/wiki-worker.ts:191-203` (and the four forks)

  A transient backend failure on the "existing summary" SELECT is indistinguishable from "no summary", so the worker regenerates from offset 0 and the `uploadSummary` UPDATE overwrites the prior incremental summary with a from-scratch one. Low probability (one transient SELECT), but consider distinguishing not-found from a thrown backend error before resetting `prevOffset`.

- [ ] **Cursor result injection uses a fixed heredoc delimiter**, `src/hooks/cursor/pre-tool-use.ts:73,108`

  `cat <<'__HIVEMIND_RESULT__'\n${body}\n__HIVEMIND_RESULT__` would terminate early if `body` contains a line exactly equal to `__HIVEMIND_RESULT__`. The Claude path uses the more robust `safeEchoCommand` (`printf '%s\n'` with single-quote escaping). The delimiter is unusual enough that practical risk is negligible, but `safeEchoCommand`-style quoting would be strictly safer.

- [ ] **Session-write disabled/lock filenames embed the raw `sessionsTable`**, `src/hooks/session-queue.ts:459-465`

  `getSessionWriteDisabledPath` / `getSessionDrainLockPath` build filenames as `.${sessionsTable}.disabled.json` / `.${sessionsTable}.drain.lock`. `sessionsTable` is config-driven (`HIVEMIND_SESSIONS_TABLE`, default `sessions`) and validated with `sqlIdent` at SQL sites, but not sanitized as a path segment here. A table name containing a path separator would write the marker outside `queueDir`. Config-controlled and low-impact, but a `replace(/[^a-zA-Z0-9._-]/g, "_")` guard (as used in `query-cache.ts`/`writeReadCacheFile`) would harden it.

- [ ] **Pervasive `catch (e: any)` idiom**, throughout `src/hooks/**`

  The hooks use `catch (e: any)` then access `e.message`/`e.status` extensively. The C3 brief flagged this pattern (C1/C2 each fixed one site). No specific `e: any` here masks a real type or runtime bug, and `tsc --noEmit` is clean, so a repo-wide `e: unknown` migration was judged out of scope for a sweep (it is a large, mechanical refactor with breakage risk on a branch with a parallel agent). Recommend a dedicated follow-up to standardize on `catch (e: unknown)` + `errorMessage(e)` (the helper already exists in `session-queue.ts`).

## Plan Item Traceability

| #  | C3 focus area / DoD item | Status | Implementation Location | Notes |
|----|--------------------------|--------|-------------------------|-------|
| F1 | Capture hooks handle all Cursor/Codex/Hermes/pi event shapes; missing fields handled | ✅ | `capture.ts`, `codex/capture.ts`, `cursor/capture.ts`, `hermes/capture.ts` | `typeof` guards, `?? ""`, `?? <agent>-${Date.now()}` fallbacks; unknown events skipped |
| F2 | Wiki worker: summarization logic, prompt construction, error handling | ⚠️→✅ | `wiki-worker.ts`, `{codex,cursor,hermes,pi}/wiki-worker.ts` | Exec-failure upload guard was missing in 4 forks; fixed |
| F3 | Spawn helpers: exit code, stderr capture, timeout | ✅ | `wiki-worker-spawn.ts`, `spawn-wiki-worker.ts` (+forks) | 120s timeout, detached spawn; codex has richest stderr formatting (others adequate) |
| F4 | Session queue: dequeue ordering, dedup, flush on exit | ✅ | `session-queue.ts` | Sorted IDs, atomic `.inflight` rename, requeue-on-error, auth-disable TTL |
| F5 | Error handling: swallowed errors, async boundaries | ⚠️ | all hooks | Top-level `main().catch` everywhere; two swallow-error Suggestions noted |
| F6 | TypeScript: `catch (e: any)` patterns, unsafe casts | ⚠️ | all hooks | No bug found; repo-wide migration deferred (Suggestion) |
| F7 | Code duplication: four wiki-worker forks (document, do NOT refactor) | 🟦 | `{codex,cursor,hermes,pi}/wiki-worker.ts` + `wiki-worker.ts` | ~Identical bodies (query/retry/esc/upload). Documented per brief; not refactored |
| D1 | Read all in-scope files, run `tsc --noEmit` | ✅ | - | All 47 files read; tsc clean pre- and post-fix |
| D2 | Fix every Medium+ finding directly | ✅ | 6 files | Two Warnings fixed (F2 guard x4, lock-leak x2) |
| D3 | Write report to `library/qa/repo-sweep/c3/quality.md` | ✅ | this file | - |
| NG | Do not touch files outside `src/hooks/`; no `npm install` | ✅ | - | Only `src/hooks/**` changed; no install run |

## Files Changed

- `src/hooks/cursor/session-end.ts` (M), import `releaseLock`; release the summary lock on spawn failure.
- `src/hooks/cursor/wiki-worker.ts` (M), add exec-failure upload guard (`execSucceeded`/`summaryChanged`).
- `src/hooks/hermes/session-end.ts` (M), import `releaseLock`; release the summary lock on spawn failure.
- `src/hooks/hermes/wiki-worker.ts` (M), add exec-failure upload guard.
- `src/hooks/pi/wiki-worker.ts` (M), add exec-failure upload guard.
- `src/hooks/wiki-worker.ts` (M), add exec-failure upload guard.

<!-- Note: src/hooks/codex/wiki-worker.ts already had the guard (reference fork) and was not modified. -->
