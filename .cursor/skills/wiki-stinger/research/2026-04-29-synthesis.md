---
title: Wiki-stinger research synthesis (retargeted to Hivemind + tree-sitter)
date: 2026-04-29
sources:
  - 2026-04-29-tree-sitter-extraction.md
  - 2026-04-29-adr-format.md
  - 2026-04-29-conventional-commits-decisions.md
  - 2026-04-29-frontmatter-validation.md
  - 2026-04-29-wikilink-resolution.md
  - 2026-04-29-git-blame-heuristics.md
---

# Wiki-stinger research synthesis

This skill is retargeted to Hivemind (`@deeplake/hivemind`). Extraction is tree-sitter (`src/graph/extract/*`), not ts-morph. Output is `library/knowledge/` (schema-v2). The 13-type catalog reflects a TS/Node/Deep Lake/MCP codebase.

## Mapping: research -> downstream guides

### `guides/04-entity-extraction-by-type.md`

| Sub-type | Primary research note | Secondary |
|---|---|---|
| `function` | `2026-04-29-tree-sitter-extraction.md` | - |
| `class` | `2026-04-29-tree-sitter-extraction.md` | - |
| `module` | `2026-04-29-tree-sitter-extraction.md` (synthetic module node + `imports` edges) | - |
| `service` | `2026-04-29-tree-sitter-extraction.md` | heuristic: file in `services/` or a long-lived stateful module (API client, daemon) |
| `mcp-tool` | `src/mcp/server.ts` (tool registration: `hivemind_search`, `hivemind_read`, `hivemind_index`) | - |
| `env-var` | AST scan for `process.env.HIVEMIND_*` | - |
| `config-key` | AST scan for `src/config.ts` / `src/user-config.ts` accessors | - |
| `data-model` | `2026-04-29-tree-sitter-extraction.md` (interface/type_alias/Zod) | `src/graph/types.ts` shapes |
| `exported-symbol` | `2026-04-29-tree-sitter-extraction.md` (exported const/enum/object) | - |
| `deeplake-table` | `src/deeplake-schema.ts` (`*_COLUMNS` arrays) | backing `HIVEMIND_*_TABLE` env vars |
| `queue` | spawned workers / daemons (`src/graph/spawn-pull-worker.ts`, `HIVEMIND_EMBED_DAEMON`) | - |
| `scheduled-hook` | interval ticks (`HIVEMIND_GRAPH_TICK_INTERVAL_MS`) + `src/hooks/` lifecycle hooks | - |
| `feature-flag` | boolean `HIVEMIND_*` env toggles (`HIVEMIND_GRAPH_PUSH`, `HIVEMIND_CAPTURE`, etc.) | - |

History sections in every entity body informed by `2026-04-29-git-blame-heuristics.md`.

### `guides/07-adr-detection.md`

- Pattern catalog & confidence threshold: `2026-04-29-conventional-commits-decisions.md` (Tier 1 / Tier 2 regex set).
- ADR document shape: `2026-04-29-adr-format.md` (Nygard 5-section template), filed at `library/knowledge/private/architecture/ADR-<n>-<slug>.md`.
- ADR status transitions (proposed -> accepted -> superseded): `2026-04-29-adr-format.md`.

### `guides/09-lint-mode.md`

- Wikilink resolution algorithm for dead-link detection: `2026-04-29-wikilink-resolution.md`.
- Frontmatter validation rules: `2026-04-29-frontmatter-validation.md`.
- ADR-specific lint (superseded_by chain integrity): `2026-04-29-adr-format.md` + `2026-04-29-conventional-commits-decisions.md` (revert-pattern detection).

### `references/frontmatter-schema.md`

- Schema definitions, Zod patterns, YAML gotchas: `2026-04-29-frontmatter-validation.md`.
- `last_commit_hash` field semantics: `2026-04-29-git-blame-heuristics.md`.
- Per-type frontmatter fields map onto `GraphNode`/`GraphEdge` in `src/graph/types.ts` and the column arrays in `src/deeplake-schema.ts`.

## Recommended implementation per entity type

| Entity type | Detection heuristic | Extraction surface | Notes |
|---|---|---|---|
| `function` | tree-sitter `kind: "function"` (+ arrow/function-valued `const`) | `GraphNode.signature`, outgoing `calls` edges | The extractor already captures `const f = () => {}`. |
| `class` | tree-sitter `kind: "class"` | `method_of`, `extends`, `implements` edges | A `services/` location hints at promotion to `service`. |
| `module` | synthetic per-file module node | outgoing `imports` edges; `exported` declarations | Narrative prose is library-worker-bee's job. |
| `service` | long-lived stateful module / `services/` dir | tree-sitter class/module + edges | Pair with `mcp-tool`, `env-var`, `deeplake-table`. |
| `mcp-tool` | tool registration in `src/mcp/server.ts` | registration call + config object + handler fn | Tool name is the harness-adapter contract. |
| `env-var` | `process.env.HIVEMIND_*` member-expressions | aggregate by name, record `read_at` sites | Group by subsystem (`HIVEMIND_GRAPH_*`, `HIVEMIND_EMBED_*`). |
| `config-key` | `src/config.ts` / `src/user-config.ts` accessors | call/member-expression walk | Distinguish from raw env-var; link via `related:`. |
| `data-model` | `interface` / `type_alias` / `z.object` | tree-sitter node `signature` | Cross-link to `deeplake-table` when shapes match. |
| `exported-symbol` | exported `const`/`enum`/object of independent significance | node `signature` + incoming edges | One shape table, not per-member pages. |
| `deeplake-table` | `*_COLUMNS` arrays in `src/deeplake-schema.ts` | column `{name, sql}` entries + `USING deeplake` | `codebase` stores the graph snapshot; note lazy schema healing. |
| `queue` | spawned worker / env-gated daemon | spawn call + entrypoint module | Handler is a separate `function`/`module` entity; pair via `triggers:`. |
| `scheduled-hook` | interval tick / lifecycle hook | timer or hook registration + period env var | Pair with target handler; interval period is its own `env-var`. |
| `feature-flag` | boolean `HIVEMIND_*` env toggle | env read inside a branch/binary expression | Pair with the worker/hook it gates via `gates:`. |

For ADR detection (separate from entity extraction):

| Tier | Trigger pattern | File destination |
|---|---|---|
| 1 (high confidence) | `BREAKING CHANGE:` footer; `feat!:`/`refactor!:` subject; body matches `Decision:` / `Rationale:` / `RFC` / `ADR`; switch-verb regexes (`switch from X to Y`, `replace X with Y`, `migrate from X to Y`, `deprecate X`, `adopt X`) | `library/knowledge/private/architecture/ADR-<n>-<slug>.md` (full Nygard template) |
| 2 (low confidence) | `refactor:`/`chore:` with multi-paragraph body; "rewrite/redesign/rearchitect" without Tier-1 verb; "instead of/rather than/we considered" tradeoff phrasing | `questions/<question>.md` (asks human to confirm) |
| Filter (ignore) | `docs:`/`style:`/`test:`/`chore: bump deps`/dependabot; single-line commits with no body; `Revert "..."` (these update a prior ADR's `superseded_by`, do NOT file new) | - |

## Open questions resolved in the retarget

1. **Extraction engine** - tree-sitter (`src/graph/extract/*`), not ts-morph. Locked.
2. **Output location** - `library/knowledge/private/codebase-graph/` for entity/concept/etc.; `library/knowledge/private/architecture/` for ADRs. Per schema-v2.
3. **Wikilinks in YAML** - always quoted (`["[[entities/foo]]"]`). Dates always quoted strings.
4. **`adr_number` allocation** - graph driver, in the post-pass (parallel ingestion can collide otherwise).
5. **Stub pages** - for languages with no wired tree-sitter grammar (outside the nine). Basename-only filename, `source_extension` in frontmatter.
6. **Lint authority** - agent does per-chunk lint; graph driver does the global pass (orphans, dead links, ADR chains).

## Top-3 things the parent agent should know

1. **Atomicity is the architectural rule, but the pairing rule is louder.** Workers pair with handlers; scheduled hooks pair with targets; flag pages aggregate from many branch sites; deeplake-tables pair with data-models; ADRs pair `supersedes`/`superseded_by`. Every entity page lists its sibling pairs in frontmatter, and lint mode catches missing pairs as a first-class finding.

2. **The graph driver does the heavy lifting; the Bee obeys a contract.** wiki-worker-bee doesn't re-run tree-sitter on the whole repo, doesn't allocate ADR numbers, doesn't reconcile the index. It receives a `chunk` + `git_context` + `prior_state` (the `FileExtraction` shape) and writes per-page content + a structured response payload. Anything needing a global view is the driver's job - mirroring how `src/graph/snapshot.ts` aggregates per-file extraction into one canonical, hashed snapshot.

3. **The catalog is TS/Node/Deep Lake/MCP-shaped.** Sub-types reflect this repo: exported functions/classes/modules, MCP tools (`hivemind_*`), Deep Lake tables/columns, `HIVEMIND_*` env vars and toggles, spawned workers and daemons, lifecycle/interval hooks. When a new construct lands, prefer extending a recognizer over inventing a 14th sub-type.
