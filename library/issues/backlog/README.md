---
ai_description: |
  Contains IRD folders for tracked issues not yet in active fix work.
  Create a new IRD here only AFTER the GitHub issue exists for this repo.
  IRD folder: ird-<###>-<slug>/ where ### = GitHub issue number.
  Must contain: ird-<###>-<slug>-index.md (the fix plan) and qa/ folder.
  IRDs are single-scope: do not add sub-IRDs.
human_description: |
  IRDs planned but not yet in active fix work. Create IRDs here.
  - Naming: ird-042-stale-cache/ with ird-042-stale-cache-index.md inside
  - IRD number must match the GitHub issue number
  - Create only after the GitHub issue exists
  Move to in-work/ when fix work begins.
---

# Issues — Backlog

Tracked issues with a fix plan, not yet in active resolution.

## Creating a new IRD

1. Confirm the GitHub issue number (e.g., #42).
2. Create `ird-042-<kebab-slug>/`.
3. Create `ird-042-<slug>-index.md` — the single-scope fix plan.
4. Create `qa/` subfolder (empty; `quality-guardian` writes here).
5. No sub-IRDs — keep scope to one issue.
