# Example 01 - `document` mode against a TypeScript module (happy path)

A small TS module from Hivemind's codebase graph is being documented for the first time. No prior knowledge-area state. Demonstrates the canonical graph-driver invocation, the six-phase flow with tree-sitter extraction, and the structured response payload.

## Invocation payload (from the graph driver)

```json
{
  "mode": "document",
  "chunk": [
    {
      "path": "src/graph/extract/index.ts",
      "content": "import { extractTypeScript } from './typescript.js';\nimport { extractPython } from './python.js';\nimport type { FileExtraction } from '../types.js';\n\nexport function isPythonPath(relativePath: string): boolean {\n  return /\\.pyi?$/.test(relativePath);\n}\n\nexport function extractFile(sourceCode: string, relativePath: string): FileExtraction {\n  const lower = relativePath.toLowerCase();\n  if (isPythonPath(lower)) return extractPython(sourceCode, relativePath);\n  return extractTypeScript(sourceCode, relativePath);\n}\n"
    },
    {
      "path": "src/graph/types.ts",
      "content": "export type NodeKind = 'function' | 'class' | 'method' | 'interface' | 'type_alias' | 'enum' | 'const' | 'module';\n\nexport interface GraphNode {\n  id: string;\n  label: string;\n  kind: NodeKind;\n  source_file: string;\n  source_location: string;\n  exported: boolean;\n}\n"
    }
  ],
  "git_context": {
    "src/graph/extract/index.ts": {
      "created_commit": "ab1c2d3",
      "created_at": "2025-09-12T14:32:00Z",
      "last_commit": {"sha": "ab1c2d3", "author": "alice", "timestamp": "2025-09-12T14:32:00Z", "message": "feat(graph): switch extraction from ts-morph to tree-sitter"},
      "recent_commits": [{"sha": "ab1c2d3", "message": "feat(graph): switch extraction from ts-morph to tree-sitter", "timestamp": "2025-09-12T14:32:00Z"}],
      "blame_summary": {"top_authors": ["alice (100%)"], "churn_rate": "1 commit/month"}
    },
    "src/graph/types.ts": {
      "created_commit": "ab1c2d3",
      "created_at": "2025-09-12T14:32:00Z",
      "last_commit": {"sha": "ab1c2d3", "author": "alice", "timestamp": "2025-09-12T14:32:00Z", "message": "feat(graph): switch extraction from ts-morph to tree-sitter"},
      "recent_commits": [{"sha": "ab1c2d3", "message": "feat(graph): switch extraction from ts-morph to tree-sitter", "timestamp": "2025-09-12T14:32:00Z"}],
      "blame_summary": {"top_authors": ["alice (100%)"], "churn_rate": "1 commit/month"}
    }
  },
  "prior_state": [],
  "knowledge_root": "/abs/path/to/repo/library/knowledge/private/codebase-graph/",
  "page_caps": {"max_lines_per_page": 300, "target_pages_per_chunk": [8, 15]},
  "callout_vocabulary": ["[!contradiction]", "[!stale]", "[!gap]", "[!key-insight]"]
}
```

## Phase walk-through

**Phase 1 - Parse the chunk:** Both files are `.ts`; tree-sitter (via the typescript grammar) extracts:
- `extractFile` (function, exported) - with `imports` edges to `./typescript.js` and `./python.js`, and `calls` edges to `isPythonPath`, `extractPython`, `extractTypeScript`
- `isPythonPath` (function, exported)
- `extractFile` module node for `src/graph/extract/index.ts`
- `NodeKind` (data-model, type_alias) and `GraphNode` (data-model, interface) in `types.ts`

Plus one concept candidate spans both files: the per-file extraction dispatch flow.

Plus one decision candidate from the commit message `feat(graph): switch extraction from ts-morph to tree-sitter` - Tier 1 (switch-verb pattern `switch ... from ... to ...`). File as a Tier-1 ADR.

**Phase 2 - Cross-reference:** `prior_state` is empty (`mode: document`), so all candidates are `new`. No contradictions.

**Phase 3 - Author entity pages:** Module + function + data-model entity pages written.

**Phase 4 - Author concept pages:** One concept page written.

**Phase 5 - Detect ADRs:** One Tier-1 ADR filed under `library/knowledge/private/architecture/`.

**Phase 6 - Contradiction protocol:** No contradictions to handle (empty `prior_state`).

## Pages written to disk

### `entities/extract-file.md`

```markdown
---
type: entity
title: "extractFile"
entity_type: function
status: developing
created: "2026-04-29"
updated: "2026-04-29"
path: "src/graph/extract/index.ts"
language: ts
depends_on: ["[[entities/is-python-path]]", "[[entities/extract-typescript]]", "[[entities/extract-python]]"]
used_by: []
last_commit_hash: "ab1c2d3"
tested_by: []
tags: [entity, codebase-graph]
related: ["[[concepts/per-file-extraction-flow]]"]
sources: []
---

# extractFile

## Overview
Per-file extractor dispatch. Routes a source file to the language-appropriate tree-sitter extractor so the snapshot builder and cross-file passes stay language-agnostic downstream (`src/graph/extract/index.ts:8-13`).

## Signature
```ts
export function extractFile(sourceCode: string, relativePath: string): FileExtraction
```

## Behavior
- Lower-cases the path, then routes by extension (`src/graph/extract/index.ts:9-12`).
- Python paths dispatch to [[entities/extract-python]] (`src/graph/extract/index.ts:10`).
- Everything else falls through to [[entities/extract-typescript]] (`src/graph/extract/index.ts:12`).
- Returns a `FileExtraction` ([[entities/GraphNode]] is part of that shape).

## Connections
- **depends_on:** [[entities/is-python-path]], [[entities/extract-typescript]], [[entities/extract-python]]
- **related concepts:** [[concepts/per-file-extraction-flow]]

## Tested by
(none detected in chunk)

## History
- **Created:** commit `ab1c2d3` by alice on 2025-09-12
- **Last touched:** commit `ab1c2d3` by alice on 2025-09-12
- **Top contributors:** alice (100%)
- **Churn rate:** 1 commit/month

## Sources
- `src/graph/extract/index.ts` (lines 1-13)
```

### `entities/is-python-path.md`

(similar shape - function entity, used_by `[[entities/extract-file]]`, body documenting the `.py`/`.pyi` regex test)

### `entities/extract-file-module.md`

(module entity for `src/graph/extract/index.ts`, `exports:` listing `extractFile` and `isPythonPath`, `imports:` listing `./typescript.js`, `./python.js`, `../types.js`)

### `entities/node-kind.md`

(data-model entity, `entity_type: data-model`, `schema_library: typescript`, `fields:` listing the eight NodeKind string literals)

### `entities/graph-node.md`

(data-model entity, `entity_type: data-model`, `schema_library: typescript`, `fields:` id/label/kind/source_file/source_location/exported)

### `concepts/per-file-extraction-flow.md`

```markdown
---
type: concept
title: "Per-file extraction flow"
complexity: intermediate
domain: "codebase-graph"
created: "2026-04-29"
updated: "2026-04-29"
status: developing
tags: [concept, codebase-graph]
related: ["[[entities/extract-file]]", "[[entities/is-python-path]]", "[[entities/node-kind]]", "[[entities/graph-node]]"]
sources: []
---

# Per-file extraction flow

## Definition
The codebase graph extracts one file at a time: [[entities/extract-file]] picks a tree-sitter grammar by extension and returns a `FileExtraction` of [[entities/graph-node]] declarations and edges. All extractors emit the same shape so downstream passes are language-agnostic.

## How it works
1. The graph driver hands `extractFile` a source string and a repo-relative path.
2. [[entities/is-python-path]] (and sibling extension checks) route to the matching extractor.
3. The extractor walks the tree-sitter AST, emitting [[entities/graph-node]] nodes keyed by `<source_file>:<symbol>:<kind>` plus `imports`/`calls`/`extends`/`implements`/`method_of` edges.
4. `src/graph/snapshot.ts` aggregates per-file output, sorts it, and hashes the whole graph (`snapshot_sha256`).

## Why it matters
This is the single ingestion path for the codebase graph. Any change to grammar routing or the `FileExtraction` shape has blast radius across every language extractor and the snapshot hash.

## Examples in this codebase
- [[entities/extract-file]] - the dispatch function itself.

## Connections
- **involves entities:** [[entities/extract-file]], [[entities/is-python-path]], [[entities/node-kind]], [[entities/graph-node]]

## Sources
- `src/graph/extract/index.ts` (full file) - dispatch
- `src/graph/types.ts` (full file) - node/edge shape
- commit `ab1c2d3` - tree-sitter extraction introduced
```

### `library/knowledge/private/architecture/ADR-pending-ab1c2d3-switch-to-tree-sitter.md`

```markdown
---
type: decision
title: "Switch graph extraction to tree-sitter"
status: accepted
adr_number: "<pending>"
decision_date: "2025-09-12"
deciders: []
commit_sha: "ab1c2d3"
supersedes: []
superseded_by: ""
related: ["[[entities/extract-file]]", "[[concepts/per-file-extraction-flow]]"]
tags: [adr, decision, codebase-graph]
---

# ADR <n>: Switch graph extraction to tree-sitter

## Status
Accepted - 2025-09-12

## Context
The codebase graph needed multi-language extraction. Commit `ab1c2d3` switches the extractor engine (Tier-1 ADR signal: subject contains "switch ... from ... to ...").

## Decision
We will extract with tree-sitter (grammars for c/cpp/go/java/js/python/ruby/rust/ts) instead of a single-language parser. Each extractor emits the same `FileExtraction` shape via [[entities/extract-file]].

## Consequences
- **Positive:** Nine languages covered with one node/edge model. Deterministic, body-stripped signatures keep snapshots cheap to diff.
- **Negative:** tree-sitter 0.21 requires chunked parsing for files over ~32 KB (handled in the extractor).
- **Affected entities:** [[entities/extract-file]], [[entities/extract-typescript]], [[entities/node-kind]], [[entities/graph-node]]

## Sources
- Commit `ab1c2d3` by alice on 2025-09-12
- Message: "feat(graph): switch extraction from ts-morph to tree-sitter"
```

(The graph driver allocates `<pending>` -> the next ADR number in the post-pass and renames the file to `ADR-<n>-switch-to-tree-sitter.md`.)

## Response payload to the graph driver

```json
{
  "pages_created": [
    "entities/extract-file.md",
    "entities/is-python-path.md",
    "entities/extract-file-module.md",
    "entities/node-kind.md",
    "entities/graph-node.md",
    "concepts/per-file-extraction-flow.md",
    "library/knowledge/private/architecture/ADR-pending-ab1c2d3-switch-to-tree-sitter.md"
  ],
  "pages_updated": [],
  "decisions_filed": ["library/knowledge/private/architecture/ADR-pending-ab1c2d3-switch-to-tree-sitter.md"],
  "contradictions_flagged": [],
  "meta_reports_written": [],
  "notification_flags": [],
  "entities_detected": [
    {"name": "extractFile", "type": "function", "file": "src/graph/extract/index.ts", "line": 8},
    {"name": "isPythonPath", "type": "function", "file": "src/graph/extract/index.ts", "line": 4},
    {"name": "NodeKind", "type": "data-model", "file": "src/graph/types.ts", "line": 1},
    {"name": "GraphNode", "type": "data-model", "file": "src/graph/types.ts", "line": 3}
  ],
  "gaps": [
    {"entity": "extractPython", "referenced_in": "src/graph/extract/index.ts:10", "reason": "definition not in chunk"}
  ],
  "lint_findings": [],
  "partial_scan": false
}
```

The graph driver consumes this and:

1. Updates `index.md` with 7 new pages.
2. Updates `entities/_index.md`, `concepts/_index.md`, and the ADR index under `library/knowledge/private/architecture/`.
3. Appends 7 entries to `log.md`.
4. Refreshes `hot.md` with "graph extraction module ingested 2026-04-29".
5. Allocates the next ADR number for the pending ADR and renames the file.
6. Updates `.hivemind/file-hashes.json` with new entries for the two source files.
7. Files the `gaps[0]` entry as `questions/where-is-extract-python-defined.md` for human follow-up on a future scan.

## Page count check

7 pages = below the 8-15 target. Within tolerance for a small two-file chunk. The 8-15 target assumes a richer chunk (a full module or a feature-area sweep). For tiny chunks like this happy-path example, 4-8 is normal.
