---
source_url: https://sph.sh/en/posts/feature-flags-scale/
fetched: 2026-05-20
source_type: blog
authority: high
relevance: high
topic: feature-flag-lifecycle
summary: "December 2025 comprehensive guide to feature flags at scale with platform comparison (LaunchDarkly, Unleash, AWS AppConfig). Introduces Pete Hodgson's four-flag taxonomy from Fowler's canonical essay: release flags (short-lived, wrap incomplete features), experiment flags (A/B testing, short-lived), ops flags (circuit breakers, long-lived permanent), permission flags (gate by user segment, permanent). The most important insight: flag debt accumulates quickly and cleanup must be part of definition-of-done. Set TTLs when creating flags, automate stale flag detection, schedule regular cleanup. Without governance feature flags make the codebase worse, not better."
---

# Feature Flags at Scale: Implementation Patterns and Platform Comparison

## Summary
December 2025 guide covering the four flag types, platform selection, and the critical importance of flag lifecycle management. Establishes that zombie flags (release flags never cleaned up) are as harmful as long-lived branches.

## Key quotations / statistics

- "Flag debt accumulates quickly. Without lifecycle management, flag count grows exponentially. Set expiration dates when creating flags, automate stale flag detection, and schedule regular cleanup."
- "A codebase with 200 zombie feature flags is as hard to understand as one with 200 stale feature branches."
- "Teams without flag discipline will accumulate zombie flags faster than they can clean them up. Before introducing feature flags, establish: who owns cleanup, what the TTL policy is, how flags are reviewed, and how zombie flags are tracked. Without this governance, feature flags make the codebase worse, not better."
- On trunk-based development: "Feature flags enable trunk-based development by allowing incomplete features in the main branch... No long-lived feature branches, continuous integration with main branch, smaller more frequent merges, reduced merge conflicts, faster feedback loops."
- "Progressive rollouts (1% → 5% → 25% → 50% → 100%) need comprehensive monitoring and clear rollback criteria. Define error rate thresholds before starting rollouts."

## Four flag types (Pete Hodgson / Martin Fowler taxonomy)

| Type | Lifespan | Purpose |
|---|---|---|
| Release flags | Days to weeks (temporary) | Wrap incomplete/risky features during development; delete after full rollout |
| Experiment flags (A/B) | Duration of experiment (days to weeks) | Split users into cohorts for controlled experiments |
| Ops flags | Long-lived, potentially permanent | Circuit breakers, rate limiting thresholds, feature degradation modes |
| Permission flags | Permanent business logic | Gate features by user segment, subscription tier, geography |

## Platform comparison (2025)

| Feature | LaunchDarkly | Unleash | AWS AppConfig |
|---|---|---|---|
| Hosting | SaaS only | Self-hosted or SaaS | AWS managed |
| Pricing | High (per seat + MAU) | Free (OSS) or paid SaaS | Pay per request |
| SDK Maturity | Excellent (15+ languages) | Good (15+ SDKs) | AWS SDK only |
| Targeting Rules | Very advanced | Good | Basic |
| A/B Testing | Native | Via integrations | Manual |

## Annotations for stinger-forge
- The four flag types taxonomy from Fowler/Hodgson is essential for `guides/04-feature-flag-vs-branch.md`
- Flag debt and zombie flag governance must be a named section in the flag guide - it's the #1 objection teams raise against adopting flags
- The flag lifecycle four phases (Create → Canary → Full Release → Cleanup) is directly usable as a workflow template
- Platform comparison belongs in a template or appendix, not in the main guides
- The "feature flags make the codebase worse without governance" warning is a critical directive for the Bee to surface
