# Escalation Path Architecture

> **Research source:** `research/external/2026-pagerduty-escalation-policies-three-tier.md`, `research/external/2026-sre-google-being-on-call-chapter.md`
> **Principle:** `guides/00-principles.md` Principle 3

Every runbook must have an explicit escalation path. This guide covers how to name, format, and validate escalation paths so they work at 3am when the on-call engineer has been paging for 20 minutes with no resolution.

---

## The three-tier model

PagerDuty's recommended structure for most services (see `research/external/2026-pagerduty-escalation-policies-three-tier.md`):

| Tier | Who | When to escalate | Contact method | Expected response |
|---|---|---|---|---|
| Tier 1 | On-call engineer (current) | N/A, this is you | N/A | N/A |
| Tier 2 | Domain team on-call | 15 min no progress OR any SEV-1 | Named Slack channel + PagerDuty schedule | 10 min |
| Tier 3 | Engineering Manager on-call | 30 min OR SEV-0 (full outage) | PagerDuty "EM Escalation" policy | 15 min |

Adapt tier count and timing to your organization, but never fewer than two tiers (you + someone else).

---

## Required escalation path format in runbooks

Every runbook must include an `## Escalation Path` section with this minimum information:

```markdown
## Escalation Path

**Tier 1 (you):** Exhaust the steps in this runbook.

**Tier 2 (escalate if: 15 min no progress OR any data loss OR SEV-1):**
- Team: Hivemind Platform Team
- Slack: #hivemind-oncall
- PagerDuty: "Hivemind Platform" schedule
- Expected response: 10 minutes

**Tier 3 (escalate if: 30 min no resolution OR full service outage OR SEV-0):**
- Team: Engineering Management
- PagerDuty: "EM Escalation" policy
- Expected response: 15 minutes

**External escalation (if vendor issue suspected):**
- Embeddings provider status: https://status.openai.com (dashboard link, not just the homepage)
- npm registry status: https://status.npmjs.org
- Open a vendor support ticket and paste the ticket URL in the incident channel.
```

---

## Five escalation anti-patterns

### Anti-pattern 1: "Escalate if needed"

**Why it fails:** "Needed" is undefined. An engineer who hasn't resolved the incident after 30 minutes may still believe they don't "need" to escalate because they haven't tried everything. The threshold is never defined.

**Correction:** Name the explicit triggers: time elapsed, symptom not responding, SEV classification, data loss risk.

---

### Anti-pattern 2: Names instead of roles

**Why it fails:** "Page Aisha", Aisha changed teams three months ago. The runbook is now pointing to the wrong person.

**Correction:** Use team names, Slack channels, and PagerDuty schedule names. People rotate; teams persist.

---

### Anti-pattern 3: Missing response-time expectation

**Why it fails:** The engineer pages Tier 2. Twenty minutes pass. They don't know if that's normal or if they should escalate further.

**Correction:** Every escalation tier specifies the expected response time. If no response within that window, auto-escalate to Tier 3.

---

### Anti-pattern 4: Single-channel escalation

**Why it fails:** The Slack channel is down. (It happens. Slack had multiple outages in 2025.)

**Correction:** Every escalation path lists a primary channel AND a backup (PagerDuty phone/SMS for emergencies, a direct phone number for critical escalations).

---

### Anti-pattern 5: Missing vendor escalation path

**Why it fails:** The payment processor is down. The engineer doesn't have the vendor support URL memorized. They search for it. Three minutes pass.

**Correction:** Pre-populate vendor escalation links for every external dependency in the runbook. Include the support URL and the internal vendor relationship owner.

---

## SLA tiering reference

Map your alert severity to escalation tier:

| Severity | Definition | Max time before Tier 2 escalation |
|---|---|---|
| SEV-0 | Full service outage, data loss, or security breach | Immediate |
| SEV-1 | Major degradation, >25% error rate, SLA at risk | 15 min |
| SEV-2 | Partial degradation, <25% error rate, no SLA impact yet | 30 min |
| SEV-3 | Minor issue, no user-visible impact | Next business day |

Runbooks triggered by SEV-0 and SEV-1 alerts must have an escalation path defined. SEV-2 runbooks should. SEV-3 runbooks may omit the escalation path if the failure mode has no risk of degrading to SEV-1.

---

## Validation checklist for escalation paths

Before marking the runbook ready, confirm:

- [ ] At least two tiers defined (you + someone else).
- [ ] Every tier names a team, channel, and PagerDuty schedule, no personal names.
- [ ] Every tier has an expected response time.
- [ ] At least one backup escalation channel per tier.
- [ ] External dependency escalation links are populated for every dependency.
- [ ] Escalation triggers are explicit (time, symptom, severity), not "if needed."

This checklist is reproduced in `guides/07-done-checklist.md`.
