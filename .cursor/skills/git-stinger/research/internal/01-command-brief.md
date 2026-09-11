---
source_url: internal - git-worker-bee-command-brief.md
retrieved_on: 2026-05-20
source_type: internal
authority: official
relevance: critical
topic: command-brief
stinger: git-stinger
---

# Command Brief Summary: git-worker-bee

Structured summary of the Command Brief at `ai-tools/command-briefs/git-worker-bee-command-brief.md`. This is the internal design document that `stinger-forge` uses to understand what the Bee does, what it does NOT do, and what playbook structure to build.

---

## Identity

- **Bee name:** `git-worker-bee`
- **Stinger name:** `git-stinger`
- **Backlog position:** 017
- **Research depth:** normal
- **Launch priority:** HIGH (Git is universal; immediate broad value)
- **Refresh cadence:** Annual (Git evolves slowly; LFS and sparse-checkout sections may need updating if GitHub/GitLab changes pricing or support)

---

## What git-worker-bee Owns

The full Git workflow surface:

| Domain | Scope |
|---|---|
| Branching strategies | Git Flow, trunk-based, GitHub Flow - decision matrix |
| Interactive rebase | `rebase -i` squash/fixup/reword/drop/reorder/exec, `--autosquash` |
| Conflict resolution | `ours`/`theirs`/manual, `git rerere`, `git mergetool` |
| History rewriting | `git filter-repo` (NOT `filter-branch`), BFG, secrets removal |
| Recovery toolkit | `git reflog`, `git reset` (soft/mixed/hard), `ORIG_HEAD`, `git fsck` |
| Git worktrees | `worktree add/list/remove/prune`, bare clone pattern |
| Hooks | client-side (pre-commit, commit-msg, pre-push), server-side (pre-receive, post-receive), Husky/lefthook |
| Large files | Git LFS, `.gitattributes`, `git lfs migrate`, partial clone, sparse checkout |
| Submodules vs subtrees | Decision matrix, `git submodule` lifecycle, `git subtree` |
| Commit signing | GPG/SSH key signing |

## What git-worker-bee Does NOT Own

| Out of scope | Owned by |
|---|---|
| CI/CD pipeline configuration on top of Git events | `ci-release-worker-bee` |
| GitHub/GitLab API usage beyond the Git protocol | `ci-release-worker-bee` |
| PR review process tooling | `ci-release-worker-bee` |
| Server-side hook configuration in CI | `ci-release-worker-bee` |
| Credential rotation after secrets-in-history incident | `security-worker-bee` |
| Secret scanning policies | `security-worker-bee` |

---

## Seven Action Categories (Maps to Stinger Guides)

When a developer brings a Git problem, `git-worker-bee` maps it to one of:

1. **Rebase / history cleanup** → `guides/01-interactive-rebase.md` + `guides/02-history-rewriting.md`
2. **Conflict resolution** → `guides/03-conflict-resolution.md`
3. **Recovery** → `guides/04-reflog-recovery.md`
4. **Worktrees** → `guides/05-worktrees.md`
5. **Hooks** → `guides/06-hooks.md`
6. **Large files** → `guides/07-lfs-and-large-files.md`
7. **Submodules vs subtrees** → `guides/08-submodules-vs-subtrees.md`

---

## Five Critical Directives (Non-Negotiable)

1. **Always show the escape hatch BEFORE a destructive operation.**
   - Before `git reset --hard` → show `git reflog`
   - Before `git rebase` → show `ORIG_HEAD` and how to abort
   - Before `git filter-repo` → show `git bundle create backup.bundle --all`

2. **Prefer `--force-with-lease` over `--force`.**
   - `--force` silently overwrites if a teammate pushed since your last fetch
   - `--force-with-lease` aborts if the remote was updated

3. **Never recommend `git filter-branch`.**
   - Officially deprecated
   - 10-50x slower than `git filter-repo`
   - Known correctness bugs
   - Always recommend `git filter-repo` instead

4. **Confirm Git version before recommending advanced features.**
   - Worktrees: Git 2.15+
   - Sparse checkout v2: Git 2.25+
   - Partial clone: Git 2.22+
   - `--rebase-merges`: Git 2.22+
   - `--update-refs` (stacked branches): Git 2.38+

5. **Escalate to the right Bee.**
   - Secrets removal → secrets rotation → `security-worker-bee`
   - Server-side hooks + CI → `ci-release-worker-bee`

---

## Expected Stinger Structure

### Guides

```
guides/
├── 00-principles.md          # escape-hatch-first rule, --force-with-lease, filter-branch deprecation,
│                             # Git 2.x feature gate table, "public branch" rebase rule
├── 01-interactive-rebase.md  # rebase -i commands, autosquash, --rebase-merges, conflict resolution
├── 02-history-rewriting.md   # filter-repo installation+usage, BFG alternative, backup+force-push protocol
├── 03-conflict-resolution.md # merge conflict anatomy, strategies (ours/theirs), rerere, mergetool
├── 04-reflog-recovery.md     # reflog anatomy, scenarios (hard reset, deleted branch, bad rebase), reset types
├── 05-worktrees.md           # worktree commands, bare clone pattern, IDE caveats, decision matrix
├── 06-hooks.md               # client-side+server-side hooks, Husky/lefthook, .githooks/ + core.hooksPath
├── 07-lfs-and-large-files.md # LFS setup, .gitattributes, lfs migrate, partial clone, sparse checkout
└── 08-submodules-vs-subtrees.md  # decision matrix, submodule lifecycle, subtree split/merge
```

### Examples

```
examples/
├── secrets-removal.md        # end-to-end: discovered secret → backup → filter-repo → force-push → credential rotation
└── worktree-parallel-features.md  # two features in progress simultaneously without stash overhead
```

### Templates

```
templates/
├── gitattributes-starter.md  # documented .gitattributes with LFS, line-ending normalization, diff drivers
├── hooks-collection.md       # pre-commit (lint/test/whitespace), commit-msg (conventional), pre-push (protect main)
└── rebase-cheatsheet.md      # quick-reference card for rebase -i commands
```

---

## Open Questions from Brief (for stinger-forge to address)

1. Should the stinger cover `git bisect` as a debugging tool, or is it out of scope?
2. Should branching strategy recommendations (trunk-based vs Git Flow) be a dedicated guide or folded into `00-principles.md`?

---

## Key Inputs the Bee Needs from Developers

- The specific Git problem or goal
- Repository context: monorepo vs polyrepo, public vs private, shared team repo vs solo
- Optional: branch strategy in use, Git version (`git --version`), whether branch is already pushed
- For debugging: specific files, commit hashes, or error output

---

## Notes for stinger-forge

- The `filter-repo` guide must prominently lead with "rotate credentials FIRST, then clean history"
- The reflog guide must cover `ORIG_HEAD` as the fastest immediate undo mechanism
- The LFS guide must include the pointer validation check (file < 1KB = misconfigured LFS, not actual binary)
- The hooks guide should cover both Husky (Node ecosystem) and lefthook (polyglot) and the native `.githooks/` + `core.hooksPath` approach
- Every guide must cite at least one research source from the `research/external/` folder
- The principles guide (00) should include the Git version feature gate table upfront, since recommending unavailable features silently fails
