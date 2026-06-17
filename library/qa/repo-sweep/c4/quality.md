# QA Report: Repo Sweep C4 - Skillify (`src/skillify/`)

**Plan document:** Repo-sweep chunk C4 task spec (quality pass over `src/skillify/`, 38 `.ts` files)
**Audit date:** 2026-06-16
**Base branch:** `main`
**Head:** `pr/05-security-quality-repo-sweep` (security pass `a57d2f82`)
**Auditor:** quality-guardian

## Summary

Pass with one fix applied. The `src/skillify/` tree is mature, exhaustively commented, and `tsc --noEmit` is clean before and after the audit; 228 in-scope unit tests pass post-fix. One Warning-level durability gap was found and fixed directly: `skill-writer.ts` wrote `SKILL.md` with a plain `writeFileSync`, while its sibling state-writers (`manifest.ts`, `state.ts`) already use the atomic tmp+rename discipline; a crash mid-write in `writeNewSkill` would leave a torn file the function can never self-heal (it always throws "already exists" on the next run). No Critical issues. The C4 security pass (`a57d2f82`, five `sqlIdent` wrappers) is intact and verified consistent with the `"${sqlIdent(x)}"` quoting convention. The documented Medium from the security pass (mined skill bodies written without a PII-redaction pass) is an architectural decision and out of scope for this quality audit.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | Every C4 focus area reviewed; all in-scope files read or scanned. |
| Correctness   | ✅ | Gate verdict parsing, pull conflict resolution, scope promotion, and provenance all behave as specified. |
| Alignment     | ✅ | Naming/structure consistent; security-pass `sqlIdent` hardening intact and correctly quoted. |
| Gaps          | ⚠️ | One atomicity gap fixed; a recoverable sibling case (`local-manifest.ts`) left as a Suggestion. |
| Detrimental   | ✅ | No regressions; no perf anti-patterns; no leftover debug or dead code. |

## Critical Issues (must fix)

None.

## Warnings (should fix) - FIXED in this pass

- [x] **`skill-writer.ts` writes `SKILL.md` non-atomically; a torn write wedges the skill permanently**, `src/skillify/skill-writer.ts:220` (writeNewSkill), `src/skillify/skill-writer.ts:271` (mergeSkill)

  Both write paths called `writeFileSync(path, text)` directly. A crash or `ENOSPC` partway through leaves a half-written `SKILL.md`. For `mergeSkill` the damage self-corrects (a torn file fails `parseFrontmatter` and the next merge overwrites it), but for `writeNewSkill` it does not: `writeNewSkill` opens with an `existsSync(path)` guard that throws `skill already exists` on every subsequent run, and the worker's KEEP branch catches that and advances the watermark (`skillify-worker.ts:538-541`), so the corrupt file is never rewritten and the skill is effectively lost until manual `rm`. The module's own siblings already protect against exactly this: `manifest.ts:138-144` and `state.ts:76-83` stage to a unique `.tmp` and `renameSync` into place.

  Fix: added an `atomicWriteFile(path, text)` helper (stage to `${path}.${pid}.${Date.now()}.tmp`, then `renameSync`) mirroring `state.ts`, and routed both `writeNewSkill` and `mergeSkill` through it. Final file content is byte-identical, so all 26 skill-writer tests pass unchanged; the `existsSync` create guard is preserved (the rename only fires after the guard).

  ```ts
  function atomicWriteFile(path: string, text: string): void {
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  }
  ```

## Suggestions (consider improving)

- [ ] **`local-manifest.ts` writes the local-mined manifest non-atomically**, `src/skillify/local-manifest.ts:87-89`

  `writeLocalManifest` uses a plain `writeFileSync`, unlike the pulled-skills `manifest.ts` which is atomic. Severity is lower than the skill-writer case because `readLocalManifest` returns `null` on malformed JSON (`local-manifest.ts:81-83`) and the next write recreates it, so a torn write self-heals. Left as a Suggestion to avoid scope creep, but routing it through the same tmp+rename pattern would make the module internally consistent.

- [ ] **Pervasive `catch (e: any)` idiom**, throughout `src/skillify/**` (e.g. `pull.ts:485,512,552,603`, `skillify-worker.ts` x8, `state.ts` lock paths, `gate-runner.ts:208`)

  Many sites use `catch (e: any)` then read `e.message`/`e.status`/`e.code`. No specific `e: any` here masks a real type or runtime bug, and `tsc --noEmit` is clean. The newer files in the tree already use the better `catch (e: unknown)` + narrowing pattern (`skills-table.ts:94-95`, `success-judge.ts:65-66`), which is the target shape. A repo-wide migration is a large mechanical refactor with breakage risk on a branch shared with a parallel agent, so it is deferred (consistent with the C1/C2/C3 dispositions of the same idiom).

- [ ] **`skillify-worker.ts` top-level config parse is unguarded**, `src/skillify/skillify-worker.ts:88`

  `const cfg = JSON.parse(readFileSync(process.argv[2], "utf-8"))` throws uncaught if the spawner's config file is missing or malformed. The file is written by the worker's own spawn helper (trusted) and a crash here is a clean fail with a stack trace, so this is informational only; a `try/catch` that logs to `skillifyLog` before exiting non-zero would aid field debugging.

## Plan Item Traceability

| #  | C4 focus area / DoD item | Status | Implementation Location | Notes |
|----|--------------------------|--------|-------------------------|-------|
| F1 | Skill path construction: `assertValidSkillName`/`assertValidAuthor` validation errors surfaced correctly | ✅ | `skill-writer.ts:103-116`, `pull.ts:38-44` | Strict kebab-case + length + separator/`..` guards; pull loop catches and reports skipped rows in the summary (`pull.ts:511-560`) |
| F2 | Pull/auto-pull: org vs project scope, manifest serialization, conflict resolution | ✅ | `pull.ts`, `auto-pull.ts`, `manifest.ts` | Version-compare + `.bak` backup (`pull.ts:565-579`); atomic manifest (`manifest.ts:138-144`); legacy-column + missing-table fallbacks; project pulls correctly skip global symlink fan-out |
| F3 | Skillify gate: KEEP/MERGE/SKIP verdict parsing robustness, fallback on LLM timeout/error | ✅ | `gate-parser.ts`, `gate-runner.ts`, `skillify-worker.ts:412-587` | Fenced/braced/prose extraction; invalid verdict → `null`; `gate.errored` returns early; no verdict → SKIP + watermark; MERGE-target-missing falls back to `writeNewSkill` |
| F4 | `skill-writer.ts`: provenance frontmatter correctness, file write atomicity | ⚠️→✅ | `skill-writer.ts` | Author immutable across merges, contributors append-once, created_at preserved (all test-covered). Write atomicity was the gap; fixed |
| F5 | `unpull.ts`: manifest cleanup, no dangling symlinks | ✅ | `unpull.ts`, `manifest.ts:215-251` | Symlinks unlinked before row drop; orphan prune cleans dangling links; `--all`/`--legacy-cleanup` refuse author filters; non-symlink targets never clobbered |
| F6 | Error handling: async error boundaries, retry logic | ✅ | `skillify-worker.ts:126-178`, `auto-pull.ts:56-67` | Exponential backoff + jitter on network and retryable HTTP; `withTimeout` bounds SessionStart; all worker failures swallowed into `wlog` with watermark advance |
| F7 | TypeScript: `catch (e: any)`, missing return types, unsafe casts | ⚠️ | tree-wide | No bug found; `as`-casts are all narrowing of `unknown`/row data with guards. `catch (e: any)` migration deferred (Suggestion) |
| D1 | Read all in-scope files, run `tsc --noEmit` | ✅ | - | Focus files read in full, remainder scanned for risk patterns; tsc clean pre- and post-fix |
| D2 | Fix every Medium+ finding directly | ✅ | `skill-writer.ts` | One Warning fixed (atomic write); Suggestions left documented |
| D3 | Write report to `library/qa/repo-sweep/c4/quality.md` | ✅ | this file | - |
| NG | Do not touch files outside `src/skillify/`; no `npm install` | ✅ | - | Only `src/skillify/skill-writer.ts` changed; no install run; `src/graph/` (C5) untouched |

## Files Changed

- `src/skillify/skill-writer.ts` (M), add `atomicWriteFile` (tmp+rename) helper and route `writeNewSkill` + `mergeSkill` through it; import `renameSync`.
