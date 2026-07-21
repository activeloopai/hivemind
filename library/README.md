---
ai_description: |
  This is the root of the repository's documentation library (schema v2).
  You own everything under library/ except notes/, which is human-only.
  Sub-trees: knowledge/ (public and private docs), requirements/ (product
  work: PRDs), issues/ (reactive bug/incident work: IRDs), notes/ (junk
  drawer, read-only to agents).
  Schema reference: legion-shared/standards/library-schema-v2.md.
  Standardize script: pnpm standardize-library --repository <name>.
human_description: |
  Root of this repository's documentation library.
  - knowledge/: reference documentation split by audience (public vs private)
  - requirements/: planned product work (PRDs) with backlog/in-work/completed lifecycle
  - issues/: reactive bug and incident work (IRDs) with same lifecycle
  - notes/: unstructured scratch space — only humans write here
  Run `pnpm standardize-library --repository <name>` to scaffold any missing structure.
---

# Library

Documentation root for this repository. Schema version: **v2**.

See [`legion-shared/standards/library-schema-v2.md`](../../legion-shared/standards/library-schema-v2.md) for the full specification.

## Top-level layout

| Folder | What goes here |
|---|---|
| `knowledge/public/` | End-user / customer-facing docs: overviews, guides, FAQs |
| `knowledge/private/` | Internal engineering and business docs: ADRs, standards, domain knowledge |
| `requirements/` | Product and feature work: PRDs in backlog/in-work/completed |
| `issues/` | Reactive bug and incident work: IRDs in backlog/in-work/completed |
| `notes/` | Human-only scratch space |

## What does NOT belong here

- Brand assets → `legion-shared/brands/`
- Wiki entity pages → `legion-wiki/<repo>/wiki/` (derived, never edit)
- Library mirrors → `legion-wiki/<repo>/library/` (derived, never edit)
