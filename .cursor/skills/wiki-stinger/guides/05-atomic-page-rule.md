# Guide 05 - The Atomic Page Rule

Two hard rules govern page authorship in wiki-worker-bee:

## Rule 1: 8-15 pages per chunk

Every non-trivial Document or Update invocation produces between 8 and 15 new-or-updated pages. Below 8 = under-extraction (you missed entities). Above 15 = over-extraction (you split too aggressively or surfaced noise).

The split per chunk is roughly:

- 1 module entity page (for the chunk's primary file or the directory's index)
- 4-8 callable entity pages (functions, classes, mcp-tools, data-models - the bulk)
- 1-3 concept pages (data flows, patterns visible across the chunk)
- 0-2 decision pages (if Phase 5 detected high-confidence ADRs)
- 0-2 question pages (gaps, low-confidence ADR signals)

If your chunk produces fewer than 8 pages, re-check Phase 1 entity extraction - you likely missed a sub-type. If it produces more than 15, look for over-splitting (e.g., per-member pages instead of one exported-symbol with a shape subsection).

Lint mode is exempt from this rule - it produces 0 entity/concept pages and 1 lint-report meta page.

## Rule 2: ≤300 lines per page

Hard cap. If a page would exceed 300 lines, SPLIT it.

Splitting protocol:

1. Identify the natural sub-divisions of the page (e.g., for a large class: methods grouped by responsibility; for a complex data flow concept: per-stage sub-pages).
2. Author the sub-pages first.
3. Author the parent page as an index pointing to sub-pages, with a one-paragraph summary of each.
4. Sub-pages link upward via `parent: [[entities/parent-page]]` in frontmatter.

Example: a 500-line `extract-typescript.md` becomes:

- `extract-typescript.md` (~80 lines) - overview, pointers to sub-pages
- `extract-typescript-declarations.md` (~120 lines)
- `extract-typescript-imports.md` (~110 lines)
- `extract-typescript-calls.md` (~90 lines)

Total: 4 pages, all under 300 lines, navigable via parent.

## Why these rules

The compounding-graph design depends on atomic pages:

- The agent reads only the entity pages relevant to the current question - bloated pages waste context.
- Cross-references (`depends_on`, `used_by`) are precise pointers - they lose meaning when pages aggregate too many entities.
- Future updates apply to single pages - bloated pages mean every contract change rewrites a giant document.

The 8-15-per-chunk rule keeps the entity graph dense without noise. Below 8 means the knowledge area is undernourished and the entity graph is sparse. Above 15 means the agent is making noise pages that won't be read.

## Source

Both rules follow the same context-discipline principle the codebase graph itself uses: keep per-node output small and deterministic so the snapshot stays cheap to dif