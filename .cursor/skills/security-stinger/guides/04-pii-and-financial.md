# 04 - Captured-Trace PII and Credential Exposure Patterns (Catalog C)

Credential and captured-trace findings are **Critical or High by construction** (never downgrade - see `guides/00-principles.md`). The blast radius of a leaked Activeloop JWT, an org id that enables cross-tenant access, or a `memory` row full of raw user prompts is measured in cross-tenant data exposure and broken trust, not engineering hours.

This catalog has nine patterns. Each maps to a scan step in `guides/01-scan-procedure.md` and a remediation playbook in `guides/05-remediation-playbooks.md`.

---

## C1 - Credential File Misconfiguration

**What it is:** the Activeloop token lives in `~/.deeplake/credentials.json`. It must be written mode `0600`, in a directory created mode `0700`. Relying on the process umask instead of an explicit mode can leave the token group- or world-readable.

**Must be tightly scoped:** the credential file itself, any cache of the JWT, the device-flow token exchange.

**Scan for:** `writeFile` / `mkdir` calls in `src/cli/auth.ts`, `src/commands/auth*.ts`, `src/config.ts` that touch the `.deeplake` directory without an explicit `{ mode: 0o600 }` / `{ mode: 0o700, recursive: true }`.

**Severity:** **High** (a readable token file is one `cat` away from full account takeover; **Critical** if the file is also committed or copied elsewhere).

**Fix:** write with explicit modes; `chmod` defensively after write. Never copy the token out of the credential store.

---

## C2 - Tokens / PII in Logging

**What it is:** shipping the Activeloop token, the `Authorization` header, the org id paired with a token, or raw captured-trace content into logs, stdout, or telemetry.

**Vulnerable:**
```ts
console.log('deeplake request', { url, headers });        // headers has Bearer <jwt>
console.log('captured', session);                         // raw prompts / responses
logger.error('auth failed', { token, orgId });            // token in a log line
```

**Severity:** **Critical** if a token / credential is logged (rotate immediately). **High** if raw captured-trace PII (prompts, tool calls, responses from `sessions`/`memory`) is logged.

**Fix:** use a `safeLog()` helper that redacts sensitive keys before anything reaches a log or telemetry sink. Reference implementation: `templates/safe-log.ts`. Playbook: `guides/05-remediation-playbooks.md` §safeLog.

**Keys to redact by default:** `authorization`, `token`, `accessToken`, `refreshToken`, `bearer`, `secret`, `apiKey`, `cookie`, `orgId` (when paired with a token), plus any captured-trace field carrying raw prompt/response text.

---

## C3 - Org Id / Scope in Untrusted Inputs

**What it is:** taking the `X-Activeloop-Org-Id` value or the `me|team` scope from request-scoped input (an MCP tool argument, a CLI flag passed through, a captured payload) instead of from the authenticated credential context.

**Vulnerable:**
```ts
// org id from the tool call argument - caller picks their own tenant
const orgId = toolArgs.orgId;
await api.query(sql, { orgId });
```

**Fix:** derive org id and scope from the credential store / authenticated session only. The caller never names their own org or widens their own scope.

**Severity:** **High** (scope coercion / broken access control; Critical if it reaches another tenant's captured PII).

**Scan for:** `orgId` / `scope` assignments sourced from tool args, `req.*`, or parsed captured content rather than `config` / the credential context.

---

## C4 - Over-Capture into `sessions` / `memory`

**What it is:** capture hooks that store more of a prompt, tool call, or response than is needed - including secrets the agent happened to handle, full request headers, or other-user content.

**Vulnerable:**
```ts
capture({ prompt, toolCalls, rawHeaders, env: process.env }); // captures everything
```

**Fix:** capture only the fields needed for recall, redact tokens/headers before write, and never persist `process.env` or `Authorization` content into a trace.

**Severity:** **High** if the over-captured fields include credentials or another user's data. **Medium** if merely verbose.

---

## C5 - Token or Secret Persisted into a Captured Trace

This is the costliest category to get wrong, because the `sessions` and `memory` tables are recalled into FUTURE agents' context. A token written into a trace today is replayed into someone's prompt tomorrow. Research: `research/cve-watchlist.md`.

### Critical - credential material in a trace

Any of these is **Critical**:
- An `Authorization: Bearer <jwt>` header captured into a `sessions` row.
- The contents of `~/.deeplake/credentials.json` captured anywhere.
- An API key / secret that the agent handled, persisted verbatim into `memory`.
- A token logged AND captured (double exposure).

**Fix:** redact at the capture boundary using `safeLog`-style key redaction before the INSERT. Delete any existing trace rows that contain credential material (scoped `UPDATE ... SET summary = ...` or row delete through the proper API). Rotate the Activeloop token. Re-run the audit.

### Critical - capture firing despite opt-out

`HIVEMIND_CAPTURE=false` must mean zero INSERTs. A capture path that writes anyway is a Critical trust violation - the user explicitly opted out.

```ts
const CAPTURE = process.env.HIVEMIND_CAPTURE !== 'false';
// every INSERT site must be guarded by CAPTURE
if (CAPTURE) await api.insert(row);
```

### Worked example

`examples/critical-pci-violation.md` walks the full Critical triage - a `Bearer` token leaked into a log line and a captured trace, with the redaction remediation.

---

## C6 - Token in Client/Temp Storage or Shell Output

**What it is:** copying the token out of the credential store into a temp file, an env dump, shell command output, or a VFS-visible path under `~/.deeplake/memory`.

**Vulnerable:**
```ts
writeFileSync('/tmp/dl-token.txt', token);                 // token on disk, world-readable
runShell(`curl -H "Authorization: Bearer ${token}" ...`);  // token in process args / shell history
```

**Fix:**
- Keep the token in memory; reference it from the credential store at request time.
- Never put a token in a shell argument (visible in `ps` / shell history) - build the request in-process via the Deep Lake client.
- Never write the token under `~/.deeplake/memory` (it is recall-visible).

**Severity:** **Critical**.

**Scan for:** `token` flowing into `writeFile`, `runShell`, template-literal shell commands, or any path under the VFS root.

---

## C7 - Missing Role / Field-Level Authorization on Recall

**What it is:** a recall or MCP tool that returns a `sessions` / `memory` field the caller should not see - another user's summary, an org-internal note, or a field that may contain residual sensitive text.

**Vulnerable:**
```ts
// returns every column of every matching row, ignoring scope
return await api.query(`SELECT * FROM "${tbl}" WHERE path LIKE '${sqlLike(prefix)}%'`);
```

**Fix:** select only the fields the recall needs, and scope the query by org + `me|team` (see `guides/03-owasp-top-10.md` B4). For MCP tool results, never include fields outside the caller's scope.

**Severity:** **High** (Critical if the field carries credential material or cross-org PII).

---

## C8 - Recalled Content Injected as Instructions (Poisoning)

**What it is:** recalled-memory content or a mined skill injected into agent context (SessionStart / UserPromptSubmit) and treated as trusted instructions. Because traces are attacker-influenceable, this lets a poisoned trace steer future agents - potentially into exfiltrating the token.

**Vulnerable:**
```tsx
const systemPrompt = base + '\n' + recalled.map(r => r.summary).join('\n'); // injected as instructions
```

**Fix:**
- Delimit and label recalled content as untrusted DATA at the injection boundary, not instructions.
- Ensure the Haiku skillify gate (`src/skillify/`) runs before a mined skill is propagated.
- Never inject one org's / user's content into another's context.

**Severity:** **High** (Critical for cross-org poisoning). Full treatment: `guides/02-vibe-coding-patterns.md` A6.

---

## C9 - Data-Handling / Retention Gaps

### C9.1 Capture opt-out honored everywhere

- **Required:** every INSERT site in the hooks is guarded by `HIVEMIND_CAPTURE !== 'false'`. A single unguarded write site → **High** (silent capture against opt-out).

### C9.2 Scope & org integrity

- **Required:** captured rows are written with the correct `me|team` scope and the authenticated org id; neither can be widened by a caller.
- **Severity:** **High** generally; **Critical** if a trace can be read across orgs.

### C9.3 Other gaps

- No documented retention / scoping expectation for the `sessions` and `memory` tables → **Medium**.
- No way to purge a user's captured traces on request → **Medium**.

---

## See also

- `guides/05-remediation-playbooks.md` - canonical fixes for every pattern above.
- `templates/safe-log.ts` - token/PII-redacting logger reference implementation.
- `examples/critical-pci-violation.md` - C2 / C5 worked case.
