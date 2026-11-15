---
source_url: https://devtoolbox.dedyn.io/blog/git-squash-commits-complete-guide + https://devtoolbox.dedyn.io/blog/git-rebase-complete-guide + https://git-scm.com/docs/git-rebase.html + https://pkglog.com/en/blog/git-interactive-rebase-practical-guide-en/ + https://oneuptime.com/blog/post/2026-01-24-git-squash-commits/view + https://www.grizzlypeaksoftware.com/library/interactive-rebase-mastery-998c8bab
retrieved_on: 2026-05-20
source_type: blog + official-docs
authority: practitioner + official
relevance: critical
topic: interactive-rebase
stinger: git-stinger
---

# Interactive Rebase: Squash, Fixup, and Autosquash Mastery

## Summary

Interactive rebase (`git rebase -i`) is Git's most powerful history-editing tool. It lets developers squash WIP commits, reorder commits for logical clarity, reword messages, split large commits, and drop unwanted noise before merging a pull request. The autosquash workflow (`git commit --fixup` + `git rebase -i --autosquash`) reduces manual todo-list editing to zero. The golden rule: only rebase commits that have not been pushed to a shared branch.

---

## 1. Core Concepts

### What interactive rebase does

`git rebase -i <base>` opens an editor with a list of commits from `<base>` to `HEAD`. Each line has a command prefix controlling what Git does with that commit. The developer edits the list, saves and closes, and Git replays the commits in the new order with the specified transformations.

```bash
# Rebase last N commits interactively
git rebase -i HEAD~4

# Rebase from a specific commit (exclusive - that commit is NOT included)
git rebase -i abc1234

# Rebase onto another branch (update feature branch to include main's changes)
git rebase -i origin/main

# Rebase from the exact point where branch diverged from main
git rebase -i $(git merge-base HEAD main)
```

### The rebase editor

When `git rebase -i HEAD~4` runs, an editor opens:

```
pick a1b2c3d Add user authentication model
pick e4f5g6h Add login endpoint
pick i7j8k9l Fix typo in login response
pick m0n1o2p Add session middleware

# Rebase 9f8e7d6..m0n1o2p onto 9f8e7d6 (4 commands)
#
# Commands:
# p, pick   = use commit as-is
# r, reword = use commit, but edit commit message
# e, edit   = use commit, but stop for amending
# s, squash = use commit, meld into previous commit (keep message)
# f, fixup  = like squash, but discard this commit's log message
# x, exec   = run command (the rest of the line) using shell
# b, break  = stop here (like edit, but without changing the commit)
# d, drop   = remove commit
# l, label  = label current HEAD with a name
```

---

## 2. Command Reference

| Command | Shortcut | What it does |
|---|---|---|
| `pick` | `p` | Keep commit exactly as-is |
| `reword` | `r` | Keep changes; open editor to rewrite message |
| `edit` | `e` | Pause after applying this commit (for amending, splitting) |
| `squash` | `s` | Combine with previous commit; open editor to merge messages |
| `fixup` | `f` | Combine with previous commit; silently discard this message |
| `drop` | `d` | Delete this commit entirely from history |
| `exec` | `x` | Run a shell command after this commit |
| `break` | `b` | Stop here without making changes |

**Key difference between `squash` and `fixup`:**
- `squash` - merges both commit messages; opens editor to write combined message
- `fixup` - silently keeps only the first commit's message; no editor opens

> "fixup is squash without the message editing. It combines the commit with the one above it and keeps only the previous commit's message. This is the one you will use most often - it is perfect for folding small fixes into the commits they belong to." - Grizzly Peak Software (2026)

Since Git 2.32, `fixup -C` keeps the fixup commit's message instead, and `fixup -c` keeps it but opens the editor.

---

## 3. Common Workflows

### 3.1 Clean up before a PR

The most common use case: squash WIP commits, fix typo in a message, reorder for logical review order.

```bash
# Step 1: See what commits are on your branch vs main
git log --oneline origin/main..HEAD

# Step 2: Rebase interactively from merge-base to tip
git rebase -i origin/main

# Step 3: In the editor, change picks as desired
pick a1b2c3d Add user authentication model
pick e4f5g6h Add login endpoint
fixup i7j8k9l Fix typo in login response       # silently fold into previous
pick m0n1o2p Add session middleware
drop q3r4s5t WIP: debug logging                # delete entirely

# Step 4: If already pushed, update remote safely
git push --force-with-lease origin feature/auth
```

**Policy table for squash decisions:**

| Scenario | Recommendation | Why |
|---|---|---|
| Local feature branch before PR | Squash with interactive rebase | Cleaner review, linear history |
| Shared branch with multiple collaborators | Avoid rebasing/squashing | Rewriting hashes breaks others' state |
| Maintainer merging PR to main | `merge --squash` | One integration commit; preserves PR discussion |
| Audit-heavy repos | Squash carefully with policy | Over-squashing hides decision timeline |

### 3.2 Squashing commits into one

```bash
# Squash the last 4 commits into one
git rebase -i HEAD~4

# In the editor:
pick a1b2c3d Implement user authentication
squash b2c3d4e Add validation
squash c3d4e5f Write tests
squash d4e5f6g Fix linting errors
# Git opens editor to write combined message

# Alternative: use fixup to skip message editing
pick a1b2c3d Implement user authentication
fixup b2c3d4e Add validation
fixup c3d4e5f Write tests
fixup d4e5f6g Fix linting errors
```

### 3.3 Reordering commits

Simply move lines in the todo list:

```bash
git rebase -i HEAD~5

# Before (in editor):
pick 1a2b3c4 Add database models
pick 5d6e7f8 Add API routes
pick 9g0h1i2 Update README

# After reordering:
pick 1a2b3c4 Add database models
pick 9g0h1i2 Update README       # moved up
pick 5d6e7f8 Add API routes      # moved down
```

### 3.4 Rewording a commit message mid-history

```bash
git rebase -i HEAD~3

# Change 'pick' to 'reword' for the commit to fix:
pick a1b2c3d Good commit
reword e4f5g6h bad mesage with typo    # opens editor to fix message
pick 7c8d9e0 Another commit
```

### 3.5 Splitting a large commit into two

```bash
git rebase -i HEAD~3

# Mark the commit to split with 'edit':
pick a1b2c3d Previous commit
edit e4f5g6h Large commit to split
pick 7c8d9e0 Later commit

# Git pauses after applying 'Large commit to split'
# Unstage everything from that commit:
git reset HEAD~1

# Now stage and commit in logical pieces:
git add src/models/
git commit -m "Add database models"

git add src/api/
git commit -m "Add API routes"

# Continue the rebase
git rebase --continue
```

### 3.6 Running tests at every commit with exec

```bash
# Verify every commit individually compiles and passes tests
git rebase -i main --exec "npm test"

# Mix exec with other commands:
pick a1b2c3d Add feature A
exec npm test               # verify feature A works standalone
pick e4f5g6h Add feature B
exec npm test               # verify feature B works standalone
```

---

## 4. The Autosquash Workflow

### Why it matters

Autosquash lets developers mark commits for squashing at commit time, eliminating the need to manually reorder and label in the todo list. This is the workflow for long-lived branches.

### Creating fixup commits

```bash
# You find a bug that belongs in an earlier commit abc1234
git add the-fix.js
git commit --fixup abc1234
# Creates a commit with message: "fixup! <original message of abc1234>"

# Or create a squash commit (prompts to edit combined message):
git commit --squash abc1234
# Creates a commit with message: "squash! <original message of abc1234>"

# Target the most recent commit (HEAD):
git commit --fixup HEAD
```

### Running autosquash

```bash
# Autosquash reorders and marks fixup commits automatically
git rebase -i --autosquash origin/main

# Git automatically rearranges the todo list:
# pick abc1234  Add user authentication
# fixup def5678 fixup! Add user authentication   <- moved right after target
# pick 9a8b7c6  Add session middleware
```

### Making autosquash the default

```bash
# Always use --autosquash with interactive rebase
git config --global rebase.autosquash true

# Now 'git rebase -i' always autosquashes without the flag
```

### Full autosquash workflow example

```bash
# Day 1: commit the feature
git commit -m "feat: add authentication"

# Day 2: realize forgot a file
git add forgotten-file.ts
git commit --fixup HEAD

# Day 3: fix a typo in an older commit abc1234
git add file.ts
git commit --fixup abc1234

# Day 4: prepare for PR - autosquash cleans everything up
git rebase -i --autosquash origin/main
```

---

## 5. Handling Rebase Conflicts

When a conflict occurs during rebase, Git pauses and shows:

```
CONFLICT (content): Merge conflict in src/auth/login.ts
error: could not apply e4f5g6h... Add login endpoint
hint: Resolve all conflicts manually, mark them as resolved with
hint: "git add/rm <conflicted_files>", then run "git rebase --continue".
hint: You can instead skip this commit: run "git rebase --skip".
hint: To abort and get back to the state before "git rebase", run "git rebase --abort".
```

Resolution sequence:

```bash
# 1. Open conflicted files and resolve (look for <<<, ===, >>> markers)
vim src/auth/login.ts

# 2. Stage the resolved files
git add src/auth/login.ts

# 3. Continue the rebase (do NOT commit - just rebase --continue)
git rebase --continue

# To abort entirely and return to pre-rebase state:
git rebase --abort

# To skip a problematic commit entirely:
git rebase --skip
```

---

## 6. Force-Pushing After Rebase

After rewriting history, the remote branch has diverged. Update it safely:

```bash
# ALWAYS use --force-with-lease, never bare --force
git push --force-with-lease origin feature/my-branch

# --force-with-lease aborts if someone else pushed since your last fetch
# This prevents silently overwriting a teammate's commits

# If --force-with-lease fails with "stale info" after a fetch:
git fetch origin
git push --force-with-lease origin feature/my-branch
```

> "Use `--force-with-lease`, not `--force`: it refuses to overwrite unexpected remote updates and prevents accidental teammate history loss." - DevToolbox Blog (2026)

---

## 7. Advanced Patterns

### Autostash (avoid "dirty working tree" errors)

```bash
# Automatically stash/pop working tree changes around a rebase
git config --global rebase.autoStash true
```

### Update-refs for stacked branches

```bash
# If working with stacked PRs (branch chains), update all at once
git config --global rebase.updateRefs true

# Now rebasing a base branch automatically rebases all dependent branches
```

### git merge --squash (for maintainers)

Different from interactive rebase: does not rewrite the feature branch. Stages the net diff as one new commit.

```bash
# On main, squash-merge a feature branch into one commit
git merge --squash feature/my-feature
git commit -m "feat: add authentication (squashed)"

# When to use vs interactive rebase:
# - merge --squash: maintainer wants one clean commit in main
# - rebase -i: contributor wants to keep individual commits but clean them up
```

---

## 8. Undoing a Bad Rebase

```bash
# ORIG_HEAD is set by Git automatically before dangerous operations
git reset --hard ORIG_HEAD

# Or use reflog to find the pre-rebase state:
git reflog
# Look for "rebase -i (start)" or the commit before the rebase
git reset --hard HEAD@{5}  # adjust the index as needed
```

---

## 9. The Golden Rule

**Never rebase commits that have been pushed to a shared branch that others have pulled.**

Rebasing rewrites commit SHAs. Anyone who has pulled those commits will have a divergent history and will need to do a hard reset or re-clone.

- Safe to rebase: local commits only on your feature branch
- Safe to rebase: commits pushed to YOUR own fork/personal branch nobody else works on
- Dangerous: commits pushed to a shared branch where teammates have pulled

---

## 10. Global Configuration Recommended Defaults

```bash
# Auto-squash fixup! commits by default
git config --global rebase.autosquash true

# Auto-stash/pop working tree changes
git config --global rebase.autoStash true

# Update dependent stacked branches automatically
git config --global rebase.updateRefs true

# Set default branch to rebase on pull
git config --global pull.rebase true
```

---

## Key Quotations

- "Interactive rebase is where rebase becomes a precision tool. It lets you rewrite, combine, reorder, or delete commits before they become part of the shared history." - DevToolbox Blog (2026)
- "Set `rebase.autosquash true` globally. This makes `git commit --fixup` and `git commit --squash` actually useful by automatically reordering fixup commits during interactive rebase." - Grizzly Peak Software (2026)
- "Since Git 2.32, you can use `fixup -C` to keep the fixup commit's message instead." - Grizzly Peak Software (2026)

---

## Citations

1. DevToolbox Blog - "How to Squash Git Commits for Clean PRs" (2026-02-18): https://devtoolbox.dedyn.io/blog/git-squash-commits-complete-guide
2. DevToolbox Blog - "Git Rebase: The Complete Guide for 2026" (2026-02-12): https://devtoolbox.dedyn.io/blog/git-rebase-complete-guide
3. Git Official Docs - git-rebase: https://git-scm.com/docs/git-rebase.html
4. pkglog - "Git Interactive Rebase Guide" (2026-04-07): https://pkglog.com/en/blog/git-interactive-rebase-practical-guide-en/
5. OneUptime Blog - "How to Handle Git Squash Commits" (2026-01-24): https://oneuptime.com/blog/post/2026-01-24-git-squash-commits/view
6. Grizzly Peak Software - "Interactive Rebase Mastery" (2026-02-13): https://www.grizzlypeaksoftware.com/library/interactive-rebase-mastery-998c8bab
7. EZDevOps - "Git Rebase Tutorial 2026": https://www.ezdevops.cloud/gitlessons/git-rebase.html
