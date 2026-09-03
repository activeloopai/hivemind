# Worked Example - Medium: Missing API-Client Hardening (No Retry / Concurrency Cap)

Demonstrates: `guides/03-owasp-top-10.md` B5 · `guides/01-scan-procedure.md` Step 4 · `guides/05-remediation-playbooks.md` §API client hardening · Medium-severity "fix if cheap" judgment call.

---

## Scenario

Routine audit of the Deep Lake client. No code change in the branch touches the request path, but the scan procedure requires checking `src/deeplake-api.ts` for the baseline hardening (retry on 429/5xx, concurrency cap, 402 detection).

## Vulnerable configuration discovered

`src/deeplake-api.ts` (a new helper added in a prior branch):

```ts
async bulkUpsert(rows: Row[]) {
  // fires every request at once, no retry, no backoff
  return Promise.all(rows.map(r => this._fetch(this.buildUpsert(r))));
}
```

The main `query()` path goes through the `Semaphore(5)` and `RETRYABLE_CODES` retry logic - but this `bulkUpsert` helper bypasses both. On a large memory sync it floods the Deep Lake API: every request fires concurrently, a 429 is treated as a hard failure, and a 402 balance-exhausted response is not detected (so the loop can keep paying into an exhausted balance).

## Finding text (report-ready)

> - [ ] **Security Misconfiguration - Missing API-client hardening** `src/deeplake-api.ts:bulkUpsert` - Helper bypasses the `Semaphore(5)` concurrency cap and the 429/5xx retry/backoff used by the main `query()` path, and does not detect a 402 balance-exhausted response. On a large sync this floods the Deep Lake API and can burn balance against an already-exhausted account.

## Severity rationale

**Medium.** No data leak or auth bypass, but a real cost/DoS-amplification gap. The Medium threshold says: **document; fix only if the patch is under ~5 lines** - here routing through the existing semaphore is a few lines. Fixing in this session.

## Remediation diff (applied in-session)

```diff
--- a/src/deeplake-api.ts
+++ b/src/deeplake-api.ts
@@ async bulkUpsert(rows: Row[]) {
-  return Promise.all(rows.map(r => this._fetch(this.buildUpsert(r))));
+  // route through the same hardened call path: Semaphore(5) + retry + 402 detect
+  return Promise.all(rows.map(r => this.call(this.buildUpsert(r))));
 }
```

`this.call(...)` is the existing wrapper that holds the `Semaphore(5)` slot, retries on `RETRYABLE_CODES` (429/5xx) with backoff, and throws `BalanceExhaustedError` on 402. The fix is to stop bypassing it.

## What goes in the audit report

Since the Medium was fixed in-session (under the 5-line threshold), promote it into the "Medium Findings - fixed in this session" sub-list:

- [x] **Security Misconfiguration - Missing API-client hardening** `src/deeplake-api.ts:bulkUpsert` - Routed the bulk path through the existing hardened `call()` wrapper (Semaphore(5), 429/5xx retry+backoff, 402 detection) instead of raw `Promise.all(_fetch)`.

Under **Recommended Follow-Up (architectural):**

- Make `_fetch` private / lint-banned outside `call()` so no future helper can bypass the hardening again.
