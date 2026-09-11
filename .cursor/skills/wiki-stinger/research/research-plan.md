# Research Plan - wiki-stinger (2026-04-29)

This skill is retargeted to Hivemind (`@deeplake/hivemind`): a TS/Node/ESM codebase whose codebase graph is built with tree-sitter (`src/graph/`). Extraction uses tree-sitter, NOT ts-morph. Output pages land in `library/knowledge/` per the schema-v2 convention. The research notes below are the audit trail for the guides.

## Authoritative sources (read the repo, no web search needed)

| Topic | Source in repo | Drives which guide |
|---|---|---|
| tree-sitter extraction engine | `src/graph/extract/typescript.ts`, `src/graph/extract/index.ts` | `guides/04-entity-extraction-by-type.md` (function, class, module, data-model, exported-symbol) |
| node/edge model | `src/graph/types.ts` (`GraphNode`, `GraphEdge`, `NodeKind`, `EdgeRelation`, `FileExtraction`) | `guides/04`, `references/frontmatter-schema.md` |
| Deep Lake tables | `src/deeplake-schema.ts` (`CODEBASE_COLUMNS` etc.) | `guides/04` (deeplake-table) |
| MCP tools | `src/mcp/server.ts` (`hivemind_search`, `hivemind_read`, `hivemind_index`) | `guides/04` (mcp-tool) |
| env vars / feature flags | `HIVEMIND_*` reads across `src/` | `guides/04` (env-var, config-key, feature-flag) |
| workers / scheduled hooks | `src/graph/spawn-pull-worker.ts`, `src/hooks/`, `HIVEMIND_GRAPH_TICK_INTERVAL_MS` | `guides/04` (queue, scheduled-hook) |
| snapshot / drift signal | `src/graph/snapshot.ts` (`snapshot_jsonb`, `snapshot_sha256`) | `guides/06-contradiction-protocol.md` |

## Web-search notes retained (provider-agnostic)

These notes survive the retarget because they are about format and process, not external runtime tech:

| Note | Drives which guide |
|---|---|
| `2026-04-29-tree-sitter-extraction.md` | `guides/04` (extraction engine) |
| `2026-04-29-adr-format.md` | `guides/07-adr-detection.md`, `templates/decision.md` |
| `2026-04-29-conventional-commits-decisions.md` | `guides/07-adr-detection.md` (Tier-1/Tier-2 catalog) |
| `2026-04-29-frontmatter-validation.md` | `references/frontmatter-schema.md` |
| `2026-04-29-wikilink-resolution.md` | `guides/09-lint-mode.md` (dead-link checks) |
| `2026-04-29-git-blame-heuristics.md` | `guides/04` (History sections) |

## Notes deleted in the retarget (external runtime tech, not in this repo)

These were research for the original generic-stack version and no longer apply to Hivemind:

- `2026-04-29-ts-morph-extraction.md` -> replaced by `2026-04-29-tree-sitter-extraction.md`.
- `2026-04-29-react-docgen-typescript.md` -> no React UI; the `exported-symbol` sub-type replaces `react-component`.
- `2026-04-29-sql-ddl-parsing.md` -> no SQL DDL; the `deeplake-table` sub-type reads `src/deeplake-schema.ts`.
- `2026-04-29-bullmq-queue-extraction.md`, `2026-04-29-inngest-extraction.md` -> no BullMQ/Inngest; the `queue` sub-type covers spawned workers and daemons.
- `2026-04-29-cron-parser-ts.md` -> no cron framework; the `scheduled-hook` sub-type covers interval ticks and lifecycle hooks.
- `2026-04-29-openfeature-flags.md`, `2026-04-29-launchdarkly-extraction.md` -> no flag SDK; the `feature-flag` sub-type covers boolean `HIVEMIND_*` env toggles.

## Open questions resolved in the retarget

- Extraction engine: tree-sitter (`src/graph/extract/*`), not ts-morph. Locked.
- Output location: `library/knowledge/private/codebase-graph/{entities,concepts,comparisons,questions,meta}/`; ADRs at `library/knowledge/private/architecture/ADR-<n>-<slug>.md`. Per schema-v2.
- ADR number allocation: graph driver, in the post-pass (parallel-safe).
- Stub pages: for languages with no wired tree-sitter grammar (outside c/cpp/go/java/js/python/ruby/rust/ts). Basename-only filename, `source_extension` in frontmatter.

## Research note format (per note)

```markdown
---
title: <topic>
date: 2026-04-29
sources:
  - <repo path or url>
---

# <Topic>

## Summary
[3-5 sentences distilling what wiki-worker-bee needs to know to apply this in production.]

## Key facts
- ...

## Recommended approach for wiki-worker-bee
[Concrete, opinionated. Name the source file, name the node/edge surface, name the gotchas.]

## Sources
- ...

## Open questions / gaps
- ...
```

The synthesis at `2026-04-29-synthesis.md` maps each note to the guide it informs.
