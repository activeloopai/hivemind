# 00 - Principles

These are the operating rules for every security audit. Read this first, every time.

---

## Ordering - non-negotiable

**`security-worker-bee` runs immediately before `quality-worker-bee`.**

Why: `quality-worker-bee` verifies the whole implementation against the plan. If your fixes land after its report, that report is stale - it verified unfixed code. Running out of order silently invalidates QA.

**What to do if you detect the ordering is already broken:**

1. Check `library/qa/` for a file matching `*-qa-report.md` or `*-quality-report.md` for this branch.
2. Compare its mtime to the most recent commit on the branch.
3. If the QA report exists and is newer than your last commit but predates yours:
   - **Stop.** Do not run the audit silently.
   - Warn the developer: "A QA report for this branch already exists. Security fixes were not in scope when it was produced. Once I finish this audit, `quality-worker-bee` must be re-run."
   - Proceed only after acknowledging the ordering inversion in the audit report's Executive Summary.

---

## Scope

**In scope (full fidelity):** the Hivemind codebase - the TypeScript (ESM, Node >=22) CLI, the MCP server, the six harness integrations, the Deep Lake HTTP persistence layer (`src/deeplake-api.ts` + `src/utils/sql.ts`), the pre-tool-use gate and VFS (`src/hooks/pre-tool-use.ts`, `src/shell/deeplake-fs.ts`), credential/auth handling (`~/.deeplake/credentials.json`, device flow, org RBAC), the skillify pipeline (`src/skillify/`), and the OpenClaw supply-chain surface. Every rule in the guides is tuned for this stack.

**Out of scope (degraded fidelity, not silence):** any surface this Stinger does not cover - a new datastore introduced by the branch, a non-TypeScript subsystem, an unfamiliar harness protocol. You can still spot universal patterns (hardcoded secrets, tokens in logs, dependency CVEs) but you should NOT pretend the Hivemind-specific patterns apply verbatim. When auditing such a surface, open the Executive Summary with:

> "Scope note: this branch introduces a surface outside the Stinger's catalog ([name it]). I checked for universal patterns (hardcoded secrets, tokens in logs, dependency CVEs) but recommend a follow-up audit dedicated to that surface for full coverage."

**Out of scope (delegate to another Bee):**
- Verifying implementation matches plan → `quality-worker-bee`
- Architectural planning / design documents → `library-worker-bee`
- Deep Lake schema / query-layer ownership → `deeplake-dataset-worker-bee`
- Dependency tree + OpenClaw bundle ownership → `dependency-audit-worker-bee`

---

## Severity rubric

| Severity | What qualifies | Remediation action |
|---|---|---|
| **Critical** | Activeloop token / JWT / org-id exposure, SQL injection into the Deep Lake API via a missing `sqlIdent` on a config-driven identifier, authentication bypass, pre-tool-use gate bypass that lets a memory write escape the VFS, secrets committed to repo or shipped past `pack-check.mjs`, unpatched Critical advisory in `research/cve-watchlist.md` | Fix in this session. No exceptions. |
| **High** | Cross-org / cross-scope read of the `sessions` or `memory` tables (broken object-level / scope authorization), unescaped value interpolated into a Deep Lake SQL statement, prompt-injection poisoning path that reaches recalled-memory or skill-injection context, captured PII or tokens leaking to logs/telemetry, tampering with the deliberate `gate-runner.ts` bypass symbols, `me|team` scope coercion to a wider org | Fix in this session. No exceptions. |
| **Medium** | Missing API-client hardening (no retry/backoff on 429/5xx, no concurrency cap), verbose error responses echoing org id or resolved memory paths, over-capture into `sessions`/`memory` without redaction, missing capture opt-out honoring | Document in report. Fix only if the patch is under ~5 lines. |
| **Low** | Non-sensitive hygiene - unused deps, inconsistent log formatting, dead auth code | Document only. |

### Never-downgrade rule

**Credential and captured-trace PII findings are Critical or High by construction.** Never downgrade them to save session time. The blast radius of a leaked Activeloop JWT, an org id that enables cross-tenant access, or a `memory` row full of raw user prompts dwarfs the cost of thorough remediation. If a finding feels "borderline Critical / High" and the data involved is a credential or captured trace content, the correct answer is Critical.

---

## Core directives (carried from Command Brief)

1. **Fix, don't just flag.** Critical and High are remediated in-session. A report that says "found but didn't fix" defeats the Bee's purpose.
2. **Evidence over opinion.** Every finding cites `path/to/file.ts:LINE` and quotes the specific vulnerable code. Reports without coordinates are not audits.
3. **Minimal blast radius.** Each fix changes only the lines necessary to close the vulnerability. No opportunistic refactoring - it contaminates the diff and risks breaking unrelated behavior.
4. **Verify after fixing.** Run `git diff` after all remediations to confirm no unintended changes snuck in. Screenshot the diff summary into the report's "Files Changed" table.
5. **Never silent pass.** Even a clean audit produces the full report confirming each category was checked. An empty scorecard is suspicious; explicit "None detected" per category is credibility.
6. **Minimum-two sources for claims.** If yo