# Guide 00 - Principles

The non-negotiables for wiki-worker-bee. Read this before any other guide. Treat each rule as a hard constraint - every one exists because breaking it caused observed harm in real graph-ingestion runs.

## The 15 directives

### 1. Never touch global state files

The knowledge area's `index.md`, `<type>/_index.md`, `log.md`, `hot.md`, and `.hivemind/file-hashes.json` are owned exclusively by Hivemind's graph driver (`src/graph/`). wiki-worker-bee writes per-page content only. The driver reconciles global state in a post-pass after all parallel agents finish.

**Why:** Race conditions and lost writes when N agents run concurrently. See [`references/parallel-subagent-contract.md`](../references/parallel-subagent-contract.md) for the full "Do NOT" list.

### 2. Active contradiction protocol is mandatory

When Phase 2 detects a contract change, ALL FOUR artifacts every time: `[!stale]` callout on prior page + `[!contradiction]` callout on new page + entry in `meta/<YYYY-MM-DD>-contradiction-report.md` + `notification_flag` in the response payload. Incomplete handling is a bug.

**Why:** The audit trail is the single most valuable property the knowledge area provides. See [`guides/06-contradiction-protocol.md`](06-contradiction-protocol.md) and [`references/contradiction-protocol.md`](../references/contradiction-protocol.md).

### 3. Never fabricate an ADR

Only file ADR pages (`library/knowledge/private/architecture/ADR-<n>-<slug>.md`) when commit message language clearly encodes a decision (high-confidence pattern matches). When confidence is below threshold, file a `questions/` page asking a human to confirm - never guess.

**Why:** Fabricated ADRs corrupt the design history. The knowledge area must be trustworthy.

### 4. Never exceed 300 lines per page

If a page would exceed 300 lines, split into atomic sub-pages and link from a parent.

**Why:** Bloated pages defeat the compounding-graph design - the agent loses the ability to load just the relevant entity.

### 5. Never fabricate relationships

Every `depends_on` / `used_by` / `related` wikilink must be supported by evidence in the chunk: a tree-sitter `imports` / `calls` / `extends` / `implements` edge, a type reference, a clear commit-message statement.

**Why:** Hallucinated cross-references are worse than missing ones - they actively mislead.

### 6. Always cite source `file:line` for factual claims

Every assertion in an entity body must be traceable to a specific line in the source.

**Why:** Reports without coordinates are not evidence.

### 7. Always use repo-relative paths

Wikilinks and `path` frontmatter are relative to the repo root, never absolute.

**Why:** Absolute paths break the moment the repo is cloned elsewhere.

### 8. Always include `last_commit_hash` in frontmatter on entity pages

Delta-tracking key - the graph driver uses it to know whether to re-scan an entity on the next pass.

**Why:** Without it, every Update scan would re-read every page from scratch.

### 9. Never author PRDs, QA reports, or module narratives

Owned by `library-worker-bee` and `quality-worker-bee`. wiki-worker-bee's scope is atomic entities + the cross-reference web only.

### 10. Never write to source code

Read-only against the codebase. The knowledge area is a derivative artifact; the code is the source of truth.

### 11. Never invent git facts

All git context comes from the graph driver's pre-computed payload (canonical path) or self-fetched via the user's `git` binary (escape-hatch path). Never hallucinate commit hashes, authors, or dates.

### 12. Always emit the structured response payload

The graph driver's reconciliation pass depends on it. A scan that completes without a payload is a bug.

### 13. When invoked via `@`-mention, always confirm scope before writing

Direct invocation skips the graph driver's chunk planning. Echo back the inferred chunk and ask the user to confirm before any disk writes.

### 14. When invoked via `@`-mention, always flag `partial_scan: true` in the response

Direct invocation produces partial state; the graph driver must run a reconciliation pass to bring `index.md`, `log.md`, `hot.md`, and the hash manifest current.

### 15. Unsupported-language files get stub pages, not silence

When the chunk includes a file in a language with no wired tree-sitter grammar (anything outside c/cpp/go/java/js/python/ruby/rust/ts), write a filename-only stub at `entities/<basename>.md` with `language: <detected>` and `status: stub` so a future grammar addition can find and upgrade it later.

---

## The principles map to the agent

These 15 directives are the critical-directives contract for wiki-worker-bee, reorganized for guide use. If the agent file and this guide ever diverge, treat it as a defect - write a `questions/` page asking wh