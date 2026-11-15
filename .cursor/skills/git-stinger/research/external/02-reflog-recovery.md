---
source_url: https://thelinuxcode.com/how-to-undo-git-reset-a-practical-recovery-playbook-2026/ + https://gitcheatsheet.dev/docs/advanced/reflog/ + https://devtoolbox.dedyn.io/blog/git-undo-reset-revert-guide + https://www.fixdevs.com/blog/git-reset-hard-undo/ + https://blog.shakiltech.com/git-reflog-explained-recover-deleted-commits-lost-work/ + https://how2.sh/posts/how-to-recover-dropped-commits-with-git-reflog-and-fsck/ + https://graphite.dev/guides/recovering-lost-commits-git-reflog
retrieved_on: 2026-05-20
source_type: blog + official-docs
authority: practitioner + official
relevance: critical
topic: reflog-recovery
stinger: git-stinger
---

# Reflog Recovery: Undoing Destructive Git Operations

## Summary

`git reflog` is Git's local journal of every position `HEAD` and branch references have occupied. It records every commit, checkout, reset, and rebase - making almost all "destructive" operations recoverable. Committed work that appears "lost" after `git reset --hard`, a failed rebase, or a deleted branch can be recovered within the reflog expiry window (90 days for normal entries, 30 days for unreachable commits). This guide covers every recovery scenario with exact commands.

---

## 1. Understanding git reflog

### What reflog records

Every Git operation that modifies a reference is logged:
- `git commit`
- `git reset`
- `git rebase`
- `git commit --amend`
- `git cherry-pick`
- `git checkout` / `git switch`
- `git merge`

### The critical difference from git log

- `git log` - shows the commit history of the current branch
- `git reflog` - shows every position HEAD has been at, regardless of whether those commits are still reachable

```bash
# View reflog
git reflog

# Output example:
abc1234 HEAD@{0}: commit: Add authentication feature
def5678 HEAD@{1}: reset: moving to HEAD~3
ghi9012 HEAD@{2}: commit: Add login form
jkl3456 HEAD@{3}: commit: Add database models
mno7890 HEAD@{4}: checkout: moving from main to feature/auth
```

### Key insight

> "The reflog records every movement of that pointer. Even if commits disappear from `git log`. Even if branches are deleted. Reflog remembers." - Shakil's Blog (2026)

### What reflog CANNOT recover

- Uncommitted changes discarded by `git reset --hard`
- Untracked files deleted with `git clean -f`
- Stashes dropped with `git stash drop` (but fsck can find them)
- Changes in working tree that were never staged or committed

---

## 2. The Three Types of git reset

Understanding reset modes is essential before running recovery:

```bash
# --soft: move branch pointer only; index (staged) and working tree unchanged
git reset --soft HEAD~1
# Use case: want to recommit with different message or split the commit

# --mixed (default): move branch pointer + unstage changes; working tree files unchanged
git reset HEAD~1       # same as git reset --mixed HEAD~1
# Use case: want to re-stage selectively

# --hard: move branch pointer + discard ALL changes (staged + unstaged + file modifications)
git reset --hard HEAD~1
# Use case: truly throw away all changes since that commit - irreversible for uncommitted work
```

**State matrix:**

| Reset type | HEAD/Branch | Index (staged) | Working tree |
|---|---|---|---|
| `--soft` | moves back | unchanged | unchanged |
| `--mixed` | moves back | reset to target | unchanged |
| `--hard` | moves back | reset to target | reset to target |

> "Warning: Uncommitted changes destroyed by `--hard` cannot be recovered. Always check `git stash` or `git diff` before running this." - DevToolbox Blog (2026)

---

## 3. Recovery Scenarios

### 3.1 Recovering from accidental `git reset --hard`

```bash
# You ran: git reset --hard HEAD~1 (or HEAD~N) and lost commits

# Step 1: View the reflog
git reflog
# Output:
# abc1234 HEAD@{0}: reset: moving to HEAD~1
# def5678 HEAD@{1}: commit: added validation logic   <- the lost commit
# ghi9012 HEAD@{2}: commit: added login form

# Step 2: Identify the commit you want to restore (def5678 in example above)

# Option A: Reset the branch back to the lost commit
git reset --hard def5678

# Option B: Use relative reflog syntax
git reset --hard HEAD@{1}

# Option C: Create a new branch pointing to the lost commit (safer - non-destructive)
git branch recovery-branch def5678
git checkout recovery-branch
```

### 3.2 Using ORIG_HEAD for immediate undo

Git automatically sets `ORIG_HEAD` before dangerous operations (merge, rebase, reset, cherry-pick). It's the fastest recovery for "I just ran X and it went wrong":

```bash
# Immediately undo a rebase:
git reset --hard ORIG_HEAD

# Immediately undo a merge:
git reset --hard ORIG_HEAD

# Immediately undo a reset:
git reset --hard ORIG_HEAD

# LIMITATION: ORIG_HEAD is overwritten by the NEXT dangerous operation
# Use it immediately or use reflog instead
```

### 3.3 Recovering a deleted branch

When a branch is deleted with `git branch -D`:

```bash
# Step 1: Find the branch tip in reflog
git reflog
# or search all refs:
git reflog show --all | grep "feature/payment-retry"

# Step 2: Note the commit SHA where the branch tip was
# Example output: abc1234 HEAD@{7}: commit: (feature/payment-retry) Add retry logic

# Step 3: Recreate the branch
git branch feature/payment-retry abc1234

# Step 4: Switch to it
git checkout feature/payment-retry
```

### 3.4 Recovering after a failed/bad rebase

```bash
# A rebase went wrong and the history is messed up

# Option A: ORIG_HEAD (immediate, before any other dangerous op)
git reset --hard ORIG_HEAD

# Option B: Reflog (when ORIG_HEAD was already overwritten)
git reflog
# Look for "rebase -i (start)" entry or the commit before rebase began
# Example:
# abc1234 HEAD@{0}: rebase finished: returning to refs/heads/feature/auth
# def5678 HEAD@{5}: rebase -i (start): checkout origin/main
# ghi9012 HEAD@{6}: commit: Add auth feature  <- state before rebase

git reset --hard HEAD@{6}  # return to pre-rebase state
```

### 3.5 Recovering a dropped stash

`git stash drop` removes the stash entry from the list, but the commit objects remain until garbage collection:

```bash
# Use git fsck to find stash objects
git fsck --lost-found --no-reflogs | grep "dangling commit"

# Inspect each dangling commit to find your stash:
git show --stat <dangling-commit-hash>

# If found, recover it
git stash apply <dangling-commit-hash>
# or
git checkout -b recovery <dangling-commit-hash>
```

### 3.6 Recovering detached HEAD commits

When in detached HEAD state, commits you make aren't attached to any branch. Switching away loses them:

```bash
# Find the detached HEAD commits in reflog
git reflog
# Look for commits made in detached HEAD state

# Create a branch to save them
git branch save-my-work HEAD@{3}  # adjust index as needed
# or
git checkout -b save-my-work <commit-hash>
```

### 3.7 Recovering after a force push

```bash
# A force push overwrote remote history you needed

# Step 1: Check your LOCAL reflog for the remote tracking branch
git reflog show origin/main
# Output shows history of origin/main including the old commit before force push

# Step 2: Identify the old commit hash
# abc1234 origin/main@{2}: update by push  <- old good state

# Step 3: Recover locally
git reset --hard abc1234

# Step 4: Coordinate with team, then force-push to fix remote
git push --force-with-lease origin main
```

---

## 4. Complete Recovery Decision Tree

```
Lost committed work?
  ├─ Just ran a destructive op?
  │   └─ ORIG_HEAD: git reset --hard ORIG_HEAD
  │
  ├─ Accidental reset?
  │   └─ git reflog → find pre-reset hash → git reset --hard HEAD@{n}
  │
  ├─ Deleted branch?
  │   └─ git reflog | grep branch-name → git branch name SHA
  │
  ├─ Failed rebase?
  │   └─ git reset --hard ORIG_HEAD
  │   └─ or: git reflog → find "rebase (start)" → git reset --hard HEAD@{n}
  │
  ├─ Bad merge?
  │   └─ git reset --hard ORIG_HEAD (if not pushed)
  │   └─ or: git revert -m 1 <merge-commit> (if pushed)
  │
  ├─ Lost single commit?
  │   └─ git reflog | grep message → git cherry-pick SHA
  │
  └─ Dropped stash?
      └─ git fsck --lost-found → find dangling commit → git stash apply SHA

Lost UNCOMMITTED work?
  └─ Cannot recover with reflog. Check:
      - Local editor undo history
      - Filesystem snapshots (Time Machine, etc.)
      - Stash (if you stashed)
```

---

## 5. Advanced Reflog Usage

### Filtering reflog

```bash
# Show reflog for a specific branch (not just HEAD)
git reflog show main
git reflog show feature/auth

# Show reflog with timestamps
git reflog --date=iso

# Show reflog for all refs
git reflog show --all

# Limit output
git reflog -10

# Search by date
git reflog --after="2026-05-01"
```

### Using git fsck for deep recovery

When the reflog doesn't have what you need (e.g., reflog has expired):

```bash
# Find all dangling (orphaned) commit objects
git fsck --lost-found --no-reflogs

# Filter to just dangling commits
git fsck --lost-found --no-reflogs | grep "dangling commit"

# Inspect each candidate
git show --name-status <sha>
git show --stat <sha>

# When you find the right one, cherry-pick or reset to it
git cherry-pick <sha>
# or
git checkout -b recovery-branch <sha>
```

---

## 6. Reflog Expiry and Configuration

By default:
- Normal reflog entries: expire after **90 days**
- Unreachable commit entries: expire after **30 days**

```bash
# Check current settings
git config --get gc.reflogExpire
git config --get gc.reflogExpireUnreachable

# Increase retention (per-repo)
git config gc.reflogExpire 180.days
git config gc.reflogExpireUnreachable 90.days

# Increase retention globally
git config --global gc.reflogExpire 90.days
git config --global gc.reflogExpireUnreachable 30.days

# IMPORTANT: Do NOT run git gc --prune=now before recovering
# That permanently removes orphaned objects
```

---

## 7. Special Refs: ORIG_HEAD, MERGE_HEAD, CHERRY_PICK_HEAD

Git sets special refs automatically during operations:

| Ref | Set by | Purpose |
|---|---|---|
| `ORIG_HEAD` | `reset`, `merge`, `rebase`, `am` | Previous HEAD before the operation |
| `MERGE_HEAD` | `git merge` (when conflict exists) | The commit being merged in |
| `CHERRY_PICK_HEAD` | `git cherry-pick` (when conflict) | The commit being cherry-picked |
| `REBASE_HEAD` | `git rebase` (during conflict) | The commit being applied |

```bash
# Check which special refs currently exist
ls .git/*.HEAD 2>/dev/null || echo "No special refs"

# Use ORIG_HEAD to undo the last dangerous operation
git reset --hard ORIG_HEAD

# During a conflicting merge - abort and go back
git merge --abort    # same as: git reset --hard ORIG_HEAD during a merge
```

---

## 8. Preventive Best Practices

### Before any destructive operation

```bash
# 1. Create a backup tag/branch BEFORE the dangerous operation
git tag backup-before-rebase    # lightweight tag; easy to delete after
git branch backup/before-filter-repo

# 2. Check reflog first to understand current state
git reflog

# 3. For major operations, create a bundle backup
git bundle create backup.bundle --all

# 4. Never use bare --hard without understanding what's in HEAD
git diff HEAD     # what's staged
git diff          # what's unstaged
git status        # overall picture
```

### Safer alternatives to `--hard`

```bash
# Instead of reset --hard to undo one file:
git restore path/to/file     # modern syntax (Git 2.23+)
git checkout -- path/to/file # older syntax

# Instead of reset --hard to unstage:
git restore --staged path/to/file
git reset HEAD path/to/file  # older syntax

# Instead of reset --hard for "I want to start over on this branch":
git stash          # save current work first
git reset --hard origin/main  # or whatever base you want
git stash pop      # optionally restore work
```

### Commit early and often

Reflog only tracks committed states. The safety net disappears for work that was never committed:

```bash
# Habit: commit WIP before any risky operation
git commit -m "WIP: save before rebasing"

# Then fix it later with autosquash:
git commit --fixup HEAD~1
git rebase -i --autosquash origin/main
```

---

## Key Quotations

- "The reflog is a local log of where HEAD has pointed. It is your primary recovery tool." - FixDevs (2026)
- "Commits linger for 30+ days even after `reset --hard`. Know your reflog. It is your safety net." - DevToolbox (2026)
- "ORIG_HEAD Shortcut: Git automatically sets ORIG_HEAD before dangerous operations." - gitcheatsheet.dev
- "Act relatively quickly when you need to recover something. Avoid running `git gc` until you've recovered the commits you need." - Graphite.dev

---

## Citations

1. TheLinuxCode - "How to Undo git reset: A Practical Recovery Playbook (2026)" (2026-02-02): https://thelinuxcode.com/how-to-undo-git-reset-a-practical-recovery-playbook-2026/
2. GitCheatSheet - "Reflog - Your Safety Net": https://gitcheatsheet.dev/docs/advanced/reflog/
3. DevToolbox Blog - "Git Undo: Reset, Revert & Restore - The Complete Guide for 2026" (2026-02-13): https://devtoolbox.dedyn.io/blog/git-undo-reset-revert-guide
4. FixDevs - "Fix: Undo git reset --hard and Recover Lost Commits" (2026-03-15): https://www.fixdevs.com/blog/git-reset-hard-undo/
5. Shakil's Blog - "Git Reflog Explained: Recover Lost & Deleted Commits" (2026-02-27): https://blog.shakiltech.com/git-reflog-explained-recover-deleted-commits-lost-work/
6. how2.sh - "How to Recover Dropped Commits with Git Reflog and fsck" (2026-02-17): https://how2.sh/posts/how-to-recover-dropped-commits-with-git-reflog-and-fsck/
7. Graphite.dev - "Recovering lost commits with git reflog": https://graphite.dev/guides/recovering-lost-commits-git-reflog
8. Git Official Docs - git-reset: https://git-scm.com/docs/git-reset.html
