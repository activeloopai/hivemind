# Example: Mobile SDK Team Where GitFlow Is Justified

**Guides demonstrated:** `guides/01-model-selection.md` (GitFlow when warranted), `guides/02-release-and-hotfix.md`, `guides/04-feature-flag-vs-branch.md` (flags can't replace release branches here)

---

## Input

> "We're a 25-engineer mobile SDK team. We ship iOS and Android SDKs that third-party app developers integrate. We currently support v3, v4, and are building v5. When we release a new version, it goes through App Store / Google Play review which can take 5-14 days. During that review window, we sometimes get bug reports that we must patch for the version under review. We're using GitFlow but the team is complaining about complexity. Should we switch to trunk-based development?"

---

## What branching-strategy-worker-bee does

**1. Assess the current model.**

GitFlow currently. 25 engineers. Multi-version support: YES (v3, v4, v5 simultaneously). External release gate: YES (App Store/Play Store review cycle forces a stabilization window). Release cadence: versioned (not continuous).

**2. Apply the decision tree (from `guides/01-model-selection.md`):**

```
Does the team support multiple live product versions simultaneously?
└── YES → Does an external gate force a stabilization window?
          └── YES → GitFlow is justified.
```

**3. Honest advice: GitFlow is justified HERE**

> "This is the 1% case where GitFlow is genuinely appropriate, not just familiar. You satisfy both conditions that make GitFlow's complexity pay off:
>
> 1. You support three live major versions simultaneously (v3, v4, v5).
> 2. Your release gate (App Store review) forces a stabilization window of up to 14 days that you cannot control.
>
> GitHub Flow or trunk-based development could serve you, but they would require a more sophisticated release-train setup with feature flags and tagged release candidates - solving the same problem with different tooling, not eliminating it."

**4. Address the "team complexity" complaint directly**

The team's complaint is about GitFlow's complexity, not about the model choice being wrong. Diagnose WHERE the complexity pain comes from:

- "Branching confusion" (which branch do I start from?) → Fix: clearer conventions, automation.
- "Too many branch types" → Fix: document exactly which branch types exist and when each is created; enforce with a branch-creation script or GitHub template.
- "Merge conflicts on hotfixes going back to develop" → Fix: automate the cherry-pick-back via CI (see `guides/02-release-and-hotfix.md`).
- "Onboarding takes too long to learn the model" → Fix: a one-page visual flowchart in the repo's docs.

**5. Why feature flags don't solve this case (from `guides/04-feature-flag-vs-branch.md`)**

> "You might wonder: can feature flags replace release branches here? Partially - but not completely. The App Store review process reviews a specific binary artifact. That artifact must be stable and reproducible for the entire review window (up to 14 days). A release branch gives you an exact snapshot of the code that produced that binary.
>
> Feature flags help with incomplete features during active development but cannot substitute for the reproducibility guarantee of a release branch during an external review window."

**6. Recommend targeted improvements without changing models**

Rather than a model migration, recommend:

1. **Automate the cherry-pick-back.** Add a CI check that detects commits on any `release/` or `hotfix/` branch and creates an automated back-merge PR to develop. This eliminates the most painful manual step.
2. **Visual branch flowchart.** A diagram in `docs/engineering/branching-model.md` showing the branch lifecycle. Reduces onboarding friction significantly.
3. **Limit active `feature/` branches.** Apply the 2-working-day rule within GitFlow: even though GitFlow permits long feature branches, the team doesn't have to use that permission. Short feature branches within GitFlow are fine.
4. **Route complexity to automation, not model change.** The complexity the team feels is largely manual process. Most of it can be automated.

---

## Output (abbreviated advisory)

```markdown
Recommendation: Keep GitFlow.

Your multi-version support requirement (v3/v4/v5 simultaneously) and the App Store
review gate (external stabilization window of up to 14 days) are the two conditions
that justify GitFlow's complexity. Switching to GitHub Flow or TBD would require
building a release-train system to solve the same problems with different tooling.

The complexity your team feels is largely process-manual. Targeted fixes:
1. Automate cherry-pick-back from release/hotfix branches → develop.
2. Add a visual branch flowchart to docs/.
3. Apply the 2-working-day rule to feature branches even within GitFlow.
4. Reduce active feature branches using feature flags for v5 work.

These changes address the pain without a model migration.
```

---

## Notes

This example is the canonical counter-case to the "always recommend GitHub Flow" default. The Bee must be able to recognize when GitFlow is the right answer and explain why clearly - including why feature flags don't fully substitute for release branches in this specific context.

The mobile SDK case study from `research/external/2026-03-31-tbd-vs-gitflow-comparison-novvista.md` is the real-world precedent for this recommendation.
