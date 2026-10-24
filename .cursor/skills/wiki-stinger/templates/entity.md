---
type: entity
title: ""
entity_type: function
status: seed
created: 2026-04-29
updated: 2026-04-29
path: ""
language: ts
depends_on: []
used_by: []
last_commit_hash: ""
tested_by: []
tags:
  - entity
related: []
sources: []
---

# {Title}

## Overview

[One paragraph: what this entity is and why it exists. Cite source `file:line` at minimum once.]

## Signature / Definition

```ts
[code signature, type declaration, or schema - keep terse, no full bodies. Use the tree-sitter `signature` field (body already stripped).]
```

## Behavior

[How it works. Inputs, outputs, side effects, error cases. Each claim cites `file:line`.]

## Connections

- **depends_on:** [[entities/...]]
- **used_by:** [[entities/...]]
- **related concepts:** [[concepts/...]]

## Tested by

- [[entities/test-name]] (`path/to/test.ts:line`)

## History

- **Created:** commit `{sha}` by {author} on {YYYY-MM-DD}
- **Last touched:** commit `{sha}` by {author} on {YYYY-MM-DD}
- **Recent activity:**
  - `{sha}` - {message} ({date})
  - `{sha}` - {message} ({date})

## Sources

- `path/to/source/file.ts` (lines X-Y)

---

**Frontmatter notes for sub-types** (see [`references/frontmatter-schema.md`](../references/frontmatter-schema.md) for the full enum):

- `entity_type` MUST be one of: `function`, `class`, `module`, `service`, `mcp-tool`, `env-var`, `config-key`, `data-model`, `exported-symbol`, `deeplake-table`, `queue`, `scheduled-hook`, `feature-flag`.
- For `mcp-tool`: add `tool_name:`, `handler:` (function entity), and `server:`.
- For `service`: add `mcp_tools:`, `env_vars:`, and `deeplake_tables:` lists.
- For `deeplake-table`: add `table_name:`, `columns:`, `primary_key:`, and `data_model:`.
- For `queue`: add `triggers:` (handler entity), `worker_kind: spawned-process | daemon | lifecycle-hook`, and `gated_by:`.
- For `scheduled-hook`: add `hook_kind: interval-tick | lifecycle-hook | session-hook`, `event:` (for lifecycle/session hooks), `interval_source:`, and `triggers:`.
- For `feature-flag`: add `flag_kind: env-toggle`, `default_value:`, `gates:`, and `read_at:` (branch sites).
- For `exported-symbol`: add `symbol_kind: const | enum | object | factory | singleton`, `shape_summary:`, and `is_default_export:`.
