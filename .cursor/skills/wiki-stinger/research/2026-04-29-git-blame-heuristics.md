---
title: git blame author distribution heuristics
date: 2026-04-29
sources:
  - https://foote.pub/2015/01/05/git-ownership.html
  - https://github.com/MichaelMure/git-ownership
  - https://github.com/src-d/hercules
  - https://link.springer.com/content/pdf/10.1007/s10664-020-09928-2.pdf
---

# git blame author distribution heuristics

## Summary
For each entity, wiki-worker-bee renders a `## History` body subsection with three signals derived from git: (1) **author distribution** - who contributed how many commits/lines, (2) **churn rate** - commits per unit time, (3) **last-touched commit** - sha + date + author. The graph driver pre-computes these via `git log` and `git blame --line-porcelain`, then hands them to wiki-worker-bee in `git_context`. Three heuristics from the literature inform what's worth surfacing: **proportion of ownership** (top contributor's commit share), **major contributor count** (developers with >5% ownership), and **minor contributor count** (with <5%) - minor count correlates strongest with defect density per the Microsoft/Vista/Win7 research.

## Key facts
- `git blame --line-porcelain <file>` outputs every line annotated with author, author-mail, author-time, commit. Parse for line-by-line author attribution.
- `git log --follow --format='%H|%an|%ae|%at|%s' <file>` gives the commit history with author, email, timestamp, subject.
- `git log --shortstat <file>` adds insertion/deletion counts per commit - useful for churn metrics.
- `-w` flag on `git blame` ignores whitespace-only changes - recommended to avoid attributing reformatting to the formatter.
- `-C` flag detects copy/move within commits - important for refactor-heavy repos to avoid attributing renamed code to the renamer.
- Three classic ownership metrics (Bird/Nagappan/Murphy/Devanbu, "Don't Touch My Code!" 2011, applied to Vista):
  - **`ownrshp` (Proportion of Ownership)** - ratio of top contributor's commits / total commits for the file/component.
  - **`majors`** - count of contributors with ownership > 5%.
  - **`minors`** - count of contributors with ownership < 5%. **Highest correlation with post-release defects.**
- Caveats:
  - Each commit treated as one "exposure"; lines-of-code variant correlates 0.9 with commit-count variant - pick whichever is cheaper to compute.
  - These metrics are NOT additive: repo-wide ownership ≠ sum of per-file ownership.
  - Survival analysis (lines that persist over time) is more meaningful than raw counts but requires walking history with blame at each commit - expensive.
- Practical signal heuristics for entity pages (cheap):
  - **Last-touched author + date** - single most-asked question; always render.
  - **Top 3 contributors by commit count** - useful "ask these people" hint.
  - **Total commits in last 90 days** - recency signal.
  - **Commits per month over the last 12 months** - sparkline-style churn indicator if rendered as a small table.
- Tool prior art:
  - `git-ownership` CLI (jonathanfoote, 2015) - implements the Bird et al. metrics.
  - `MichaelMure/git-ownership` (2026) - visualization HTML from `git log` walks; same metric family with longitudinal view.
  - `src-d/hercules` - heavy-weight burndown + ownership engine; overkill for v1 wiki-worker-bee.

## Recommended approach for wiki-worker-bee

wiki-worker-bee itself does NOT run git. The graph driver pre-computes `git_context` per file and hands it to the agent in the canonical-path payload. Per the agent contract, `git_context` includes:
- `creation_commit: { sha, author, date }`
- `last_touched_commit: { sha, author, email, date, message }`
- `recent_commits: [{ sha, author, date, message }]` (last N affecting the file)
- `blame_summary: { author_distribution: { [email]: { commits, lines } }, churn_rate: { last_30d, last_90d } }`

The driver computes the **cheap** subset (no per-commit blame walk):
1. `git log --follow --format=... <file>` -> `recent_commits` + `creation_commit` + `last_touched_commit`.
2. `git blame -w -C --line-porcelain <file>` (single pass at HEAD) -> author per line -> `author_distribution`.
3. Time-windowed counts from log -> `churn_rate`.

wiki-worker-bee renders this into the entity body's `## History` subsection:

```md
## History

- **Last touched:** `abc123` by Mario (2026-04-28) - "fix(auth): handle null tokens"
- **Created:** `def456` by Mario (2025-11-01)
- **Contributors:** Mario (45 commits), Alice (12), Bob (3)
- **Churn (last 90 days):** 8 commits, +112 / -34 lines
```

Frontmatter `last_commit_hash` is the delta-tracking key - when the driver re-scans, if the file's HEAD blame's last commit matches frontmatter, the entity page is fresh; otherwise it queues a re-extract.

For the **active contradiction protocol**, when a re-extract detects that the function signature changed since `last_commit_hash`, that's the contradiction trigger - wiki-worker-bee flags both old and new pages per the brief's Phase 6.

For ADR `decision_date` fields, use the last-touched commit date of the file containing the decision-encoding commit. For ADR `commit_sha`, use that commit's full SHA.

For "minor contributors" (the defect-correlated signal): consider a small `[!gap]` callout in the body when minor count > 5 - "this file has many transient contributors; consider review for stability." Out of v1 scope but worth noting.

## Sources
- [Code Ownership for git | foote.pub](https://foote.pub/2015/01/05/git-ownership.html) - date retrieved 2026-04-29 - explains Bird et al. metrics (`ownrshp`, `majors`, `minors`) and their defect-correlation finding.
- [MichaelMure/git-ownership](https://github.com/MichaelMure/git-ownership) - date retrieved 2026-04-29 - visualizer with author-band time series; useful conceptually for what to surface.
- [git2net paper (Springer)](https://link.springer.com/content/pdf/10.1007/s10664-020-09928-2.pdf) - date retrieved 2026-04-29 - `-C` and `-w` flag rationale, productivity hypothesis around ownership.
- [src-d/hercules](https://github.com/src-d/hercules) - date retrieved 2026-04-29 - burndown + ownership analyzer, demonstrates the metric family at scale.

## Quotes worth preserving
> "Results are sorted by `minor` as this had the highest correlation with defects in the paper." - Jonathan Foote, foote.pub
> "git blame is a very versatile tool that annotates all lines of a file with the commit that last modified them. ... The -C option allows the detection of lines moved or copied between files." - git2net paper
> "There is a difference between the efforts plot and the ownership plot, although changing lines correlate with owning lines." - hercules README

## Open questions / gaps
- For monorepos, file-level ownership is misleading; module-level ownership is more useful. Recommend driver computes both (file and parent-directory) and entity pages render the more specific one.
- Ownership-as-defect-predictor is contested (the Bird et al. result was Microsoft-specific). Recommend NOT surfacing predictive claims in entity bodies; just facts. Defect prediction is a v2+ analytic.
- Should wiki-worker-bee's `_index.md` files (per type) include a churn-ranked list? Recommend yes - driver's reconciliation pass populates this. Out of agent's scope but worth surfacing in synthesis.
