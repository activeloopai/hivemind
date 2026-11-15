---
source_url: https://ownership.pagerduty.com/escalations
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: high
topic: escalation-paths
stinger: runbook-writing-stinger
---

# Escalation Policies - PagerDuty Full-Service Ownership Documentation

Published: Primary reference (no date; PagerDuty official documentation)

## Summary

- **Three-tier escalation model** (PagerDuty's recommended default): Level 1 = team on-call rotation (primary responder, first 5-30 min), Level 2 = same pool offset by one week (secondary, catches unacknowledged pages), Level 3 = technical team leaders, engineering manager, tech lead, technical product owner.
- **Tier 1 services** add a Level 4: engineering senior leadership team.
- **Key principle**: "Individuals should never be assigned to an escalation policy; instead, a schedule should be assigned." Even if a CEO is the final escalation, they should be on a schedule ("CEO On-Call") so the policy is maintainable.
- **Level 2 design rationale**: "The secondary on-call person for a given week was the primary on-call person from the week before. Our logic is that the second-level escalation still has context from being primary the week before."
- **Escalation time window**: "The first-level responder has 30 minutes to take action on the incident (acknowledge, resolve, or reassign) before escalation fires." Minimum 5 minutes between escalation levels.
- **Self-escalation is encouraged**: "If the first-level responder is unable to resolve, or is even just uncomfortable with, the current issue, it is reasonable and encouraged that they manually escalate to the second-level." Low-shame escalation is a design goal.
- **Shadow rotation for onboarding**: "A common practice for new hires is to have them shadow the primary on-call responder... Create a dedicated shadow schedule and place it alongside the primary on-call schedule on the escalation policy."
- **Three-tier rationale**: The three-tier system is not about blame escalation but about ensuring technical expertise increases with each tier. Tier 3 escalation reaches people with architectural context.
- **OpsGenie P1 escalation example** (from OpsGenie/OneUptime source): Level 1 = primary on-call (immediate), Level 2 = secondary on-call (5 minutes unacknowledged), Level 3 = engineering managers (15 minutes unacknowledged).

## Direct quotes

- "The system you choose to build should mirror the needs of your specific organization."
- "Individuals should never be assigned to an escalation policy; instead, a schedule should be assigned."
- "If the first-level responder is unable to resolve, or is even just uncomfortable with, the current issue, it is reasonable and encouraged that they manually escalate to the second-level."
- "The third level of the escalation typically includes technical team leaders, as defined for the service."

## Implications for stinger-forge

- `guides/03-escalation-path-architecture.md` should encode the three-tier model as the canonical starting point, with customization guidance for 1-person vs. large-team scenarios.
- The "schedule, not individual" rule should be an explicit check in the escalation-path audit protocol (alongside the no-implied-context checks).
- The shadow rotation pattern is useful context for teams onboarding new engineers - include it as a note in the escalation-path guide.
- The minimum 5-minute window between escalation levels is a concrete configuration constraint that runbooks should reference when specifying "escalate after X minutes."
- The self-escalation encouragement ("uncomfortable = escalate") maps to the Command Brief's "never skip the escalation path" directive - include this framing in `guides/00-principles.md`.
