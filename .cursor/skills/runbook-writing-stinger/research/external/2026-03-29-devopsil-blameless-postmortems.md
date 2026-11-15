---
source_url: https://devopsil.com/articles/2026-03-29-incident-postmortem-template
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: postmortem-linkage
stinger: runbook-writing-stinger
---

# Writing Blameless Postmortems That Actually Prevent Recurrence - DevOpsil

Published: 2026-03-29 (Author: Zara Blackwood)

## Summary

- **Four-requirement action item rule**: Specific (not "improve monitoring" but "add PagerDuty alert when DB connection pool usage exceeds 80%"), Assigned (one named owner, not a team), Time-bound (due date, not "soon"), Tracked (ticket number). All four must be present or the action item is invalid.
- **Runbook as mandatory action item category**: The example postmortem includes "Write runbook for DB connection pool exhaustion" as an explicit action item (ENG-4824, due 2026-04-11). This is the canonical pattern for postmortem-to-runbook linkage.
- **Postmortem document before the meeting**: "The postmortem document should be written before the review meeting - not during it. The meeting is for validating the timeline, stress-testing the contributing factors, and refining action items."
- **Action item classification by leverage**: Prevention (stops this class of incident), Detection (makes it visible faster), Mitigation (reduces impact when it does occur). Prevention items are highest priority. If a postmortem produces only mitigation items, ask why.
- **Sprint integration**: "Postmortem action items should enter the engineering backlog immediately - not sit in a separate document. If your team uses Jira, Linear, or GitHub Issues, create the ticket before the review meeting ends."
- **Monthly review cycle**: "A monthly 'postmortem review' that checks completion status of action items from the past 30 days. If an item is blocked or deprioritized, that decision should be explicit - not silent."
- **Meeting structure (60 minutes max)**: Read timeline silently (5m) -> timeline corrections (10m) -> root cause (15m) -> contributing factors/lessons (10m) -> action items (20m) -> confirm next steps (5m).
- **Five Whys in practice**: Used for root cause, but the final postmortem presents the narrative form (not the raw why chain). The connection pool exhaustion example shows what deep root cause looks like.

## Direct quotes

- "Every action item must be: Specific - not 'improve monitoring' but 'add PagerDuty alert when DB connection pool usage exceeds 80%'; Assigned - one named owner, not a team; Time-bound - a due date, not 'soon'; Tracked - a ticket number."
- "Postmortem action items should enter the engineering backlog immediately - not sit in a separate document."
- "The document should be written before the review meeting - not during it. The meeting is for validating the timeline, stress-testing the contributing factors, and refining action items."
- "Write runbook for DB connection pool exhaustion" - shown as a specific action item in a real postmortem example (ENG-4824).

## Implications for stinger-forge

- `guides/06-postmortem-linkage.md` should encode the four-requirement action item rule (Specific/Assigned/Time-bound/Tracked) and mandate a "runbook update or creation" action item for every P1/P2 postmortem.
- The leverage classification (Prevention/Detection/Mitigation) is a useful triage tool for prioritizing which action items spawn new runbooks vs. which update existing ones.
- The "write runbook" action item pattern gives stinger-forge a concrete handoff protocol: when a postmortem identifies a scenario with no runbook, the action item is `[Write runbook for <scenario>]` with a named owner and a due date.
- Sprint integration (create ticket before meeting ends) should be a required step in the postmortem-to-runbook workflow in `guides/06-postmortem-linkage.md`.
- The monthly action item review cycle gives stinger-forge a recommended freshness cadence to pair with the quarterly game day cadence.
