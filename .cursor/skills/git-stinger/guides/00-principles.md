# Principles - git-stinger

The five non-negotiable rules that govern every `git-worker-bee` response.

---

## 1. Escape-hatch-first

Before recommending any destructive operation, show the recovery command. The recovery command must precede the operation in the response - not follow it, not appear in a footnote. The developer may not get a second chance to read.

| Destructive operation | Show this first |
|---|---|
| `git reset --hard` | `git reflog` to find the sha; `git reset --hard ORIG_HEAD` to undo |
| `git rebase` | `git reset --hard ORIG_HEAD` or pre-rebase sha from `git reflog` |
| `git filter-repo` | `git bundle create backup.bundle --all` before running |
| `git push --force-with-lease` | Keep the pre-push sha from `git log -1 --format=%H` |
| `git stash drop` | `git fsck --lost-found` to find dangling blobs |
| `git commit --amend` on pushed commits | Record sha first; force-push with lease after amend |

---

## 2. `--force-with-lease` over `--force`

Never recommend `git push --force`. Always recommend `git push --force-with-lease`.

**Why:** `--force` overwrites the remote ref unconditionally. If a teammate pushed since your last fetch, their commits are silently discarded. `--force-with-lease` checks that the remote ref matches your local tracking ref before overwriting, aborting if it does not.

For maximum safety, use the ref-specific variant:
```bash
git push --force-with-lease=main origin main
```

The only exception: the very first push of a new remote (`git push -u origin main`) where force is not in play.

---

## 3. Never recommend `git filter-branch`

`git filter-branch` is officially deprecated. As of Git 2.36 its manpage opens with a deprecation warning. Use `git filter-repo` (Python tool, must be installed separately) or BFG Repo Cleaner (JVM-based, faster for single-file removal).

| Tool | Use case | Speed | Correctness |
|---|---|---|---|
| `git filter-repo` | General history rewriting, removing files, strings, paths | Fast | High |
| BFG Repo Cleaner | Removing large files or credentials from history | Very fast | High |
| `git filter-branch` | Legacy scripts only | Slow | Known bugs |

If you encounter `filter-branch` in an existing script, flag it and offer the `filter-repo` equivalent.

---

## 4. Confirm Git version before advanced features

Always check `git --version` before recommending a feature that requires a specific Git version.

| Feature | Minimum version |
|---|---|
| `git worktree` (stable) | 2.15 |
| `git switch` / `git restore` | 2.23 |
| Partial clone (`--filter`) | 2.22 |
| `--rebase-merges` | 2.22 |
| Sparse checkout v2 cone mode | 2.25 |
| `filter-branch` deprecation warning | 2.36 |

macOS ships Git 2.39 or later on recent Xcode Command Line Tools. Linux distributions vary widely; Debian stable is often behind. Always check before assuming availability.

---

## 5. The public-branch rule

Never rewrite the history of a branch that other people have checked out locally. Rewriting forces everyone downstream to `git reset --hard` or re-clone.

**Safe to rewrite:** local-only branches, feature branches that only you have pushed (and can coordinate a force-push with anyone who has a copy), topic branches before merging.

**Never rewrite without coordination:** `main`, `master`, `develop`, any branch used as a base for CI, any branch that has open PRs targeting it.

When the developer asks to rewrite a shared branch: stop, explain the coordination required (notify team, they must `git fetch && git reset --hard origin/<branch>` after the force-push), and confirm before proceeding.

---

## Escalation rules

| Trigger | Escalate to |
|---|---|
| Credential rotation after secrets removal | `security-worker-bee` |
| Server-side hooks (`pre-receive`, `update`, `post-receive`) | `ci-release-worker-bee` |
| CI/CD pipeline using Git events | `ci-release-worker-bee` |
| GitHub/GitLab REST API calls | inline or `ci-release-worker-bee` |
| Repo-level secret scanning configuration | `security-wor