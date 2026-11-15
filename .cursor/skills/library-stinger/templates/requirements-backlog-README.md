---
ai_description: |
  Contains PRD folders planned but not yet started. This is where
  library-worker-bee creates new PRD folders on "write a PRD for X".
  PRD folder naming: prd-<###>-<kebab-slug>/ (3-digit zero-padded).
  PRD number: take max+1 from all prd-* folders across backlog/,
  in-work/, and completed/ in this repo.
  Each PRD folder must contain: prd-<###>-<slug>-index.md (always),
  prd-<###><letter>-<slug>-<feature>.md (one per sub-feature, optional),
  qa/ subfolder (empty on creation; quality-worker-bee writes QA reports here).
  Move entire folder to in-work/ when implementation begins.
human_description: |
  PRDs planned but not yet started. Create new PRDs here.
  - Naming: prd-007-feature-name/ with prd-007-feature-name-index.md inside
  - Sub-features: prd-007a-feature-name-backend.md, prd-007b-feature-name-ui.md
  - QA folder: qa/prd-007-feature-name-qa.md (created by quality-worker-bee)
  Move to in-work/ when implementation begins.
---

# Requirements - Backlog

Planned PRDs not yet in implementation. All new PRD folders are created here.

## Creating a new PRD

1. Find `max_n` across `backlog/prd-*/`, `in-work/prd-*/`, `completed/prd-*/`.
2. Create `prd-<max_n + 1>-<kebab-slug>/`.
3. Create `prd-<###>-<slug>-index.md` (module overview + feature list).
4. Create `qa/` subfolder (empty; `quality-worker-bee` writes reports here).
5. Add sub-PRDs `prd-<###>a-<slug>-<feature>.md` etc. as needed.
