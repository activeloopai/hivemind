# Interactive Rebase - git-stinger

Squash, fixup, reword, drop, reorder, and exec - the full `git rebase -i` playbook.

---

## Starting an interactive rebase

```bash
# Rebase the last N commits
git rebase -i HEAD~N

# Rebase from (but not including) a specific commit
git rebase -i <sha>

# Rebase onto another branch's tip
git rebase -i main
```

Always run `git log --oneline -10` first to identify the commits and count N.

**Escape hatch before starting:**
```bash
# Save the current HEAD
git log -1 --format=%H
# After rebase, if anything goes wrong:
git rebase --abort          # while rebase is paused
git reset --hard ORIG_HEAD  # after rebase completed but you want to undo
```

---

## The rebase -i command reference

When the editor opens, each line is `<command> <sha> <message>`. Edit the command word:

| Command | Short | Effect |
|---|---|---|
| `pick` | `p` | Keep commit as-is |
| `reword` | `r` | Keep commit, edit commit message |
| `edit` | `e` | Keep commit, pause to amend (add files, split commit) |
| `squash` | `s` | Meld into previous commit, combine both messages |
| `fixup` | `f` | Meld into previous commit, discard this message |
| `drop` | `d` | Delete commit entirely |
| `exec` | `x` | Run shell command at this point in the rebase |
| `break` | `b` | Pause here (useful for inspection) |
| `label` | `l` | Label current HEAD (for rebase-merges) |
| `reset` | `t` | Reset HEAD to a label |
| `merge` | `m` | Create a merge commit (requires `--rebase-merges`) |

---

## Common workflows

### Squash the last 3 commits into one

```bash
git rebase -i HEAD~3
```

Change the bottom 2 commits from `pick` to `squash` (or `s`):
```
pick abc1234 Initial feature scaffolding
squash def5678 Add validation
squash ghi9012 Fix typo
```

An editor opens for the combined commit message. Keep what you want, delete the rest.

### Clean up with fixup (discard WIP messages)

```bash
git rebase -i HEAD~4
```

Change WIP commits to `fixup` (or `f`):
```
pick abc1234 feat: add user profile page
fixup def5678 wip
fixup ghi9012 fix lint
fixup jkl3456 forgot to save
```

The fixup commits are merged in silently; their messages are discarded.

### Autosquash: pre-mark commits for fixup

Create commits that auto-mark themselves for fixup during rebase:

```bash
# Create a fixup commit targeting "feat: add user profile page"
git commit --fixup abc1234

# Or by message prefix:
git commit -m "fixup! feat: add user profile page"

# Then rebase with --autosquash:
git rebase -i --autosquash HEAD~5
```

Git automatically reorders the `fixup!` commits after their target and marks them as `fixup`. Set as the default:
```bash
git config --global rebase.autoSquash true
```

### Reword a commit message mid-history

```bash
git rebase -i HEAD~4
```

Change the target commit's command to `reword` (or `r`):
```
pick abc1234 My typo in commit message
reword def5678 Old message I want to change
pick ghi9012 Later commit
```

An editor opens for the commit you marked `reword`. Edit and save.

### Split a commit into two

Mark the commit as `edit`:
```
pick abc1234 Previous commit
edit def5678 Commit to split
pick ghi9012 Later commit
```

When rebase pauses at that commit:
```bash
git reset HEAD~   # unstage the commit's changes (soft reset)
git add -p        # stage first logical chunk
git commit -m "First part"
git add -p        # stage second logical chunk
git commit -m "Second part"
git rebase --continue
```

---

## Resolving conflicts during rebase

Unlike a merge, a rebase replays each commit one at a time. Conflicts appear per-commit.

```bash
# When a conflict appears:
git status          # shows conflicted files
# Edit files to resolve conflicts
git add <file>      # mark as resolved
git rebase --continue   # continue to next commit

# To skip this commit entirely (dangerous):
git rebase --skip

# To abort and return to pre-rebase state:
git rebase --abort
```

After resolving, never use `git commit` during rebase - always use `git rebase --continue`.

---

## `--rebase-merges`: preserve merge commits

By default, `rebase -i` linearizes history (drops merge commits). To preserve merge structure:

```bash
git rebase -i --rebase-merges HEAD~10
```

Requires Git 2.22+. The editor shows `label`, `reset`, and `merge` commands alongside the usual commands.

---

## Setting the default editor for rebase

```bash
git config --global core.editor "code --wait"   # VS Code
git config --global core.editor "vim"
git config --global sequence.editor "interactive-rebase-tool"  # GUI tool
```

---

## After rebase: updating the remote

Because rebase rewrites history, a force-push is required:

```bash
# Safe force-push (aborts if remote was updated since your last fetch):
git push --force-with-lease origin <branch>

# Never:
git push --force  # overwrites without checking remote state
```

Sources: research/external/01-interactive-rebase.md
