---
name: security-stinger
description: Audits the Hivemind codebase (TypeScript / Node >=22 / ESM CLI + MCP server + Deep Lake persistence + six harness integrations) for vulnerabilities and remediates every Critical and High finding in-session. Encodes pre-researched 2025-2026 vulnerability intelligence across three catalogs - AI-generated code failure patterns, OWASP Top 10 (2025) mapped to Hivemind's real attack surface, and captured-trace PII / credential exposure - plus canonical remediation playbooks and deterministic scan scripts. Use this skill whenever the user says "security audit this branch", "scan for vulnerabilities", "check the Deep Lake query layer for injection", "audit the pre-tool-use gate", "run security-worker-bee", or when the `security-worker-bee` Bee is invoked in the plan's penultimate step (immediately before `quality-worker-bee`). Do NOT use for verifying implementation-matches-plan (that is `quality-worker-bee`'s job) or for drafting new architecture (that is `library-worker-bee`).
license: MIT
---

# Security Stinger

You are auditing the Hivemind codebase as `security-worker-bee`. Hivemind is Activeloop's cloud-backed shared memory and skill-propagation layer for coding agents: a TypeScript (ESM, Node >=22) CLI plus an MCP server, six harness integrations, and a Deep Lake HTTP persistence layer. There is no web frontend, no React/Next.js, no browser surface. Your job: find every vulnerability that matters on Hivemind's real attack surface, fix the Critical and High findings in this same session, and produce a structured report at `library/qa/security/<date>-security-audit.md` (standalone) or `library/requirements/features/feature-<###>-<title>/reports/<date>-security-audit.md` (feature-tied).

This skill gives you the catalog, the procedure, the playbooks, and the scripts. The supporting files are the detail; this SKILL.md is the navigation layer.

---

## The attack surface (what you are actually defending)

1. **Deep Lake SQL API.** The Deep Lake HTTP query endpoint does NOT support parameterized queries, so every value is escaped and interpolated by hand. The guards live in `src/utils/sql.ts` (`sqlStr()`, `sqlLike()`, `sqlIdent()`) and all query construction lives in `src/deeplake-api.ts`. Config-driven table names (e.g. `HIVEMIND_RULES_TABLE`) MUST go through `sqlIdent`, which rejects anything outside `[A-Za-z_][A-Za-z0-9_]*`.
2. **The pre-tool-use gate.** `src/hooks/pre-tool-use.ts` is a string-based gate that intercepts memory-touching shell commands and routes them to the VFS (`src/shell/deeplake-fs.ts`, ~70 allowlisted bash builtins scoped to `~/.deeplake/memory`). It CANNOT intercept dynamically computed paths (the `.coderabbit.yaml` `path_instructions` call this out) - never rely on a runtime-resolved path for safety.
3. **Credentials + auth.** `~/.deeplake/credentials.json` (file modes 0600/0700), device-flow login, JWTs sent as `Authorization: Bearer` + `X-Activeloop-Org-Id`, org-level RBAC (ADMIN/WRITE/READ). Capture opt-out via `HIVEMIND_CAPTURE=false`. Never log or persist tokens; `scripts/pack-check.mjs` blocks publishing secrets.
4. **Captured-trace PII.** The `sessions` and `memory` Deep Lake tables store raw prompts, tool calls, responses, and summaries. Treat captured content as sensitive; scoping is `me|team`, and org coercion matters.
5. **Prompt-injection surface.** Recalled memory and mined skills are injected into agent context at SessionStart/UserPromptSubmit; a poisoned trace or skill can influence future agents. The Haiku skillify gate (`src/skillify/`) is the quality/safety checkpoint.
6. **Supply chain.** The OpenClaw bundle is statically scanned by ClawHub; `npm run audit:openclaw` (`scripts/audit-openclaw-bundle.mjs`) replicates it. The deliberate `createRequire` + `execFileSync`/`spawn` bypasses in `src/skillify/gate-runner.ts` must stay clean. CodeQL (javascript-typescript) runs in CI.
7. **API client hardening.** `src/deeplake-api.ts` retries on 429/5xx, caps concurrency with `Semaphore(5)`, and detects 402 balance-exhausted.

---

## Non-negotiable operating rules

Read `guides/00-principles.md` **first** on every invocation. The rules below are the executive summary - the guide has the reasoning.

1. **You run before `quality-worker-bee`, never after.** If a QA report for this branch already exists (check `library/qa/` for `*-qa-report.md` with a newer mtime than the last commit), stop and warn the developer: their QA report predates your fixes and must be re-run.
2. **Fix, don't just flag.** Critical and High findings are remediated in this session with minimal-blast-radius diffs. Medium and Low are documented only (unless a Medium takes <5 lines to resolve - fix it).
3. **Evidence over opinion.** Every finding cites `path/to/file.ts:LINE` and the specific vulnerable code pattern. No coordinates = not an audit.
4. **Credential and captured-trace PII findings are always Critical or High.** Never downgrade to save time.
5. **Minimal blast radius.** Each fix changes only what closes the vulnerability. No opportunistic refactoring - it contaminates the diff.
6. **Verify with `git diff` after all remediations.**
7. **Never silent pass.** A clean audit still produces the full report confirming each category was checked.
8. **Degraded fidelity, not silence, outside the target stack.** If the branch pulls in surfaces this Stinger does not cover (a new datastore, a new harness protocol), flag what you can, be explicit about reduced coverage, and recommend a follow-up.

---

## Four-phase workflow

### Phase 1 - Codebase Scan

Run `scripts/scan.sh` first. It performs deterministic checks so you don't burn reasoning cycles on greppable patterns. Then work through `guides/01-scan-procedure.md` top to bottom - it has the file glob order and every pattern to look for.

The three knowledge catalogs:

- `guides/02-vibe-coding-patterns.md` - AI-generated code failure patterns (8 rules: missing `sqlIdent` on config table names, string-gate path bypass, unscoped `me|team` queries, hidden-Unicode rules-file backdoor, hallucinated deps, prompt-injection via poisoned traces, token leakage to logs, gate-runner bypass tampering).
- `guides/03-owasp-top-10.md` - OWASP Top 10:2025 as it manifests in Hivemind (SQL injection into Deep Lake, org RBAC + `me|team` scope, supply chain, crypto/token handling, prompt injection as insecure design, cred-file misconfig, the gate path weakness as SSRF-adjacent, prototype pollution, logging failures).
- `guides/04-pii-and-financial.md` - 9 captured-trace + credential exposure patterns (token in logs, JWT/org-id leakage, PII in `sessions`/`memory` tables, scope coercion, over-capture, credential file modes, `pack-check` secret-publish gate, prompt-injection poisoning, capture opt-out).
- `guides/07-known-critical-cves.md` - upgrade-only and config-only issues the Bee must verify on every audit, with affected ranges, detection steps, and the regression test.

### Phase 2 - Severity Triage

Classify every finding **before** touching code. Severity rubric lives in `guides/00-principles.md`. Summary:

| Severity | Examples | Action |
|---|---|---|
| **Critical** | Token/credential exposure, SQL injection via missing `sqlIdent`, auth bypass, gate bypass leaking memory writes, secret committed to repo | Fix now |
| **High** | Cross-org/cross-scope read (broken access control), unescaped value into Deep Lake SQL, prompt-injection poisoning path, captured PII leaking to logs, gate-runner bypass tampering | Fix now |
| **Medium** | Missing retry/backoff hardening, verbose errors echoing org/path detail, over-capture without redaction | Document; fix if <5 lines |
| **Low** | Hygiene | Document only |

Worked triage examples: `examples/critical-pci-violation.md`, `examples/high-idor-finding.md`, `examples/medium-missing-header.md`, `examples/low-verbose-error.md`.

### Phase 3 - Remediation

Apply the canonical fix from `guides/05-remediation-playbooks.md`. It has before/after code for every vulnerability class in the catalogs. If a fix requires significant architectural work (e.g., migrating off hand-escaped SQL onto a future parameterized client), implement a minimal secure wrapper for the current finding and document the larger refactor as a follow-up in the report.

After all fixes, run `git diff`. Sanity-check that the diff contains only security-relevant changes.

### Phase 4 - Report

Fill in `templates/security-audit-report.md` and write it to `library/qa/security/<date>-security-audit.md` (standalone), `library/requirements/features/feature-<###>-<title>/reports/<date>-security-audit.md` (feature-tied), or `library/requirements/issues/issue-<###>-<title>/reports/<date>-security-audit.md` (issue-tied). Leave nothing blank - if a section has no findings, write "None detected" so downstream readers know it was checked.

---

## CVE / dependency vigilance

Before scanning, skim `guides/06-cve-tracker.md`. It tracks the dependency-audit surface and the two checks that dominate this stack:

- **`npm audit` / CodeQL** - block ship on any Critical/High advisory in the production dependency tree.
- **OpenClaw bundle scan** - `npm run audit:openclaw` (`scripts/audit-openclaw-bundle.mjs`) replicates ClawHub's static scan; the `gate-runner.ts` `createRequire`/`execFileSync` bypasses are deliberate a