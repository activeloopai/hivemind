# Worked Example - High: Cross-Scope Read of the `memory` Table

Demonstrates: `guides/02-vibe-coding-patterns.md` A1 · `guides/03-owasp-top-10.md` B4 · `guides/01-scan-procedure.md` Step 6 · `guides/05-remediation-playbooks.md` §Scoped query.

---

## Scenario

Branch `feat/memory-recall` adds a recall path that returns memory rows by path prefix. AI-generated - the developer requested "a query that returns memory entries matching a prefix."

## Vulnerable code discovered

`src/deeplake-api.ts` (recall path):

```ts
async recall(prefix: string) {
  const tbl = sqlIdent(this.memoryTable);
  return this.query(
    `SELECT path, summary FROM "${tbl}"
     WHERE path LIKE '${sqlLike(prefix)}%'`
  );
}
```

## Why it fails

The values are escaped correctly (`sqlIdent`, `sqlLike` - good). But the query has **no `me|team` scope filter and no org constraint**. Any authenticated caller can recall any user's memory rows by guessing prefixes - the org pin and scope live only in convention, not in the statement. This is the Hivemind shape of IDOR / BOLA: object-level (here, scope-level) authorization is missing.

Secondary finding: the recall returns whatever `summary` text exists, which may include residual sensitive content from another scope.

## Finding text (report-ready)

> - [x] **Broken Access Control / Cross-Scope Read** `src/deeplake-api.ts:recall` - Recall query escapes its inputs but does not filter by the caller's `me|team` scope and does not pin the org. Any authenticated caller can read any scope's `memory` rows by iterating path prefixes. Escalates to Critical if the matched rows contain another org's captured PII.

## Severity rationale

**High.** Captured `memory` content is user-authored and may carry sensitive prompt/response text. If a matched row can belong to another org, escalate to **Critical** per the never-downgrade rule. Without knowing the corpus, default to High and flag the cross-org question in the report.

## Remediation diff (applied in-session)

```diff
--- a/src/deeplake-api.ts
+++ b/src/deeplake-api.ts
@@ async recall(prefix: string) {
   const tbl = sqlIdent(this.memoryTable);
-  return this.query(
-    `SELECT path, summary FROM "${tbl}"
-     WHERE path LIKE '${sqlLike(prefix)}%'`
-  );
+  const scopes = this.authContext.scopes;            // caller's me|team, from credentials
+  const scopeList = scopes.map(s => `'${sqlStr(s)}'`).join(',');
+  return this.query(
+    `SELECT path, summary, scope FROM "${tbl}"
+     WHERE path LIKE '${sqlLike(prefix)}%'
+       AND scope IN (${scopeList})`
+    // org is pinned by X-Activeloop-Org-Id from the credential context,
+    // NOT a value the caller can name or widen.
+  );
 }
```

Two targeted changes:

1. Add `AND scope IN (...)` bound to the caller's own `me|team` scopes - the query itself enforces authorization, so a later refactor can't drop a separate check.
2. The org id stays pinned by the `X-Activeloop-Org-Id` header sourced from the credential context (never from input), confining the read to the caller's tenant.

Returning fewer rows (rather than erroring) means an unauthorized prefix simply matches nothing - no "exists but not yours" enumeration oracle.

## Post-fix verification

```bash
npm test -- recall
git diff src/deeplake-api.ts
```

Sanity: the diff touches only this method and only the scope/org lines.

## What goes in the audit report

Under **High Findings (fixed in this session):**

- [x] **Broken Access Control / Cross-Scope Read** `src/deeplake-api.ts:recall` - Recall ignored the caller's `me|team` scope; any caller could read any scope's memory rows. Fix: `AND scope IN (<caller scopes>)` with org pinned by the credential context. Flagged for cross-org review.

Under **Recommended Follow-Up (architectural):**

- Audit every `sessions` / `memory` query in `src/deeplake-api.ts` for the same missing-scope pattern. A helper that injects the scope/org clause for all captured-trace reads would be a structural fix.
