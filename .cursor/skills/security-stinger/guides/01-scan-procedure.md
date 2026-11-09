# 01 - Scan Procedure (Phase 1)

The systematic sweep that must precede triage. Work top to bottom. Each step cites the pattern catalog entry it maps to.

Sources: `research/cve-watchlist.md`, the live Hivemind source under `src/`.

---

## Step 0 - Run `scripts/scan.sh`

Execute before anything else. It populates a local ephemeral scratch dir (e.g., `.scan-output/`, gitignored) with:

- `npm-audit.json`
- `openclaw-audit.txt` (OpenClaw bundle static scan via `npm run audit:openclaw`, if the harness build is present)
- `unicode-scan.txt` (rules-file backdoor)
- `grep-findings.txt` (regex sweeps)

Read the outputs. Every regex hit is a lead, not a finding - you must confirm by reading the file.

---

## Step 1 - Dependency + bundle gate

From `package-lock.json`, resolve the production dependency tree. Run:

- `npm audit --json --audit-level=high` - any Critical/High advisory in a production dependency → **Critical / High** (see Step 13).
- `npm run audit:openclaw` (`scripts/audit-openclaw-bundle.mjs`) - replicates ClawHub's static scan of the OpenClaw bundle. Any new flagged pattern → investigate.

Confirm the deliberate bypasses in `src/skillify/gate-runner.ts` (`createRequire` + the renamed `execFileSync`/`spawn` handles) are unchanged in intent - they exist to spawn the gate agent without tripping the scanner's literal-symbol regex. Tampering or new undocumented bypasses → **High**.

Guide cross-refs: `guides/02-vibe-coding-patterns.md` A5, A8; `guides/06-cve-tracker.md`.

---

## Step 2 - Rules-file backdoor scan

Glob: `.cursor/rules/**/*.{md,mdc,txt}`, `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`.

Search each for zero-width / bidi codepoints (U+200B-200F, U+202A-202E, U+2060-2069, U+FEFF). Any hit = **Critical**, silent supply-chain backdoor.

Remediation: delete the compromised file, audit `git log` to find when the codepoints were introduced, invalidate any tokens or credentials the compromised rules may have exfiltrated.

Guide cross-ref: `guides/02-vibe-coding-patterns.md` A4.

---

## Step 3 - Environment configuration & secrets

Files: `.env`, `.env.local`, `.env*`, and any source touching `process.env`.

Checklist:

- [ ] Any committed `.env*` file (`git ls-files | grep -E '^\.env'`) → **Critical**. Rotate, add to `.gitignore`, scrub history.
- [ ] Hardcoded Activeloop tokens, JWT-shaped strings, or API keys in `src/**` - search for `Bearer `, `eyJ` (JWT prefix), `sk_`, `-----BEGIN`, long Base64-looking constants in auth-adjacent code (`src/cli/auth.ts`, `src/commands/auth*.ts`, `src/config.ts`) → **Critical**.
- [ ] `HIVEMIND_CAPTURE` handling: confirm `=false` truly disables INSERTs (read-only mode). A path that captures despite opt-out → **High** (see `guides/04-pii-and-financial.md` C9).
- [ ] `scripts/pack-check.mjs` still blocks publishing secrets - confirm it runs in the publish path and its patterns are intact.

Guide cross-ref: `guides/04-pii-and-financial.md` C1, C6.

---

## Step 4 - API client hardening (`src/deeplake-api.ts`)

The Deep Lake HTTP client is the network boundary. Confirm:

- [ ] Retry on transient failure: `RETRYABLE_CODES` covers 429 + 5xx, with backoff.
- [ ] Concurrency cap: `Semaphore(MAX_CONCURRENCY)` (currently 5) wraps outbound requests.
- [ ] 402 balance-exhausted is detected and surfaced, not retried into a tight loop.
- [ ] Auth headers (`Authorization: Bearer`, `X-Activeloop-Org-Id`) are set from the credential store, never from request-scoped untrusted input.

Missing retry/backoff or concurrency cap → **Medium** (DoS-amplification / cost risk). Org id sourced from untrusted input → **High** (scope coercion).

Guide cross-ref: `guides/03-owasp-top-10.md` B5. Worked example: `examples/medium-missing-header.md`.

---

## Step 5 - Pre-tool-use gate integrity (`src/hooks/pre-tool-use.ts`)

The gate is a STRING-BASED interceptor: it matches literal command/path shapes and routes memory-touching commands to the VFS (`src/shell/deeplake-fs.ts`, ~70 allowlisted bash builtins over `~/.deeplake/memory`).

For each gate rule, confirm:

- [ ] The match is on a literal, statically-analyzable path or command shape - NOT on a runtime-resolved path (`os.homedir() + ...`, computed string concat). The `.coderabbit.yaml` `path_instructions` call this weakness out explicitly. A safety decision that depends on a dynamically computed path → **High** (gate bypass).
- [ ] The VFS allowlist in `deeplake-fs.ts` has not silently grown a command that can write outside `~/.deeplake/memory` or shell out.
- [ ] No code path lets a memory write reach the real filesystem or Deep Lake without passing the gate.

Gate bypass that lets a write escape the VFS → **Critical** (auth/integrity bypass).

Guide cross-ref: `guides/02-vibe-coding-patterns.md` A2, `guides/03-owasp-top-10.md` B9.

---

## Step 6 - Deep Lake query construction (`src/deeplake-api.ts`)

This is the injection-prone surface: the Deep Lake HTTP query endpoint has no parameterized queries, so every value is hand-escaped via `src/utils/sql.ts`.

For each query-building call, check:

- [ ] **Identifiers:** any table/column name (especially config-driven ones from `HIVEMIND_RULES_TABLE` and friends) is wrapped in `sqlIdent(...)`. A raw `"${name}"` interpolation of a config or input-derived identifier with NO `sqlIdent` → **Critical** (SQL injection into Deep Lake). See `guides/03-owasp-top-10.md` B1.
- [ ] **String values:** every interpolated value goes through `sqlStr(...)` (or `sqlLike(...)` for LIKE patterns). A raw `'${value}'` with no `sqlStr` → **High**.
- [ ] **Scope filters:** every `sessions` / `memory` read carries the correct `me|team` scope AND the org constraint. A query that filters by user but not org, or by scope but lets org be coerced wider → **High** (cross-scope read). See `guides/03-owasp-top-10.md` B4 and `examples/high-idor-finding.md`.

---

## Step 7 - MCP server tool handlers (`src/mcp/**`, MCP tool definitions)

For each MCP tool the server exposes, check:

- [ ] **Auth context:** the handler resolves identity/org from the credential store, not from tool arguments. A tool that accepts an org id or scope as an argument and trusts it → **High** (scope coercion / broken access control).
- [ ] **Input validation:** tool inputs that flow into a Deep Lake query are validated and escaped before interpolation (Step 6 applies transitively).
- [ ] **No secret echo:** tool return values do not include tokens, full credential paths, or other users' captured traces.

Missing auth/scope enforcement → **High**. Secret echoed in a tool result → **Critical**.

---

## Step 8 - Captured-trace capture path (`src/hooks/**/capture.ts`, `src/hooks/**/session-start*.ts`)

The capture hooks write raw prompts, tool calls, responses, and summaries into the `sessions` and `memory` tables. Check:

- [ ] `HIVEMIND_CAPTURE !== "false"` is honored everywhere capture happens - opt-out must mean zero INSERTs.
- [ ] No raw token, `Authorization` header, or credential-file content is written into a captured trace.
- [ ] Captured content is scoped (`me|team`) at write time; an org id is never widened.

Token written into a captured trace → **Critical**. Capture firing despite opt-out → **High**.

Guide cross-ref: `guides/04-pii-and-financial.md` C2, C5, C9.

---

## Step 9 - Prompt-injection surface (recalled memory + mined skills)

Recalled memory and mined skills are injected into agent context at SessionStart / UserPromptSubmit. A poisoned trace or skill can steer future agents. Check:

- [ ] The Haiku skillify gate (`src/skillify/`, `src/skillify/gate-runner.ts`) actually runs before a mined skill is propagated - it is the quality/safety checkpoint.
- [ ] Recalled-memory content that is injected verbatim into a prompt is treated as untrusted data, not as instructions, at the injection boundary.
- [ ] There is no path that injects unvetted skill content into another user's / org's context.

A path that injects unvetted content into agent context → **High** (prompt-injection poisoning). A cross-org injection path → **Critical**.

Guide cross-ref: `guides/02-vibe-coding-patterns.md` A6, `guides/03-owasp-top-10.md` B6.

---

## Step 10 - Credential file handling (`src/cli/auth.ts`, `src/commands/auth*.ts`, `src/config.ts`)

The credential store is `~/.deeplake/credentials.json`.

Checklist:

- [ ] The file is written with mode `0600` and its directory with mode `0700`. A write that omits the explicit mode (relying on umask) → **High**.
- [ ] The device-flow login never logs the token or the device code beyond what the flow requires.
- [ ] Tokens are read into memory only as needed and never persisted anywhere except the credential file. A token copied into a log, a temp file, or a captured trace → **Critical**.

Guide cross-ref: `guides/04-pii-and-financial.md` C1, C6. Worked example: `examples/critical-pci-violation.md`.

---

## Step 11 - Logging & error paths

Across `src/**`, especially the API client, hooks, and CLI:

- [ ] No `console.*` / logger call interpolates a token, `Authorization` header, org id paired with a token, or full credential-file content. → **Critical** if a token; **High** if PII from a captured trace.
- [ ] Error responses returned to the caller do not echo the resolved memory path, org id, or internal Deep Lake error detail. → **Medium** (see `examples/low-verbose-error.md`).
- [ ] Use `templates/safe-log.ts` (`safeLog`) as the redacting wrapper for any log line that may touch sensitive payloads.

---

## Step 12 - Org RBAC enforcement

RBAC is org-level: ADMIN / WRITE / READ. Check:

- [ ] Write operations (INSERT/UPDATE into `sessions`/`memory`/rules tables) require WRITE or ADMIN; reads require at least READ.
- [ ] The role check derives from the authenticated org context, never from a request argument.
- [ ] No operation silently coerces `me` scope into `team`, or one org id into another.

Missing role check on a write → **High**. Scope/org coercion → **High** (Critical if it crosses tenants with captured PII).

Guide cross-ref: `guides/03-owasp-top-10.md` B4.

---

## Step 13 - Dependency review

Output from `npm audit --json --audit-level=high`:

- [ ] Any Critical vulnerability → **Critical**. Upgrade to patched version.
- [ ] Any High vulnerability → **High**. Upgrade unless the advisory has an explicit "not exploitable in this usage" note.
- [ ] Recently-added packages with <100 weekly downloads → investigate for typosquatting / hallucinated-dependency risk. See `guides/02-vibe-coding-patterns.md` A5.
- [ ] OpenClaw bundle: any new pattern flagged by `npm run audit:openclaw` that is not a known-