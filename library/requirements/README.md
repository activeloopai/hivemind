---
ai_description: |
  This folder contains all planned product and feature work (PRDs).
  Sub-folders: backlog/ (queued, not started), in-work/ (actively
  being implemented), completed/ (shipped), reports/ (routine code scans).
  Lifecycle = location: move entire PRD folders between states.
  PRD folder naming: prd-<###>-<kebab-slug>/
  PRD numbers are repo-local sequential. Take max+1 from all prd-* folders
  across backlog/, in-work/, and completed/.
  Never write PRD content outside of a prd-<###>-<slug>/ folder.
  Do NOT put IRDs here — those go in issues/ (peer of requirements/).
human_description: |
  Product and feature work (PRDs) organized by lifecycle stage.
  - backlog/: planned work not yet started
  - in-work/: currently being implemented
  - completed/: shipped work (move entire folder here when done)
  - reports/: routine code-scan and QA reports not tied to a specific PRD
  To start a new PRD: create prd-<###>-<slug>/ in backlog/ with an index.md.
  To move lifecycle: move the entire prd-<###>-<slug>/ folder.
---

# Requirements

Product and feature work, organized by lifecycle state.

## Sub-folders

| Folder | State | Description |
|---|---|---|
| `backlog/` | Queued | PRDs planned but not yet started |
| `in-work/` | Active | PRDs currently being implemented |
| `completed/` | Shipped | Entire PRD folder moves here when work ships |
| `reports/` | Evergreen | Routine code-scan and QA reports not tied to a PRD |

## PRD folder structure

```
prd-007-user-export/
  prd-007-user-export-index.md         module overview + feature list
  prd-007a-user-export-backend.md      sub-feature a
  prd-007b-user-export-ui.md           sub-feature b
  qa/
    prd-007-user-export-qa.md          QA audit (written by quality-guardian)
```

## Naming

- Folder: `prd-<###>-<kebab-slug>/` (3-digit zero-padded)
- Index: `prd-<###>-<kebab-slug>-index.md`
- Sub-PRDs: `prd-<###><letter>-<kebab-slug>-<feature>.md`
- PRD numbers are **repo-local sequential** — not GitHub issue numbers.
