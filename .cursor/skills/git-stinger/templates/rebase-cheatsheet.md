# Rebase Cheat-sheet

Quick-reference card for `git rebase -i` commands and common rebase workflows.

---

## rebase -i command reference

| Command | Short | Effect |
|---|---|---|
| `pick` | `p` | Keep commit as-is |
| `reword` | `r` | Keep commit, edit message |
| `edit` | `e` | Keep commit, pause to amend |
| `squash` | `s` | Meld into previous, combine messages |
| `fixup` | `f` | Meld into previous, discard message |
| `drop` | `d` | Delete commit entirely |
| `exec` | `x` | Run shell command |
| `break` | `b` | Pause here |

---

## Common one-liners

```bash
# Interactive rebase for last N commits:
git rebase -i HEAD~N

# Rebase with autosquash (auto-reorders fixup! commits):
git rebase -i --autosquash HEAD~N

# Rebase onto another branch's tip:
git rebase -i main

# Abort a rebase in progress:
git rebase --abort

# Continue after resolving conflicts:
git rebase --continue

# Skip a commit during rebase (dangerous):
git rebase --skip
```

---

## Autosquash workflow

```bash
# Create a fixup commit for commit abc1234:
git commit --fixup abc1234

# Or by message match:
git commit -m "fixup! feat: add user profile"

# Rebase with autosquash (auto-marks fixup! commits):
git rebase -i --autosquash HEAD~5
```

Enable permanently:
```bash
git config --global rebase.autoSquash true
```

---

## Escape hatches

```bash
# Before rebase - save sha:
git log -1 --format=%H

# After rebase - undo:
git reset --hard ORIG_HEAD

# Find pre-rebase sha in reflog:
git reflog | grep "rebase"
```

---

## Force-push after rebase

```bash
# Safe (aborts if remote was updated):
git push --force-with-lease origin <branch>

# Never:
git push --force
```

---

## Conflict resolution during rebase

```bash
# Resolve conflict:
git status                   # find conflicted files
# edit files ...
git add <file>
git rebase --continue        # NOT git commit

# Accept all from current branch:
git checkout --ours <file>   # then: git add <file>

# Accept all from incoming:
git checkout --theirs <file> # then: git add <file>
```
