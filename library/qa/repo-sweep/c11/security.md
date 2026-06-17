# Security Audit Report: Repo Sweep C11 - CLI + per-agent tests

**Audit date:** 2026-06-16
**Auditor:** security-worker-bee subagent
**Branch:** `pr/05-security-quality-repo-sweep`
**Chunk:** C11 (CLI + per-agent tests)
**Scope:** 51 `.ts` files: `tests/cli/` (20), `tests/codex/` (9), `tests/hermes/` (6), `tests/cursor/` (6), `tests/openclaw/` (5), `tests/pi/` (3), `tests/scripts/` (1), and `tests/test-setup.ts` (1)
**Node version audited:** >=22 (per repo `engines`)
**`npm audit` result:** Not run - dependency-tree auditing is out of scope for this test-file-only chunk (owned by `dependency-audit-worker-bee`); `npm install` was explicitly prohibited for this run.
**OpenClaw bundle scan:** Not applicable to this chunk (test sources only; `tests/openclaw/openclaw-embed-bundle.test.ts` is a build-time artifact guard, not a runtime surface).
**CVE watchlist:** Not applicable to this chunk (no production dependencies or framework version surface in test files).

---

## Executive Summary

Clean pass. All 51 TypeScript test files in scope were read and audited against the six test-specific focus areas (hardcoded secrets, unsafe shell helpers, predictable/shared temp paths, SQL injection into real queries, `tmpdir()` hygiene, and tainted process spawns). Zero Critical or High findings were identified, so no remediation was required.

Every credential-shaped literal is a fake placeholder (`"tok"`, `"t"`, `"env-token"`, `"env-tok"`, `"flag-tok"`, `"should-be-ignored"`, `"invalid-token"`). All real-process spawns (`execFileSync`/`spawn` in `codex-integration.test.ts`, `install-consent-bundle.test.ts`, and the per-agent wiki-worker tests) pass static, test-authored argument arrays; none use `shell: true` and none interpolate tainted input into a shell string. The wiki-worker tests pass LLM prompts as discrete `execFileSync` arguments, never through a shell. Mock HTTP servers bind to `127.0.0.1`. Several of the highest-signal files are themselves *positive* security tests: the openclaw `hivemind_goal_add` suite asserts that `sqlStr()` doubles single quotes (`E'Levon''s goal'`), and the per-agent capture-hook JSONB tests assert the SQL-escape regression fix produces parseable, injection-safe literals.

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

- **Informational - non-atomic (but randomized) temp-dir pattern.** Several `*-fs` installer tests and a few helper tests build their temp root as `join(tmpdir(), \`prefix-${Date.now()}-${Math.random().toString(36).slice(2)}\`)` followed by `mkdirSync(...)` rather than the atomic `mkdtempSync(...)`. Examples: `tests/cli/cli-install-codex-fs.test.ts:32`, `cli-install-cursor-fs.test.ts:20`, `cli-install-pi-fs.test.ts:22`, `cli-install-hermes.test.ts:22`, `cli-install-mcp-shared.test.ts:17`, `cli-install-openclaw.test.ts:17`, `cli-util.test.ts:54/99/128/178`, `cli-version.test.ts:30`. The `Date.now()` + `Math.random()` suffix makes practical collision under parallel `vitest` workers negligible, each test cleans up with `rmSync(..., { recursive: true, force: true })`, and the path is created-then-owned by the test rather than read from a pre-existing attacker-controlled location. Worst case is a test flake, not a runtime or production security weakness. No action recommended; `mkdtempSync` would be a marginal hardening if touched for other reasons.
- **Informational - inline `require("node:fs")` in two test files.** `tests/openclaw/setup-command.test.ts:71` and `tests/cli/cli-install-claude.test.ts:305-307` use inline `require(...)` for fs/path/os. This is a style/lint concern (the repo's no-inline-imports rule), not a security issue, and is pre-existing. Left unchanged to preserve minimal blast radius.

---

## Focus-Area Findings Detail

### 1. Hardcoded secrets / tokens / credentials in fixtures
**None detected.** Regex sweeps for high-confidence secret shapes (`eyJ`, `sk-`, `AKIA`, `ghp_`, `xox*-`, PEM keys, `AIza`) and long base64/hex literals returned no real secrets across all 51 files. Every credential-shaped value is an obvious placeholder used to satisfy a type or drive a mock:
- Env-token fixtures: `process.env.HIVEMIND_TOKEN = "env-token"` / `"bad-token"` / `"invalid-token"` (`install-consent.test.ts`, `install-consent-bundle.test.ts`), `"env-tok"` / `"flag-tok"` (`cli-auth.test.ts`).
- Negative test: `DEEPLAKE_API_TOKEN = "should-be-ignored"` (`cli-auth.test.ts:271`) asserts the legacy env name is NOT honored.
- Config/cred fixtures consistently use `token: "tok"` / `token: "t"` with mocked `loadCredentials`/`loadConfig`. No file reads or writes a real `~/.deeplake/credentials.json` with a live token; `cli-auth.test.ts` writes throwaway creds into a `mkdtemp` HOME with correct `0o700`/`0o600` modes (a positive practice).

### 2. Unsafe test helpers executing shell commands with user-controlled input
**None detected.** `codex-integration.test.ts` and `install-consent-bundle.test.ts` spawn the real shipped bundle, but exclusively via `execFileSync("node", [bundlePath], {...})` / `spawn(process.execPath, [cliPath, "install", "--only", "codex"], {...})` - argument arrays, no `shell: true`, no string interpolation. JSON payloads are piped through `input:`/stdin, not the command line. The wiki-worker suites (`codex`/`cursor`/`hermes`/`pi`) mock `execFileSync` and only assert on the argv shape; the production prompt is a discrete argv element, never a shell fragment.

### 3. SQL injection in test query strings against real DB queries
**None detected.** All SQL in scope is either mocked (`DeeplakeApi.query` stubbed via `vi.mock`) or part of a *defensive* assertion. `tests/openclaw/hivemind-tools.test.ts:389-397` feeds `"Levon's goal"` to `hivemind_goal_add` specifically to assert `sqlStr()` doubles the quote (`E'Levon''s goal'`). The per-agent capture-hook JSONB regression tests (`codex-capture-hook.test.ts`, `codex-capture.test.ts`, `codex-stop-hook.test.ts`, plus cursor/hermes capture) verify that double quotes and apostrophes round-trip into parseable, correctly-escaped SQL literals. No test issues attacker-controlled SQL against a live database.

### 4. Predictable / shared temp paths (TOCTOU in parallel runs)
**None detected (informational only).** The dominant pattern is the atomic, collision-safe `mkdtempSync(join(tmpdir(), prefix))` (e.g. `test-setup.ts`, `cli-embeddings.test.ts`, `cli-auth.test.ts`, `install-end-to-end.test.ts`, all four wiki-worker tests, `scripts/sync-versions.test.ts`). The `Date.now()`+`Math.random()` directory pattern in the `*-fs` and util tests is randomized per-test and is documented under Low Findings as informational. The `/tmp/...` strings that appear elsewhere (`memoryPath: "/tmp/mem"`, `cwd: "/tmp"`, `bundleDirFromImportMeta: () => "/tmp/bundle"`, `socketPathFor` regexes in `pi-extension-source.test.ts`) are mock config values and source-level pattern assertions, never real filesystem operations.

### 5. `tmpdir()` usage - uniqueness and cleanup
**Healthy.** Files that create real temp dirs pair creation with `rmSync(..., { recursive: true, force: true })` teardown (`afterEach`/`afterAll`), including `test-setup.ts` (global config isolation), the wiki-worker tests, the `*-fs` installer tests, and `cli-embeddings.test.ts` (which additionally redirects the embed daemon's socket/pidfile into a per-test `mkdtemp` dir precisely to avoid clobbering a real developer/CI daemon). No shared mutable temp path is reused across tests in a way that creates a security-relevant race.

### 6. Tests that spawn real processes with tainted arguments
**None detected.** Real spawns are confined to `codex-integration.test.ts` (real codex bundle, static argv + stdin JSON), `install-consent-bundle.test.ts` (real `bundle/cli.js`, static argv, mock 401 server on `127.0.0.1`), and `cli-update.test.ts`'s one default-spawn path (guarded by overriding `PATH` to a non-existent dir so the spawn fails fast - no real `npm install` runs). All other process interaction is mocked at the `node:child_process` boundary. No dynamic value is interpolated into an executed command line.

---

## Files Changed (remediation)

None. This was a clean audit; no source files were modified.

Run `git diff` to confirm: the only change on this commit is the addition of this report.

---

## Recommended Follow-Up (architectural)

None for this chunk. The CLI and per-agent test files follow safe patterns for secrets, process spawning, SQL escaping, and temp-path handling. Production-code SQL guards (`src/utils/sql.ts`), credential file modes, capture opt-out, and the OpenClaw bundle/dependency surfaces are owned by other chunks/Bees and were not in scope here.
