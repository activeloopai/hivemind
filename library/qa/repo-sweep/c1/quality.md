# QA Report — Repo Sweep C1: Core Data + Shell

- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Auditor:** quality-worker-bee
- **Scope (Chunk C1):** `src/config.ts`, `src/deeplake-api.ts`, `src/deeplake-schema.ts`, `src/user-config.ts`, `src/path-match.ts`, `src/index-marker-store.ts`, `src/shell/*.ts`
- **Source plan:** Standalone repo-sweep audit (no PRD/IRD). This is a code-quality pass, not a plan-traceability audit.
- **Security ordering:** `security-guardian` ran first on this chunk (commit `8b9a7841`, 3 Medium SQL-escaping gaps fixed). No Critical/High security findings outstanding. Ordering respected.

## Summary

The C1 surface is in good shape: `tsc --noEmit` passes cleanly before and after the audit, error handling is generally deliberate (documented graceful-degradation catches, retry/backoff, balance-exhaustion banner), and the SQL boundary is consistently escaped via `sqlIdent`/`sqlStr`/`sqlLike` after the security pass. Two Medium findings were fixed directly: a silent data-loss bug in the shell VFS `appendFile` (the `echo a > f && echo b >> f` idiom dropped the appended content) and an unsafe `catch (e: any)` that could log an `undefined` error message. No Critical findings. Remaining items are Low/Suggestion-tier and were left as notes.

## Scorecard

| Category | Status | Notes |
|---|---|---|
| Completeness | ✅ | No plan to trace; all in-scope files reviewed in full. |
| Correctness | ✅ | One Medium correctness bug found and fixed (`appendFile` data loss). Rest verified. |
| Alignment | ✅ | Naming, module boundaries (fs vs network split), and ESM `.js` import extensions consistent. |
| Gaps | ✅ | Error/degradation paths are deliberate and documented; one type-safety gap fixed. |
| Detrimental | ✅ | No regressions, secrets, or hot-path perf anti-patterns. Minor dead code noted (Low). |

## Critical Issues (must fix)

None.

## Medium Findings (fixed in this pass)

### M1 — `appendFile` silently drops appends onto an unflushed write
- **File:** `src/shell/deeplake-fs.ts:816` (`DeeplakeFs.appendFile`)
- **Severity:** Medium (correctness / data integrity)
- **Description:** Writes are buffered in `this.pending` and flushed on a 200ms debounce. `appendFile` takes a fast-path SQL-level concat (`UPDATE … SET summary = summary || …`) whenever `this.files.has(p)` is true. A freshly written-but-unflushed file satisfies `files.has(p)` but has no DB row yet, so the `UPDATE` matches zero rows and the appended bytes are lost; the subsequent debounced flush then writes only the original content. The common shell idiom `echo a > f && echo b >> f` therefore produces `a` instead of `ab`. The append path also set the content cache to `null`, masking the loss until the next read.
- **Fix applied:** Flush any buffered write for the path before the concat so the `UPDATE` lands on a persisted row:
  ```ts
  if (this.pending.has(p)) await this.flush();
  ```
  Gated on `this.pending.has(p)` to keep the blast radius minimal (no force-flush for appends onto already-persisted files). Verified `tsc --noEmit` passes.

### M2 — Unsafe `catch (e: any)` with potentially `undefined` error message
- **File:** `src/deeplake-api.ts:394` (`DeeplakeApi.ensureLookupIndex`)
- **Severity:** Medium (TypeScript type safety / unhelpful error message)
- **Description:** This was the only `catch (e: any)` in the file; every other handler uses `catch (e: unknown)` with an `instanceof Error` narrowing. The `any` annotation disables type checking, and `e.message` evaluates to `undefined` when a non-`Error` is thrown (e.g. a string), emitting `index "…" skipped: undefined` — an unhelpful diagnostic that breaks the file's otherwise-consistent error-handling convention.
- **Fix applied:** Switched to `catch (e: unknown)` and narrowed the message:
  ```ts
  } catch (e: unknown) {
    if (isDuplicateIndexError(e)) { markers.writeIndexMarker(markerPath); return; }
    const msg = e instanceof Error ? e.message : String(e);
    log(`index "${indexName}" skipped: ${msg}`);
  }
  ```
  `isDuplicateIndexError` already accepts `unknown`, so no other change was needed. Verified `tsc --noEmit` passes.

## Warnings (should fix)

None beyond the two Medium items above (both fixed).

## Suggestions / Low (noted, not fixed)

- **L1 — Dead variable `sessionSyncOk`.** `src/shell/deeplake-fs.ts:220` declares `let sessionSyncOk = true;` and the only use (`sessionsTable && sessionSyncOk`, line ~255) can never be false because it is never reassigned. Harmless, but the gate is misleading; consider removing the variable.
- **L2 — Redundant Map lookup in `prefetch`.** `src/shell/deeplake-fs.ts:625` calls `this.files.get(p)` twice in one condition. Read once into a local. Cold path; negligible.
- **L3 — Duplication between `readFile` and `readFileBuffer`.** `src/shell/deeplake-fs.ts:671` / `:706` repeat the session-concat and SQL-summary fetch logic. They return different types (`Uint8Array` vs `string`), so a shared private helper returning a `Buffer` could de-duplicate. Suggestion only; `jscpd` may flag.
- **L4 — Pervasive `as any` at JSON boundaries in `grep-core.ts`.** `formatToolInput` / `formatToolResponse` / `normalizeContent` (`src/shell/grep-core.ts:101-256`) use `any`/`as any` extensively. These sit at genuinely dynamic JSON-parse boundaries where the shape is untyped input; tightening to typed guards is a larger, riskier refactor disproportionate to a sweep. Left as-is.
- **L5 — `healSchema` parameter typed `typeof MEMORY_COLUMNS`.** `src/deeplake-api.ts:423` could use the clearer `readonly ColumnDef[]` (the type it resolves to). Cosmetic.

## Files Changed

| File | Change |
|---|---|
| `src/shell/deeplake-fs.ts` | M1 fix: flush pending write before SQL-level append concat to prevent dropped appends. |
| `src/deeplake-api.ts` | M2 fix: `catch (e: any)` → `catch (e: unknown)` with `instanceof Error` message narrowing in `ensureLookupIndex`. |
| `library/qa/repo-sweep/c1/quality.md` | This report. |

## Verification

- `npx tsc --noEmit` → exit 0 (clean) both before and after the fixes.
- No linter errors on the two edited files.
- No files outside the C1 scope list were modified.
