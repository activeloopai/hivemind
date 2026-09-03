---
name: runbook-writing-stinger
description: Operational runbook authorship specialist covering canonical templates (break-fix, scheduled operation, diagnostic), the no-implied-context audit protocol, exact-command discipline, escalation path architecture, rollback procedure standards, runbook-as-test (game day) methodology, and postmortem-to-runbook linkage. Activate when the user says "write a runbook", "audit this runbook", "our runbooks are out of date", "we need a runbook for this alert", "turn this postmortem into a runbook", "schedule a game day", "our on-call docs are weak", or when `runbook-writing-worker-bee` is invoked. Do NOT activate for incident management tooling setup (PagerDuty/OpsGenie, route to ci-release-worker-bee), infrastructure provisioning decisions (route to ci-release-worker-bee), or documentation culture/process design beyond the runbook format (route to library-worker-bee).
---

# runbook-writing-stinger

Operational runbook craft: the exact-command discipline, the no-implied-context rule, escalation path architecture, rollback procedures, runbook-as-test methodology, and postmortem-to-runbook linkage.

**Read this file first** to orient. Then open the guide that matches your task.

---

## The five core principles

These govern every decision in this stinger. Full justification with failure modes per principle in `guides/00-principles.md`.

1. **No implied context.** Every command is copy-pasteable. Every URL is absolute. Every env var is defined. Every decision point is explicit. A runbook written for "someone who knows the system" is not a runbook.
2. **Exact-command discipline.** No "something like `npm run embeddings:status`." Exact flags, exact dataset paths, exact daemon names. Vague commands create incident-time variance.
3. **Explicit escalation paths.** Every runbook names its escalation contact (person, team, channel) with a response-time expectation. "Escalate if needed" is not an escalation path.
4. **Rollback before you ship.** Every state-changing step has an undo step or an explicit irreversibility acknowledgment. Rollback is never improvised during an incident.
5. **Runbook-as-test mandate.** An untested runbook is a hypothesis. Exercise runbooks quarterly (game day) and on every postmortem action item. Mark untested runbooks prominently.

**Research anchor:** Google SRE Book Chapter 11 defines on-call as requiring co-equal resources: clear escalation paths, well-defined procedures, and blameless postmortem culture. All five principles map directly to this triad. See `research/external/2026-sre-google-being-on-call-chapter.md`.

---

## Quick reference: which guide to read

| Task | Guide |
|---|---|
| Learn the five principles and their failure modes | `guides/00-principles.md` |
| Choose which runbook type to write | `guides/01-runbook-types.md` |
| Audit an existing runbook for no-implied-context violations | `guides/02-no-implied-context-audit.md` |
| Structure escalation paths correctly | `guides/03-escalation-path-architecture.md` |
| Write rollback sections | `guides/04-rollback-procedures.md` |
| Plan and execute a game day / runbook exercise | `guides/05-runbook-as-test.md` |
| Link a postmortem action item to a runbook | `guides/06-postmortem-linkage.md` |
| Validate a runbook before marking it ready | `guides/07-done-checklist.md` |
| See a full worked example | `examples/happy-path-break-fix.md` |
| Audit an existing runbook end-to-end | `examples/audit-existing-runbook.md` |
| Start a new runbook from a blank template | `templates/` |

---

## When this stinger activates

This stinger is pre-loaded by `runbook-writing-worker-bee`. Do not load it independently unless you are the Bee.

Trigger contexts:

- "Write a runbook for the [service/alert]"
- "Our runbook for [X] is outdated"
- "Audit this runbook" + paste of existing doc
- "Turn this postmortem action item into a runbook"
- "We need to run a game day / exercise our runbooks"
- "Our on-call docs are weak / missing / wrong"
- Postmortem with action item: "Write runbook for [failure mode]"
- PR or code change that introduces a new failure mode without a runbook

Do NOT activate for:
- PagerDuty / OpsGenie configuration (ci-release-worker-bee)
- Infrastructure provisioning decisions embedded in runbooks (ci-release-worker-bee owns the what; this stinger owns the how-to-document-it)
- Incident culture or postmortem process design beyond the document format (library-worker-bee)

---

## Runbook types at a glance

Three types, three templates. Details in `guides/01-runbook-types.md`.

| Type | When to use | Template |
|---|---|---|
| **Break-fix** | Alert fires, service degraded, on-call responds | `templates/break-fix-runbook.md` |
| **Scheduled operation** | Planned maintenance, deployment window, DR drill | `templates/scheduled-operation-runbook.md` |
| **Diagnostic** | Root-cause investigation, "it's slow but not paged" | `templates/diagnostic-runbook.md` |

---

## Open questions from research (flags for the user)

The following were surfaced by `scripture-historian` and were not resolved by the Command Brief. Flag to the user before finalizing any guide that touches these areas:

1. **Runbook-as-code scope**: Should this stinger cover automation hooks (Rundeck, AWS SSM, Jupyter notebooks)? Research shows 2026 SRE practice increasingly blurs manual vs. automated runbooks. Current stance: manual runbooks only; automation is an advanced pattern flagged in `guides/01-runbook-types.md` as "out of scope, see ci-release-worker-bee."
2. **Security attribute**: The SRE School quality model adds "no exposed secrets, least privilege commands" as a ninth attribute. Added to `guides/07-done-checklist.md` as a checklist item; flag to user if their environment has PCI/HIPAA compliance requirements.
3. **Alert-links-to-runbook principle**: Added as Principle 6 in `guides/00-principles.md` ("Alert linking"), the alert payload must directly link to the specific runbook, not a runbook index.
4. **Freshness KPIs**: Added postmortem action item completion rate as a KPI in `guides/07-done-checklist.md`. User should decide whether to track in a dashboard.
5. **Storage tooling**: This stinger is tool-agnostic (Notion, Confluence, Slab, Git/Backstage all work). Tool-specific tips are callouts in `guides/00-principles.md`.

> TODO: open question, if the user's org uses runbook automation tools (Rundeck, Shoreline, AWS SSM), a future `runbook-automation-worker-bee` would own the integration layer. Flag this need if it surfaces.

---

## Critical directives (verbatim from Command Brief)

- **Never use implied commands.** See `guides/02-no-implied-context-audit.md`.
- **Never skip the escalation path.** See `guides/03-escalation-path-architecture.md`.
- **Always include rollback for every state-changing step.** See `guides/04-rollback-procedures.md`.
- **Mark untested runbooks prominently.** See `guides/05-runbook-as-test.md`.
- **Apply the five-minute rule.** A runbook requiring more than five minutes to understand enough to execute is too long. Split it or add a prominent TL;DR summary at the top.

---

## Folder layout

```
runbook-writing-stinger/
+- SKILL.md                        (this file, read first)
+- README.md                       (one-page overview)
+- guides/
|  +- 00-principles.md             (six core principles with failure modes)
|  +- 01-runbook-types.md          (break-fix vs scheduled-operation vs diagnostic)
|  +- 02-no-implied-context-audit.md (audit protocol, step-by-step)
|  +- 03-escalation-path-architecture.md (naming, formatting, SLA tiering)
|  +- 04-rollback-procedures.md    (reversible vs irreversible, undo templates)
|  +- 05-runbook-as-test.md        (game day methodology, quarterly cadence)
|  +- 06-postmortem-linkage.md     (closed loop: incident -> postmortem -> runbook)
|  +- 07-done-checklist.md         (validation pass before marking ready)
+- examples/
|  +- happy-path-break-fix.md      (end-to-end worked example: embeddings daemon stall alert)
|  +- audit-existing-runbook.md    (worked audit: before and after with violations called out)
+- templates/
|  +- break-fix-runbook.md         (canonical template with all required sections)
|  +- scheduled-operation-runbook.md (planned maintenance template)
|  +- diagnostic-runbook.md        (root-cause investigation template)
+- reports/
|  +- README.md                    (what the Bee's audit reports look like)
+- research/                       (READ ONLY - authored by scripture-historian)
   +- research-plan.md
   +- research-summary.md
   +- index.md
   +- internal/command-brief-notes.md
   +- external/  (8 source notes)
```

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
