---
source_type: blog
authority: medium
relevance: high
topic: rule-file-authoring
url: https://design.dev/guides/cursor-rules/
fetched: 2026-05-20
---

# Cursor Rules Guide - AI Configuration | design.dev

## Summary

Published February 6, 2026. Comprehensive practitioner guide covering the complete rule priority hierarchy and the modern `.cursor/rules/` system. Unique value: documents the full 5-level priority stack, which the official docs do not present as clearly.

**Full priority hierarchy (highest to lowest):**
1. Team Rules (highest - Enterprise/Business plans, admin-managed)
2. Project Rules (`.cursor/rules/*.mdc` - version-controlled)
3. User Rules (Cursor Settings > Rules - global preferences)
4. Legacy Rules (`.cursorrules` file - deprecated, still supported)
5. AGENTS.md (simple markdown alternative in project root)

**AGENTS.md alternative:** Simple always-on plain markdown instructions in the project root. No frontmatter, no activation modes. Use when you want simple, always-on instructions without the MDC complexity. The `.mdc` system is better when fine-grained control is needed.

**Conflict resolution:** Rules applied later override earlier ones at the same tier. Team Rules can be enforced (cannot be disabled by users) or advisory (users can disable).

**Common patterns from guide:**
- Database rules scoped to `**/*.sql, **/migrations/**`
- Component rules scoped to `**/*.tsx, **/*.jsx`
- Test rules scoped to `**/*.test.*, **/*.spec.*`
- API rules scoped to `**/api/**`
- Global style rules with `alwaysApply: true`

## Key quotations

- "5-layer priority: Team Rules > Project Rules > User Rules > Legacy Rules > AGENTS.md"
- "Tip: Use `.cursor/rules/` with `.mdc` files when you need fine-grained control over when rules activate. Use `AGENTS.md` when you want simple, always-on instructions in plain markdown."
- "Team Rules can be enforced by team admins, preventing users from disabling them."

## Relevance to the stinger

- Practitioner backing for `guides/01-principles.md` and `guides/02-rule-file-authoring.md`: the rule priority hierarchy and common glob scoping patterns.
- Secondary source; the authoritative rules reference is the official docs note and this repo's own `.cursor/rules/*.mdc`.
