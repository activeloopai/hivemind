---
name: git-stinger
description: Git mastery specialist - interactive rebase (squash, fixup, reword, drop), conflict resolution, history rewriting (git filter-repo, BFG), reset/reflog recovery, worktrees for parallel branches, hooks (Husky, lefthook), submodules vs subtrees, Git LFS, partial clone, and sparse checkout. Use when the user says "squash my commits", "I pushed a secret", "my repo is huge", "undo that rebase", "work on two branches at once", "set up Git hooks", "submodules vs subtrees", or needs any Git recovery operation. Do NOT use for CI/CD pipeline configuration (ci-release-worker-bee) or credential rotation after a secrets incident (security-worker-bee).
---

# git Stinger

The procedural arsenal for `git-worker-bee`. This stinger encodes the opinionated playbooks for every Git mastery surface: interactive rebase, conflict resolution, history rewriting, reflog recovery, worktrees, hooks, large-file storage, and submodule/subtree architecture.

**When invoked, read `SKILL.md` first, then the relevant guide(s) for the task at hand. Research files confirm every factual claim; cite them when answering questions.**

---

## Scope and non-scope

**In scope:**
- Branching strategy advisory (trunk-based, Git Flow, GitHub Flow)
- Interactive rebase: squash, fixup, reword, drop, reorder, exec, autosquash
- Conflict resolution: merge conflicts, rebase conflicts, rerere, mergetool config
- History rewriting: `git filter-repo`, BFG Repo Cleaner, removing secrets/large files
- Reset/reflog recovery: all three reset types, recovering deleted branches and commits
- Git worktrees: parallel branch work without stashing
- Hooks: client-side (pre-commit, commit-msg, pre-push) and server-side hand-off
- Submodules vs subtrees decision matrix and lifecycle
- Git LFS: setup, `.gitattributes`, selective fetch, CI patterns
- Partial clone (`--filter=blob:none`) and sparse checkout v2 (`--cone` mode)
- Commit signing: GPG and SSH signature verification

**Not in scope:**
- CI/CD pipeline configuration using Git events -> ci-release-worker-bee
- Server-side hook configuration in CI/CD runners -> ci-release-worker-bee
- Credential rotation after a secrets-in-history incident -> security-worker-bee
- Secret scanning policies and repository security tooling -> security-worker-bee
- GitHub/GitLab REST API usage beyond the Git protocol itself

---

## Eight-action playbook

The Bee performs eight distinct actions. Each maps to a guide:

| Action | Guide |
|---|---|
| Interactive rebase (squash, fixup, autosquash) | `guides/01-interactive-rebase.md` |
| History rewriting (filter-repo, BFG, secrets removal) | `guides/02-history-rewriting.md` |
| Conflict resolution (merge, rebase, rerere) | `guides/03-conflict-resolution.md` |
| Reset/reflog recovery | `guides/04-reflog-recovery.md` |
| Worktrees for parallel branches | `guides/05-worktrees.md` |
| Hooks (pre-commit, commit-msg, pre-push) | `guides/06-hooks.md` |
| Large files (Git LFS, partial clone, sparse checkout) | `guides/07-lfs-and-large-files.md` |
| Submodules vs subtrees decision | `guides/08-submodules-vs-subtrees.md` |

---

## Critical directives (from Command Brief)

These are non-negotiables. Full justifications in `guides/00-principles.md`.

1. **Always offer the escape hatch before a destructive operation.** Before `git reset --hard`, show `git reflog`. Before `filter-repo`, show `git bundle create backup.bundle --all`. Before any force-push, show the rollback command. The escape hatch must precede the operation.

2. **Prefer `--force-with-lease` over `--force`.** `--force` overwrites without checking whether a teammate pushed since your last fetch. `--force-with-lease` aborts if the remote was updated, preventing silent overwrites. Use `--force-with-lease=<refname>` for the strictest variant.

3. **Never recommend `git filter-branch`.** It is officially deprecated (Git 2.36+) in favor of `git filter-repo`. It is an order of magnitude slower, has known correctness bugs, and the manpage now opens with a deprecation warning. Always use `filter-repo` or BFG.

4. **Confirm the Git version before recommending advanced features.** Worktrees stabilized in Git 2.15. Sparse checkout v2 (cone mode) arrived in 2.25. Partial clone landed in 2.22. `--rebase-merges` in 2.22. `--autosquash` has been available since 1.7.4 but `fixup!` with a comment requires 2.32.

5. **Escalate to security-worker-bee for secrets-in-history scenarios.** Removing a secret from history requires force-push coordination AND credential rotation - the secret must be treated as compromised even after removal. That coordination (rotating keys, auditing access logs, notifying stakeholders) is security-worker-bee's domain.

6. **Escalate to ci-release-worker-bee for server-side hooks and CI Git configuration.** Server-side hooks (`pre-receive`, `update`, `post-receive`) run in CI contexts with different Git versions, file system constraints, and network policies.

---

## Git version requirements matrix

| Feature | Minimum Git version |
|---|---|
| `git worktree` (stable) | 2.15 |
| Partial clone (`--filter`) | 2.22 |
| `--rebase-merges` | 2.22 |
| Sparse checkout v2 (`--cone`) | 2.25 |
| `git switch` / `git restore` | 2.23 |
| `filter-branch` deprecated warning | 2.36 |
| `git bundle --filter` | 2.41 |

Check with `git --version` before using any of the above.

---

## Quick reference: recovery operations

| Scenario | Command |
|---|---|
| Undo last commit (keep changes staged) | `git reset --soft HEAD~1` |
| Undo last commit (keep changes unstaged) | `git reset HEAD~1` |
| Undo last commit (discard changes) | `git reset --hard HEAD~1` + verify with reflog first |
| Recover deleted branch | `git checkout -b <branch> <sha>` (sha from `git reflog`) |
| Recover dropped stash | `git stash apply <sha>` (sha from `git fsck --lost-found`) |
| Undo a merge | `git reset --hard ORIG_HEAD` |
| Undo a rebase | `git reset --hard ORIG_HEAD` or find pre-rebase sha in reflog |
| Recover file deleted in past commit | `git checkout <sha>^ -- <path>` |

---

## Quick reference: interactive rebase commands

| Command | Effect |
|---|---|
| `pick` | Keep commit as-is |
| `reword` | Keep commit, edit message |
| `edit` | Keep commit, pause to amend |
| `squash` | Meld into previous commit, combine messages |
| `fixup` | Meld into previous commit, discard message |
| `drop` | Delete commit entirely |
| `exec` | Run shell command between commits |
| `break` | Pause rebase at this point |

---

## Folder layout

```text
git-stinger/
├── SKILL.md                         (this file - master index)
├── README.md                        (human overview)
├── guides/
│   ├── 00-principles.md             (escape-hatch-first, force-with-lease, filter-branch deprecation, version matrix, public-branch rule)
│   ├── 01-interactive-rebase.md     (squash, fixup, autosquash, rebase -i conflict resolution)
│   ├── 02-history-rewriting.md      (filter-repo, BFG, backup procedure, force-push protocol)
│   ├── 03-conflict-resolution.md    (merge conflicts, rerere, mergetool, cherry-pick conflicts)
│   ├── 04-reflog-recovery.md        (reset types, recovering deleted branches/commits, ORIG_HEAD)
│   ├── 05-worktrees.md              (worktree commands, bare clone pattern, AI agent use cases)
│   ├── 06-hooks.md                  (pre-commit, commit-msg, pre-push; Husky/lefthook setup)
│   ├── 07-lfs-and-large-files.md    (LFS setup, .gitattributes, partial clone, sparse checkout)
│   └── 08-submodules-vs-subtrees.md (decision matrix, lifecycle commands, alternatives)
├── examples/
│   ├── secrets-removal.md           (end-to-end: discovered secret → backup → filter-repo → force-push → escalate)
│   └── worktree-parallel-features.md (two features in progress without stash context-switch)
├── templates/
│   ├── gitattributes-starter.md     (.gitattributes with LFS patterns + line-ending normalization)
│   ├── hooks-collection.md          (pre-commit, commit-msg, pre-push hook scripts)
│   └── rebase-cheatsheet.md         (quick-reference card for rebase -i commands)
├── reports/
│   └── README.md                    (past run summaries accumulate here)
└── research/                        (authored by scripture-historian - DO NOT MODIFY)
    ├── research-plan.md
    ├── research-summary.md
    ├── index.md
    ├── internal/
    └── external/
```

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
