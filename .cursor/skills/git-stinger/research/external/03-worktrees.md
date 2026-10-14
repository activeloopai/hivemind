---
source_url: https://devtoolbox.dedyn.io/blog/git-worktrees-complete-guide + https://www.7tech.co.in/git-worktrees-explained-work-on-multiple-branches-simultaneously-without-stashing/ + https://allahabadi.dev/blogs/git/git-worktrees-parallel-branches-without-stashing/ + https://pure-essence.net/2026/04/27/stop-juggling-branches-how-git-worktrees-transformed-our-multi-repo-workflow/ + https://dviramontes.com/posts/using-git-worktrees + https://bearzk.prose.sh/2026-01-05-git-worktrees-multiple-checkouts + https://www.gitworktree.org/
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: worktrees
stinger: git-stinger
---

# Git Worktrees: Parallel Branch Work Without Stashing

## Summary

Git worktrees let you check out multiple branches of the same repository into separate directories simultaneously. Unlike cloning, worktrees share the same `.git` object database, so they take minimal extra disk space and stay perfectly in sync - no push/pull between them needed. Each worktree has its own working directory and staging area. This is the modern solution to "I'm mid-feature and need to fix a production bug right now."

---

## 1. Core Concepts

### What a worktree is

A Git worktree is an additional working directory linked to the same repository. Every Git repo already has one worktree - your main checkout. `git worktree` lets you add more.

Key properties:
- All worktrees share the same `.git` object store (disk-efficient)
- Commits made in any worktree are immediately visible in all others (no fetch needed)
- Each worktree has its own working directory, index (staging area), HEAD, and merge state
- One branch can only be checked out in ONE worktree at a time
- Available since Git 2.5 (2015); stable and production-ready

### How the filesystem looks

```
~/project/                       # main worktree (on feature/auth)
├── .git/                        # full git directory
│   ├── worktrees/               # linked worktree metadata
│   │   ├── hotfix/              # metadata for ../hotfix worktree
│   │   └── review/              # metadata for ../review worktree
│   └── objects/                 # SHARED by all worktrees
│
~/hotfix/                        # linked worktree (on hotfix/bug-123)
├── .git                         # file (NOT directory) containing path to main .git
│
~/review/                        # linked worktree (on origin/pr/456)
└── .git                         # file pointing back to ~/project/.git
```

---

## 2. Command Reference

```bash
# Add a worktree for an EXISTING branch
git worktree add <path> <branch>
git worktree add ../hotfix-login hotfix/login-bug

# Add a worktree with a NEW branch (create from current HEAD)
git worktree add -b <new-branch> <path>
git worktree add -b hotfix/critical-login ../my-app-hotfix

# Add a worktree from a specific remote or commit
git worktree add ../review origin/feature/auth
git worktree add ../debug abc1234

# Add a worktree in detached HEAD state
git worktree add --detach ../test-main origin/main

# List all worktrees
git worktree list
# Output example:
# /Users/me/project         abc1234 [feature/auth]
# /Users/me/hotfix-login    def5678 [hotfix/login-bug]
# /Users/me/review          ghi9012 (detached HEAD)

# Remove a worktree (after merging/done)
git worktree remove <path>
git worktree remove ../hotfix-login

# Force remove (has uncommitted changes)
git worktree remove --force <path>

# Remove stale worktree entries (directory was deleted manually)
git worktree prune

# Move a worktree to a new path
git worktree move <current-path> <new-path>
git worktree move ../hotfix ~/worktrees/myproject/hotfix

# Lock a worktree to prevent pruning (e.g., on a removable drive)
git worktree lock <path>
git worktree unlock <path>
```

---

## 3. Classic Workflows

### 3.1 Hotfix while mid-feature (the canonical use case)

```bash
# You are on feature/auth with 20 changed files
# A production bug is reported

# Step 1: Create a hotfix worktree from main
git worktree add -b hotfix/critical-login-bug ../my-app-hotfix origin/main

# Step 2: Open the hotfix in a new terminal/editor window
cd ../my-app-hotfix
# (install deps if needed: npm install / poetry install / etc.)

# Step 3: Fix the bug, test, commit
vim src/auth/login.js
npm test
git add src/auth/login.js
git commit -m "Fix null pointer in login token validation"

# Step 4: Push the hotfix
git push -u origin hotfix/critical-login-bug

# Step 5: Go back to your feature branch - it never changed!
cd ../my-app
# All your files, editor state, and build artifacts are exactly as you left them

# Step 6: After the PR is merged, clean up
git worktree remove ../my-app-hotfix
git branch -d hotfix/critical-login-bug
```

### 3.2 Running tests on two branches simultaneously

```bash
# Compare performance or behavior between branches
git worktree add ../project-v2 feature/v2-refactor

# Terminal 1 (current directory - main branch)
npm run dev -- --port 3000

# Terminal 2 (worktree - feature branch)
cd ../project-v2
npm install  # install deps specific to this branch
npm run dev -- --port 3001

# Now both versions run simultaneously - compare at localhost:3000 vs :3001
```

### 3.3 Reviewing a pull request without disrupting work

```bash
# Checkout a PR branch for review without leaving your feature branch
git fetch origin
git worktree add ../review-pr-42 origin/feature/user-auth

cd ../review-pr-42
# Run the code, check tests, verify behavior

# When done reviewing
git worktree remove ../review-pr-42
```

---

## 4. Advanced Patterns

### 4.1 Bare clone pattern (power users and CI)

A bare clone has no default working directory - every branch gets its own worktree. This is a clean architecture for multi-branch work:

```bash
# Clone as bare (--bare means no default working tree)
git clone --bare git@github.com:user/repo.git my-project.git

# Create worktrees for branches you need
cd my-project.git
git worktree add ../main main
git worktree add ../develop develop
git worktree add ../feature-auth feature/auth

# Result: every branch is in its own directory, no "default" checkout
```

### 4.2 Centralized worktree directory convention (team pattern)

```bash
# Organize all worktrees by ticket ID to avoid scattered directories
mkdir -p ~/worktrees/myproject

export TICKET=PROJ-2152
export SLUG=user-auth-redesign
export BRANCH=feature/${TICKET}-${SLUG}
export ROOT=~/worktrees/myproject/${TICKET}-${SLUG}

# Create the worktree
cd ~/my-project
git fetch origin
git worktree add -b ${BRANCH} ${ROOT} origin/main

# Open the ticket folder in IDE
code ${ROOT}  # or cursor, idea, etc.

# After PR is merged
git worktree remove ${ROOT}
git branch -d ${BRANCH}
```

Benefits: "Every ticket gets a folder named `{TICKET-ID}-{slug}`. Inside, each repo you need for that ticket gets its own worktree. Open the ticket folder and you have everything for that ticket in one window." - Pure-Essence.Net (2026)

### 4.3 Multi-repo ticket workflow

When a ticket requires changes across multiple repositories:

```bash
export TICKET=STAR-3485
export SLUG=quick-view-save-image
export BRANCH=feature/${TICKET}-${SLUG}
export ROOT=~/worktrees/${TICKET}-${SLUG}

# From each primary clone, create a worktree
cd ~/primary/myrecipes
git worktree add -b ${BRANCH} ${ROOT}/myrecipes origin/master

cd ~/primary/mm-myrecipes
git worktree add -b ${BRANCH} ${ROOT}/mm-myrecipes origin/master

# Open the combined root in IDE (multi-root workspace)
code ${ROOT}  # VS Code / Cursor multi-root workspace
```

### 4.4 Parallel AI coding agent isolation

Worktrees are now standard for running multiple AI coding agents (Claude Code, Cursor, Codex) on the same repo in parallel:

```bash
# Each agent gets its own worktree = no merge conflicts between agents
git worktree add ../agent-1-auth feature/auth
git worktree add ../agent-2-billing feature/billing
git worktree add ../agent-3-tests feature/tests

# Open each directory in a separate Cursor/Claude Code session
# Agents work in parallel without stepping on each other
```

---

## 5. Decision Matrix: Worktree vs Stash vs Clone

| Aspect | Worktree | Stash | New Clone |
|---|---|---|---|
| Disk space | Low (shared objects, only working files duplicated) | None | High (full copy of .git) |
| Parallel branches | Yes - both open simultaneously | No - one at a time | Yes |
| Shared history | Yes - instant, no push needed | Yes - same repo | No - requires push/pull |
| Build isolation | Yes - separate node_modules, compiled output | No | Yes |
| Setup time | Seconds | Instant | Minutes (network) |
| Context switching | None - change directory | Full - stash/pop | None |
| IDE state preserved | Yes - separate windows | Partial - loses editor state | Yes |
| Best for | Hours-long parallel work | Quick 5-minute fixes | Independent long-term forks |

**Rule of thumb:**
- Work lasting > 15 minutes: use a worktree
- Quick context switch < 15 minutes: `git stash` is fine
- Long-term independent fork: separate clone

---

## 6. Gotchas and Limitations

### 6.1 Same branch in two worktrees: not allowed

```bash
# This WILL FAIL:
git worktree add ../worktree2 feature/auth  # if feature/auth is already checked out

# Error: fatal: 'feature/auth' is already checked out at '/path/to/other/worktree'

# Workaround: create a new branch from the same commit
git worktree add -b feature/auth-review ../review feature/auth
```

### 6.2 Path must not exist yet

```bash
# Git creates the directory for you
# If it already exists, the command fails
git worktree add ../existing-dir main  # FAILS if ../existing-dir exists
```

### 6.3 Stash is shared across worktrees

```bash
# git stash is GLOBAL - stashes from one worktree appear in all
# Always use descriptive stash names to avoid confusion:
git stash push -m "WIP: auth-worktree - half-done validation"
```

### 6.4 Submodules need initialization per worktree

```bash
cd ../new-worktree
git submodule update --init
```

### 6.5 node_modules / build artifacts are per worktree

Each worktree needs its own dependency install. This is intentional (different branches may have different deps) but adds setup time:

```bash
cd ../new-worktree
npm install    # or yarn, pnpm, pip install, etc.
```

### 6.6 Hooks run from the main .git/hooks

There are no per-worktree hooks natively. Client-side hooks (pre-commit, commit-msg, etc.) apply to all worktrees.

### 6.7 If you accidentally rm -rf a worktree directory

```bash
# The .git directory still has stale metadata
git worktree prune  # cleans up references to deleted directories
```

---

## 7. Complete Quick-Reference

```bash
# CREATE
git worktree add <path> <branch>          # existing branch
git worktree add -b <new> <path>          # new branch from HEAD
git worktree add -b <new> <path> <base>   # new branch from specific base
git worktree add --detach <path> <commit> # detached HEAD at commit

# INSPECT
git worktree list                         # list all worktrees
git worktree list --porcelain             # machine-readable output

# MANAGE
git worktree remove <path>                # remove (must be clean)
git worktree remove --force <path>        # remove with uncommitted changes
git worktree prune                        # remove stale entries (dir deleted)
git worktree move <old-path> <new-path>   # move a worktree
git worktree lock <path>                  # prevent pruning
git worktree unlock <path>                # allow pruning again
git worktree repair                       # fix broken linked worktrees
```

---

## Key Quotations

- "Git worktrees let you check out multiple branches of the same repository into separate directories simultaneously. No stashing, no cloning, no losing your place." - DevToolbox Blog (2026)
- "Commits made in any worktree are immediately visible in all others. You're not cloning or duplicating anything - just checking out different branches in different locations." - bearzk.prose.sh (2026)
- "Worktrees are one of those features that feel like a superpower once you start using them. They've been available since Git 2.5 (2015) but remain surprisingly underused." - 7tech.co.in (2026)
- "Worktrees hit a sweet spot: low setup cost, meaningful reduction in context-switching friction, and a natural fit for the way modern development (and AI-assisted development in particular) increasingly demands parallel workstreams." - dviramontes.com (2026)

---

## Citations

1. DevToolbox Blog - "Git Worktrees: The Complete Guide for 2026" (2026-02-12): https://devtoolbox.dedyn.io/blog/git-worktrees-complete-guide
2. 7Tech - "Git Worktrees Explained: Work on Multiple Branches Simultaneously" (2026-04-10): https://www.7tech.co.in/git-worktrees-explained-work-on-multiple-branches-simultaneously-without-stashing/
3. Frontend Master (allahabadi.dev) - "Git Worktrees Explained" (2026-02-26): https://allahabadi.dev/blogs/git/git-worktrees-parallel-branches-without-stashing/
4. Pure-Essence.Net - "Stop Juggling Branches: How Git Worktrees Transformed Our Multi-Repo Workflow" (2026-04-27): https://pure-essence.net/2026/04/27/stop-juggling-branches-how-git-worktrees-transformed-our-multi-repo-workflow/
5. dviramontes.com - "Using Git Worktrees for Parallel Branch Development" (2026-03-18): https://dviramontes.com/posts/using-git-worktrees
6. bearzk.prose.sh - "Git Worktrees: Multiple Checkouts, One Repository" (2026-01-05): https://bearzk.prose.sh/2026-01-05-git-worktrees-multiple-checkouts
7. gitworktree.org - "Git Worktree: The Complete Guide to Parallel Development": https://www.gitworktree.org/
8. GeeksforGeeks - "Using Git Worktrees for Multiple Working Directories": https://www.geeksforgeeks.org/git/using-git-worktrees-for-multiple-working-directories/
