---
ai_description: |
  This is the root of the repository's documentation library (schema v2).
  You own everything under library/ except notes/, which is human-only.
  Sub-trees: knowledge/ (public and private docs), requirements/ (product
  work: PRDs), issues/ (reactive bug/incident work: IRDs), notes/ (junk
  drawer, read-only to agents).
  Schema reference: this README plus the per-folder READMEs under library/.
human_description: |
  Root of this repository's documentation library.
  - knowledge/: reference documentation split by audience (public vs private)
  - requirements/: planned product work (PRDs) with backlog/in-work/completed lifecycle
  - issues/: reactive bug and incident work (IRDs) with same lifecycle
  - notes/: unstructured scratch space - only humans write here
  Structure is maintained manually or by the library-worker-bee; mirror the layout below when scaffolding new folders.
---

# Library

Documentation root for this repository. Schema version: **v2**.

The schema-v2 convention is documented inline here and in the README.md inside each sub-folder. The layout below plus those per-folder READMEs are the full specification for this repo.

## Top-level layout

| Folder | What goes here |
|---|---|
| `knowledge/public/` | End-user / customer-facing docs: overviews, guides, FAQs |
| `knowledge/private/` | Internal engineering and business docs: ADRs, standards, domain knowledge |
| `requirements/` | Product and feature work: PRDs in backlog/in-work/completed |
| `issues/` | Reactive bug and incident work: IRDs in backlog/in-work/completed |
| `notes/` | Human-only scratch space |

## What does NOT belong here

- Wiki and codebase-graph pages: these are derived and live in `library/knowledge/` (maintained by the wiki-worker-bee, never hand-edit).
