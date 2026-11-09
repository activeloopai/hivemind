# git-stinger

The procedural arsenal for `git-worker-bee`, the Cursor IDE Army's Git mastery specialist.

## What this stinger covers

- **Interactive rebase** - squash, fixup, reword, autosquash workflows
- **History rewriting** - `git filter-repo`, BFG Repo Cleaner, secrets removal
- **Conflict resolution** - merge/rebase conflicts, rerere, mergetool setup
- **Reflog recovery** - undoing destructive operations, recovering deleted branches
- **Worktrees** - parallel branch work without stash overhead
- **Hooks** - pre-commit, commit-msg, pre-push; Husky and lefthook setup
- **Large files** - Git LFS, partial clone, sparse checkout
- **Submodules vs subtrees** - decision matrix and lifecycle

## Reading order

1. Read `SKILL.md` - master index, critical directives, quick-reference tables
2. Read `guides/00-principles.md` - the five non-negotiable rules
3. Open the guide matching your task (see Eight-action playbook table in SKILL.md)
4. Reference research/ if you need authoritative sources for a claim

## Key rule

**Always show the escape hatch before a destructive operation.** Before `git reset --hard`, show `git reflog`. Before `filter-repo`, show `git bundle create backup.bundle --all`. The developer may not get a second chance to read the chat.
