# 03 - OWASP Top 10:2025 on Hivemind's Attack Surface (Catalog B)

The OWASP Top 10 refreshed in 2025 (`research/2026-04-24-owasp-top-10-2025.md`). Two new categories (Supply Chain Failures, Mishandling of Exceptional Conditions) and SSRF consolidated into Broken Access Control. The catalog below maps each category to how it actually manifests on Hivemind - a TypeScript CLI + MCP server talking to a Deep Lake HTTP API, gated by a string-based pre-tool-use interceptor, holding an Activeloop token.

> Mapping quick-ref: **A01** Broken Access Control · **A02** Security Misconfiguration · **A03** Software Supply Chain Failures · **A04** Cryptographic Failures · **A05** Injection · **A06** Insecure Design · **A07** Identification & Authentication Failures · **A08** Software & Data Integrity Failures · **A09** Logging & Monitoring Failures · **A10** Mishandling of Exceptional Conditions.

---

## B1 - Injection (A05:2025) - SQL into the Deep Lake HTTP API

The Deep Lake query endpoint does NOT support parameterized queries. Every value and identifier is hand-escaped in `src/deeplake-api.ts` via `src/utils/sql.ts`. This is the single highest-value injection surface in the codebase.

### B1.1 Missing `sqlIdent` on an identifier

**Vulnerable:**
```ts
// table name from HIVEMIND_RULES_TABLE, interpolated raw
const rows = await this.query(`SELECT * FROM "${name}"`);
```

**Secure:**
```ts
const safe = sqlIdent(name); // throws on anything outside [A-Za-z_][A-Za-z0-9_]*
const rows = await this.query(`SELECT * FROM "${safe}"`);
```

**Scan for:** any `"${...}"` or backtick-interpolated table/column name in `src/deeplake-api.ts` that is NOT wrapped in `sqlIdent`. Config-driven names (`HIVEMIND_RULES_TABLE`, default `hivemind_rules`) are the prime target.

**Severity:** **Critical**.

### B1.2 Missing `sqlStr` / `sqlLike` on a value

**Vulnerable:**
```ts
await this.query(`SELECT path FROM "${tbl}" WHERE path = '${row.path}'`); // raw value
```

**Secure:**
```ts
await this.query(`SELECT path FROM "${tbl}" WHERE path = '${sqlStr(row.path)}'`);
// LIKE patterns:
await this.query(`... WHERE path LIKE '${sqlLike(prefix)}%'`);
```

`sqlStr` escapes single quotes, backslashes, NUL, and control chars; `sqlLike` additionally escapes `%` and `_`. Every interpolated value must pass through one of them.

**Severity:** **High** (Critical if the injected value can pivot to a cross-org read or a destructive statement).

### B1.3 Command injection through the gate / VFS

A memory operation that builds a shell command from input instead of routing through the VFS allowlist is command injection. See B9 (gate path weakness).

---

## B2 - Cryptographic Failures (A04:2025) - token & credential handling

- **Token storage:** the Activeloop JWT lives only in `~/.deeplake/credentials.json` (mode 0600). A token written anywhere else (log, temp file, captured trace) → **Critical**. See `guides/04-pii-and-financial.md` C1, C2.
- **Transport:** all Deep Lake traffic is HTTPS with the token in `Authorization: Bearer`. A plaintext/HTTP fallback or a token in a query string → **High**.
- **Hardcoded secrets:** string literals resembling JWTs (`eyJ...`), API keys, or Activeloop tokens in source → **Critical** (and rotate). `scripts/pack-check.mjs` is the publish-time backstop.

**Scan for:** `Bearer `, `eyJ`, `sk_`, `-----BEGIN` in `src/**`; `Authorization` headers built from anything other than the credential store.

---

## B3 - Identification & Authentication Failures (A07:2025)

- **Device-flow login** (`src/cli/auth.ts`, `src/commands/auth*.ts`): the device code and token must never be logged beyond what the flow strictly requires. Token persisted only to the credential file.
- **Org-id binding:** `X-Activeloop-Org-Id` must come from the authenticated credential context, never from request-scoped or tool-argument input. An org id taken from untrusted input → **High** (scope coercion / auth confusion).
- **No token reuse across orgs:** one credential context = one org scope; do not let a single in-memory token be re-aimed at a different org id by a caller.

Missing org-context binding → **High**.

---

## B4 - Broken Access Control (A01:2025) - org RBAC + `me|team` scope

**Pattern:** a read or write against `sessions` / `memory` / rules tables that does not enforce both the org RBAC role (ADMIN / WRITE / READ) AND the `me|team` scope.

**Vulnerable:** `SELECT ... FROM sessions WHERE path = '...'` with no scope filter and no org pin - any authenticated caller reads any trace.

**Every captured-trace query must enforce:**
```
authenticated AND org-scoped AND scope IN (caller's me|team)
```

For state-changing operations, push the scope into the statement itself so an unauthorized op is a no-op, not a leak:
```ts
// scoped UPDATE - cannot touch another scope/org's row
`UPDATE "${sqlIdent(tbl)}" SET ... WHERE path = '${sqlStr(path)}' AND scope = '${sqlStr(scope)}'`
```

**Scope coercion** is the dangerous subclass: a path that silently widens `me` to `team`, or accepts an org id from input and reads another tenant's data. Enforce role + scope + org in every query.

**Severity:** **High** (Critical if the resource is captured PII crossing tenants).

Worked example: `examples/high-idor-finding.md`. SSRF note: the gate path weakness (B9) is the SSRF-adjacent / insecure-design member of A01.

---

## B5 - Security Misconfiguration (A02:2025, now #2)

### B5.1 Credential file modes

`~/.deeplake/credentials.json` must be mode `0600`, its directory `0700`. A write that relies on umask instead of an explicit mode → **High** (world/group-readable token).

### B5.2 Capture opt-out not honored

`HIVEMIND_CAPTURE=false` must produce a fully read-only run - no placeholder rows, no INSERTs into `sessions`/`memory`. A write site that ignores the flag → **High** (silent data capture against the user's wishes).

### B5.3 API client hardening gaps

`src/deeplake-api.ts` must retry on 429/5xx with backoff, cap concurrency with `Semaphore(5)`, and detect 402 balance-exhausted. Missing retry/backoff or concurrency cap → **Medium** (cost/DoS amplification). Worked example: `examples/medium-missing-header.md`.

---

## B6 - Software Supply Chain Failures (A03:2025, NEW)

- `npm audit --json --audit-level=high` - any Critical/High advisory in a production dependency = block ship.
- **OpenClaw bundle:** `npm run audit:openclaw` (`scripts/audit-openclaw-bundle.mjs`) replicates ClawHub's static scan. Any new flagged pattern that is not a documented deliberate bypass = block ship.
- **`gate-runner.ts` bypasses:** the `createRequire` + renamed `execFileSync`/`spawn` handles are intentional and must stay clean - see `guides/02-vibe-coding-patterns.md` A8.
- **Prompt-injection as a data-integrity failure:** a mined skill that bypasses the Haiku skillify gate (`src/skillify/`) propagates unvetted content - see B-note below and A6.
- Newly-added dependencies with <100 weekly downloads: investigate for typosquatting / hallucinated deps (`guides/02-vibe-coding-patterns.md` A5).
- `.cursor/rules/**` and AI rules files: scan for hidden Unicode (A4).

CodeQL (javascript-typescript) runs in CI as the standing static-analysis gate.

---

## B7 - Insecure Design (A04 family) - prompt-injection / poisoned propagation

Recalled memory and mined skills injected at SessionStart / UserPromptSubmit are an insecure-design surface: trusting attacker-influenceable captured content as instructions. The Haiku skillify gate is the design-level control. A propagation path that skips it, or injects unvetted content into agent context, is an insecure-design finding.

**Severity:** **High** (Critical for cross-org poisoning). Full treatment: `guides/02-vibe-coding-patterns.md` A6.

---

## B8 - Software & Data Integrity (A08:2025) - prototype pollution & untrusted merges

`Object.assign(target, JSON.parse(userInput))` or `_.merge(target, userInput)` on untrusted input (e.g. a tool-call payload or a captured-trace blob) lets `{"__proto__": {...}}` pollute `Object.prototype`. On Hivemind the dangerous downstream is a polluted config/role object.

**Defenses:** validate with a strict schema before merging (reject `__proto__`/`constructor`/`prototype`), use `Object.hasOwn(...)` for flag reads, `Object.create(null)` / `Map` for internal lookup maps.

**Severity:** **High** (privilege escalation downstream). Playbook: `guides/05-remediation-playbooks.md` §Prototype pollution.

---

## B9 - Broken Access Control / SSRF-adjacent (A01:2025) - the gate path weakness

The pre-tool-use gate (`src/hooks/pre-tool-use.ts`) is STRING-BASED and CANNOT intercept dynamically computed paths. A memory operation whose target path is resolved at runtime can slip past the gate and reach the real filesystem or Deep Lake unmediated - the same class as path traversal / SSRF (a request reaching an unintended destination because the guard only saw a literal).

**Vulnerable:** `runShell(\`rm -rf ${os.homedir() + "/.deeplake/" + seg}\`)` - gate matched a literal prefix, real target was computed.

**Secure:** keep gate-relevant paths literal; route every memory op through the VFS allowlist (`src/shell/deeplake-fs.ts`). Never make a safety decision depend on a runtime-resolved path (the `.coderabbit.yaml` `path_instructions` say exactly this).

**Severity:** **Critical** (gate bypass - write escapes the VFS). See `guides/02-vibe-coding-patterns.md` A2.

---

## B10 - Logging & Monitoring Failures (A09:2025) + Mishandling Exceptions (A10:2025)

### B10.1 Verbose Error Responses

**Vulnerable:**
```ts
return { error: err.message, orgId, memoryPath: resolved }; // echoes org + internal path
```

**Secure:**
```ts
console.error('[deeplake]', err);                  // server-side / safeLog only
return { error: 'Internal error' };                // generic to the caller
```

Echoing the org id, resolved memory path, or raw Deep Lake error detail aids reconnaissance. **Medium** - but **High** if the error string contains a token, captured PII, or a SQL fragment.

Worked example: `examples/low-verbose-error.md`.

### B10.2 Sensitive data in logs

Auth events (login, token refresh, org switch, capture writes) should be logged with a timestamp and a user/org identifier - but NEVER with the token itself or raw captured-trace content. A log line containing a `Bearer` token → **Critical**; one containing captured PII → **High**. Use `templates/safe-log.ts`. S