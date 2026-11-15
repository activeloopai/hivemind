# Postmortem-to-Runbook Linkage

> **Research source:** `research/external/2026-03-29-devopsil-blameless-postmortems.md`, `research/external/2026-03-13-incidentio-postmortem-best-practices.md`
> **Principle:** `guides/00-principles.md` (closes the feedback loop between incidents and runbooks)

The runbook-to-postmortem relationship is a closed loop: runbooks prevent incidents; postmortems improve runbooks. This guide covers how to link postmortems to runbooks, how to create runbook action items from postmortem findings, and how to track the loop to completion.

---

## The closed loop

```
Alert fires
    ↓
On-call executes runbook
    ↓
Incident resolved (or not)
    ↓
Postmortem (SEV-1: within 48h; SEV-2: within 5 business days)
    ↓
Postmortem action items → new runbooks OR runbook updates
    ↓
Updated runbook exercised in game day
    ↓
Runbook prevents next incident (or reduces MTTR)
```

**Source:** The Good Shell (2026-04-22) names "Postmortem action item completion rate (runbook-related)" as the primary KPI for runbook program health. See `research/external/2026-04-22-thegoodshell-incident-runbook-template.md`.

---

## Adding postmortem references to runbooks

Every runbook should include a `## Postmortem History` section (optional but strongly recommended for production runbooks). Format:

```markdown
## Postmortem History

Past incidents that led to improvements in this runbook:

| Date | Incident ID | SEV | Summary | Runbook change |
|---|---|---|---|---|
| 2026-03-10 | INC-2041 | SEV-1 | Connection pool exhaustion; Step 6 command was missing --timeout flag | Added --timeout to Step 6; added connection pool verification to Step 2 |
| 2025-12-05 | INC-1887 | SEV-2 | Escalation path pointed to dissolved team | Updated Tier 2 to Payments team; added response-time expectation |
```

**Why:** Future on-call engineers reading this runbook gain context about why specific steps exist. A step with a postmortem behind it carries implicit authority: "this was the hard-won lesson from INC-2041."

---

## Creating runbook action items from postmortems

DevOpsil (2026-03-29) provides a real-world example where the postmortem action item reads: "Write runbook for DB connection pool exhaustion (ENG-4824, due 2026-04-11)."

This is the correct format. Every runbook-related postmortem action item must have four attributes:

| Attribute | Example | Anti-pattern |
|---|---|---|
| **Specific** | "Write runbook for DB connection pool exhaustion covering Steps 1-7 per the break-fix template" | "Improve runbooks" |
| **Assigned** | @sre-engineer-name | "SRE team" |
| **Time-bound** | Due: 2026-04-11 (2 business weeks from postmortem) | "Soon" / "Next quarter" |
| **Tracked** | Linear/Jira ticket ENG-4824 | Slack message |

Action items that lack any of these four attributes do not close the loop. They become technical debt.

**Source:** `research/external/2026-03-29-devopsil-blameless-postmortems.md`.

---

## Leverage classification: new runbook vs. update existing

Postmortem action items map to three leverage categories. The category determines whether to create a new runbook or update an existing one:

| Category | Definition | Runbook action |
|---|---|---|
| **Prevention** | Change the system so the failure cannot occur again | May require no runbook (system fix), or a new "check for X before deploying" step in a scheduled operation runbook |
| **Detection** | Add alerting/monitoring to catch the failure earlier | Update alert definition to include `runbook_url`; add triage steps to existing runbook |
| **Mitigation** | Reduce the impact or recovery time when the failure occurs | Create a new break-fix runbook OR update an existing one with the learned resolution steps |

Most postmortem action items that create new runbooks are in the Mitigation category.

**Source:** DevOpsil (2026-03-29) uses this three-category classification. See `research/external/2026-03-29-devopsil-blameless-postmortems.md`.

---

## Runbook creation from postmortem action item: checklist

When a postmortem assigns "Write runbook for X":

- [ ] Classify: break-fix, scheduled operation, or diagnostic? (See `guides/01-runbook-types.md`.)
- [ ] Copy the appropriate template from `templates/`.
- [ ] Fill in all sections. Apply the no-implied-context audit (`guides/02-no-implied-context-audit.md`).
- [ ] Add a `## Postmortem History` entry linking back to the originating postmortem.
- [ ] Mark TEST STATUS: UNTESTED with a scheduled staging exercise date.
- [ ] Update the alert definition with a `runbook_url` pointing to the new runbook.
- [ ] Close the postmortem action item ticket with the runbook PR link.
- [ ] Schedule the runbook for the next quarterly game day.

---

## Postmortem cadence targets

| Severity | Postmortem deadline | Runbook action item deadline |
|---|---|---|
| SEV-0 | 24 hours | 1 business week |
| SEV-1 | 48 hours | 2 business weeks |
| SEV-2 | 5 business days | 4 business weeks |
| SEV-3 | Optional (blameless retro) | No formal deadline |

Missing the postmortem cadence for SEV-1 or higher is a systemic failure. If postmortems are consistently late in your organization, flag to `library-worker-bee` for process improvement.
