# Conflict Resolution - git-stinger

Merge conflicts, rebase conflicts, rerere, and mergetool configuration.

---

## Anatomy of a conflict marker

```
<<<<<<< HEAD
your version of the code
=======
incoming version of the code
>>>>>>> feature/new-login
```

- `<<<<<<< HEAD` - the current branch's version
- `=======` - separator
- `>>>>>>> <branch>` - the incoming branch's version

Resolution: edit the file to the desired final state, remove all three marker lines, then stage the file.

---

## Resolving a merge conflict

```bash
# See all conflicted files:
git status

# Open each conflicted file and edit
# ... resolve the markers ...

# Mark as resolved:
git add <file>

# Complete the merge:
git commit  # a merge commit message is pre-populated
```

To abort and return to the pre-merge state:
```bash
git merge --abort
```

---

## Resolving a rebase conflict

Rebase replays commits one at a time. Conflicts appear per-commit.

```bash
# Conflict during rebase:
git status          # shows conflicted files
# ... edit the files to resolve ...
git add <file>
git rebase --continue   # moves to the next commit

# Skip this commit entirely (dangerous - use only if commit is empty after resolution):
git rebase --skip

# Abort and return to pre-rebase state:
git rebase --abort
```

**Important:** During rebase, never use `git commit`. Always use `git rebase --continue`.

---

## Merge strategies

### Whole-file strategies (for binary files or large conflicts)

```bash
# Accept all changes from "our" side (current branch):
git checkout --ours <file>
git add <file>

# Accept all changes from "their" side (incoming branch):
git checkout --theirs <file>
git add <file>
```

### Strategy options (for `git merge`)

```bash
# Prefer our version for all conflicts automatically:
git merge -X ours <branch>

# Prefer their version for all conflicts automatically:
git merge -X theirs <branch>
```

Use `-X ours` and `-X theirs` with care - they silently resolve all conflicts in one direction, which is fast but potentially lossy.

---

## rerere: Reuse Recorded Resolution

`rerere` records how you resolved a conflict and auto-applies the same resolution if the same conflict appears again. Essential for repos with frequent long-running branches.

```bash
# Enable globally:
git config --global rerere.enabled true

# Enable per-repo:
git config rerere.enabled true
```

After enabling, each conflict resolution is recorded in `.git/rr-cache/`. The next time the same conflict appears (e.g., during a repeated rebase), Git applies the cached resolution automatically.

```bash
# See what rerere has recorded:
git rerere status

# See the cached diff:
git rerere diff

# Forget a bad cached resolution:
git rerere forget <file>
```

---

## Mergetool configuration

Configure a visual merge tool for complex conflicts:

```bash
# VS Code:
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'

# IntelliJ IDEA:
git config --global merge.tool intellij
git config --global mergetool.intellij.cmd 'idea merge $LOCAL $REMOTE $BASE $MERGED'

# vimdiff (built-in, no install required):
git config --global merge.tool vimdiff

# Launch the configured mergetool:
git mergetool
```

The mergetool opens each conflicted file. Save and close to mark as resolved; Git then stages the file and moves to the next conflict.

Set `mergetool.keepBackup false` to avoid `.orig` backup files:
```bash
git config --global mergetool.keepBackup false
```

---

## Cherry-pick conflicts

Cherry-pick applies a single commit from another branch. Conflicts appear the same way.

```bash
git cherry-pick <sha>
# ... resolve conflicts ...
git add <file>
git cherry-pick --continue

# Abort:
git cherry-pick --abort
```

---

## Diff3 conflict style (recommended)

The default conflict style shows only two versions. The `diff3` style also shows the common ancestor, giving more context:

```bash
git config --global merge.conflictstyle diff3
```

Conflict markers become:
```
<<<<<<< HEAD
your version
||||||| common ancestor
original version
=======
incoming version
>>>>>>> feature/new-login
```

The ancestor block makes it much easier to understand what both sides changed from.

Sources: research/external/01-interactive-rebase.md (rebase conflicts section)
