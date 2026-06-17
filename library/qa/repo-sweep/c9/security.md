# Security Audit Report: Repo Sweep C9 (first half) - claude-code tests

**Audit date:** 2026-06-16
**Auditor:** security-worker-bee subagent
**Branch:** `pr/05-security-quality-repo-sweep`
**Chunk:** C9 (first half)
**Scope:** All 110 `.ts` files under `tests/claude-code/`
**Node version audited:** >=22 (per repo `engines`)
**`npm audit` result:** Not run - dependency-tree auditing is out of scope for this test-file-only chunk (owned by `dependency-audit-worker-bee`); `npm install` was explicitly prohibited for this run.
**OpenClaw bundle scan:** Not applicable to this chunk (test sources only).
**CVE watchlist:** Not applicable to this chunk (no production dependencies or framework version surface in test files).

---

## Executive Summary

Clean pass. All 110 TypeScript test files under `tests/claude-code/` were read and audited against the six test-specific focus areas (hardcoded secrets, unsafe shell helpers, predictable/shared temp paths, SQL injection into real queries, `tmpdir()` hygiene, and tainted process spawns). Zero Critical or High findings were identified, so no remediation was required. Every credential-shaped literal is a fake placeholder (`"tok"`, `"t"`, `"x"`, `"test-token"`, `"fake-token-for-trace-test"`), all real-process spawns use static or test-generated arguments, and all temporary directories use the atomic, collision-resistant `mkdtempSync(join(tmpdir(), prefix))` pattern. Notably, several of the highest-signal files are themselves *positive* security tests (command-injection breakout canaries, git-URL credential stripping, `sqlIdent` injection rejection).

---

## Scorecard

| Category | Status | Findings |
|---|---|---|
| Credential / Token Exposure (real secrets in fixtures) | OK | 0 |
| Captured-Trace PII (sessions/memory fixtures) | OK | 0 |
| Unsafe Shell Helpers (user/tainted-controlled exec) | OK | 0 |
| Injection (test query strings into real DB queries) | OK | 0 |
| Predictable/Shared Temp Paths (TOCTOU in parallel runs) | OK | 0 |
| Tainted Process Spawns (real subprocesses) | OK | 0 |

Legend: **OK** = zero findings · **ATTN** = Medium/Low documented · **FAIL** = Critical/High (fixed in session).

---

## Critical Findings (fixed in this session)

None detected.

---

## High Findings (fixed in this session)

None detected.

---

## Medium Findings (follow-up required)

None detected.

---

## Low Findings (documentation only)

None requiring action. Two informational observations are recorded below for transparency; neither is a security vulnerability and no change is recommended.

- **Informational - predictable canary path** `tests/claude-code/safe-echo.test.ts:60` - the injection-breakout test uses a fixed `/tmp/safe-echo-canary-<shell>.flag` path. This is a *negative-assertion* security test: it `rm -f`s the canary first, runs `safeEchoCommand()` output through a real shell, and asserts the canary was NOT created (i.e., the injected `touch` never ran). The shell name is embedded in the filename so `/bin/bash` and `/bin/sh` cases do not collide. Worst case under concurrent runs on a shared host is a test flake, not a production or runtime security weakness. No action recommended.
- **Informational - string-interpolated `execSync` cleanup** `tests/claude-code/embeddings-client.test.ts:369` - `execSync(\`pkill -f ${daemonScript}\`)` interpolates a path into a shell command. `daemonScript` is `join(makeTmpDir(), "fake-daemon.js")` - a test-generated temp path with no externally controlled or metacharacter-bearing content - so there is no injection vector. It is daemon-cleanup in an `afterEach`-style block guarded by `try/catch`. No action recommended.

---

## Focus-Area Findings Detail

### 1. Hardcoded secrets / tokens / credentials in fixtures
**None detected.** High-confidence secret regexes (JWT `eyJ...`, `sk-`, `AKIA`, `ghp_`, `xox*-`, PEM private keys, `AIza`) returned zero matches across all 110 files. Every credential-shaped value is an obvious placeholder used to satisfy a type or mock:
- `token: "tok"`, `token: "t"`, `token: "x"`, `token: "test-token"` (e.g. `wiki-worker.test.ts:61`, `pre-tool-use-branches.test.ts:34`, `pre-tool-use-baseline-cloud.test.ts:93`, `skillify-triggers.test.ts:52`).
- `HIVEMIND_TOKEN: "fake-token-for-trace-test"` (`shell-bundle-sql-trace-silence.test.ts:48`) - explicitly fake; the test drives a connection to a closed port (`http://127.0.0.1:1`).
- `"https://emanuele:secret@github.com/activeloopai/hivemind.git"` (`skillify-state.test.ts:152`) - a placeholder credential inside a `normalizeGitRemoteUrl` test that *verifies userinfo is stripped* from git remotes. This is a positive security test, not exposure.
- `tests/claude-code/real-table-test.mjs` reads real creds from `~/.deeplake/credentials.json` at runtime (`Authorization: Bearer ` + `creds.token`). It contains no committed secret and is a `.mjs` file outside the 110-file `.ts` scope; noted only for completeness.

### 2. Unsafe test helpers executing shell commands with user-controlled input
**None detected.** `safe-echo.test.ts` and `shell-bundle-sql-trace-silence.test.ts` run real shells, but exclusively with static, test-authored command strings and fixed argument arrays (`execFileSync(shell, ["-c", cmd])` / `spawnSync(execPath, [BUNDLE_PATH, "-c", "echo hello"])`). No input originates from an external/untrusted source.

### 3. SQL injection in test query strings against real DB queries
**None detected.** The only SQL-bearing fixtures are defensive injection tests, e.g. `sessions-table.test.ts:331` constructs `new DeeplakeApi(..., \`memory"; DROP TABLE x; --\`)` precisely to assert that the `sqlIdent` guard rejects a malicious table name. No test issues attacker-controlled SQL against a live database; targets are mocked or unreachable hosts.

### 4. Predictable / shared temp paths (TOCTOU in parallel runs)
**None detected.** Temp directories consistently use `mkdtempSync(join(tmpdir(), prefix))`, which atomically creates a uniquely-suffixed directory (collision-safe under parallel `vitest` workers). The handful using `join(tmpdir(), \`...-${Date.now()}-${Math.random().toString(36).slice(2)}\`)` (`version-check.test.ts`, `utils-version-check.test.ts`) are sufficiently unique for test isolation. See the `safe-echo.test.ts` canary note above (informational only).

### 5. `tmpdir()` usage - uniqueness and cleanup
**Healthy.** Files pair `mkdtempSync(...)` with `rmSync(..., { recursive: true, force: true })` cleanup in teardown (e.g. `wiki-worker.test.ts`, `summary-state.test.ts`, `session-queue.test.ts`, `query-cache.test.ts`). No shared mutable temp path is reused across tests in a way that creates a security-relevant race.

### 6. Tests that spawn real processes with tainted arguments
**None detected.** Real spawns (`summary-state.test.ts:593`, `notifications.test.ts:504/530/745`, `session-start.test.ts:101`, `pre-tool-use.test.ts:21`, `plugin-cache-gc-bundle.integration.test.ts:49`, `autoupdate.test.ts`) pass either fixed argv arrays or `tsx -e <code>` where `<code>` is a fully static string and all dynamic values (session ids, producer indices) are forwarded via environment variables (`TEST_SID`, `PRODUCER_IDX`), never interpolated into the executed code or argv.

---

## Files Changed (remediation)

None. This was a clean audit; no source files were modified.

Run `git diff` to confirm: the only change on this commit is the addition of this report.

---

## Recommended Follow-Up (architectural)

None for this chunk. Test files in `tests/claude-code/` follow safe patterns for secrets, process spawning, and temp-path handling. Production-code SQL guards, credential file modes, capture opt-out, and the OpenClaw bundle scan are owned by other chunks/Bees and were not in scope here.
