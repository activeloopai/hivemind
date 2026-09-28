---
source_url: https://incident.io/blog/sre-incident-postmortem-best-practices
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: postmortem-linkage
stinger: runbook-writing-stinger
---

# SRE Incident Post-Mortem Best Practices: Templates, Process & Learning Culture - incident.io

Published: 2026-03-13

## Summary

- **Three components that must work together**: blameless culture, automated timeline capture, disciplined action item tracking. All three are required; having only one or two produces partial improvement.
- **Root cause of most postmortem failure**: "Most post-mortems fail not because engineers lack skill, but because the process punishes honesty and drowns teams in manual reconstruction work."
- **Automated timeline capture** (key 2026 tooling shift): Modern incident management tools (incident.io, etc.) build the timeline as the incident runs, not after. Reduces 60-90 minutes of archaeology per incident.
- **Action item taxonomy**: Mitigative actions (fixes the immediate gap) vs. Preventative actions (addresses the class of failure). Distinguish between them explicitly.
- **Action item move to backlog**: "Move action items to Jira, Linear, or your existing task tracker immediately after the meeting... action items created during the incident or review land immediately in your existing workflow rather than orphaned in a document."
- **"Human error" is the start of investigation, not the end**: "Start with the timeline, not the root cause (facts first, analysis second). If discussion veers toward 'who,' redirect to 'what condition allowed this.'"
- **Meeting rules**: "End every meeting with action items assigned to specific owners. 'We should improve our deployment pipeline' is not an action item. 'Sarah adds query performance checks to the staging deploy step by March 19' is."
- **The discipline that actually matters**: "One postmortem with five action items that all close in two weeks is worth more than ten postmortems with fifty stale items."
- **Postmortem document drafted before meeting**: Confirmed by multiple sources; incident.io's tool pre-populates 80% of the data work before the meeting starts.

## Direct quotes

- "Most post-mortems fail not because engineers lack skill, but because the process punishes honesty and drowns teams in manual reconstruction work."
- "End every meeting with action items assigned to specific owners. 'We should improve our deployment pipeline' is not an action item. 'Sarah adds query performance checks to the staging deploy step by March 19' is."
- "One postmortem with five action items that all close in two weeks is worth more than ten postmortems with fifty stale items."
- "Start with the timeline, not the root cause (facts first, analysis second). If discussion veers toward 'who,' redirect to 'what condition allowed this.'"

## Implications for stinger-forge

- The mitigative vs. preventative action item distinction should be encoded in `guides/06-postmortem-linkage.md` as a required classification step. Preventative items that identify missing runbooks are the direct input to the runbook creation workflow.
- The "blameless culture + automated timeline + disciplined tracking" triad gives stinger-forge a framing for why the postmortem-linkage guide matters structurally, not just procedurally.
- The "60-90 minutes of archaeology" stat is a concrete justification for why incident tools (incident.io, Rootly, PagerDuty) are worth mentioning in the runbook storage/tooling guide.
- The action item taxonomy (mitigative vs. preventative) aligns with the DevOpsil source's leverage classification (Prevention/Detection/Mitigation) - stinger-forge should consolidate these into one model in `guides/06-postmortem-linkage.md`.
