# Bug Severity Levels - Industry Standard Definitions

**Sources:**
- https://blog.qatestlab.com/2015/03/10/software-bugs-severity-levels/
- https://www.browserstack.com/guide/bug-severity-vs-priority
- https://birdeatsbug.com/blog/bug-severity-vs-priority
- https://www.guru99.com/defect-severity-in-software-testing.html
- https://testgrid.io/blog/bug-severity-and-priority-in-testing/

**Retrieved:** 2026-04-24
**Query used:** `bug severity classification Critical High Medium Low definitions software testing`

## Summary

Industry-standard severity levels (Critical / High / Medium / Low, sometimes Trivial at the bottom) measure the **technical impact** of a defect on the software, independent of priority. The canonical definitions are consistent across QA resources:

- **Critical (S1):** Complete system failure or a fully blocked core workflow with no workaround. Testing cannot continue until the defect is resolved. Examples: app crash on launch, data corruption, security breach, checkout pipeline broken.
- **High / Major (S2):** A major feature is broken but a workaround exists; the system still functions for other flows. Significantly affects core features but does not completely block use.
- **Medium / Moderate (S3):** A non-critical feature is affected; workarounds are possible. Impacts secondary functions or UX without disrupting key workflows.
- **Low / Minor (S4):** Cosmetic issues, text/UI inconsistencies, or minor improvements that do not affect functionality.

Severity is distinct from priority: severity is "how bad is the bug" (technical), priority is "how soon should we fix it" (business).

## Key quotations

> "Critical severity causes complete system failure or halts a major function with no possible workaround, and testing or production cannot continue until the issue is resolved."

> "High severity significantly affects core features but does not completely block usage, and a workaround might exist, though it may be unreliable or time-consuming."

> "Medium severity impacts secondary functions or user experience but does not disrupt key workflows."

> "Low severity creates small usability issues or visual inconsistencies that do not affect functionality."

## Mapping to the Command Brief's three-tier scheme

The Command Brief specifies three tiers (Critical / Warning / Suggestion). Map them as follows:

| Brief tier | Industry tier(s) | Rubric |
|---|---|---|
| Critical (must fix - blocks ship) | Critical (S1) + High (S2) | Plan requirement missing, contract broken, security/authz gap, data corruption risk, or regression on existing behavior. Workaround does not exist or is unacceptable for ship. |
| Warning (should fix) | Medium (S3) | Plan requirement partially met, implied-but-missing behavior, validation gap, or performance anti-pattern that is not immediately user-visible. Workaround exists. |
| Suggestion (consider improving) | Low (S4) / Trivial | Cosmetic, naming, minor refactor opportunity. The plan neither requires nor prohibits the change; the code works as specified. |

## Relevance to this stinger

This is the source for `guides/05-severity-classification.md`. The mapping table above resolves the Command Brief's open question: "Should the Stinger include a rubric for deciding when a Warning becomes a Critical?" Answer: use the industry-standard criterion of "blocks ship / workaround exists / cosmetic only" rather than an ad-hoc scale.

Anchor the rubric to **user-facing impact** (does the user hit this?) combined with **plan fidelity** (did the plan require this?). The Bee's audit is explicitly plan-relative, so a missing plan requirement is Critical even if the code path is rarely hit - because the plan is the contract.
