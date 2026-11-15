# Reflog Recovery - git-stinger

Undoing destructive operations using `git reflog`, `ORIG_HEAD`, and the three reset types.

---

## The three reset types

| Reset type | Working tree | Index (staging) | Commits | Use when |
|---|---|---|---|---|
| `--soft` | Unchanged | Unchanged | Undone | Undo commit, keep changes staged |
| `--mixed` (default) | Unchanged | Cleared | Undone | Undo commit, unstage changes |
| `--hard` | Cleared | Cleared | Undone | Undo commit AND discard all changes |

```bash
# Undo last commit, keep changes staged:
git reset --soft HEAD~1

# Undo last commit, keep changes unstaged:
git reset HEAD~1       # --mixed is the default

# Undo last commit, discard all changes (destructive):
git reset --hard HEAD~1
# Escape hatch: git reflog → find sha → git reset --hard <sha>
```

**Before `git reset --hard`, always note the current sha:**
```bash
git log -1 --format=%H  # copy this sha before running reset --hard
```

---

## ORIG_HEAD: the one-step undo

Git saves the previous HEAD in `ORIG_HEAD` before any operation that moves HEAD significantly (merge, rebase, reset). This is the fastest one-step undo.

```bash
# Undo a merge:
git reset --hard ORIG_HEAD

# Undo a rebase:
git reset --hard ORIG_HEAD

# Undo a reset:
git reset --hard ORIG_HEAD

# ORIG_HEAD is overwritten each time, so it only covers the most recent such operation.
```

---

## git reflog: the complete history of HEAD movements

```bash
git reflog
```

Output:
```
abc1234 HEAD@{0}: rebase -i (finish): returning to refs/heads/feature
def5678 HEAD@{1}: rebase -i (squash): feat: add user profile
ghi9012 HEAD@{2}: rebase -i (pick): fix: validation logic
jkl3456 HEAD@{3}: checkout: moving from main to feature
mno7890 HEAD@{4}: commit: initial feature work
```

Each row is an action; the sha on the left is the state of HEAD at that moment.

### Recovering with reflog

```bash
# Find the sha you want to return to:
git reflog

# Reset to that state:
git reset --hard HEAD@{3}   # or use the sha directly
git reset --hard mno7890
```

Reflog entries expire after 90 days by default (`gc.reflogExpire`). For the stash reflog, entries expire after 30 days.

---

## Recovering a deleted branch

```bash
# Find the sha of the deleted branch's tip:
git reflog | grep "checkout: moving from deleted-branch"
# or
git reflog --all | grep deleted-branch

# Re-create the branch at that sha:
git checkout -b deleted-branch <sha>
# or with the newer syntax:
git switch -c deleted-branch <sha>
```

If the branch was deleted on the remote, check `git log FETCH_HEAD` or `git reflog origin/deleted-branch` if the remote ref was fetched before deletion.

---

## Recovering after `git reset --hard`

```bash
# Step 1: Find the sha of the lost commit in reflog:
git reflog
# Look for the commit just before the "reset: moving to" line

# Step 2: Reset to that sha:
git reset --hard <sha>

# Alternative: cherry-pick the lost commit onto current HEAD:
git cherry-pick <sha>
```

---

## Recovering a dropped stash

```bash
# Method 1: stash reflog
git stash list  # all current stashes
git reflog stash  # shows dropped stashes too

# Method 2: git fsck (finds all unreferenced objects)
git fsck --lost-found 2>/dev/null | grep "dangling commit"

# Each "dangling commit" may be a dropped stash. Inspect:
git stash show -p <dangling-sha>

# Apply if it's the one you want:
git stash apply <dangling-sha>
```

`fsck --lost-found` writes all dangling objects to `.git/lost-found/`. This is the last resort; dangling objects are garbage-collected eventually.

---

## Recovering a lost commit (gc'ed or deep reflog)

If a commit no longer appears in reflog (expired), use:

```bash
git fsck --lost-found
# Look for "dangling commit" lines

# Inspect each:
git show <sha>

# Re-attach it:
git cherry-pick <sha>
# or
git branch recovered-work <sha>
```

---

## Special ref cheat-sheet

| Ref | Meaning |
|---|---|
| `HEAD` | Current commit |
| `HEAD~1` | One commit before HEAD |
| `HEAD~N` | N commits before HEAD |
| `ORIG_HEAD` | HEAD before last merge/rebase/reset |
| `MERGE_HEAD` | Commit being merged in (during merge) |
| `CHERRY_PICK_HEAD` | Commit being cherry-picked |
| `REBASE_HEAD` | Current commit being replayed during rebase |
| `FETCH_HEAD` | Last fetched remote sha |

---

## Branch protection with reflog

```bash
# Extend reflog expiry (default 90 days):
git config --global gc.reflogExpire 180

# Extend reflog expiry for unreachable objects (default 30 days):
git config --global gc.reflogExpireUnreachable 60
```

Increasing these values gives more time to recover from mistakes before gc cleans them up.

Sources: research/external/02-reflog-recovery.md
