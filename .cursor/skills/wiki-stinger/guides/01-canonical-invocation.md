# Guide 01 - Canonical Invocation (Graph Driver)

The canonical path for wiki-worker-bee invocation is Hivemind's graph driver (`src/graph/`). The driver does the heavy lifting (chunk planning, file walking via tree-sitter extraction, hash diff, git pre-computation) and hands wiki-worker-bee a structured payload to act on.

## The invocation payload

The driver MUST send all of the following keys. wiki-worker-bee SHOULD validate before proceeding and return an error if any required key is missing.

```json
{
  "mode": "document | update | scan-directory | lint",
  "chunk": [
    { "path": "src/auth/middleware.ts", "content": "<full source>" },
    { "path": "src/auth/session.ts", "content": "<full source>" }
  ],
  "git_context": {
    "src/auth/middleware.ts": {
      "created_commit": "{sha}",
      "created_at": "2025-09-12T14:32:00Z",
      "last_commit": {
        "sha": "abc123",
        "author": "alice",
        "timestamp": "2026-04-15T10:22:00Z",
        "message": "auth: nullable user"
      },
      "recent_commits": [{"sha": "...", "message": "...", "timestamp": "..."}],
      "blame_summary": {
        "top_authors": ["alice (62%)", "bob (38%)"],
        "churn_rate": "2.3 commits/month"
      }
    }
  },
  "prior_state": [
    { "path": "entities/extract-typescript.md", "frontmatter": {"...": "..."} }
  ],
  "knowledge_root": "/abs/path/to/repo/library/knowledge/private/codebase-graph/",
  "page_caps": { "max_lines_per_page": 300, "target_pages_per_chunk": [8, 15] },
  "callout_vocabulary": ["[!contradiction]", "[!stale]", "[!gap]", "[!key-insight]"]
}
```

## Field semantics

- `mode` - one of four (see [`README.md`](../README.md) mode table). Drives Phase dispatch.
- `chunk` - list of files. Each has `path` (repo-relative) and `content` (full source). Driver-decided boundary.
- `git_context` - keyed by file path. Pre-computed by the driver. wiki-worker-bee does NOT shell out to git in the canonical path.
- `prior_state` - list of existing knowledge-area pages relevant to this chunk. Empty for `mode: document`. Used in Phase 2 cross-reference.
- `knowledge_root` - absolute path to the codebase-graph knowledge area. All writes are relative to this root (except ADRs, which land in `library/knowledge/private/architecture/`).
- `page_caps` - soft target for page count, hard cap on lines per page (300).
- `callout_vocabulary` - the only allowed semantic callouts. Anything else is a frontmatter/format violation.

## Validation

Before Phase 1, validate the payload:

1. `mode` ∈ {document, update, scan-directory, lint}.
2. `chunk` non-empty array.
3. Every `chunk[i]` has both `path` and `content`.
4. `git_context` has an entry for every `chunk[i].path`.
5. For `mode: update`, `prior_state` is non-empty (otherwise driver should have used `document`).
6. `knowledge_root` exists and is writable.

If any check fails: emit a structured error response per [`guides/10-response-payload.md`](10-response-payload.md) and STOP. Do not partial-scan.

## Phase dispatch

- `mode: document | update | scan-directory` -> run Phases 1-6 per [`guides/03-the-six-phases.md`](03-the-six-phases.md).
- `mode: lint` -> skip the six phases; run lint procedure per [`guides/09-lint-mode.md`](09-lint-mode.md).

## Concurrency

Multiple wiki-worker-bee invocations may run in parallel against different chunks. Each invocation is a sub-agent against global knowledge-area state - see [`references/parallel-subagent-contract.md`](../references/parallel-subagent-contract.md) for the