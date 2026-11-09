# 02, Inventory All Changes

Capture every file added, modified, or deleted by the implementation. No silent passes on changes outside the diff.

---

## Primary invocation

Use the three-dot `git diff` against the base branch. This matches what the PR page shows. (Source: `research/2026-04-24-git-diff-pr-review.md`.)

```bash
# Name + status per file (A=added, M=modified, D=deleted, R=renamed)
git diff main...HEAD --name-status

# Full patch for close reading
git diff main...HEAD

# Summary stats (lines added/removed per file)
git diff main...HEAD --stat

# Scope to a subdirectory if the diff is huge
git diff main...HEAD -- src/search/
```

Replace `main` with the actual base branch (`master`, `develop`, `release/X`) as applicable. Verify by asking `git` which branches exist:

```bash
git branch -r
git remote show origin 2>/dev/null | grep 'HEAD branch'
```

## Mid-session fallback

If the work is not yet committed, the three-dot diff misses uncommitted changes. Use the combined invocation:

```bash
git status --short                  # what's uncommitted
git diff                            # unstaged changes
git diff --staged                   # staged but uncommitted
git diff main...HEAD                # everything on the branch
```

Merge these into one inventory list. Flag in the report that the audit was done against a dirty working tree, this is a note for the invoker, not a blocker.

## Building the Files Changed list

From the `--name-status` output, build a deterministic list. Sort alphabetically within each status group. Example:

```
A  src/search/search-service.ts
A  src/search/search.types.ts
M  src/retrieval/rank.ts
M  src/dataset/schema.ts
D  src/legacy/old-ranker.ts
R  src/embeddings/Embedder.ts -> src/embeddings/BatchEmbedder.ts
```

This feeds the "Files Changed" section of the report. For each file, record a one-line summary of what changed (you'll write these as you work through steps 3-4, not now).

## What to read vs. what to skim

You do not have to read every line of every file. Use this triage:

| File type | Treatment |
|---|---|
| New source files (`A`) | Read in full. |
| Modified source files (`M`) | Read the diff hunks, then read surrounding context for any hunk touching public exports or function signatures. |
| Deleted files (`D`) | Grep the rest of the repo for remaining references. A deletion with dangling callers is a Critical. |
| Renamed files (`R`) | Confirm all import paths updated. |
| Generated files (lock files, build output) | Skim for surprises; usually no finding. |
| Snapshot tests (`.snap`) | Only read if a corresponding source file changed. |
| Config (`.env.example`, `package.json`, `tsconfig.json`) | Read in full, small files with outsized impact. |
| Docs (`README.md`, `CHANGELOG.md`) | Confirm they reflect the change if the plan said to update them. |

## Cross-check against the plan's scope

Once you have the inventory, compare it against the plan's declared scope:

- **Out-of-scope files in the diff?** Flag under the Alignment axis, scope creep. (Warning by default, Critical if the out-of-scope change is risky like the pre-tool-use gate or `src/dataset/schema.ts`.)
- **In-scope files missing from the diff?** Flag under Completeness, a plan requirement with no touched file is almost certainly not implemented.

## Repo-specific signals

Watch for files that carry outsized risk regardless of plan scope:

- The pre-tool-use gate, every tool call passes through it.
- `src/dataset/schema.ts` / dataset migration code, data-model changes require extra scrutiny.
- `tsconfig.json`, `esbuild` config, `turbo.json`, build pipeline changes.
- `.env.example`, a new required env var the deployer must set.
- `package.json`, dependency adds. Cross-check with the plan ("did the plan authorize adding this dep?").

Any of the above that were not mentioned in the plan should appear in the report, usually as a Warning with "out-of-scope change to high-risk file."

---

## See also

- Example of an inventory walk: `examples/02-blocker-heavy-audit.md` Section "Files Changed".
- Research: `research/2026-04-24-git-diff-pr-review.md`.
