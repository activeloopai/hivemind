---
source_url: https://incop.ai/blog/on-call-runbook-best-practices
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: runbook-structure
stinger: runbook-writing-stinger
---

# On-Call Runbook Best Practices (With Examples) - Incident Copilot

Published: 2026-03-08

## Summary

- **The 7-section framework**: Title+Scope, Symptoms, Severity Classification, Investigation Steps, Resolution Steps, Verification, Follow-Up. All seven sections are required; omitting any one causes the runbook to fail under real incident conditions.
- **One scenario per runbook** is a hard rule: "If two runbooks share 80% of steps, that's fine - duplication is better than confusion." Teams routinely break this and pay in wasted triage time.
- **Investigation before action**: "Never skip investigation. Taking action without diagnosis leads to cascading failures." The investigation section must precede resolution steps and must include exact commands.
- **Verification criteria are mandatory**: Define what "resolved" looks like (metric at threshold, error rate below X, user-visible behavior confirmed normal) before the engineer declares the incident over.
- **Game day as primary quality gate**: Write runbooks after incidents, not before. Test them in game days. "Audit your last 20 incidents, identify the top 5 most common incident types, write one runbook per type."
- **Common mistakes**: Vague steps ("check the logs"), missing rollback procedures, no severity guidance, no ownership, too many decision branches, skipping the verification step.
- The no-ambiguity rule is phrased precisely: "No ambiguity. 'Check logs' is bad. 'Run: `kubectl logs -n payments deploy/checkout-api --tail=100 | grep connection`' is good."

## Direct quotes

- "Most runbooks fail because they're incomplete, outdated, or too abstract to follow under pressure."
- "Rule: One alert, one runbook. If two runbooks share 80% of steps, that's fine - duplication is better than confusion."
- "'Check the logs' is not a step. 'Run `grep -i error /var/log/app/app.log | tail -50`' is."
- "Every remediation action should have a documented rollback. If you scale up read replicas and it doesn't work, how do you undo it?"

## Implications for stinger-forge

- The 7-section framework should be the canonical structure encoded in ALL three templates (break-fix, scheduled, diagnostic) with section names adapted per type.
- The "investigation before resolution" rule maps directly to the Command Brief's exact-command discipline - reinforce this in `guides/02-no-implied-context-audit.md`.
- The verification section is a gap in many real-world runbooks; stinger-forge should include explicit "success criteria" placeholders in all templates.
- The game day recommendation aligns with `guides/05-runbook-as-test.md` - use this source's "audit your last 20 incidents" starting methodology.
- The free template included in this article is a strong candidate for `templates/break-fix-runbook.md` base content.
