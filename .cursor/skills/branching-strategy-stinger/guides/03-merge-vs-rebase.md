# Merge vs Rebase: When Each Applies

**Research sources:** `research/external/2026-02-17-release-branch-pattern-azure-devops.md` (merge method types, Azure official docs), `research/external/2026-03-31-tbd-vs-gitflow-comparison-novvista.md` (squash-merge as the modern default).

> TODO: open question - merge-vs-rebase guide sourcing. The current research corpus covers merge method types tangentially. A targeted search for "git squash merge vs rebase bisect impact 2026" would strengthen this guide's factual basis. (`research/research-summary.md` open question 3)

---

## The three options

### Squash merge (recommended default for feature branches)

**What it does:** Takes all commits on the feature branch and squashes them into a single commit on the target branch. The feature branch's commit history is discarded.

**When to use:**
- Merging feature branches into `main` (GitHub Flow, TBD).
- When the in-branch commits are noisy ("WIP", "fix typo", "actually fix typo") and don't belong in shared history.
- When you want easy reverts: one `git revert <squash-commit>` undoes the entire feature.

**Trade-off:**
- Loses per-commit bisect granularity for the work done within the branch.
- If a feature branch has 50 commits, bisecting into those commits later is impossible from `main`.
- Acceptable for most features; not acceptable for large algorithmic changes where blame at line level inside the feature matters.

**GitHub Flow standard:** "squash merges into main" is the mode that the 2026 research corpus identifies as the most common practice among SaaS teams. (Source: `research/external/2026-03-31-tbd-vs-gitflow-comparison-novvista.md`)

---

### Merge commit (preserve history)

**What it does:** Creates a merge commit on the target branch that joins both histories. All source commits remain visible and individually navigable.

**When to use:**
- Merging a `release/X.Y.Z` branch back to `main` or `develop` - the merge commit marks the exact point the release entered the integration branch, and the full branch history is auditable.
- When the team or auditors need to trace individual commits within a feature for compliance or post-incident analysis.
- When the feature contains independent sub-changes that individually need to be `git revert`-able.

**Trade-off:**
- `git log --oneline --graph` on `main` becomes cluttered with merge commits over time.
- "Octopus merges" (multiple simultaneous parents) are hard to read and hard to bisect across.

---

### Rebase (clean local history, NOT for shared branches)

**What it does:** Rewrites the feature branch's commits so they appear to start from the current tip of the target branch, rather than from the branch point. Each commit gets a new SHA.

**When to use:**
- Within a local feature branch before opening a PR - to incorporate changes from main without a merge commit.
- To clean up a branch's local commit history before review (interactive rebase: `git rebase -i`).

**When NOT to use:**
- Never on a branch that other engineers have cloned or are reviewing. Rewriting SHAs causes their local copies to diverge and requires force-push recovery.
- Never on `main`, `develop`, or any protected branch.
- For the mechanics of interactive rebase and recovery from bad rebases, route to `git-worker-bee`.

---

## Team-level merge strategy policy

When authoring the branching policy document, specify ONE merge method per target branch. Mixing methods on the same target branch makes history unpredictable:

| Target branch | Recommended method | Rationale |
|---|---|---|
| `main` (GitHub Flow) | Squash | Clean history, easy reverts, one commit per feature |
| `main` (TBD) | Squash or rebase | Either works when branches are < 1 day |
| `develop` (GitFlow) | Merge commit | Preserve feature branch audit trail in integration |
| `main` from `release/X.Y.Z` | Merge commit | Mark the exact release point in main's history |
| `develop` from `hotfix/X` | Merge commit or cherry-pick | Preserve hotfix attribution |

---

## Merge strategy ≠ branch model

**This is the most common conflation.** Teams say "we use rebase" when they mean "we have a merge strategy decision." Clarify:

- **Branching model** = how you structure branches, who works where, when branches are created and deleted (GitHub Flow, GitFlow, TBD).
- **Merge strategy** = how commits move from a source branch to a target branch (squash, merge commit, rebase-then-merge).

A team can use GitHub Flow (branching model) with squash merges, merge commits, OR rebase - these are independent choices. Configure the merge strategy in GitHub's repository settings ("Allow squash merging", "Allow merge commits", "Allow rebase merging") and disable the options you don't want to permit.
