# quality-stinger

The Cursor skill that equips the `quality-worker-bee` Bee to audit completed implementations against their source plan documentation. It encodes the canonical audit procedure (Locate plan -> Inventory changes -> Cross-reference -> Five-axis evaluation -> Severity classification -> Report) plus the findings-report template, the severity rubric, and a library of worked examples.

This Stinger is the final checkpoint in the `library-worker-bee` (plan) -> implementer -> `security-worker-bee` (security) -> `quality-worker-bee` (QA) loop. It runs after `security-worker-bee` and before work is marked done. See `SKILL.md` for the entry point and `guides/00-principles.md` for scope, ordering, and cross-Bee handoffs.

The Bee that wields this Stinger lives at `.cursor/agents/quality-worker-bee.md`.
