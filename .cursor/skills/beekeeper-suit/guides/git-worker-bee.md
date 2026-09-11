# Git Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `git-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/git-worker-bee.md`](../../../agents/git-worker-bee.md)
**Stinger:** [`.cursor/skills/git-stinger/`](../../git-stinger/)
**Trigger policy:** on-demand

---

## Domain

`git-worker-bee` is the Army's Git mechanics specialist. It owns interactive rebase (squash, fixup, reword, autosquash), conflict resolution (rerere, mergetool, diff3), history rewriting (git filter-repo, BFG, never filter-branch), reset/reflog recovery (all three reset types, recovering deleted branches and commits), worktrees for parallel branch work, hooks (pre-commit, commit-msg, pre-push; Husky, lefthook), the submodules-vs-subtrees decision, Git LFS, partial clone, and sparse checkout. It always shows the escape hatch before a destructive operation.

## Trigger phrases

Route to `git-worker-bee` when the user says any of:

- "Squash my commits"
- "I pushed a secret" / "I accidentally pushed a secret"
- "My repo is huge"
- "Undo that rebase" / "recover my deleted branch"
- "Work on two branches at once"
- "Set up Git hooks" / "submodules vs subtrees"

Or when the request implicitly involves any Git recovery or local Git workflow operation.

## Do NOT route when

- The user wants which branching model to use, or the merge-vs-rebase strategy decision - that is `branching-strategy-worker-bee`. This Bee runs the mechanics; branching-strategy picks the model.
- The user wants the CI/CD pipeline configured on top of Git events, or server-side hooks in CI - that is `ci-release-worker-bee`.
- The user wants credential rotation after a secrets incident - that is `security-worker-bee` (removing a secret from history does not undo the exposure).

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The Git situation (what state the repo is in and what they want to change).
- The Git version (advanced features gate on it; the Bee runs `git --version` first).
- Optional: whether the branch is shared (drives force-with-lease guidance).

If the situation is unclear, do not invoke yet - ask the user what happened.

## Outputs the Bee produces

- Exact Git command sequences with the recovery/escape-hatch command shown before any destructive step.
- Hook configuration (Husky, lefthook) and worktree/LFS/sparse-checkout setups.
- Escalation to `security-worker-bee` whenever a secret reached history.

## Multi-Bee sequences this Bee participates in

- Hands off branching-model and merge-strategy decisions to `branching-strategy-worker-bee`, and credential rotation for secrets-in-history to `security-worker-bee`.

## Critical directives the orchestrator should respect

- **Always show the escape hatch before a destructive operation** - the recovery command precedes the operation in the response.
- **Prefer `--force-with-lease` over `--force`** - there is no acceptable plain `--force` in a shared repo.
- **Never recommend `git filter-branch`** - deprecated; use `git filter-repo` or BFG.
- **Confirm Git version before recommending advanced features.**
- **Escalate credential rotation to `security-worker-bee` for secrets-in-history scenarios.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
