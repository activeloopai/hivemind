# Git Diff for PR Review - Two-Dot vs. Three-Dot

**Sources:**
- https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-comparing-branches-in-pull-requests
- https://www.dolthub.com/blog/2022-11-11-two-and-three-dot-diff-and-log/
- https://www.baeldung.com/ops/git-double-vs-triple-dot

**Retrieved:** 2026-04-24
**Query used:** `git diff base branch pull request three dot two dot review commands`

## Summary

When inventorying changes for a PR audit, the invocation matters. GitHub's PR diff uses three-dot semantics. Two-dot and three-dot answer different questions:

- `git diff A..B` (two dots) - "Everything different between the tip of A and the tip of B." Changes when `A` is updated, even if `B` hasn't changed.
- `git diff A...B` (three dots) - "What did branch B introduce since it diverged from A?" Uses the merge base. This matches what the PR page shows.

For `quality-worker-bee`, the audit should mirror what a human reviewer sees on the PR page: the three-dot diff against the base branch.

## Recommended invocations

```bash
# Primary: what this branch introduces relative to main
git diff main...HEAD --stat       # summary of files changed
git diff main...HEAD              # full patch
git diff main...HEAD -- path/     # scope to a subfolder

# Status of uncommitted work (useful if the Bee is invoked mid-session)
git status
git diff --staged                 # staged but uncommitted
git diff                          # unstaged

# Name-only (for inventorying file changes)
git diff main...HEAD --name-only
git diff main...HEAD --name-status   # adds A/M/D status per file
```

## Key quotations

> "Pull requests on GitHub show a three-dot diff."

> "The three-dot comparison compares with the merge base, [so] it is focusing on 'what a pull request introduces.'"

> "Using two dots compares the absolute latest commits on both branches and shows you everything that is different between the tip of branch1 and the tip of branch2."

## Relevance to this stinger

This is the source for `guides/02-inventory-changes.md`. The Bee must use `git diff <base>...HEAD --name-status` as its authoritative "files changed" list. If the Bee is invoked mid-session before the commit has landed, fall back to `git status` + `git diff` + `git diff --staged` combined.

The `--name-status` flag returns `A` / `M` / `D` / `R` per file, which maps directly onto the "Files Changed" section of the report template.
