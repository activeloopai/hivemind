# Example: Worktree Parallel Features Workflow

Two features in progress simultaneously without stash context-switch overhead.

---

## Situation

A developer is working on `feature/recall-filter` and receives a high-priority request to also prototype `feature/cursor-harness`. Both branches need to be active and ready to demo at any time. Stashing and switching branches every few hours is creating friction.

---

## Setup: add a second worktree

```bash
# Current state: in the main repo directory, on feature/recall-filter
ls .git/  # the repo's .git is here

# Add a second worktree for the harness feature:
git worktree add -b feature/cursor-harness ../hivemind-harness main

# List worktrees:
git worktree list
# /home/dev/hivemind          abc1234 [feature/recall-filter]
# /home/dev/hivemind-harness  def5678 [feature/cursor-harness]
```

---

## Day-to-day workflow

```bash
# Work on the recall filter in the original directory:
cd ~/hivemind
# ... edit files, test, commit as normal ...
git add -p
git commit -m "feat(retrieval): add recency filter to recall"

# Switch to the harness feature by changing directory (no stash needed):
cd ~/hivemind-harness
# The harness feature branch is exactly as you left it
# ... edit files, test, commit ...
git add src/harness/cursor/
git commit -m "feat(harness): add Cursor integration adapter"

# Push both branches:
git push origin feature/recall-filter    # from ~/hivemind
git push origin feature/cursor-harness   # from ~/hivemind-harness
```

---

## Fetching remote updates in both worktrees

Both worktrees share the same object store. Fetching in one updates objects for both:

```bash
# Fetch from either worktree:
cd ~/hivemind
git fetch origin

# Now in the other worktree, the new objects are available:
cd ~/hivemind-harness
git rebase origin/main   # rebases onto the newly fetched main
```

---

## Running test watchers in parallel

Each worktree can run its own Vitest watcher so both features stay green:

```bash
# Terminal 1 - recall filter feature:
cd ~/hivemind
npx vitest --watch

# Terminal 2 - harness feature:
cd ~/hivemind-harness
npx vitest --watch
```

Both watchers run simultaneously. Switching between them is a tab switch, not a stash + branch switch + rebuild cycle.

---

## Demo preparation

Before a demo, ensure each feature is at its best state without cross-contamination:

```bash
# Recall filter demo:
cd ~/hivemind
git status  # confirm clean
npm run build

# Harness demo:
cd ~/hivemind-harness
git status  # confirm clean
npm run build
```

---

## Cleanup when a feature is merged

```bash
# After feature/cursor-harness is merged via PR:
cd ~/hivemind
git fetch origin
git branch -d feature/cursor-harness  # delete local branch

# Remove the worktree:
git worktree remove ../hivemind-harness

# Confirm:
git worktree list
# /home/dev/hivemind  abc1234 [feature/recall-filter]
```

---

## What this avoids

- `git stash` / `git stash pop` cycles (stash is error-prone; conflicts can occur on pop)
- Waiting for `npm install` after branch switches (if `node_modules` differs between branches)
- Accidentally committing to the wrong branch after context-switching
- Losing unsaved work because you forgot to stash
