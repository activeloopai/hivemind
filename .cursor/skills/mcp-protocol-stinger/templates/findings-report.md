# MCP Server / Tool Audit Findings Report

**Target:** {server file / tool name / harness config - e.g. src/mcp/server.ts}
**Auditor:** mcp-protocol-worker-bee
**Date:** {YYYY-MM-DD}
**Branch / Commit:** {branch or commit hash}
**Consumers in scope:** {Hermes / OpenClaw / pi / Claude Code / Codex / Cursor}

---

## Summary

| Severity | Count |
|---|---|
| Critical | {N} |
| High | {N} |
| Medium | {N} |
| Informational | {N} |
| **Total** | **{N}** |

{One paragraph on overall MCP health. Is the transport right? Are the tool schemas v3-correct? Is the error model honest? Is the contract stable across the harnesses?}

---

## Critical findings

{Contract-breaking changes, error-channel violations that poison agent context, or schema defects that break param validation}

### C1 - {Short title}

- **Location:** {file / tool / line}
- **Finding:** {What is wrong, specifically}
- **Spec / SDK reference:** {MCP spec section / SDK symbol / JSON-RPC code}
- **Impact:** {What breaks for the agent or which harness regresses}
- **Remediation:** {Concrete fix, code example if helpful}

---

## High findings

{Schema/description defects, missing error classification, transport hygiene problems}

### H1 - {Short title}

- **Location:** {file / tool / line}
- **Finding:** {What is wrong}
- **Spec / SDK reference:** {reference}
- **Impact:** {What breaks}
- **Remediation:** {Fix}

---

## Medium findings

{Technically incorrect but limited immediate impact}

### M1 - {Short title}

- **Location:** {file / tool / line}
- **Finding:** {What is wrong}
- **Spec / SDK reference:** {reference}
- **Impact:** {What is suboptimal}
- **Remediation:** {Fix}

---

## Informational

{Best-practice suggestions and observations that are not defects}

- {Observation 1}
- {Observation 2}

---

## Contract-stability call-out

{Any change here that is BREAKING across harnesses - renamed tool, removed/required param, reshaped output. List every consumer that must be updated in lockstep.}

---

## Handoffs

- **Auth / credential findings:** {Token lifecycle, credential storage -> security-worker-bee}
- **Security findings:** {SQL injection in handlers, OWASP-level issues -> security-worker-bee}
- **Deeplake findings:** {Query semantics, schema, vector search -> deeplake-dataset-worker-bee}

---

*Report template: \`.cursor/skills/mcp-protocol-stinger/templates/findings-report.md\`*
