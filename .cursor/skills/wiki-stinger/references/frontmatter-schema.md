# Frontmatter Schema

Every knowledge page starts with flat YAML frontmatter. No nested objects (Obsidian's Properties UI requires flat structure; Cursor doesn't care, but we keep flat for portability across both renderers).

---

## Universal fields (every page, no exceptions)

```yaml
---
type: <entity|concept|decision|comparison|question|meta>
title: "Human-Readable Title"
created: 2026-04-29
updated: 2026-04-29
tags:
  - <type-tag>
  - <domain-tag>
status: <seed|developing|mature|evergreen|stub>
related:
  - "[[Other Page]]"
sources:
  - "[[entities/source-file]]"
---
```

**Status values:**
- `seed` - exists, barely populated
- `developing` - has real content, not yet complete
- `mature` - comprehensive, well-linked
- `evergreen` - unlikely to need updates
- `stub` - placeholder for a file in a language with no wired tree-sitter grammar, pending a grammar upgrade

---

## Type-specific additions

### entity (the most common type)

```yaml
entity_type: function
# function | class | module | service | mcp-tool | env-var | config-key |
# data-model | exported-symbol | deeplake-table | queue | scheduled-hook | feature-flag
path: "src/graph/extract/typescript.ts"   # repo-relative
language: ts                              # ts | tsx | js | jsx | py | go | rs | java | rb | c | cpp | unknown
depends_on:
  - "[[entities/firstNamedChildOfTypes]]"
  - "[[entities/makeNode]]"
used_by:
  - "[[entities/extractFile]]"
last_commit_hash: "abc123def"
tested_by:
  - "[[entities/typescript-extractor-test]]"
```

**For `mcp-tool` sub-type, additionally:**
```yaml
tool_name: "hivemind_search"
handler: "[[entities/handleSearch]]"
server: "[[entities/mcp-server]]"
```

**For `service` sub-type, additionally:**
```yaml
mcp_tools:
  - "[[entities/hivemind_search]]"
  - "[[entities/hivemind_read]]"
env_vars:
  - "[[entities/HIVEMIND_API_URL]]"
deeplake_tables:
  - "[[entities/codebase]]"
```

**For `deeplake-table` sub-type, additionally:**
```yaml
table_name: "codebase"
columns: "org_id, workspace_id, repo_slug, commit_sha, snapshot_jsonb, snapshot_sha256, node_count, edge_count"
primary_key: "org_id, workspace_id, repo_slug, user_id, worktree_id, commit_sha"
data_model: "[[entities/GraphSnapshot]]"
```

**For `queue` sub-type, additionally:**
```yaml
triggers:
  - "[[entities/runPullWorker]]"
worker_kind: "spawned-process"   # spawned-process | daemon | lifecycle-hook
gated_by: "[[entities/HIVEMIND_GRAPH_PULL]]"
```

**For `scheduled-hook` sub-type, additionally:**
```yaml
hook_kind: "interval-tick"        # interval-tick | lifecycle-hook | session-hook
event: "SessionStart"             # for lifecycle/session hooks
interval_source: "[[entities/HIVEMIND_GRAPH_TICK_INTERVAL_MS]]"
triggers:
  - "[[entities/buildSnapshot]]"
```

**For `feature-flag` sub-type, additionally:**
```yaml
flag_kind: "env-toggle"
default_value: "off"
gates: "[[entities/embed-daemon]]"
read_at:
  - file: "src/graph/deeplake-push.ts"
    line: 42
  - file: "src/graph/spawn-pull-worker.ts"
    line: 18
```

**For `exported-symbol` sub-type, additionally:**
```yaml
symbol_kind: "object"             # const | enum | object | factory | singleton
shape_summary: "name, sql"
is_default_export: false
```

### concept

```yaml
complexity: intermediate    # basic | intermediate | advanced
domain: "codebase-graph"
aliases:
  - "extraction flow"
```

### decision (ADR-shaped, filed under library/knowledge/private/architecture/)

```yaml
status: proposed             # proposed | accepted | superseded | deprecated | rejected
adr_number: <pending>        # driver allocates the number in the post-pass
decision_date: 2026-04-15
commit_sha: "abc123"
superseded_by: "[[ADR-9-switch-to-grammar-x]]"   # optional
supersedes:                                       # optional
  - "[[ADR-3-use-ts-morph]]"
```

### comparison

```yaml
subjects:
  - "[[entities/tree-sitter-extractor]]"
  - "[[entities/regex-extractor]]"
dimensions:
  - "accuracy"
  - "multi-language coverage"
  - "maintenance cost"
verdict: "tree-sitter for extraction; regex only for cheap pre-filters."
```

### question

```yaml
question: "Why does the graph tick run on HIVEMIND_GRAPH_TICK_INTERVAL_MS rather than on every save?"
answer_quality: solid       # draft | solid | definitive
```

### meta (contradiction reports, lint reports)

```yaml
report_type: contradiction   # contradiction | lint
date: 2026-04-29
contradiction_count: 3       # for contradiction reports
issue_count: 12              # for lint reports
```

---

## Rules

1. Use flat YAML only. Never nest objects (except `read_at` on `feature-flag` entities, which uses a list of objects - the only allowed exception, since flag call-sites carry both file and line and need to stay together).
2. Dates as `YYYY-MM-DD` strings, not ISO datetime.
3. Lists always use the `- item` format, not inline `[a, b, c]`.
4. Wikilinks in YAML fields must be quoted: `"[[Page Name]]"`.
5. `path` is repo-relative - never absolute.
6. `last_commit_hash` is the delta-tracking key - always include on entity pages.
7. Update `updated` every time you edit the page content.
8. `tags` always includes the type tag (e.g., `entity`, `concept`).
9. `status: stub` means a placeholder for a language with no wired tree-sitter grammar - do not promote until a real extraction has run.

---

## Source

Code-specific fields (`path`, `language`, `depends_on`, `used_by`, `last_commit_hash`, sub-type extensions) map onto the `GraphNode` / `GraphEdge` shape in `src/graph/types.ts` and the Deep Lake column arrays in `src/deeplake-schema.ts`.
