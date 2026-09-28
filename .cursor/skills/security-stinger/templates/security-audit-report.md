# Security Audit Report: {{FEATURE_OR_BRANCH_NAME}}

**Audit date:** {{YYYY-MM-DD}}
**Auditor:** security-worker-bee subagent
**Scope:** {{list of files / directories reviewed}}
**Node version audited:** {{x.y from package.json engines / runtime}}
**`npm audit` result:** {{clean / N High / N Critical from package-lock.json}}
**OpenClaw bundle scan:** {{clean / flagged - from `npm run audit:openclaw`}}
**CVE watchlist last refreshed:** {{date from research/cve-watchlist.md - flag if >120 days old}}

---

## Executive Summary

{{2-3 sentences covering: overall security posture, counts by severity, and the financial/PII risk level. Name the single most important finding first. If running out of order (after quality-worker-bee), state that here.}}

---

## Scorecard

| Category | Status | Findings |
|---|---|---|
| Credential / Token Exposure | {{OK / ATTN / FAIL}} | {{count}} |
| Captured-Trace PII (sessions/memory) | {{OK / ATTN / FAIL}} | {{count}} |
| Authentication & Org RBAC / Scope | {{OK / ATTN / FAIL}} | {{count}} |
| Injection (Deep Lake SQL API) | {{OK / ATTN / FAIL}} | {{count}} |
| Dependency & OpenClaw Bundle | {{OK / ATTN / FAIL}} | {{count}} |
| Configuration (cred modes, capture opt-out, client hardening) | {{OK / ATTN / FAIL}} | {{count}} |
| Pre-Tool-Use Gate & Prompt Injection | {{OK / ATTN / FAIL}} | {{count}} |

Legend: **OK** = zero findings · **ATTN** = Medium/Low findings documented · **FAIL** = Critical/High findings (fixed in this session).

---

## Critical Findings (fixed in this session)

{{For each Critical finding:}}
- [x] **{{CATEGORY / CVE}}** `path/to/file.ts:LINE` - {{vulnerability description in one sentence; fix applied in one sentence}}

{{If none: "None detected."}}

---

## High Findings (fixed in this session)

{{For each High finding:}}
- [x] **{{CATEGORY}}** `path/to/file.ts:LINE` - {{vulnerability description; fix applied}}

{{If none: "None detected."}}

---

## Medium Findings (follow-up required)

{{For each Medium finding - use [ ] unless fixed in-session under the 5-line exception, then [x]:}}
- [ ] **{{CATEGORY}}** `path/to/file.ts:LINE` - {{description; recommended fix}}

{{If none: "None detected."}}

---

## Low Findings (documentation only)

{{For each Low finding:}}
- [ ] **{{CATEGORY}}** `path/to/file.ts:LINE` - {{description}}

{{If none: "None detected."}}

---

## Dependency Audit

```text
{{paste summary of `npm audit --json --audit-level=high` - just the severity counts and top 5 advisories}}
```

Full output: ephemeral local scan scratch (e.g., `.scan-output/npm-audit.json`).

---

## Surface Integrity Check

| Check | Expected | Observed | Status |
|---|---|---|---|
| **SQL guards** (`src/utils/sql.ts`) | `sqlIdent` regex `[A-Za-z_][A-Za-z0-9_]*`; every interpolation wrapped | {{observed}} | {{OK / FAIL - CRITICAL}} |
| **Config table names via `sqlIdent`** | `HIVEMIND_RULES_TABLE` etc. wrapped | {{observed}} | {{OK / FAIL - CRITICAL}} |
| **Pre-tool-use gate** (`src/hooks/pre-tool-use.ts`) | literal paths only; VFS-confined | {{observed}} | {{OK / FAIL}} |
| **Credential file modes** | `0600` file / `0700` dir, explicit | {{observed}} | {{OK / FAIL - HIGH}} |
| **Capture opt-out** (`HIVEMIND_CAPTURE=false`) | zero INSERTs | {{observed}} | {{OK / FAIL - HIGH}} |
| **OpenClaw bundle scan** (`npm run audit:openclaw`) | clean; only the documented `gate-runner` bypass | {{observed}} | {{OK / FAIL}} |
| **No token in logs / traces** | `safeLog` redaction on sensitive paths | {{observed}} | {{OK / FAIL - CRITICAL}} |

---

## Files Changed (remediation)

| File | Change Summary |
|---|---|
| `{{path/to/file.ts}}` | {{one-line description}} |

Run `git diff` to review every change; diff reviewed and confirmed security-scoped on {{YYYY-MM-DD}}.

---

## Recommended Follow-Up (architectural)

{{Larger refactors flagged but not implemented in this sessio