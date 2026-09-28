# Security Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `security-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/security-worker-bee.md`](../../../agents/security-worker-bee.md)
**Stinger:** [`.cursor/skills/security-stinger/`](../../security-stinger/)
**Trigger policy:** proactive (second-to-last step of every implementation plan, before `quality-worker-bee`)

---

## Domain

`security-worker-bee` is the security audit and remediation specialist for the Hivemind surface (TypeScript / Node >=22 / ESM CLI + MCP server + Deep Lake persistence + six harness integrations). It wields three pre-researched 2025-2026 catalogs (AI-generated code failure patterns, OWASP Top 10:2025 mapped to Hivemind's real attack surface, and captured-trace PII/credential exposure) plus canonical remediation playbooks. Its remit: SQL injection into the Deep Lake API (`sqlIdent`/`sqlStr`/`sqlLike`), the string-based pre-tool-use VFS gate and its dynamic-path weakness, credentials/JWT/org-RBAC, PII in captured traces, prompt injection via recalled memory, and the npm/OpenClaw supply chain. It runs immediately before `quality-worker-bee` and remediates Critical and High findings in place.

## Trigger phrases

Route to `security-worker-bee` when the user says any of:

- "Audit for security" / "security audit this branch"
- "Check for vulnerabilities" / "scan for vulnerabilities"
- "Check the Deep Lake query layer for injection"
- "Audit the pre-tool-use gate"
- "Scan for PII in traces"
- "OWASP review" / "fix this Critical finding"

Or as the proactive second-to-last step of every implementation plan, just before `quality-worker-bee`.

## Do NOT route when

- The user wants implementation-matches-plan verification - that is `quality-worker-bee`, which runs after this Bee.
- The user wants new architecture drafted - that is `library-worker-bee`.
- `quality-worker-bee` has already produced a report for this branch - alert the developer and recommend re-running QA after these fixes land (do not run security after QA silently).

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The branch or files to audit.
- The implementation context (what changed and which surface it touches).
- Confirmation that `quality-worker-bee` has not already run for this branch.

If the scope is missing, do not invoke yet - ask the user which branch to audit.

## Outputs the Bee produces

- A security findings report, each finding citing `path/to/file.ts:LINE` and the vulnerable pattern, classified by severity.
- In-session remediation of Critical and High findings with a minimal-blast-radius diff, verified via `git diff`.
- A full report even on a clean pass (no silent passes).

## Multi-Bee sequences this Bee participates in

- **Plan execution loop** - after the implementation Bee produces the change, `security-worker-bee` audits the Hivemind surface and remediates Critical/High findings in place; `quality-worker-bee` then verifies the final implementation against the plan.

## Critical directives the orchestrator should respect

- **Step ordering is non-negotiable - run before `quality-worker-bee`, never after.**
- **Credential and captured-trace PII findings are always Critical or High** (cross-tenant blast radius).
- **Evidence over opinion** - every finding cites `file.ts:LINE`.
- **Fix, don't just flag** - Critical and High issues are remediated in-session.
- **Minimal blast radius per fix**, verified with `git diff`; **never silent pass.**
- **Ordering check on entry** - if QA already ran for this branch, alert and recommend re-running it after fixes land.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
