# Regression Detection When Test Coverage Is Absent

**Sources:**
- https://circleci.com/blog/regression-testing-and-how-to-automate-it-with-ci/
- https://www.augmentcode.com/learn/regression-testing-defined-purpose-types-and-best-practices
- https://www.harness.io/blog/regression-testing-in-ci-cd-deliver-faster-without-the-fear
- https://www.ranorex.com/blog/automation-test-coverage/

**Retrieved:** 2026-04-24
**Query used:** `regression detection without test coverage post deployment patterns`

## Summary

Many of the PRs `quality-worker-bee` audits will arrive without comprehensive tests - especially early-stage features and AI-authored implementations. The literature identifies three fallback strategies when existing test coverage doesn't cover the changed paths:

1. **Dependency impact analysis** - trace which modules import the changed file and flag their exported surface area as "at-risk."
2. **Canary/synthetic monitoring** - staged rollout with live metrics (not a tool the Bee can invoke, but a recommendation it should make).
3. **Static analysis and type-checking** - strict TypeScript, linting, and dependency graphs catch a class of regressions without runtime tests.

For a review-time Bee, #1 and #3 are the actionable ones.

## Dependency-based "at-risk surface" check (Bee-usable)

When the plan says "modify function `X`":

1. Grep the repo for imports of `X`. Every caller is a potential regression site.
2. Check whether `X`'s signature, return shape, thrown errors, or side-effects changed.
3. Any caller not updated to match the new contract is a regression.

This is the core heuristic for the Detrimental Patterns → "regression" sub-axis when tests are absent.

## Key quotations

> "Modern platforms use AI-driven impact analysis to predict test relevance based on code changes, dependency graphs, and historical failure patterns."

> "Organizations lacking comprehensive test coverage are increasingly turning to monitoring production behavior, AI-driven risk analysis, and synthetic testing rather than relying solely on pre-deployment test execution."

## Relevance to this stinger

Source for the "regression detection" portion of `guides/04-five-axis-evaluation.md` (Detrimental Patterns axis) and `guides/07-common-gaps.md`. The Bee cannot run tests - it reviews statically. But it can and should:

- Grep for every caller of a modified function/export.
- Compare old and new signatures in the diff.
- Flag any caller not visited in the diff that relies on the old contract as a Warning at minimum, Critical if the behavior change is silent (e.g., return type changed from `Promise<User>` to `Promise<User | null>` with no caller checking null).

When there are zero tests for a modified area and the plan said "add tests," that's a Gap finding. When the plan said nothing about tests and there are no tests, it's a Suggestion - not a Warning. The plan is the contract.
