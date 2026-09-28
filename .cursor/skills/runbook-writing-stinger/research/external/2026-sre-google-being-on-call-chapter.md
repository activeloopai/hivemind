---
source_url: https://sre.google/sre-book/being-on-call/
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: critical
topic: on-call-principles
stinger: runbook-writing-stinger
---

# Being On-Call - Google SRE Book, Chapter 11

Published: Primary reference (Google SRE Book; no publication date; canonical primary source)

Note: No 2026 equivalent exists for this foundational content. Used as a primary reference per research constraints.

## Summary

- **On-call time budget**: Google caps on-call at 25% of SRE time. Per 12-hour shift, maximum 2 incidents (6 hours average per incident including root-cause analysis, remediation, postmortem, bug fixes). Teams sized to have every engineer on-call at least once or twice a quarter.
- **Resources that make on-call sustainable**: Clear escalation paths, well-defined procedures (runbooks), and blameless postmortem culture. "The most important on-call resources" - the chapter does not separate these three.
- **Operational underload is a risk**: Engineers who are rarely on-call lose proficiency. "Wheel of Misfortune" exercises (game days) counteract this. Google runs DiRT (Disaster Recovery Training) annually.
- **Incident definition**: "A sequence of events and alerts that are related to the same root cause and would be discussed as part of the same postmortem." This is the unit of work that a runbook should cover.
- **Postmortem as learning mechanism**: Postmortems are mentioned alongside root-cause analysis and bug fixing as standard post-incident activities - not optional overhead.
- **Incident management framework**: Covers incident commander, communications coordinator, and ops lead roles. These are the same roles appearing in the 2026 runbook templates - confirms role structure has remained stable.
- **"Wheel of Misfortune"**: Exercises where a junior engineer follows the runbook while a senior engineer observes - directly maps to the game day methodology confirmed across multiple 2026 sources.

## Direct quotes

- "no more than 25% can be spent on-call"
- "It's important that on-call SREs understand that they can rely on several resources that make the experience of being on-call not as difficult as it might seem. The most important on-call resources are: clear escalation paths, well-defined procedures [runbooks], and blameless postmortem culture."
- "'Wheel of Misfortune' exercises... are useful team activities that can help to hone and improve troubleshooting skills and knowledge of the service."
- "dealing with the tasks involved in an on-call incident - root-cause analysis, remediation, and follow-up activities like postmortem and fixing bugs - takes 6 hours [on average]"

## Implications for stinger-forge

- The three co-required resources (clear escalation paths + well-defined procedures + blameless postmortem culture) give stinger-forge a canonical justification for why the stinger must address all three - not just templates.
- The "6 hours per incident" baseline is a useful benchmark for the five-minute rule: if a runbook adds 30 minutes of orientation time, that's 8% overhead on an already costly incident.
- The Wheel of Misfortune = game day; SKILL.md should reference the SRE book's terminology for teams that know the source material.
- The incident unit definition (same root cause, same postmortem) confirms that one runbook = one root cause category - directly supporting the "one scenario per runbook" rule.
- Cite this source explicitly in SKILL.md's reference section as the foundational anchor for the stinger's principles.
