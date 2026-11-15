---
source_url: https://dora.dev/capabilities/trunk-based-development/
fetched: 2026-05-20
source_type: official-docs
authority: high
relevance: high
topic: dora-tbd-research
summary: "DORA's official capability page for trunk-based development. Cites analysis from 2016 and 2017 DORA data showing teams achieve higher software delivery and operational performance when they: have 3 or fewer active branches in the repo, merge branches to trunk at least once a day, don't have code freezes or integration phases. Provides concrete measurement framework: measure active branch count, code freeze periods, merge frequency, and code review approval time. Key implementation prerequisite: develop in small batches (calls this one of the most important enablers). Recommends synchronous code review over async to avoid review-waiting bottlenecks."
---

# DORA Capabilities: Trunk-Based Development

## Summary
Official DORA research capability page. The research basis for trunk-based development's performance correlation comes from 2016 and 2017 DORA data (the original DevOps State of DevOps reports). This is the authoritative citation for the TBD-performance correlation claim.

## Key quotations / statistics

- "Analysis of DORA data from 2016 and 2017 shows that teams achieve higher levels of software delivery and operational performance (delivery speed, stability, and availability) if they follow these practices: Have three or fewer active branches in the application's code repository. Merge branches to trunk at least once a day. Don't have code freezes and don't have integration phases."
- "One of the most important enablers of trunk-based development is teams learning how to develop in small batches."
- "Trunk-based development is a substantial change for many developers, and you should expect some resistance."

## DORA measurement framework for TBD

| Factor to test | What to measure | Goal |
|---|---|---|
| Active branches | Count of active branches in version control, visible to all teams | Three or fewer active branches |
| Code freeze periods | Count and duration of code freezes | No code freezes |
| Merge frequency | Binary (yes/no) per branch merged, or % merged daily | Merging at least once per day |
| Code review time | Average time to approve change requests, flag outliers | Make code review synchronous |

## Implementation guidance from DORA
1. Develop in small batches - most important enabler, requires training and organizational support
2. Perform synchronous code review (not days-long async review) - branches stalling in review waiting undermine TBD
3. Implement comprehensive automated unit tests run before every merge
4. Create a core group of advocates and mentors for the culture change

## Annotations for stinger-forge
- The "three or fewer active branches" metric is a concrete measurement threshold for the Bee to use in assessments
- The "no code freezes" criterion is a diagnostic: if a team has code freezes, they likely have a branching model problem
- The measurement framework table should be included in `guides/00-principles.md` as "how to know if TBD is working"
- The "expect resistance" note is important for the migration playbook (`guides/05-migration-playbook.md`)
- The synchronous code review recommendation is a key cultural prerequisite that the Bee must surface
