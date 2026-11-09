---
source_type: internal
authority: high
relevance: critical
topic: command-brief-decisions
stinger: runbook-writing-stinger
retrieved_on: 2026-05-20
---

# Command Brief Decisions: runbook-writing-worker-bee

## Summary

The Command Brief defines `runbook-writing-worker-bee` as an opinionated operations writer that enforces three non-negotiable rules: (1) no-implied-context, (2) exact-command discipline, and (3) runbook-as-test mandate. The stinger (`runbook-writing-stinger`) must encode templates and guides that operationalize all three rules plus escalation-path architecture, rollback procedures, and postmortem linkage.

## Key decisions from the brief

### Runbook types (three canonical variants)

The Bee classifies every incoming request into one of three runbook types before applying any template:

1. **Break-fix (alert-triggered)** - fires when a monitoring alert pages the on-call engineer. Entry point is an alert name. Structure: symptoms -> severity triage -> investigation steps -> resolution -> rollback -> escalation.
2. **Scheduled operation (maintenance window)** - planned, time-boxed changes. Structure: pre-requisites -> step-by-step procedure -> rollback -> sign-off.
3. **Diagnostic (root-cause investigation)** - no known fix yet; engineer is exploring. Structure: hypothesis -> evidence-collection commands -> decision tree -> escalation triggers.

### Five critical directives (verbatim from brief)

Each directive has an explicit failure mode if violated:

1. **Never use implied commands.** Every shell command, kubectl invocation, SQL query, or API call must be exactly copy-pasteable. Failure mode: on-call engineer at 3am will not infer correctly; implied commands create variance in incident response.
2. **Never skip the escalation path.** Every runbook must contain a named escalation contact (person, team, or channel) with a response-time expectation. Failure mode: engineers under pressure skip escalation until the incident is already major.
3. **Always include rollback for every state-changing step.** If a step modifies state, the runbook must include an explicit undo step or a documented irreversibility acknowledgment. Failure mode: rollback is always considered in hindsight; it must be pre-authored in foresight.
4. **Mark untested runbooks prominently.** Add `## TEST STATUS: UNTESTED - exercise before relying on this document in production` at the top. Failure mode: an untested runbook is a hypothesis; treating it as verified procedure during an incident is a compounding failure mode.
5. **Apply the five-minute rule.** A runbook that takes more than five minutes to understand well enough to execute is too long. Failure mode: cognitive load during incidents is high; a runbook that requires orientation time will be abandoned in favor of Slack DMs to the author.

### Proposed guide structure (from IDEAS section)

| Guide file | Content |
|---|---|
| `guides/00-principles.md` | Five core principles with failure modes |
| `guides/01-runbook-types.md` | Break-fix vs scheduled-operation vs diagnostic; decision tree |
| `guides/02-no-implied-context-audit.md` | Step-by-step audit protocol; checklist of copy-paste requirements |
| `guides/03-escalation-path-architecture.md` | PagerDuty schedule lookup, Slack channel naming, SLA tiering |
| `guides/04-rollback-procedures.md` | Reversible vs irreversible changes; irreversibility acknowledgment format |
| `guides/05-runbook-as-test.md` | Exercise protocol; last-tested date; environment; outcome; gaps found |
| `guides/06-postmortem-linkage.md` | Cross-link format; when to auto-create runbook from postmortem action item |

### Proposed templates (from IDEAS section)

| Template file | Type |
|---|---|
| `templates/break-fix-runbook.md` | Alert-triggered incident |
| `templates/scheduled-operation-runbook.md` | Planned maintenance window |
| `templates/diagnostic-runbook.md` | Root-cause investigation |

### Open questions from the brief

1. **Runbook automation scope**: Should the stinger cover runbook-as-code tools (Rundeck, AWS SSM)? The backlog purpose implies manual runbooks but 2026 tooling has blurred the line. Research suggests this is a real 2026 tension - see `SRE School (2026-02-15)` source for the automation maturity model.
2. **Overlap boundary with ci-release-worker-bee**: `runbook-writing-worker-bee` owns the document; `ci-release-worker-bee` owns the infrastructure knowledge that populates the commands. This boundary needs a concrete handoff example in the guides.

### Overlap boundaries (from NOTES section)

- `ci-release-worker-bee`: owns infrastructure decisions; `runbook-writing-worker-bee` surfaces a placeholder while the user decides
- `library-worker-bee`: owns broader documentation culture; `runbook-writing-worker-bee` owns runbook document format and testability
- If a runbook surfaces a missing deployment procedure, the Bee surfaces it to `ci-release-worker-bee` and embeds a placeholder

## Annotations for stinger-forge

- The "done checklist" referenced in ACTION step 8 (`guides/00-done-checklist.md`) is mentioned but not fully specified - stinger-forge should derive it from the five critical directives plus research findings.
- The three runbook types map directly to the three templates; stinger-forge should align guide numbering and template naming.
- The five-minute rule is a hard constraint on template length - stinger-forge should enforce it structurally by keeping templates under ~1 page (600 words).
- The REFERENCE MATERIAL list includes PagerDuty response docs and Google SRE Book as primary anchors - stinger-forge should cite thes