---
source_url: https://cloudtoolstack.com/blog/sre-incident-response-runbooks
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: runbook-structure
stinger: runbook-writing-stinger
---

# Building SRE Incident Response Runbooks for Cloud Infrastructure - CloudToolStack

Published: 2026-03-14

## Summary

- **Triage section** must answer "What just fired and how bad is it?" - not just the metric but the **customer impact statement**: "API response times exceed 2 seconds, affecting all users of the checkout flow" is good; "CPU above 90 percent" is not.
- **"New hire test"**: "Could an engineer who joined the team last week follow this runbook during an incident at 3 AM and resolve it without calling someone else?" This is the actionable operationalization of the Command Brief's "five-minute rule."
- **Confirmation of recovery** is as important as the fix: include expected time to recovery ("CPU should drop below 70 percent within 5 minutes of scaling").
- **Escalation section**: organized by time of day AND severity. Not just one tier - different contacts for business hours vs. 3am, with expected response time for each level.
- **Post-incident review structure**: Summary -> Timeline -> Root cause -> What went well -> What went poorly -> Action items. "Blameless does not mean actionless."
- **Game days as primary quality mechanism**: "Quarterly, simulate an incident and have the on-call engineer follow the runbook step by step. Time the resolution. Note where the runbook is unclear or outdated. Game days are the single most effective practice for maintaining runbook quality."
- **Monthly runbook review**: Assign a rotating team member to review 2-3 runbooks per month. They verify dashboard links work, commands execute correctly, and described architecture matches reality.
- **Runbook as code**: Store runbooks alongside infrastructure code in version control. Some teams use Jupyter notebooks or Backstage TechDocs for runbooks, which allows embedding live queries.
- **Anti-pattern confirmed**: "Generic advice like 'check the logs' is not helpful. 'Run this specific query in Cloud Logging to find the error' is." Exact phrasing of the no-implied-context rule.

## Direct quotes

- "The difference between a 15-minute resolution and a 3-hour outage is often whether the on-call engineer has a runbook."
- "The first section answers: 'What just fired, and how bad is it?' ... 'CPU above 90 percent' does not convey urgency. 'API response times exceed 2 seconds, affecting all users of the checkout flow' does."
- "A good runbook passes the 'new hire test': could an engineer who joined the team last week follow this runbook during an incident at 3 AM and resolve it without calling someone else?"
- "Every P1 and P2 incident should result in a post-incident review... The review serves two purposes: it identifies systemic improvements to prevent recurrence, and it updates the runbook with what the team learned during the incident."

## Implications for stinger-forge

- The "customer impact statement" requirement should be a mandatory field in all break-fix templates (not just "metric threshold" but "user-visible impact").
- The "new hire test" is a concrete, memorable formulation of the Command Brief's five-minute rule - include it verbatim in `guides/00-principles.md`.
- Time-of-day-aware escalation paths (business hours vs. after-hours contacts) should be explicitly modeled in `guides/03-escalation-path-architecture.md`.
- The monthly review cadence (2-3 runbooks/month per rotating team member) gives stinger-forge a concrete freshness recommendation to embed in `guides/05-runbook-as-test.md`.
- Backstage TechDocs as a runbook storage option - mention alongside Notion/Confluence in `guides/07-runbook-storage.md` (or equivalent).
