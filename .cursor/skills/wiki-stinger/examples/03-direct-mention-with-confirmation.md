# Example 03 - Direct `@`-mention with scope confirmation (escape hatch)

A Cursor user is reading code in `src/mcp/server.ts` and `@`-mentions wiki-worker-bee to extract entities for that file. Demonstrates the direct-invocation flow per [`guides/02-direct-invocation.md`](../guides/02-direct-invocation.md): self-discover the chunk, confirm scope before writing, fetch git context (driver-or-direct), respond with `partial_scan: true`.

## User prompt (in Cursor chat)

> @wiki-worker-bee extract entities for the file I'm looking at

## Step 1 - Self-discover the chunk

Cursor's editor state shows `src/mcp/server.ts` is the active file. wiki-worker-bee infers:

- chunk: `[{path: "src/mcp/server.ts", content: "<full source>"}]`
- mode: `update` if a prior page exists for this file; otherwise `document`. Check the codebase-graph knowledge area's `entities/` for `mcp-server.md` - assume not present, so mode is `document`.

## Step 2 - Confirmation message (NO writes yet)

wiki-worker-bee responds in Cursor chat:

```
I'll extract entities from this scope:

- src/mcp/server.ts (full file, 180 lines)

Mode: document (no prior page exists for this file).
Git context: I'll request from the graph driver via .hivemind/queue/ if it's running, otherwise shell to git directly.
Output location: library/knowledge/private/codebase-graph/{entities,concepts,questions}/ (ADRs go to library/knowledge/private/architecture/)

This will be a partial scan - index.md and log.md won't update until the next Document or Update run.

Confirm? (yes / no / refine scope)
```

User responds: `yes`

## Step 3 - Fetch git context

wiki-worker-bee writes to `.hivemind/queue/git-context-request-1745930400.json`:

```json
{
  "request_id": "git-context-1745930400",
  "files": ["src/mcp/server.ts"]
}
```

Wait up to 2 seconds for `.hivemind/queue/git-context-response-1745930400.json` to appear.

**Case A - driver responds:** read the response file, get pre-computed git context. Proceed to Phase 1.

**Case B - driver doesn't respond:** shell out to git directly:

```bash
git log --format='%H|%an|%aI|%s' -- src/mcp/server.ts | head -10
git log --format='%H|%aI|%s' --diff-filter=A -- src/mcp/server.ts | tail -1
git blame --line-porcelain src/mcp/server.ts | grep '^author ' | sort | uniq -c | sort -rn | head -3
```

Parse outputs into the `git_context` shape. Proceed to Phase 1.

## Step 4 - Run Phases 1-6

Same as canonical invocation - tree-sitter parses the MCP server module. Suppose this file produces:

- 1 `module` entity (`src/mcp/server.ts`)
- 3 `mcp-tool` entities (`hivemind_search`, `hivemind_read`, `hivemind_index`)
- 3 `function` entities (the handlers: `handleSearch`, `handleRead`, `handleIndex`)
- 1 `data-model` entity (the search input schema)
- 1 `concept` entity (the MCP tool-registration pattern)

Each `mcp-tool` links to its handler via `handler:`; each handler's `used_by:` includes the tool.

## Step 5 - Response payload (with `partial_scan: true`)

```json
{
  "pages_created": [
    "entities/mcp-server.md",
    "entities/hivemind-search.md",
    "entities/hivemind-read.md",
    "entities/hivemind-index.md",
    "entities/handle-search.md",
    "entities/handle-read.md",
    "entities/handle-index.md",
    "entities/search-input-schema.md",
    "concepts/mcp-tool-registration.md"
  ],
  "pages_updated": [],
  "decisions_filed": [],
  "contradictions_flagged": [],
  "meta_reports_written": [],
  "notification_flags": [
    {
      "severity": "info",
      "title": "Partial scan completed via @-mention - driver reconciliation pending",
      "page": "entities/mcp-server.md"
    }
  ],
  "entities_detected": [
    {"name": "hivemind_search", "type": "mcp-tool", "file": "src/mcp/server.ts", "line": 66},
    {"name": "hivemind_read", "type": "mcp-tool", "file": "src/mcp/server.ts", "line": 112},
    {"name": "hivemind_index", "type": "mcp-tool", "file": "src/mcp/server.ts", "line": 146},
    {"name": "handleSearch", "type": "function", "file": "src/mcp/server.ts", "line": 70},
    {"name": "handleRead", "type": "function", "file": "src/mcp/server.ts", "line": 116},
    {"name": "handleIndex", "type": "function", "file": "src/mcp/server.ts", "line": 150}
  ],
  "gaps": [
    {"entity": "McpServer", "referenced_in": "src/mcp/server.ts:1", "reason": "external library import - not in chunk; not extractable"}
  ],
  "lint_findings": [],
  "partial_scan": true
}
```

## Step 6 - Cursor chat reply

wiki-worker-bee summarizes for the user:

```
Done. 9 pages written under library/knowledge/private/codebase-graph/:

- entities/mcp-server.md
- entities/hivemind-search.md, hivemind-read.md, hivemind-index.md (mcp-tool)
- entities/handle-search.md, handle-read.md, handle-index.md (handlers)
- entities/search-input-schema.md (data-model)
- concepts/mcp-tool-registration.md

This was a partial scan - index.md, log.md, hot.md, and the hash manifest will update on the next Document or Update run (or whenever the driver next reconciles .hivemind/queue/).

Open questions: none. Gaps: 1 (external library `McpServer` - expected, not extractable).
```

## What the graph driver does on the next reconciliation pass

1. Sees the `partial_scan: true` queued response and runs reconciliation:
2. Updates `index.md` with 9 new pages.
3. Updates `entities/_index.md` and `concepts/_index.md`.
4. Appends 9 entries to `log.md` with a `[partial-scan]` tag noting the source.
5. Refreshes `hot.md` with "MCP server tools ingested via @-mention 2026-04-29".
6. Updates `.hivemind/file-hashes.json`.
7. Surfaces a "1 partial scan reconciled" notification so the user knows the knowledge area is fully consistent again.

## When direct invocation is the right tool

This example shows the right use case: user is reading code, has a single file in focus, wants to extend the knowledge area on the spot without leaving Cursor. No bulk scan, no global state changes - just one chunk, one set of pages.

For ANY of the following, let the graph driver run a Document/Update pass instead:
- More than ~10 files at once.
- Cross-cutting work (lint, full-repo audit, all-modules sweep).
- Anything that should leave the knowledge area fully reconciled when done.
