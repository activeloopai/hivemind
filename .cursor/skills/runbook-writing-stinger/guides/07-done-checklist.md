# Done Checklist: Runbook Validation Protocol

> **Principle:** All six principles in `guides/00-principles.md`
> **When to use:** Before marking any runbook `READY FOR PRODUCTION`. Run after authoring, after auditing, and after a game day exercise that found gaps.

A runbook that passes every item on this checklist is ready for production on-call use. A runbook with any Critical or High item open is a draft and must not be relied on as a primary response procedure.

---

## Section 1: Structure and type

- [ ] **S1** Runbook type is declared (break-fix / scheduled operation / diagnostic) in the header or metadata.
- [ ] **S2** Runbook covers exactly one scenario (break-fix) or one operation (scheduled). If it covers multiple, split into separate runbooks.
- [ ] **S3** Required sections for the runbook type are present:
  - Break-fix: Summary, Severity, Prerequisites, Triage checklist, Steps, Rollback, Escalation path, Post-incident, Postmortem history, TEST STATUS.
  - Scheduled operation: Summary, Prerequisites, Go/no-go decision, Steps, Communication plan, Rollback window, Verification, Post-operation.
  - Diagnostic: Summary, Observation collection, Hypothesis tree, Evidence protocol, Escalation at diagnosis.

---

## Section 2: No-implied-context (from `guides/02-no-implied-context-audit.md`)

- [ ] **C1** All shell commands are copy-pasteable (no `<placeholder>` or approximations). **CRITICAL.**
- [ ] **C2** All URLs are absolute (include protocol and domain). **CRITICAL.**
- [ ] **C3** All environment variables used in commands are defined in the Prerequisites section. **CRITICAL.**
- [ ] **C4** All decision points are explicit (name what to look for; name where to route). **CRITICAL.**
- [ ] **C5** All referenced documents are linked inline. **HIGH.**
- [ ] **C6** Every command shows expected output and what to do if the output is unexpected. **HIGH.**
- [ ] **C7** Time estimates included for time-sensitive steps. **MEDIUM.**
- [ ] **C8** Access requirements stated (VPN, dataset read token, embeddings API key). **HIGH.**
- [ ] **C9** No hardcoded secrets, API keys, or passwords. All credentials reference a secret store. **CRITICAL.**

---

## Section 3: Escalation path (from `guides/03-escalation-path-architecture.md`)

- [ ] **E1** Escalation path section is present. **HIGH.**
- [ ] **E2** At least two tiers defined (you + someone else). **HIGH.**
- [ ] **E3** Every tier names a team or schedule (not a personal name). **HIGH.**
- [ ] **E4** Every tier has an expected response time. **HIGH.**
- [ ] **E5** Escalation triggers are explicit (time elapsed, symptom, SEV). Not "if needed." **HIGH.**
- [ ] **E6** Backup contact method included for at least one tier. **MEDIUM.**
- [ ] **E7** External dependency escalation links populated. **MEDIUM.**

---

## Section 4: Rollback (from `guides/04-rollback-procedures.md`)

- [ ] **R1** Rollback section is present if any step modifies state. **HIGH.**
- [ ] **R2** Every state-changing step has a corresponding rollback step or an explicit irreversibility acknowledgment. **HIGH.**
- [ ] **R3** Rollback steps are in reverse chronological order. **MEDIUM.**
- [ ] **R4** Irreversible steps are marked with ⚠️ IRREVERSIBLE and include risk and mitigation. **HIGH.**
- [ ] **R5** Read steps capture original state before every state-changing step. **HIGH.**

---

## Section 5: TEST STATUS (from `guides/05-runbook-as-test.md`)

- [ ] **T1** TEST STATUS header is present near the top of the runbook. **HIGH.**
- [ ] **T2** If UNTESTED: header says UNTESTED and links to the game day schedule. **HIGH.**
- [ ] **T3** If tested: header includes date, format, score, gaps found (or "none"), and next exercise date. **MEDIUM.**
- [ ] **T4** Any runbook scoring ≤ 2 in a game day is in DRAFT status. **HIGH.**

---

## Section 6: Postmortem linkage (from `guides/06-postmortem-linkage.md`)

- [ ] **P1** Postmortem history section present for production runbooks with known incidents. **MEDIUM.**
- [ ] **P2** Alert definition includes `runbook_url` pointing directly to this runbook. **HIGH** (Principle 6).
- [ ] **P3** If created from a postmortem action item: action item ticket linked in the Postmortem history section. **MEDIUM.**

---

## Section 7: Security (from `guides/02-no-implied-context-audit.md` Check 9)

- [ ] **X1** No credentials in the runbook body. **CRITICAL.**
- [ ] **X2** All commands use least-privilege (read-only where possible; destructive commands require explicit confirmation step). **HIGH.**
- [ ] **X3** Access requirements in Prerequisites do not require more than the role needs. **MEDIUM.**

---

## Severity summary

| Severity | Items | Action if open |
|---|---|---|
| **CRITICAL** | C1, C2, C3, C4, C9, X1 | Fix before READY status. No exceptions. |
| **HIGH** | C5, C6, C8, E1-E5, R1, R2, R4, R5, T1, T2, T4, P2, X2 | Fix before READY status. |
| **MEDIUM** | C7, E6, E7, R3, T3, P1, P3, X3 | Fix in same PR; note in audit log. May ship as READY with documented exceptions. |

---

## Status labels

Use one of these status labels in the runbook header:

| Status | Meaning |
|---|---|
| `DRAFT` | Authored but not yet audited. Cannot be used as primary response procedure. |
| `AUDITED` | Passed this checklist. Awaiting game day exercise. May be used with caution. |
| `TESTED` | Passed this checklist AND scored ≥ 4 in a game day exercise. **READY FOR PRODUCTION.** |
| `DEPRECATED` | Scenario no longer exists or superseded by another runbook. Archive; do not delete (historical reference). |
