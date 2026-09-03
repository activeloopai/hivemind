---
name: library-stinger
description: Equips library-worker-bee with the documentation lifecycle - knowledge-base authoring (public vs private audience split), feature PRD authoring (prd-<###>-<slug>/ with index + sub-PRDs + qa/), issue IRD authoring (ird-<###>-<slug>/ with index + qa/), backwards-PRD generation, sync audits / drift detection, and lifecycle moves (backlog/in-work/completed) against this repo's schema v2 library/. Use when initializing a library/, ingesting issues, planning features, writing knowledge docs, running drift audits, or moving a completed PRD/IRD to its completed/ tier. Not for QA report authorship (use quality-stinger) or narrative knowledge docs (use knowledge-stinger).
---

# library-stinger

Cursor-skill wrapper for the `library-worker-bee` Bee's companion resource bundle. The full directory map, intent-routing tables, examples catalog, templates list, path conventions, and self-operation notes are in [`README.md`](README.md) - start there.

> **Agent entry point:** [`library-worker-bee.md`](../../agents/library-worker-bee.md) - deployed via the host repo's `.cursor/agents/` folder.
>
> **Peer Bees:** [`quality-worker-bee`](../../agents/quality-worker-bee.md) owns QA report authorship. [`knowledge-worker-bee`](../../agents/knowledge-worker-bee.md) owns narrative knowledge docs under `library/knowledge/private/<domain>/`.

## Path conventions enforced (schema v2)

| Output | Location |
|---|---|
| Customer-facing docs | `library/knowledge/public/<domain>/<slug>.md` |
| Internal engineering/business docs | `library/knowledge/private/<domain>/<slug>.md` |
| ADRs | `library/knowledge/private/architecture/ADR-<n>-<slug>.md` |
| PRD folder (backlog) | `library/requirements/backlog/prd-<###>-<slug>/` |
| PRD index | `library/requirements/backlog/prd-<###>-<slug>/prd-<###>-<slug>-index.md` |
| PRD sub-feature | `library/requirements/backlog/prd-<###>-<slug>/prd-<###><letter>-<slug>-<feature>.md` |
| PRD QA report | `library/requirements/backlog/prd-<###>-<slug>/qa/prd-<###>-<slug>-qa.md` |
| PRD in-work | `library/requirements/in-work/prd-<###>-<slug>/` (same structure) |
| Completed PRD | `library/requirements/completed/prd-<###>-<slug>/` |
| Routine scan report | `library/requirements/reports/<YYYY-MM-DD>-<type>-report.md` |
| IRD folder (backlog) | `library/issues/backlog/ird-<###>-<slug>/` |
| IRD index | `library/issues/backlog/ird-<###>-<slug>/ird-<###>-<slug>-index.md` |
| IRD QA report | `library/issues/backlog/ird-<###>-<slug>/qa/ird-<###>-<slug>-qa.md` |
| Completed IRD | `library/issues/completed/ird-<###>-<slug>/` |
| Notes (human only) | `library/notes/` - agents NEVER write here |

**NOT in `library/`:**

| Asset | Correct location |
|---|---|
| Brand assets (logos, fonts, colors) | Wherever the deployment stores shared brand assets (e.g. a `brands/` or `assets/` folder outside this repo) |
| Derived wiki / docs vault mirrors | Any aggregated wiki or docs vault that mirrors `library/` is derived - never edit it directly |
| Binary files (images, fonts, PDFs) | An `assets/` or `public/` folder appropriate to the deployment |

**Legacy v1 paths (do NOT create new content here):**

| v1 path | v2 replacement |
|---|---|
| `library/knowledge-base/` | `library/knowledge/private/` |
| `library/architecture/` | `library/knowledge/private/architecture/` |
| `library/requirements/features/` | `library/requirements/backlog/` |
| `library/requirements/issues/` | `library/issues/backlog/` |
| `library/qa/` | `library/requirements/reports/` |

See `guides/07-wiki-sync.md` for 