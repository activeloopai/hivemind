# Runbook Types: Break-Fix, Scheduled Operation, Diagnostic

> **Research source:** `research/external/2026-03-08-incop-oncall-runbook-best-practices.md`, `research/external/2026-04-22-thegoodshell-incident-runbook-template.md`

Three types. Three templates. Pick the wrong type and your runbook will be missing critical sections. This guide explains when to use each type and what distinguishes them structurally.

---

## Decision tree: which type?

```
Is this triggered by an alert (automated or manual) for a degraded system?
  YES -> Break-fix runbook (templates/break-fix-runbook.md)

Is this a planned, time-boxed operation with a defined start and end?
  YES -> Scheduled operation runbook (templates/scheduled-operation-runbook.md)

Is this an investigation to find a root cause when the system is slow but not alarming?
  YES -> Diagnostic runbook (templates/diagnostic-runbook.md)
```

If you are unsure, use break-fix. It is the most complete template and covers the widest range of scenarios.

---

## Type 1: Break-Fix

**When:** An alert fired. A service is degraded or down. An on-call engineer is paged and needs to restore service.

**Distinctive sections:**
- **Triage checklist** at the top, quick yes/no questions to confirm the alert is real before taking action.
- **Decision tree**, branching steps based on observed symptoms.
- **Explicit escalation path**, when to escalate and to whom.
- **Rollback**, every state-changing step has an undo.
- **TEST STATUS** header.

**One scenario per runbook rule:** A break-fix runbook covers exactly one alert or failure mode. If "Payment service degraded" can mean three different root causes, write three runbooks and a parent router runbook that routes to each.

**Source:** Incident Copilot (2026-03-08): "One scenario per runbook is the most important structural rule for break-fix runbooks." See `research/external/2026-03-08-incop-oncall-runbook-best-practices.md`.

**Template:** `templates/break-fix-runbook.md`
**Example:** `examples/happy-path-break-fix.md`

---

## Type 2: Scheduled Operation

**When:** A planned maintenance window, deployment procedure, DR drill, database migration, or other time-bounded operation that requires coordination and has a defined success criterion.

**Distinctive sections:**
- **Prerequisites checklist**, everything that must be true before starting. Missing a prerequisite is a go/no-go blocker.
- **Go/no-go decision point**, explicit checkpoint before irreversible steps begin.
- **Communication plan**, who to notify at which step (start, mid-point, completion, rollback).
- **Rollback window**, time within which rollback is possible. After this window, document consequences.
- **Verification steps**, how to confirm the operation succeeded.

**Template:** `templates/scheduled-operation-runbook.md`

---

## Type 3: Diagnostic

**When:** The system is behaving oddly (slow, elevated error rate, unusual resource usage) but no alert has fired or the alert does not have a known root cause. The goal is root-cause identification, not immediate service restoration.

**Distinctive sections:**
- **Observation collection**, commands to gather data without changing state. This section comes before any action steps.
- **Hypothesis tree**, structured hypotheses ordered by probability based on observed data.
- **Evidence protocol**, what to capture and where to save it for postmortem.
- **Escalation at diagnosis**, when to escalate because diagnosis requires deeper expertise.
- No rollback section (diagnostic runbooks are read-only by design; if diagnosis produces a remediation action, a break-fix runbook is authored or referenced for that action).

**Template:** `templates/diagnostic-runbook.md`

---

## Out of scope: Runbook-as-code

Several 2026 tools (Rundeck, AWS SSM Documents, Shoreline, Jupyter notebooks with live queries) blur the line between manual runbooks and automated remediation. This stinger covers **manual runbooks only**. Automated runbooks are an extension of infrastructure-as-code owned by `ci-release-worker-bee`. If the user's organization uses runbook automation, flag the boundary: `runbook-writing-worker-bee` authors the human-readable procedure; `ci-release-worker-bee` implements the automation that optionally executes it.

> TODO: open question, a future `runbook-automation-worker-bee` could bridge this gap if demand surfaces.

---

## Runbook vs. playbook disambiguation

Per The Good Shell (2026-04-22):
- **Runbook:** A specific, step-by-step procedure for a defined scenario. Written for execution.
- **Playbook:** A higher-level strategic guide that references multiple runbooks. Written for situational awareness.

This stinger authors **runbooks**. If the user asks for a "playbook," confirm whether they mean a specific procedure (runbook) or a strategic overview (playbook). The strategic overview is out of scope; route to `library-worker-bee`.

**Source:** `research/external/2026-04-22-thegoodshell-incident-runbook-template.md`.
