# Example 02 - `update` mode with a contract change (active contradiction protocol)

The `extractDeclarations` helper from `src/graph/extract/typescript.ts` had its contract changed: a later commit made it return a `FileExtraction` instead of mutating an out-parameter. Demonstrates Phase 6 active contradiction protocol - all four artifacts produced.

## Invocation payload (from the graph driver)

```json
{
  "mode": "update",
  "chunk": [
    {
      "path": "src/graph/extract/typescript.ts",
      "content": "// ... earlier in the file ...\nexport function extractDeclarations(root: TSNode, relativePath: string): FileExtraction {\n  const result = emptyExtraction(relativePath);\n  walk(root, result);\n  return result;\n}\n"
    }
  ],
  "git_context": {
    "src/graph/extract/typescript.ts": {
      "created_commit": "ab1c2d3",
      "created_at": "2025-09-12T14:32:00Z",
      "last_commit": {
        "sha": "fe9d8c7",
        "author": "bob",
        "timestamp": "2026-04-15T10:22:00Z",
        "message": "graph: extractDeclarations returns FileExtraction (rather than mutating an out-param)"
      },
      "recent_commits": [
        {"sha": "fe9d8c7", "message": "graph: extractDeclarations returns FileExtraction (rather than mutating an out-param)", "timestamp": "2026-04-15T10:22:00Z"},
        {"sha": "ab1c2d3", "message": "feat(graph): switch extraction from ts-morph to tree-sitter", "timestamp": "2025-09-12T14:32:00Z"}
      ],
      "blame_summary": {"top_authors": ["alice (62%)", "bob (38%)"], "churn_rate": "1.2 commits/month"}
    }
  },
  "prior_state": [
    {
      "path": "entities/extract-declarations.md",
      "frontmatter": {
        "type": "entity",
        "entity_type": "function",
        "status": "developing",
        "path": "src/graph/extract/typescript.ts",
        "language": "ts",
        "depends_on": ["[[entities/walk]]", "[[entities/empty-extraction]]"],
        "used_by": ["[[entities/extract-typescript]]"],
        "last_commit_hash": "ab1c2d3"
      }
    }
  ],
  "knowledge_root": "/abs/path/to/repo/library/knowledge/private/codebase-graph/",
  "page_caps": {"max_lines_per_page": 300, "target_pages_per_chunk": [8, 15]},
  "callout_vocabulary": ["[!contradiction]", "[!stale]", "[!gap]", "[!key-insight]"]
}
```

## Phase walk-through

**Phase 1 - Parse:** tree-sitter extracts the updated `extractDeclarations` node. Its `signature` field now reads `function extractDeclarations(root: TSNode, relativePath: string): FileExtraction`.

**Phase 2 - Cross-reference:** `extractDeclarations` exists in `prior_state`. Compare signatures:
- Prior (from prior page): `function extractDeclarations(root, relativePath, result): void` (mutated an out-param).
- New (from current chunk's tree-sitter `signature`): `function extractDeclarations(root, relativePath): FileExtraction`.

Contract change detected (parameter list and return type both moved). Mark `extract-declarations` as `contradiction`.

**Phase 3 - Author updated entity page:** Write the new `entities/extract-declarations.md` with the `[!contradiction]` callout.

**Phase 5 - ADR detection:** Commit message `graph: extractDeclarations returns FileExtraction (rather than mutating an out-param)` matches Tier 2 (tradeoff phrase "rather than mutating") - file as a `questions/` page asking whether this should be promoted to an ADR.

**Phase 6 - Active contradiction protocol:** All four artifacts.

## Artifact 1 - `[!stale]` callout appended to PRIOR `entities/extract-declarations.md`

The agent does NOT delete the prior page content. It appends:

```markdown
> [!stale]
> Behavior changed in commit `fe9d8c7` (2026-04-15) - see [[entities/extract-declarations]] (current version).
> Reason: signature changed from `(root, relativePath, result): void` to `(root, relativePath): FileExtraction`. The function now returns a fresh extraction instead of mutating a caller-supplied out-param.
```

(Since both pages share the same filename, the [[wikilink]] above resolves to the SAME page after the update - Cursor preview shows both the prior and the new content in one file with the contradiction callout at the top.)

## Artifact 2 - Updated `entities/extract-declarations.md` with `[!contradiction]` callout

```markdown
---
type: entity
title: "extractDeclarations"
entity_type: function
status: developing
created: "2026-04-29"
updated: "2026-04-29"
path: "src/graph/extract/typescript.ts"
language: ts
depends_on: ["[[entities/walk]]", "[[entities/empty-extraction]]"]
used_by: ["[[entities/extract-typescript]]"]
last_commit_hash: "fe9d8c7"
tested_by: []
tags: [entity, codebase-graph]
related: ["[[concepts/per-file-extraction-flow]]"]
sources: []
---

# extractDeclarations

> [!contradiction]
> Supersedes prior version at commit `ab1c2d3` (2025-09-12).
> Prior contract: `(root, relativePath, result): void` (mutated an out-param). New contract: `(root, relativePath): FileExtraction` (returns a fresh extraction).
> Callers must now use the return value instead of passing a `result` accumulator. See [[questions/should-callers-of-extract-declarations-use-the-return]].

## Overview
Walks the tree-sitter declaration subtree and returns a `FileExtraction` of [[entities/graph-node]] declarations (`src/graph/extract/typescript.ts`).

## Signature
```ts
export function extractDeclarations(root: TSNode, relativePath: string): FileExtraction
```

## Behavior
- Builds a fresh `FileExtraction` for the file (`emptyExtraction`).
- Walks the AST via [[entities/walk]], collecting declaration nodes and edges.
- Returns the populated extraction - no caller-supplied out-param.

## Connections
- **depends_on:** [[entities/walk]], [[entities/empty-extraction]]
- **used_by:** [[entities/extract-typescript]] - note: caller must be updated to consume the return value.
- **related concepts:** [[concepts/per-file-extraction-flow]]

## History
- **Created:** commit `ab1c2d3` by alice on 2025-09-12
- **Last touched:** commit `fe9d8c7` by bob on 2026-04-15 - signature changed (see `[!contradiction]` callout above)
- **Top contributors:** alice (62%), bob (38%)
- **Churn rate:** 1.2 commits/month

## Sources
- `src/graph/extract/typescript.ts`
```

## Artifact 3 - entry in `meta/2026-04-29-contradiction-report.md`

If the file doesn't exist for today, create from [`templates/contradiction-report.md`](../templates/contradiction-report.md). Append:

```markdown
---
type: meta
report_type: contradiction
date: "2026-04-29"
created: "2026-04-29"
updated: "2026-04-29"
contradiction_count: 1
tags: [meta, contradiction-report]
---

# Contradiction Report - 2026-04-29

---

## 11:14 - fe9d8c7 - extractDeclarations

- **Old page:** [[entities/extract-declarations]] (prior version, commit `ab1c2d3`)
- **New page:** [[entities/extract-declarations]] (current version, commit `fe9d8c7`)
- **Reason:** signature changed from `(root, relativePath, result): void` to `(root, relativePath): FileExtraction` - returns a fresh extraction instead of mutating an out-param
- **Commit:** `fe9d8c7` - "graph: extractDeclarations returns FileExtraction (rather than mutating an out-param)" - bob
- **Severity:** warning
- **Resolution suggestion:** [[questions/should-callers-of-extract-declarations-use-the-return]]
```

## Artifact 4 - `notification_flag` in the response payload

```json
{
  "notification_flags": [
    {
      "severity": "warning",
      "title": "Contract change detected in extractDeclarations",
      "page": "entities/extract-declarations.md",
      "report": "meta/2026-04-29-contradiction-report.md"
    }
  ]
}
```

The graph driver renders this via Hivemind's notifications path (`src/notifications/`) as a Cursor notification.

## Full response payload

```json
{
  "pages_created": [
    "questions/should-callers-of-extract-declarations-use-the-return.md",
    "questions/was-fe9d8c7-an-architectural-decision.md",
    "meta/2026-04-29-contradiction-report.md"
  ],
  "pages_updated": ["entities/extract-declarations.md"],
  "decisions_filed": [],
  "contradictions_flagged": [
    {
      "old": "entities/extract-declarations.md",
      "new": "entities/extract-declarations.md",
      "reason": "signature changed from (root, relativePath, result): void to (root, relativePath): FileExtraction",
      "commit": "fe9d8c7"
    }
  ],
  "meta_reports_written": ["meta/2026-04-29-contradiction-report.md"],
  "notification_flags": [
    {
      "severity": "warning",
      "title": "Contract change detected in extractDeclarations",
      "page": "entities/extract-declarations.md",
      "report": "meta/2026-04-29-contradiction-report.md"
    }
  ],
  "entities_detected": [
    {"name": "extractDeclarations", "type": "function", "file": "src/graph/extract/typescript.ts", "line": 192}
  ],
  "gaps": [],
  "lint_findings": [],
  "partial_scan": false
}
```

## What the graph driver does

1. Reconciles `index.md` (no new entries - `extract-declarations.md` was an update, not new).
2. Appends one entry to `log.md`: `## [2026-04-29] update | extractDeclarations - contract change`.
3. Updates `.hivemind/file-hashes.json` with the new hash for `src/graph/extract/typescript.ts`.
4. Renders the `notification_flag` via `src/notifications/`.
5. The user clicks the notification -> opens `entities/extract-declarations.md` and sees the contradiction callout at top, with a link to the meta report and the open question.

## What's intentionally NOT done

- The prior version's frontmatter and body are NOT deleted - the contradiction is part of the audit trail.
- The change is NOT silently overwritten - that would defeat the entire knowledge layer's value.
- `[[entities/extract-typescript]].depends_on` is NOT auto-updated to flag the breaking change for the caller - that's a Phase-6 cross-cutting concern lint mode catches separately.
