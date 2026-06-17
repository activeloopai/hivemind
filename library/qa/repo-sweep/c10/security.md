# Security Audit - Repo Sweep C10 (tests/shared)

- **Auditor:** `security-worker-bee`
- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Chunk:** C10 - Shared tests
- **Scope:** All 69 `.ts` files under `tests/shared/` (read in full)
- **Stinger:** `.cursor/skills/security-stinger/SKILL.md`

---

## Executive Summary

Clean audit. All 69 shared test files were reviewed against the C10 test-file security
focus areas. **No Critical or High findings.** No remediation was required, so no test
code was modified.

These are test files only: no production attack surface (no live network, no real
credential store, no real Deep Lake queries) is exercised. The suite demonstrates strong
test-isolation hygiene: every filesystem write targets a per-test `mkdtempSync` directory
with a unique random suffix, all are torn down with `rmSync`, every mutated environment
variable is saved and restored in `try/finally`, and every shell-out uses literal commands
(or `JSON.stringify`-escaped test constants) scoped to an isolated temp directory.

**Ordering check:** No `quality.md` / QA report exists yet for the C10 chunk
(`library/qa/repo-sweep/c10/`). The most recent quality reports cover c1-c8 only. This
security audit therefore runs before quality-guardian for C10, as required. The C9
quality-guardian run on `tests/claude-code/` was left untouched.

---

## Findings by Category

### Hardcoded secrets / tokens / credentials in fixtures

**None detected.** The only token-shaped literals are obvious placeholders used as test
fixtures, not real secrets:

- `tests/shared/deeplake-api.test.ts:52` - `expect(opts.headers["Authorization"]).toBe("Bearer tok")` (asserting a fake header value).
- `tests/shared/graph/deeplake-pull.test.ts:22`, `graph/deeplake-push.test.ts:11`, `deeplake-api-balance-exhausted.test.ts:56` - `token: "tok"` fixtures.

No JWTs, Activeloop tokens, API keys, private keys, or Base64 secret blobs. The
`deeplake-api-balance-exhausted.test.ts` credentials fixture is written into a sandbox
`TEMP_HOME` (a `mkdtempSync` dir), not a real `~/.deeplake/credentials.json`, and is
removed during the test.

### Unsafe test helpers executing shell with user input

**None detected.** All `execSync` / `spawnSync` calls use static, literal commands:

- `graph/git-hook-install.test.ts`, `graph/command.test.ts`, `graph/last-build-and-gate.test.ts` - literal `git init` / `git config` / `git add` / `git commit` invocations scoped to an isolated `mkdtempSync` `cwd`. No untrusted input is interpolated; the one interpolated value (`core.hooksPath "${customHooks}"`) is a test-controlled temp path.
- `spawn-detached.test.ts:114-131` - spawns `process.execPath -e <script>` where the only interpolated value is a fixed missing-binary constant passed through `JSON.stringify` (safe escaping).
- `spawn-detached.test.ts:151-164` - launches a real detached worker via `process.execPath` against a worker script written into a `mkdtempSync` dir; arguments are test-controlled temp paths.

No helper accepts or forwards external/user-controlled input into a shell.

### Tests writing to predictable shared paths

**None detected.** Every filesystem write resolves under a unique `mkdtempSync(join(tmpdir(), "<prefix>-"))` directory. The literal `/tmp/...` strings that appear are either:

- Pure-function path-composition assertions (e.g. `graph/snapshot.test.ts:90` `expect(repoDir("abc")).toBe("/tmp/x/abc")`, `graph/cache.test.ts:71-74`) - no file is created.
- Static input fixtures to pure functions (e.g. `worktree_path: "/tmp/test"`, `memoryPath: "/tmp/mem"`) - no file is created.

The `git-hook-install.test.ts` PATH shim is created inside a `mkdtempSync` bin dir (not a shared predictable path), is `chmod 0o755` only because it must be an executable resolvable by `which`, and the PATH mutation plus the dir are both cleaned up in `restore()`.

### Real SQL injection vectors (not mocked)

**None detected.** The Deep Lake API tests (`deeplake-api*.test.ts`,
`deeplake-schema.test.ts`, `graph/deeplake-*.test.ts`) mock the network boundary
(`fetch`) and assert on the constructed query strings. No test issues a real query, and
no SQL is built from untrusted or dynamically sourced input within the test code. The
`../etc/passwd`, `secrets.md`, and `/graph/../secret` strings (e.g.
`memory-path-utils.test.ts`, `graph/graph-command.test.ts`, `graph/diff.test.ts`,
`graph/session-context.test.ts`) are negative-path fixtures that assert traversal and
injection attempts are correctly **rejected** by the code under test. These strengthen
the defense and are not findings.

### `tmpdir()` uniqueness and cleanup

**Clean.** All temp directories use `mkdtempSync` (kernel-guaranteed unique random
suffix), eliminating predictable-name collision and symlink-preplacement risk. Cleanup
discipline is pervasive: `rmSync(..., { recursive: true, force: true })` appears in
`afterEach` / `afterAll` (or `try/finally`) across the suite. Environment overrides
(`HOME`, `HIVEMIND_STATE_DIR`, `HIVEMIND_GRAPHS_HOME`, `HIVEMIND_INDEX_MARKER_DIR`, `PATH`)
are captured and restored so tests do not leak mutated global state.

---

## Other Stinger Categories

- **Rules-file backdoor (Unicode):** Not applicable - chunk scope is `tests/shared/`, not `.cursor/rules`. None detected in scope.
- **Token leakage to logs:** None detected. No `console.*` in scope logs a token or credential payload.
- **Prompt-injection / poisoned-trace paths:** Not applicable to test fixtures; skillify and recall tests assert on static inputs.
- **Dependency CVEs:** Out of scope for this chunk (owned by `dependency-audit-worker-bee`); `npm install` / `npm audit` deliberately not run per task constraints.

---

## Remediation

None required. No test files were modified.

## Files Changed

| File | Change |
|---|---|
| (none) | Clean audit - no code changes |

## Recommendation

C10 (`tests/shared/`) passes the security audit cleanly. Safe to proceed to
quality-guardian for this chunk.
