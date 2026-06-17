# QA Report: Repo Sweep C7 - commands + dashboard + rules + utils

**Plan document:** none (standalone repo-sweep chunk; scope defined by the C7 task brief)
**Audit date:** 2026-06-16
**Base branch:** `pr/05-security-quality-repo-sweep`
**Head:** `a5c2d0f0` (+ this session's C7 quality fix)
**Auditor:** quality-worker-bee
**Scope:** `src/commands/*.ts`, `src/dashboard/*.ts`, `src/rules/*.ts`, `src/utils/*.ts`

## Summary

Pass-with-one-fix. The C7 surface is high quality: defensive throughout, fail-soft on every I/O boundary, with prior Codex / CodeRabbit review citations baked into the code. `tsc --noEmit` is clean before and after. One Medium (Warning) finding was fixed directly: `src/commands/auth.ts` `openBrowser` spawned the OS opener via `execSync` with a shell-interpolated OAuth URL, the lone shell-string spawn in scope, now converted to fixed-argv `execFileSync`. Note for the loop: the C7 `security.md` summary asserted "child-process spawns use fixed argv arrays (no shell)," but this site contradicted that claim; the fix is low-risk and behavior-preserving, but `security-guardian` should re-confirm spawn safety in `auth.ts` on its next pass. Remaining observations are Suggestions only and were not changed.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | All C7 focus areas reviewed; DoD steps 1-2 satisfied. |
| Correctness   | ✅ | Session mining, JSONL parsing, batch sizing, dashboard rendering, rule parse/apply, version compare all verified sound. |
| Alignment     | ✅ | Argv-array spawn convention now consistent across the chunk; naming/placement match repo conventions. |
| Gaps          | ✅ | Error handling, empty-state, and degraded-mode paths present; CLI inputs validated before use. |
| Detrimental   | ⚠️ | One shell-interpolated spawn (fixed). `catch (e: any)` is widespread but type-safe and not lint-enforced (Suggestion). |

## Critical Issues (must fix)

None.

## Warnings (should fix)

- [x] **`openBrowser` ran the OS opener through a shell with an interpolated URL (FIXED)**, `src/commands/auth.ts:127-137`

  `openBrowser` built a shell command string by interpolating the OAuth `verification_uri_complete` URL, then ran it via `execSync`. Although the URL originates from `https://api.deeplake.ai` over HTTPS (so realistic exploitability is low, this is why it is a Warning and not a Critical), it is a shell-injection-shaped pattern: a crafted/MITM'd verification URL containing shell metacharacters would be interpreted by the shell. It also carried a latent Windows bug (`start "<url>"` treats the quoted URL as the window title). This was the only shell-string spawn in the C7 surface and it contradicts the C7 `security.md` invariant claim that all spawns use fixed argv arrays. Fixed by switching to `execFileSync` with fixed argv arrays per platform (matching the clean pattern already in `src/dashboard/open.ts`), which also fixes the Windows title bug. `tsc --noEmit` clean post-fix.

  Before:

  ```ts
  const cmd = process.platform === "darwin" ? `open "${url}"`
    : process.platform === "win32" ? `start "${url}"`
    : `xdg-open "${url}" 2>/dev/null`;
  execSync(cmd, { stdio: "ignore", timeout: 5000 });
  ```

  After:

  ```ts
  if (process.platform === "darwin") {
    execFileSync("open", [url], { stdio: "ignore", timeout: 5000 });
  } else if (process.platform === "win32") {
    execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore", timeout: 5000 });
  } else {
    execFileSync("xdg-open", [url], { stdio: "ignore", timeout: 5000 });
  }
  ```

## Suggestions (consider improving)

- [ ] **`catch (e: any)` instead of `catch (e: unknown)`**, multiple sites (e.g. `src/commands/mine-local.ts:678`, `src/commands/dashboard.ts:217,232,284`, `src/dashboard/data.ts:158,176,186,193,223`, `src/dashboard/serve.ts:131`, `src/commands/skillify.ts:246,351,359,379`, `src/utils/plugin-cache.ts:52,187,295,304`)

  Every usage is type-safe in practice (`e?.message ?? String(e)` or `(e as Error).message`), `tsc --noEmit` passes, and the repo has no ESLint rule enforcing `no-explicit-any` (the gate is `tsc` only). Per the severity guide a non-lint-enforced style preference is a Suggestion, not a Warning, so these were not changed to avoid a ~15-site refactor that would require re-adding type guards (`unknown` breaks `e?.message`) for zero behavioral benefit. Worth a sweep-wide convention pass if the team adds an ESLint config later. Note `src/commands/goal.ts` already uses the preferred `catch (e: unknown)` form.

- [ ] **`sqlStr` backslash-doubling is tuned for `E'...'` literals but is also used inside plain `'...'` literals**, `src/utils/sql.ts:12-18` (consumed by `src/commands/session-prune.ts`, `src/rules/read.ts`, `src/commands/goal.ts`)

  `sqlStr` doubles `\` to `\\`, which is correct for Postgres escape-string (`E'...'`) literals (used by `rules/write.ts`, `goal.ts` INSERTs) but, under `standard_conforming_strings=on`, would yield two literal backslashes inside a plain `'...'` literal (used by most WHERE clauses). In practice the affected values (UUIDs, session paths, usernames) rarely contain backslashes, and `sql.ts` is the security-owned shared helper that the C7 `security.md` verified as correct, so this is left as an observation rather than a fix. Recommend the team confirm Deep Lake's `standard_conforming_strings` setting and either standardize on `E'...'` everywhere or split the escaper.

## Plan Item Traceability

| #   | Focus Area / DoD Item                                   | Status | Implementation Location | Notes |
|-----|---------------------------------------------------------|--------|-------------------------|-------|
| F1  | `mine-local.ts` session mining, JSONL parsing, batch sizing correctness | ✅ | `src/commands/mine-local.ts` | `parallelMap` order-preserving + per-task isolation; `PER_SESSION_PAIR_CAP`/char caps applied; in-flight session skip correct. |
| F2  | `skillify.ts` CLI option handling + pipeline invocation | ✅ | `src/commands/skillify.ts` | Flag parsers validate values; `mine-local` dispatch + `.catch` correct. |
| F3  | `spawn-detached.ts` cross-platform detached behavior, pid tracking | ✅ | `src/utils/spawn-detached.ts` | `detached`+`stdio:ignore`+`unref()`; async `error` listener prevents parent crash. |
| F4  | `wiki-log.ts` / `debug.ts` log output, no debug-only paths in prod | ✅ | `src/utils/wiki-log.ts`, `src/utils/debug.ts` | `debug.log` gated on `HIVEMIND_DEBUG`; `wiki-log` intentionally unconditional (user-visible); call-time env read for openclaw define. |
| F5  | `src/dashboard/` data rendering accuracy + terminal width | ✅ | `src/dashboard/{data,render,serve,open}.ts` | KPI source fallbacks (org/local/none) correct; HTML escaping thorough; loopback-only server with EADDRINUSE fallback. |
| F6  | `src/rules/` rule parse/apply correctness | ✅ | `src/rules/{read,write,index}.ts` | INSERT-only versioning; latest-per-id JS dedup with stable tertiary tie-break; newline/Unicode-separator rejection. |
| F7  | TypeScript `catch (e: any)` / unsafe casts | ⚠️ | chunk-wide | `catch (e: any)` widespread but type-safe and not lint-enforced -> Suggestion (see above). No unsafe casts that break type soundness. |
| D1  | Read all in-scope files; run `tsc --noEmit` | ✅ | - | 34 in-scope files read; `tsc --noEmit` exit 0 before and after the fix. |
| D2  | Fix every Medium+ finding directly | ✅ | `src/commands/auth.ts` | One Warning fixed; no Critical found. |
| NG1 | Do not touch `harnesses/cursor/extension/src/` (C8) | ✅ | - | Untouched; the 3 extension files in glob results were excluded. |
| NG2 | Do not run `npm install` | ✅ | - | Not run; used existing `node_modules` for `tsc`. |

## Files Changed

- `src/commands/auth.ts` (M), converted `openBrowser` from shell-string `execSync` to fixed-argv `execFileSync` per platform; swapped the `execSync` import for `execFileSync`. Fixes the lone shell-interpolated spawn in the C7 surface and a latent Windows `start` title bug.
