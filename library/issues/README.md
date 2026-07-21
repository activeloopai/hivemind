---
ai_description: |
  This folder contains all reactive bug and incident work (IRDs).
  It is a PEER of requirements/, not nested under it.
  Sub-folders: backlog/, in-work/, completed/ — same lifecycle as requirements/.
  IRD folder naming: ird-<###>-<kebab-slug>/
  IRD numbers match the GitHub issue number for this repo.
  Never invent IRD numbers — a GitHub issue must exist first.
  IRDs are single-scope: one issue per IRD, no sub-IRDs.
  Do NOT put PRDs here — those go in requirements/.
human_description: |
  Reactive bug and incident work (IRDs), organized by lifecycle stage.
  - backlog/: tracked issues with a fix plan, not yet started
  - in-work/: issues currently being fixed
  - completed/: resolved issues (move entire folder)
  IRD numbers match GitHub issue numbers. Create an IRD only after the
  GitHub issue exists.
---

# Issues

Reactive bug and incident work (IRDs), organized by lifecycle state.

## Sub-folders

| Folder | State | Description |
|---|---|---|
| `backlog/` | Tracked | IRDs with a fix plan, not yet in progress |
| `in-work/` | Active | Issues currently being resolved |
| `completed/` | Resolved | Entire IRD folder moves here when the issue closes |

## IRD folder structure

```
ird-042-stale-cache/
  ird-042-stale-cache-index.md     single-scope fix plan
  qa/
    ird-042-stale-cache-qa.md      QA audit (written by quality-guardian)
```

## Naming rules

- Folder: `ird-<###>-<kebab-slug>/`
- Index: `ird-<###>-<kebab-slug>-index.md`
- IRD number = GitHub issue number (never invented)
- No sub-IRDs (scope one issue per IRD)
