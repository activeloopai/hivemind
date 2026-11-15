---
source_url: https://martinfowler.com/articles/feature-toggles.html
retrieved_on: 2026-05-20
source_type: blog
authority: official
relevance: critical
topic: feature-flags-vs-branches
stinger: branching-strategy-stinger
---

# Feature Toggles (aka Feature Flags) - Martin Fowler / Pete Hodgson

## Summary

The canonical reference article on feature toggles, authored by Pete Hodgson and published on martinfowler.com. Although written in 2016 and not updated with a recent date, this is the authoritative taxonomy that all modern feature flag literature cites. It remains current because the conceptual framework has not been superseded.

**The core thesis:** Feature toggles introduce complexity - both the runtime complexity of conditional paths and the operational complexity of managing toggle configuration. The article provides a framework for managing this complexity: categorize toggles by type (with different management discipline for each), implement them cleanly (decision points decoupled from decision logic), and constrain the total number of toggles in the system.

**Four toggle categories (the canonical taxonomy):**
1. **Release toggles** - Allow incomplete/untested features to be deployed to production hidden from users. Short-lived: days to weeks.
2. **Experiment toggles** - Multivariate or A/B testing. Short-lived: days to weeks.
3. **Ops toggles** - Control operational aspects of system behavior (kill switches, circuit breakers). Medium-lived: weeks to months, eventually removed.
4. **Permission toggles** - Turn features on for specific users/groups (premium features, beta users). Long-lived: potentially permanent.

**Management principle:** "Long-lived toggles vs transient toggles" - Release and Experiment toggles are transient and should be aggressively cleaned up. Ops and Permission toggles are longer-lived and managed differently.

**Implementation principle:** "De-coupling decision points from decision logic" - the place in code where you branch on a flag (decision point) should be separate from the logic that determines the flag's value (decision logic). This enables testing and prevents the flag from leaking into business logic.

**The origin story** in the article: A team chose to use feature flags instead of branching for a multi-week algorithm overhaul, motivated by "previous painful experiences of merging long-lived branches." This is the narrative that established the "flags as alternative to long-lived branches" pattern in the industry.

## Key quotations / statistics

- "Feature Toggles are a powerful technique, allowing teams to modify system behavior without changing code."
- "Toggles introduce complexity. We can keep that complexity in check by using smart toggle implementation practices and appropriate tools to manage our toggle configuration, but we should also aim to constrain the number of toggles in our system."
- "You want to avoid branching for this work if at all possible, based on previous painful experiences of merging long-lived branches in the past."
- "Release Toggles are used to enable trunk-based development for teams practicing Continuous Delivery."

## Annotations for stinger-forge

- This is THE foundational source for feature flag taxonomy. The four-category framework (Release / Experiment / Ops / Permission) should be adopted directly in `guides/04-feature-flag-vs-branch.md`.
- The "decision point vs decision logic" decoupling principle should be presented as an implementation guideline with a code example.
- The article explicitly frames feature flags as a trunk-based development enabler - quote the origin story to establish the connection between TBD and flags.
- Even though this is not a 2025-2026 source, its authority in the field justifies inclusion; flag the vintage in the guide and note it remains the authoritative taxonomy.
