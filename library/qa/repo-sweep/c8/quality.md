# QA Report: Repo Sweep C8 - Cursor Extension (quality pass)

**Plan document:** none (standalone repo-sweep quality pass; scope defined by the C8 task brief)
**Audit date:** 2026-06-16
**Base branch:** `main`
**Head:** `pr/05-security-quality-repo-sweep` (audited at commit `597d1578`; remediation committed on top)
**Auditor:** quality-worker-bee

## Summary

Blocked-then-fixed. The C8 security pass's global `--` separator (added in PR #04, re-verified at `a5c2d0f0`) was a Critical regression: prepending `--` to every `hivemind` invocation makes the CLI read `"--"` as the subcommand name and exit with `Unknown command: --`, which silently broke **every** CLI-backed dashboard action (embeddings toggle, graph build, goal/rules CRUD, skill promote, workspace/org switch, activation auto-pull). This is the root cause behind the `--scope`-after-`--` symptom the security pass flagged. It is now fixed, along with one Warning (a filesystem-mutating `syncSkillsToCursor` call in `pushSettings` that ignored `HIVEMIND_AUTOPULL_DISABLED`). QA M1 (the `DashboardViewProvider` disposable leak) is confirmed fixed, the `sanitizeApiUrl` origin-equality hardening is present, and `npx tsc --noEmit` passes cleanly. Five lower-severity Suggestions are recorded for follow-up. Branch is shippable for C8 after the two committed fixes.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | All C8 focus areas audited; QA M1 + security hardening confirmed present. |
| Correctness   | ✅ (after fix) | Critical CLI-routing regression found and fixed; `--scope` symptom resolved. |
| Alignment     | ✅ | Code structure, naming, and VS Code disposable conventions match the codebase. |
| Gaps          | ✅ (after fix) | `HIVEMIND_AUTOPULL_DISABLED` gating gap in `pushSettings` fixed. |
| Detrimental   | ⚠️ | One Critical regression (fixed) plus pre-existing perf/dead-code Suggestions. |

## Critical Issues (must fix)

- [x] **Global `--` prepend breaks every CLI-backed dashboard action** (FIXED), `harnesses/cursor/extension/src/webview/data-bridge.ts:436-438`

  `runHivemindCliAsync` spawned `hivemind` with a leading `--`. The core CLI reads its subcommand positionally (`const cmd = args[0]` in `src/cli/index.ts:411`) and has no leading-`--` handling, so `cmd` became `"--"`, matched no branch, and hit `warn("Unknown command: --"); process.exit(1)` (`src/cli/index.ts:507-509`). Every dashboard action routed through `runHivemindCli` / `runHivemindCliAsync` failed: `embeddings status/enable/disable`, `graph build`, `goal add/list`, `rules add/done/edit`, `skillify promote`, `workspace switch`, `org switch`, `nextStepsPromote`, the settings pane's `embeddings status` + `goal list`, and the activation `skillify pull` auto-sync. This is the root cause of the `--scope`-after-`--` symptom the security pass flagged: `--scope` was not the only casualty, the entire subcommand was neutralized. `spawn()` runs shell-less, so the `--` provided no shell-injection protection (there was no shell), and the CLI ignores `--` so it provided no option-injection protection either. Remediation applied: drop the `--` prepend and pass `args` directly; documented that option-injection hardening belongs in the CLI's per-subcommand parser.

  ```ts
  // before
  const child = spawn("hivemind", ["--", ...args], { ... });
  // after
  const child = spawn("hivemind", args, { ... });
  ```

## Warnings (should fix)

- [x] **`pushSettings` re-syncs skills (filesystem mutation) ignoring `HIVEMIND_AUTOPULL_DISABLED`** (FIXED), `harnesses/cursor/extension/src/webview/DashboardPanel.ts:407-411`

  `syncSkillsToCursor()` creates agent symlinks and rewrites `~/.deeplake/state/skillify/pulled.json`. The poller (`statusbar/poller.ts:42`) and the `syncSkills` message handler (`DashboardPanel.ts:188`) both gate this behind `HIVEMIND_AUTOPULL_DISABLED === "1"`, but `pushSettings` called it unconditionally on every settings render and visibility refresh. A user who opted out of auto-sync still got their filesystem mutated whenever the settings pane rendered. Remediation applied: gate the call behind the same env check and fall back to an empty `SkillSyncState` for the summary line.

  ```ts
  const sync: SkillSyncState =
    process.env.HIVEMIND_AUTOPULL_DISABLED === "1"
      ? { lastSyncAt: undefined, results: [], syncedCount: 0, skippedCount: 0, erroredCount: 0 }
      : syncSkillsToCursor(workspaceRoot());
  ```

## Suggestions (consider improving)

- [ ] **Dead `401`/`403` exit-code branch in cursor-agent login check**, `harnesses/cursor/extension/src/health/checker.ts:188-189`

  `execFileSync` surfaces a process exit code (0-255), never an HTTP status, so `exitCode === 401 || exitCode === 403` can never be true. Logged-out detection effectively relies only on the `/not logged/i` and `/login required/i` message regexes. Replace the HTTP-status comparison with the actual cursor-agent logged-out exit code, or drop the dead branch.

- [ ] **Unused import `setBundledExtensionSrc`**, `harnesses/cursor/extension/src/statusbar/commands.ts:3`

  Imported but never referenced in this module (`tsc` does not flag it because `noUnusedLocals` is off, and there is no ESLint config). Remove for cleanliness.

- [ ] **`DashboardViewProvider` accumulates disposables in `context.subscriptions` across re-resolves**, `harnesses/cursor/extension/src/webview/DashboardPanel.ts:558-575`

  Each `resolveWebviewView` pushes a fresh `disposables` array and a `visibilityDisposable` into `context.subscriptions` but never removes prior ones on re-resolve. The QA M1 watcher leak is fixed via `controller.dispose()`, but the controller's `onDidReceiveMessage` listener (held only in the local `disposables` array, not disposed by `controller.dispose()`) lingers in `context.subscriptions` until deactivation. Bounded by re-resolve frequency; consider collecting per-resolve disposables into a `vscode.Disposable` that is disposed in `onDidDispose`.

- [ ] **Visibility-triggered `refreshAll()` bypasses the `refreshInFlight` guard**, `harnesses/cursor/extension/src/webview/DashboardPanel.ts:524, 566`

  `onDidChangeViewState` / `onDidChangeVisibility` call `controller.refreshAll()` directly, while only the `ready`/`refresh` message paths honor `refreshInFlight`. Rapid visibility toggles can launch concurrent refresh cycles (and concurrent CLI spawns). Consider routing visibility refreshes through the same in-flight guard.

- [ ] **`runHealthCheck` performs blocking `execFileSync` on the extension host every poll**, `harnesses/cursor/extension/src/health/checker.ts:27, 52, 168`

  Each 60s poll runs up to three synchronous `execFileSync` calls (`which`/`where`, `--version`, and `cursor-agent status` with an 8s timeout) on the extension host thread, which can jank the UI when PATH resolution or cursor-agent is slow. Consider switching to async `execFile`. Pre-existing; out of the C8 regression but worth scheduling.

- [ ] **Extension passes `--scope team` to `skillify promote`, which the CLI ignores**, `harnesses/cursor/extension/src/webview/DashboardPanel.ts:265-268`

  `promoteSkill` reads only `args[1]` as the skill name (`src/commands/skillify.ts:122, 349`) and never parses `--scope`; promotion inherently moves a project skill to the global (team-shared) location, so the flag is a harmless no-op. With the Critical fix in place this works correctly, but the unused flag is misleading. Drop it or wire real scope support into the CLI handler. (`rules add`, by contrast, does parse `--scope` from anywhere in argv at `src/commands/rules.ts:76`, so that call is fully correct after the fix.)

## Plan Item Traceability

| # | Plan Requirement (C8 focus area / DoD) | Status | Implementation Location | Notes |
|---|----------------------------------------|--------|-------------------------|-------|
| F1 | Confirm QA M1 (disposable cleanup) fix present | ✅ | `webview/DashboardPanel.ts:556, 563, 572-575` | `controller.dispose()` on re-resolve + `onDidDispose`; watcher/editor-listener leak closed. Residual `context.subscriptions` growth noted as Suggestion. |
| F2 | Check `--scope` / `--` separator ordering correctness | ✅ (fixed) | `webview/data-bridge.ts:436-447` | Root cause was the global `--` breaking all routing (Critical); fixed. `rules add` parses `--scope`; `skillify promote` ignores it (Suggestion). |
| F3 | `bridge/skill-sync.ts` symlink mgmt + conflict handling | ✅ | `bridge/skill-sync.ts:31-84, 216-299` | Symlink fan-out replaces only Hivemind-owned symlinks, reports non-symlink conflicts, partial-reach as errored; manifest merge is idempotent. Correct. |
| F4 | `health/checker.ts` + `wirings.ts` correctness + idempotency | ⚠️ | `health/checker.ts:204-269`, `health/wirings.ts:30-141` | Hook merge strips prior Hivemind entries before re-adding (idempotent); `writeJsonIfChanged` avoids needless rewrites; version-stale detection correct. Dead `401/403` branch is a Suggestion. |
| F5 | `statusbar/` display accuracy + polling correctness | ✅ | `statusbar/poller.ts:21-53`, `statusbar/indicator.ts:4-72` | State composition, focus-gated polling, tooltip assembly correct. Blocking `execFileSync` per poll noted as Suggestion. |
| F6 | Error handling: activation + VS Code API boundaries | ✅ | `extension.ts:16-69`, `webview/DashboardPanel.ts:360-363`, `bridge/auto-sync.ts:16-43` | Activation paths and message handler wrap in try/catch; CLI/data-bridge spawns resolve safely on error. |
| F7 | TypeScript typecheck via extension tsconfig | ✅ | `harnesses/cursor/extension/tsconfig.json` | `npx tsc --noEmit` exits 0 before and after remediation. |
| F8 | Fix every Medium+ finding directly | ✅ | data-bridge.ts, DashboardPanel.ts | 1 Critical + 1 Warning fixed; 6 Suggestions reported (not fixed per report-don't-fix for sub-Medium). |
| S1 | `sanitizeApiUrl` origin-equality hardening present (security context) | ✅ | `auth/safe-url.ts:35-39` | Returns `parsed.origin`; host-spoofing fix confirmed. |
| NG1 | Do not touch `tests/claude-code/` (C9 running) | ✅ | n/a | No test files modified. |
| NG2 | No repo-root `npm install` | ✅ | n/a | `npm install` run only inside `harnesses/cursor/extension/`. |

## Files Changed

- `harnesses/cursor/extension/src/webview/DashboardPanel.ts` (M), gate `syncSkillsToCursor` in `pushSettings` behind `HIVEMIND_AUTOPULL_DISABLED`; add `SkillSyncState` type import.
- `harnesses/cursor/extension/src/webview/data-bridge.ts` (M), drop the broken global `--` prepend so `hivemind` subcommands route correctly; document the rationale.
