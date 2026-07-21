# Security audit: Cursor extension + touched CLI paths

> **Date:** 2026-06-13
> **Auditor:** security-guardian (inline pass)
> **Scope:** `harnesses/cursor/extension/src/**`, `src/commands/skillify.ts`, `src/dashboard/data.ts`, `src/notifications/sources/org-stats.ts`, `src/skillify/pull.ts`, loader scripts under `harnesses/cursor/extension/scripts/`

## Summary

No **Medium or higher** findings remain in scope after remediation review.

## Checks performed

| Area | Result |
|---|---|
| Credential storage / logging | Tokens are not logged; auth uses masked input and existing CLI credential paths (`auth/api-key.ts`, `safe-url.ts`). |
| Session summary loader | Session IDs validated with `^[a-zA-Z0-9_-]{1,128}$`; SQL literals use `sqlStr`; user paths reject `..` and slashes. |
| Webview XSS | User/session/rule/skill text routed through `esc()` before `innerHTML`; markdown summary lines escaped. |
| CLI promote `--scope team` | Uses parameterized `insertSkillRow`; requires credentials via existing skillify config load. |
| Org stats cache | Read-only HTTP with bearer token; stale/offline flags surfaced without exposing token values. |
| Command execution | Dashboard invokes fixed `hivemind` argv arrays; no user-controlled shell interpolation. |
| Symlink fan-out | Conflict paths reported; does not overwrite real files (lstat + skip). |

## Low / informational

- **L1:** Webview still uses `innerHTML` with escaped content; acceptable for VS Code webviews with CSP nonce on script tags. Continue preferring `textContent` for new surfaces.
- **L2:** `load-session-summary.mjs` queries remote memory with 4s timeout; failures degrade to local file without throwing.

## Verdict

**PASS** for merge at Medium+ threshold.
