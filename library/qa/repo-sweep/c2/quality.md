# QA Report — Repo Sweep C2: CLI + Scripts

- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Auditor:** quality-worker-bee
- **Scope (Chunk C2):** `src/cli/*.ts` (all 15 files), `scripts/audit-openclaw-bundle.mjs`, `scripts/ensure-tree-sitter.mjs`, `scripts/pack-check.mjs`, `scripts/sync-versions.mjs`, `scripts/verify-install.sh`
- **Source plan:** Standalone repo-sweep audit (no PRD/IRD). This is a code-quality pass, not a plan-traceability audit.
- **Security ordering:** `security-worker-bee` ran first on this chunk (commit `72c53fed`, hardened `pack-check.mjs` private-key gate). No Critical/High security findings outstanding. Ordering respected — no `quality.md` for C2 existed before this pass.

## Summary

The C2 CLI + scripts surface is in good shape: `tsc --noEmit` passes cleanly before and after the audit, installer error handling is deliberate (every per-platform installer throws on a missing bundle, `runSingleInstall`/`runSingleUninstall` wrap each install in try/catch and degrade to a per-agent `FAILED` warning, and the auth gate never dead-ends the install). The hooks.json / config merge logic across codex/cursor/hermes correctly strips only hivemind-owned entries before re-appending, and the `writeJsonIfChanged` idempotency guard is consistently applied to avoid re-triggering trust prompts. One Medium type-safety finding was fixed directly: three `catch (e: any)` handlers that broke the repo's established `catch (e: unknown)` convention (the same pattern the C1 pass fixed as M2). No Critical findings. Remaining items are Low/Suggestion-tier CLI-parsing edge cases, left as notes.

## Scorecard

| Category | Status | Notes |
|----------|--------|-------|
| Completeness | ✅ | No plan to trace; all 15 CLI files + 5 scripts reviewed in full. |
| Correctness | ✅ | Installer idempotency, dedup, and merge logic verified correct. No behavioral bugs found. |
| Alignment | ✅ | Naming, ESM `.js` import extensions, and per-harness module boundaries consistent. |
| Gaps | ✅ | One type-safety gap (`catch (e: any)`) fixed; installer error/degradation paths are deliberate. |
| Detrimental | ✅ | No regressions, secrets, or hot-path perf anti-patterns. CLI-parsing edge cases noted (Low). |

## Critical Issues (must fix)

None.

## Medium Findings (fixed in this pass)

### M1 — `catch (e: any)` breaks the repo's `catch (e: unknown)` convention (3 sites)
- **Files:**
  - `src/cli/update.ts:305` (npm-install failure handler in `runUpdate`)
  - `src/cli/update.ts:318` (agent-refresh failure handler in `runUpdate`)
  - `src/cli/install-claude.ts:269` (settings.json cleanup handler in `installClaude`)
- **Severity:** Medium (TypeScript strict compliance / convention consistency)
- **Description:** All three handlers annotated the caught error as `any`, which disables type checking at the catch boundary. The two `update.ts` sites read `e.message` directly: if a non-`Error` value were ever thrown (e.g. a string), `e.message` resolves to `undefined`, emitting `npm install failed: undefined`. This is the identical pattern the C1 pass flagged and fixed as M2, and "TypeScript strict compliance" is an explicit focus area for this chunk. The `install-claude.ts` site already used the safe `e?.message ?? String(e)` runtime form, so its fix is convention-only, but it was included to keep the whole chunk uniform.
- **Fix applied:** Switched all three to `catch (e: unknown)` with the repo-standard narrowing:
  ```ts
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`npm install failed: ${msg}`);
    ...
  }
  ```
  Verified `tsc --noEmit` passes and no lint errors on the edited files.

## Warnings (should fix)

None beyond the Medium item above (fixed).

## Suggestions / Low (noted, not fixed)

- **L1 — `--token` / `--only` space-form parsers consume a trailing flag as a value.** `src/cli/index.ts:164-188` (`parseOnly`, `parseToken`). With the space form, the value is taken as `args[idx + 1]` with no check that the next token is not itself a flag. So `hivemind install --token --skip-auth` treats `--skip-auth` as the token value (login then fails and falls through harmlessly), and `hivemind install --only --with-embeddings` treats `--with-embeddings` as a platform id (errors with "Unknown platform(s): --with-embeddings", exit 1). Both paths are self-recovering and safe, but a guard like `raw && !raw.startsWith("--")` would give clearer diagnostics. Low; malformed input only.
- **L2 — `--only` with no value silently widens `uninstall` to all platforms.** `src/cli/index.ts:164-176` returns `null` when `--only` has no value, and `null` means "no filter" → `detectPlatforms()`. For `hivemind uninstall --only` (value omitted) this removes hivemind from *every* detected agent rather than erroring, which is a mild footgun for a destructive command. Consider treating a present-but-empty `--only` as an error. Low.
- **L3 — Version-stamp / late-step failure reports a mostly-complete install as `FAILED`.** e.g. `src/cli/install-codex.ts:274` (`writeVersionStamp`) runs after the bundle copy, hooks merge, and symlink. If it throws, `runSingleInstall` (`src/cli/index.ts:373-384`) catches it and prints `codex FAILED`, even though the functional install already landed. Cosmetic/diagnostic only; the install is effectively healthy. Suggestion.
- **L4 — `scripts/verify-install.sh` uses `set -u` only.** `scripts/verify-install.sh:16`. No `pipefail`/`errexit`, so a failure inside a pipe can be masked (already noted as L1 in the C2 security report). All paths are `$HOME`-rooted with no untrusted input, so this is robustness, not correctness. Maintainer may add `set -uo pipefail` opportunistically. Low.

## Files Changed

| File | Change |
|------|--------|
| `src/cli/update.ts` | M1 fix: two `catch (e: any)` → `catch (e: unknown)` with `instanceof Error` message narrowing. |
| `src/cli/install-claude.ts` | M1 fix: `catch (e: any)` → `catch (e: unknown)` with `instanceof Error` message narrowing. |
| `library/qa/repo-sweep/c2/quality.md` | This report. |

## Verification

- `npx tsc --noEmit` → exit 0 (clean) both before and after the fixes.
- No linter errors on the two edited files.
- No files outside the C2 scope list were modified.
- `npm install` was not run, per task constraint.
