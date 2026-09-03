# Worked Example - Critical: Activeloop Token Leaked to Logs and a Captured Trace

Demonstrates: `guides/04-pii-and-financial.md` C2 / C5 · `guides/01-scan-procedure.md` Step 11 · `guides/05-remediation-playbooks.md` §safeLog / §Credential redaction.

---

## Scenario

Branch `feat/request-tracing` adds debug logging to the Deep Lake client and captures the outbound request into the `sessions` table for "observability." The developer used AI code generation to scaffold the tracing.

## Vulnerable code discovered

`src/deeplake-api.ts` (request path):

```ts
async query(sql: string) {
  const req = {
    url: this.baseUrl,
    headers: {
      Authorization: `Bearer ${this.token}`,
      'X-Activeloop-Org-Id': this.orgId,
    },
    body: sql,
  };

  console.log('[deeplake] request', req);            // <- logs the Bearer token

  await capture({                                    // <- writes the token into a trace
    path: `sessions/${Date.now()}`,
    summary: JSON.stringify({ outbound: req }),
  });

  return this._fetch(req);
}
```

## Finding text (report-ready)

> - [x] **Credential Exposure** `src/deeplake-api.ts:~245` - The request object containing `Authorization: Bearer <jwt>` is both written to stdout via `console.log` and persisted into the `sessions` table via `capture()`. The Activeloop token is now in process logs AND in recalled-memory content that will be injected into future agents' context. Any reader of the logs or any future session recall gains full account access.

## Severity rationale

**Critical.** Two simultaneous Critical findings in one handler:

1. Token in logs - one `cat` of the log stream is full account takeover.
2. Token in a captured trace - the `sessions` table is recalled into future agents, so the token replays into someone's prompt later. The never-downgrade rule applies: credential findings are Critical by construction.

## Remediation diff (applied in-session)

```diff
--- a/src/deeplake-api.ts
+++ b/src/deeplake-api.ts
@@
+import { safeLog, redact } from './lib/safe-log.js';
@@
   const req = { url: this.baseUrl, headers: { Authorization: `Bearer ${this.token}`,
     'X-Activeloop-Org-Id': this.orgId }, body: sql };

-  console.log('[deeplake] request', req);
+  // safeLog redacts authorization/token/cookie before anything is emitted
+  safeLog.info('deeplake.request', { url: req.url, bodyLen: sql.length });
@@
-  await capture({
-    path: `sessions/${Date.now()}`,
-    summary: JSON.stringify({ outbound: req }),
-  });
+  // never persist headers/token into a trace; capture only non-sensitive shape
+  await capture({
+    path: `sessions/${Date.now()}`,
+    summary: JSON.stringify(redact({ outbound: { url: req.url, bodyLen: sql.length } })),
+  });
```

Two targeted changes:

1. Replace `console.log(req)` with a `safeLog` call that emits only the URL and body length - the redactor strips `authorization`/`token` even if a future edit re-adds headers.
2. Strip headers from the captured trace and route the payload through `redact()` so a token can never reach the `sessions` table.

## Post-fix actions (non-code)

- Rotate the Activeloop token (assume compromise - it was in logs and a trace).
- Purge any log aggregator records matching `Bearer ` within the retention window.
- Delete or overwrite any `sessions` rows already written with the token (scoped `UPDATE ... SET summary = ...` or row delete through the proper API).
- Confirm `scripts/pack-check.mjs` would block a token at publish time (defense-in-depth).

## What goes in the audit report

Under **Critical Findings (fixed in this session):**

- [x] **Credential Exposure** `src/deeplake-api.ts:~245` - Bearer token logged via `console.log` and persisted into the `sessions` table. Replaced with `safeLog` (redacted) logging; stripped headers from capture and routed through `redact()`. Token rotation + log/trace purge queued as post-fix actions.

Under **Files Changed (remediation):**

| File | Change Summary |
|---|---|
| `src/deeplake-api.ts` | Replaced raw `console.log(req)` with redacting `safeLog`; stripped token/headers from `capture()` payload |
| `src/lib/safe-log.ts` | Added (token/PII-redacting logger from `templates/safe-log.ts`) |

Under **Recommended Follow-Up (architectural):**

- Add an ESLint / CodeQL rule banning `console.log` of any object that may contain `headers`/`Authorization` in `src/deeplake-api.ts` and the hooks.
- Rotate the Activeloop token on a schedule, not just on incident.
