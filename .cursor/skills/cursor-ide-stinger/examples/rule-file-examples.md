# Rule File Examples

Worked `.cursor/rules/*.mdc` examples. The first three are this repo's live Army rules; the rest are patterns for new rules.

## 1. Always Apply: a short, always-true directive (live: `no-em-dashes.mdc`)

```mdc
---
description: Never use em dashes (or en dashes) in prose written for the user
alwaysApply: true
---

# No em dashes

Do not use em dashes (`-`, U+2014) or en dashes (`-`, U+2013) in any prose written
for the user. Regular hyphens (`-`, U+002D) are fine. Use a comma, colon,
parentheses, or a period instead.
```

**Why it earns `alwaysApply: true`:** it is short and must hold in every context. This is the only always-on rule worth its budget in this repo.

## 2. Apply Intelligently: a guardrail keyed on `description` (live: `respect-agent-work-boundaries.mdc`)

```mdc
---
description: Never modify or delete another agent's active work
alwaysApply: true
---

# Respect agent work boundaries

Never modify, delete, move, rename, or overwrite files that are part of another
agent's active work. Touch only the files your own assigned task owns.
```

**Pattern:** a crisp `description` lets the agent recognize relevance. (This repo marks it `alwaysApply: true` because it is a hard, Army-wide guardrail; a softer rule would set `alwaysApply: false` and rely on the description alone.)

## 3. Process rule keyed on `description` (live: `plan-construction-protocol.mdc`)

```mdc
---
description: Mandatory structure, model routing, and ship gate for every multi-step plan
alwaysApply: true
---

# Plan Construction Protocol

Every plan you produce MUST follow this structure: branch off main first, route
each step to a model via `.cursor/model-comparison-matrix.md`, run security then
quality as the final gates, then commit/push/PR.
```

**Pattern:** reference the model matrix with a path rather than inlining the table, so the rule stays accurate when the matrix changes.

## 4. Apply to Specific Files: scope a rule to a path with globs

```mdc
---
description: Conventions for the Cursor hook bundle scripts.
globs: harnesses/cursor/bundle/**, src/cli/install-cursor.ts
alwaysApply: false
---

# Cursor Hook Wiring

- Keep the `hooks.json` entry shape exactly: `{ type, command, timeout }`, no outer wrapper.
- Strip prior Hivemind entries on a normalized `/.cursor/hivemind/bundle/` path before re-adding.
- Only rewrite `hooks.json` when content changed (preserve the trust fingerprint).
```

**When to use:** path- or language-specific conventions. Fires only when a matching file is in context, so it costs nothing elsewhere.

## 5. Apply Manually: reference material loaded on demand

```mdc
---
description: Cursor MCP registration checklist. Mention this rule when wiring an MCP server into Cursor.
alwaysApply: false
---

# Cursor MCP Registration Checklist

1. Add a `mcpServers` entry to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global).
2. No secrets in the file; servers authenticate themselves.
3. Restart Cursor (no hot reload).
4. Verify in Output > "Cursor MCP".
```

**When to use:** a checklist you pull up with `@`-mention during a specific workflow rather than carrying in every context.
