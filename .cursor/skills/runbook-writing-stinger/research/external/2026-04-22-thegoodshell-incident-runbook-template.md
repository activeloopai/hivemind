---
source_url: https://thegoodshell.com/incident-runbook-template/
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: runbook-structure
stinger: runbook-writing-stinger
---

# Incident Runbook Template: The Essential Guide for SRE Teams in 2026 - The Good Shell

Published: 2026-04-22

## Summary

- **Three storage requirements** for runbooks: (1) alert must link directly to the specific runbook - not the wiki homepage; (2) runbooks must be version controlled; (3) runbooks must be accessible without depending on the alerting tool itself (if PagerDuty goes down, you need the runbook via Git or static docs site).
- **Role assignment section** is non-negotiable for SEV-1: Incident Commander (owns coordination, does NOT troubleshoot), Operations Lead (executes technical steps), Communications Lead (status page, stakeholder updates), Scribe (records timeline).
- **Immediate triage checklist (first 5 minutes)**: scope (how many users, which region, when did it start, any recent deploy?), then severity confirmation.
- **Postmortem trigger cadence**: SEV-1 required within 48 hours; SEV-2 required within 5 business days; SEV-3 at engineering team discretion.
- **Postmortem-to-runbook linkage**: "Postmortem action item completion rate: Percentage of runbook-related action items completed within the agreed timeline." This is the KPI that keeps runbooks current.
- **Runbook vs. playbook distinction**: Runbook = specific procedure for a specific scenario. Playbook = higher-level collection of runbooks for a domain. The article notes these are "frequently conflated."
- **Opsgenie/PagerDuty migration note**: When migrating alerting platforms, "Export all runbook content via the Opsgenie API before the shutdown... Rebuild runbook links in your new tool pointing to your canonical runbook storage, which should be version-controlled and independent of any specific alerting platform."
- **Blameless declaration** is a formal section in the postmortem template: "This postmortem follows blameless postmortem principles..."
- The accessibility rule is absolute: "If an engineer has to navigate three tools to find the relevant runbook after being paged, the coordination tax is already costing MTTR."

## Direct quotes

- "The alert must link directly to the runbook. Not to the wiki homepage, not to the team folder - to the specific runbook for that specific alert. Engineers under stress should not have to navigate."
- "Runbooks must be version controlled. Every change should be trackable. When an incident reveals an inaccurate runbook step, you need to know who changed it and when."
- "Build the runbook, link it to the alert, review it after every incident, and assign a human owner who is responsible for keeping it accurate. That combination, not any specific tool, is what reduces MTTR."
- "Blameless does not mean actionless. If the incident happened because a deployment bypassed the staging environment, the action item is to enforce the deployment pipeline, not to blame the engineer who deployed. But there must be an action item."

## Implications for stinger-forge

- The three storage requirements should be encoded as a checklist in the stinger's `guides/00-principles.md` or as a separate `guides/07-runbook-storage.md`.
- The role assignment section belongs in break-fix templates for SEV-1 incidents; stinger-forge should include it as an optional section gated on severity.
- The postmortem-to-runbook completion rate KPI gives stinger-forge a concrete metric to include in `guides/06-postmortem-linkage.md`.
- The accessibility rule (alert links directly to runbook) should be listed as Principle 6 in `guides/00-principles.md` (the brief only specifies 5; this is a strong addition from current 2026 practice).
- The runbook vs. playbook distinction should be clarified in `guides/01-runbook-types.md` to prevent scope confusion.
