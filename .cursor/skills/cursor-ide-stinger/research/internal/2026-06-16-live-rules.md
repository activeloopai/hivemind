---
source_type: internal-artifact
authority: high
relevance: high
topic: rule-file-authoring
url: .cursor/rules/
fetched: 2026-06-16
---

# Live Rules: .cursor/rules/*.mdc

## Summary

This repo ships three `.cursor/rules/*.mdc` files. They are the canonical examples for `.mdc` authoring and the Army's guardrails.

## The three rules

- **`no-em-dashes.mdc`** (`alwaysApply: true`, `description` only, no globs): bans em/en dashes in any prose written for the user. The one rule worth the always-on budget.
- **`plan-construction-protocol.mdc`** (`alwaysApply: true`, process directive): mandates branch-off-main first, per-step model routing via `.cursor/model-comparison-matrix.md`, a security gate then a quality gate, then commit/push/PR. References the model matrix by path rather than inlining it.
- **`respect-agent-work-boundaries.mdc`** (`alwaysApply: true`): never modify or delete another agent's active work; stay inside the assigned scope.

## Key observations

- All three use `alwaysApply: true` because they are hard, Army-wide guardrails. Softer, scoped rules would set `alwaysApply: false` with a glob or a `description`.
- The plan-construction rule shows the path-reference pattern (point at the matrix file, do not duplicate the table).
- No `.cursorrules` file exists or should exist here; the repo standardized on `.mdc`.

## Relevance to the stinger

Source for `guides/02-rule-file-authoring.md` and the live examples in `examples/rule-file-examples.md`.
