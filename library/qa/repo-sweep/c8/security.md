# Security Audit - Repo Sweep C8 (Cursor extension, re-verify)

- **Auditor:** security-worker-bee
- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Chunk:** C8 (re-verification pass)
- **Scope:** `harnesses/cursor/extension/src/**/*.ts` (27 files) and `harnesses/cursor/extension/scripts/*.mjs` (6 files)

---

## Executive Summary

This is a re-verification pass over the Cursor extension surface, first audited on PR #04 (no Critical/High, 3 Mediums fixed). Two outcomes:

1. **All three PR #04 fixes are confirmed present and survived the rebase/merge.** (See "PR #04 fix verification" below.)
2. **One new High finding was identified and fixed in this session:** the `sanitizeApiUrl()` host allowlist in `scripts/lib/deeplake.mjs` used a string `startsWith` prefix check rather than an origin-equality check. A prefix check accepts hostile values such as `https://api.deeplake.ai@evil.com` and `https://api.deeplake.ai.evil.com`, which would redirect the Activeloop bearer token to an attacker-controlled host. This is the exact threat the guard's own comment claims to prevent. The fix switches to parsed-origin equality, matching the already-correct TypeScript sibling `src/auth/safe-url.ts`.

No other Critical or High findings were found. The remaining surface is sound: every webview `innerHTML` sink routes user-influenced data through the hardened `esc()` (now escaping `"` and `'` in addition to `<>&`) under a strict nonce CSP (`default-src 'none'`); all SQL built by the loader scripts wraps identifiers in `sqlIdent()` and values in `sqlStr()`; the Deep Lake CLI spawn prepends `--`; all outbound `fetch` calls use sanitized origins; credential files are written `0600` in a `0700` dir; and no logging path interpolates a token, `Authorization` header, or credential content.

Ordering check: no `*-qa-report.md` / `*-quality-report.md` for this branch was found in `library/qa/` predating this audit, so the security-before-quality ordering is intact. C7 quality-guardian is running concurrently on `src/commands/`, `src/dashboard/`, `src/rules/`, `src/utils/` (the core repo `src/`, a disjoint file set from this extension scope); those files were left untouched.

---

## PR #04 fix verification

| PR #04 fix | Location | Status |
|---|---|---|
| `esc()` escapes `"` and `'` (not just `<>&`) | `src/webview/html/dashboard-shell.ts:226-228` | PRESENT - escapes `&`, `<`, `>`, `"`, `'` |
| `runHivemindCliAsync` prepends `["--", ...args]` | `src/webview/data-bridge.ts:438` | PRESENT - `spawn("hivemind", ["--", ...args], ...)` |
| `sanitizeApiUrl()` exists and is called from `loadCreds()` | `scripts/lib/deeplake.mjs:28` (defn), `:51` (call) | PRESENT (but had a prefix-match weakness, fixed below) |

---

## Findings

### Critical

None detected.

### High

#### C8-SEC-01 - apiUrl host allowlist bypass via prefix match (FIXED)

- **Severity:** High
- **Category:** Catalog C (credential redirect / token exfiltration) / OWASP B5 (SSRF-adjacent, untrusted host) + crypto/token handling
- **File / line:** `harnesses/cursor/extension/scripts/lib/deeplake.mjs:33`

**Vulnerable pattern (before):**

```js
if (ALLOWED_API_ORIGINS.some((o) => raw.startsWith(o))) return raw.replace(/\/+$/, "");
```

`sanitizeApiUrl()` is defense-in-depth against a tampered `credentials.json` redirecting the Activeloop bearer token (the function's own comment states this). The protocol check (`url.protocol !== "https:"`) is correct, but the host check used `raw.startsWith(allowedOrigin)`, which is a string-prefix test, not a host/origin match. That accepts:

- `https://api.deeplake.ai@evil.com/...` - `new URL(...)` resolves host to `evil.com` (the part before `@` is userinfo), yet the string starts with `https://api.deeplake.ai`.
- `https://api.deeplake.ai.evil.com/...` - host is `api.deeplake.ai.evil.com`, still a matching prefix.

The sanitized value flows into `query()` (`scripts/lib/deeplake.mjs:96`) and `load-dashboard.mjs:132`, both of which send `Authorization: Bearer ${creds.token}` and `X-Activeloop-Org-Id` to `${creds.apiUrl}/...`. A malicious `apiUrl` therefore exfiltrates the Activeloop JWT + org id to an attacker host.

**Why High:** the leaked artifact is a credential (Activeloop bearer token), which the never-downgrade rule fixes at Critical/High by construction. It is rated High rather than Critical because exploitation requires write access to the user's `~/.deeplake/credentials.json` (mode `0600`); the guard exists specifically as a defense-in-depth backstop for exactly that tampering case, and the prefix check defeats it.

**Fix applied (minimal blast radius):**

```js
const url = new URL(raw);
if (url.protocol !== "https:") return DEFAULT_API_URL;
// Match on the parsed origin, never a string prefix. A startsWith check
// accepts hostile values like "https://api.deeplake.ai@evil.com" or
// "https://api.deeplake.ai.evil.com", which would redirect the bearer
// token to an attacker-controlled host.
if (ALLOWED_API_ORIGINS.includes(url.origin)) return url.origin;
```

`url.origin` is the scheme + host + port computed by the URL parser, so userinfo and look-alike subdomains can no longer satisfy the allowlist. Returning `url.origin` (instead of the raw string) also strips any path/userinfo, matching the behavior of the TypeScript sibling `src/auth/safe-url.ts` (`assertSafeExternalUrl` / `sanitizeApiUrl`). `ALLOWED_API_ORIGINS` entries are already bare origins, so legitimate values (`https://api.deeplake.ai`, `https://app.activeloop.ai`) continue to pass unchanged.

### Medium

None detected.

### Low / Informational

- **Allowlist host divergence (informational):** `scripts/lib/deeplake.mjs` `ALLOWED_API_ORIGINS` is `{api.deeplake.ai, app.activeloop.ai}` while `src/auth/safe-url.ts` `ALLOWED_AUTH_HOSTS` is `{api.deeplake.ai, app.deeplake.ai, auth.deeplake.ai}`. Both lists are exact-match safe after this fix; the divergence is a consistency note, not a vulnerability. No change made (would alter accepted endpoints, outside minimal-blast-radius scope).
- **`promoteSkill` passes `--scope team` after the `--` separator** (`src/webview/data-bridge.ts` / `DashboardPanel.ts:266`): once `--` is prepended, the hivemind CLI treats `--scope team` as positional, not as an option. This is a functional/parsing concern, not a security one, and the `--` separator is the intended PR #04 hardening. Left untouched; flagged for the quality pass.

---

## Category scorecard

| Category | Result |
|---|---|
| Dependency / bundle gate (`npm audit`, OpenClaw) | Not run (no `npm install` per task constraint); extension ships no new deps in scope |
| Rules-file backdoor (hidden Unicode) | None detected (no `.cursor/rules` in extension scope) |
| Environment config & secrets | None detected - no committed secrets, no hardcoded tokens |
| Deep Lake SQL construction | None detected - `sqlIdent()` on all table names, `sqlStr()` on all values (`load-rules/goals/sessions/session-summary/dashboard.mjs`) |
| Credential file handling | None detected - `0600`/`0700` modes explicit (`device-flow.ts:104-105`); `credentials.json` deletion on logout |
| Token / PII leakage to logs | None detected - `logSafe`/`logError` log only static messages and `err.message`; grep sweep for token-in-log clean |
| Outbound host validation (SSRF/token redirect) | **C8-SEC-01 fixed**; TS paths (`safe-url.ts`, `detector.ts`, `device-flow.ts`) use origin/hostname equality |
| Webview XSS (`innerHTML`) | None detected - all dynamic content `esc()`-escaped under nonce CSP `default-src 'none'` |
| Webview message handling | None detected - inbound `sessionId` regex-validated, `goalsFilter` constrained, rule/goal text length + newline checked |
| Path traversal | None detected - `editor-sync.ts:104` bails on `..`; `load-session-summary.mjs:27` rejects `/ \ ..` in userName |
| Prompt-injection / scope coercion | None detected - reads filtered by `author = userName`; org enforced server-side via `X-Activeloop-Org-Id` from creds |

---

## Files changed

| File | Change |
|---|---|
| `harnesses/cursor/extension/scripts/lib/deeplake.mjs` | `sanitizeApiUrl()` host check changed from `startsWith` prefix match to parsed-origin equality (C8-SEC-01) |

`git diff` verified: the diff contains only the single security-relevant change above.
