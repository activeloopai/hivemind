# Security Audit - Repo Sweep C7 (commands + dashboard + rules + utils)

- **Auditor:** security-worker-bee
- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Chunk:** C7
- **Scope:** `src/commands/*.ts`, `src/dashboard/*.ts`, `src/rules/*.ts`, `src/utils/*.ts`

---

## Executive Summary

One **Critical** SQL-injection finding was identified and fixed in this session: `src/commands/session-prune.ts` interpolated config-driven table names directly into Deep Lake SQL with no `sqlIdent` guard, the same class of defect caught in sweep chunks C3/C4/C5/C6. All four interpolation sites are now wrapped in `sqlIdent()`.

No other Critical or High findings were found. The focus-area files reviewed most closely (`src/utils/sql.ts`, `src/utils/spawn-detached.ts`, `src/utils/version-check.ts`, `src/commands/mine-local.ts`, `src/rules/*`, `src/dashboard/*`) are sound: the escaping helpers are correct, child-process spawns use fixed argv arrays (no shell), the dashboard output is HTML-escaped, and credential file modes are explicit (0700/0600). A small number of Low / informational observations are documented for completeness; none required a fix.

Ordering check: no `*-qa-report.md` / `*-quality-report.md` for this branch was found in `library/qa/` predating this audit, so the security-before-quality ordering is intact. (C6 quality-guardian is running concurrently on `src/mcp/`, `src/embeddings/`, `src/notifications/`, a disjoint file set; those files were left untouched.)

---

## Findings

### Critical

#### C7-SEC-01 - SQL injection via unescaped config-driven table names (FIXED)

- **Severity:** Critical
- **Category:** Catalog A3 (missing `sqlIdent` on a config-driven identifier) / OWASP B1 (injection)
- **File / lines:**
  - `src/commands/session-prune.ts:78` - `FROM "${sessionsTable}"`
  - `src/commands/session-prune.ts:112` - `DELETE FROM "${config.sessionsTableName}"`
  - `src/commands/session-prune.ts:122` - `SELECT path FROM "${config.tableName}"`
  - `src/commands/session-prune.ts:126` - `DELETE FROM "${config.tableName}"`

**Vulnerable pattern:** The Deep Lake HTTP query endpoint has no parameterized queries, so every identifier and value must pass through the sanctioned escaping layer in `src/utils/sql.ts`. `session-prune.ts` correctly wrapped its *values* in `sqlStr()` but interpolated the *table identifiers* (`sessionsTable`, `config.sessionsTableName`, `config.tableName`) raw. These names are config-driven (the `HIVEMIND_*_TABLE` family), exactly the tainted-identifier path the catalog classifies as Critical injection - a malformed or attacker-influenced config value flows straight into a `DELETE FROM` statement.

**Why Critical (not downgraded):** the affected statements include destructive `DELETE FROM` against the `sessions` and `memory` tables, which hold captured-trace PII. An injected identifier here is both a query-injection and a captured-trace integrity/exposure risk.

**Fix applied (canonical, per `guides/05-remediation-playbooks.md` §SQL into Deep Lake):**
- Added `sqlIdent` to the existing `../utils/sql.js` import.
- `listSessions`: wrapped `sessionsTable` in `sqlIdent(...)` at the `FROM` site.
- `deleteSessions`: computed `const sessionsTbl = sqlIdent(config.sessionsTableName)` and `const memoryTbl = sqlIdent(config.tableName)` once, then used those guarded names at all three remaining interpolation sites.

`sqlIdent` throws on anything outside `[A-Za-z_][A-Za-z0-9_]*`, matching the precedent already in `goal.ts`, `rules/read.ts`, and `rules/write.ts`. Blast radius: identifier-escaping only; no behavioral change for valid table names.

### High

None detected.

### Medium

None detected.

### Low / Informational (documented, no fix required)

- **`src/utils/sql.ts` - helpers verified correct.** `sqlStr` escapes backslash before quote (correct order), doubles single quotes, strips NUL and C0/C1 control chars while preserving tab/newline/CR. `sqlLike` builds on `sqlStr` and escapes `%`/`_`. `sqlIdent`'s regex is anchored with `^...$`; in JavaScript (no `m` flag) `$` does **not** match before a trailing `\n`, so the newline-smuggling bypass that affects PCRE/Python `$` does not apply here. No null-byte or Unicode-normalization breakout was reproducible against these helpers.
- **`src/utils/spawn-detached.ts` - safe.** `spawn(execPath, [workerPath, ...args], ...)` uses fixed argv array form with no `shell: true`; `execPath` defaults to `process.execPath`. Node consumes `workerPath` as the script and the remaining elements as script args, so no node-flag or shell-metacharacter injection is possible.
- **`src/utils/version-check.ts` - no SSRF.** `getLatestVersion` fetches a hardcoded `raw.githubusercontent.com` URL with no caller-supplied input and an `AbortSignal.timeout`. The returned version string originates from a trusted repo. (Defense-in-depth note: the version string is rendered to the terminal by the session-start notice; if that upstream were ever compromised, an embedded ANSI escape could reach the terminal. Trusted source -> Low.)
- **`src/commands/mine-local.ts` - prompt-injection boundary already handled.** The model-produced `insight` field is sanitized at the parse boundary in `parseMultiVerdict` (whitespace collapsed to single spaces, capped at 280 chars), which strips embedded newlines that could carry pseudo-instructions into future SessionStart context. No Deep Lake SQL is constructed in this file; mined content is local-only.
- **`src/rules/read.ts`, `src/rules/write.ts` - hardened.** All table names go through `sqlIdent` and all values through `sqlStr`. `assertValidText` rejects CR/LF and Unicode line separators (U+2028/U+2029/U+0085) as prompt-injection defense before persistence.
- **`src/dashboard/render.ts` - XSS-safe.** Every externally-sourced string passes through `escHtml` (markup contexts, all attributes use double quotes) or `safeJsonForScript` (escapes `</`, `<!--`, `-->` for the embedded `application/json` block). vis-network tooltip components are pre-escaped.
- **`src/dashboard/serve.ts` - low exposure.** Binds 127.0.0.1 by default with no `--host` override, single static GET route returning a pre-rendered buffer; no request data reaches the response body.
- **`src/dashboard/open.ts`, `src/utils/resolve-cli-bin.ts` - safe spawns.** Both use fixed argv arrays; `open.ts` passes an internally-generated dashboard file path, and `resolve-cli-bin.ts` passes internal agent names ("claude"/"codex") to `where`/`which`.
- **`src/commands/auth-creds.ts` - credential modes correct.** Dir created `0o700`, file written `0o600`. Note: `writeFileSync`'s `mode` option does not chmod a pre-existing file; since `saveCredentials` is the only writer and always creates with `0o600`, this is not an exposure today. A belt-and-suspenders `chmod(credsPath(), 0o600)` after write (per `guides/05` §Credential file modes) could be added if older/looser files are a concern.

---

## Files Changed

| File | Change | Finding |
|---|---|---|
| `src/commands/session-prune.ts` | Import `sqlIdent`; wrap 4 table-name interpolations in `sqlIdent()` | C7-SEC-01 |

(`git diff` confirmed the change set contains only these security-relevant lines. Concurrent edits under `src/notifications/` belong to the C6 quality-guardian run and were not touched.)

---

## Categories Checked

| Category | Result |
|---|---|
| SQL injection into Deep Lake (values + identifiers) | 1 Critical found and fixed (session-prune.ts); all other in-scope query sites use `sqlIdent`/`sqlStr` |
| Command / argument injection (child_process) | None detected (fixed-argv spawns, no `shell: true` on tainted input) |
| SSRF / response injection (version-check) | None detected (hardcoded URL, trusted source) |
| Path traversal / content injection (rules write) | None detected (sqlIdent + sqlStr; newline + Unicode-separator rejection) |
| Terminal/HTML output injection (dashboard) | None detected (escHtml + safeJsonForScript; loopback-only server) |
| Prompt-injection via mined/recalled content | None detected (insight sanitized at parse boundary) |
| Credential / token exposure (logs, file modes) | None detected (0700/0600; no token logging in scope) |
| Broken access control / scope coercion | None detected in scope (session-prune is author-scoped by `author = userName`) |

---

## Recommended Follow-Up

- Optional defense-in-depth: add `chmod(credsPath(), 0o600)` after `writeFileSync` in `src/commands/auth-creds.ts` to harden against any pre-existing looser-permissioned credentials file.
- After this branch lands, re-run `quality-worker-bee` so its report reflects the security remediation.
