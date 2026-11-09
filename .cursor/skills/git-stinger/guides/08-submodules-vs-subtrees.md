# Submodules vs Subtrees - git-stinger

Decision matrix and lifecycle commands for embedding one repo inside another.

---

## Decision matrix

| Factor | Submodules | Subtrees | Sparse checkout |
|---|---|---|---|
| Embedded repo has its own releases | Best | Workable | No |
| Need to push changes back to embedded repo | Workable (requires separate push) | Good (git subtree push) | No |
| Team Git experience | High required | Medium required | Low required |
| Contributor workflow complexity | High | Low-medium | Low |
| Pinned to exact commit | Yes (by design) | No (flattens history) | No |
| Embedded repo history visible | As separate repo | Merged into parent | As parent sub-path |
| Works without the embedded repo's remote | No | Yes (content is in parent) | Yes |

**Rule of thumb:**
- If you control both repos and contributors work across them simultaneously → **monorepo with sparse checkout or path-based structure**
- If the embedded code has its own release cycle and you want to pin versions → **submodules**
- If you want to vendor a dependency and occasionally sync upstream → **subtrees**

---

## Git submodules

A submodule is a pointer (a commit sha) to another repository embedded inside a parent repo.

### Adding a submodule

```bash
git submodule add https://github.com/org/shared-lib.git libs/shared-lib
git commit -m "chore: add shared-lib submodule at v2.3.0"
```

This creates `.gitmodules` (tracked in repo) and a special submodule entry in `.git/config`.

### Cloning a repo with submodules

```bash
# Clone and initialize all submodules in one command:
git clone --recurse-submodules https://github.com/org/repo.git

# Or after a regular clone:
git submodule update --init --recursive
```

### Updating submodules

```bash
# Update all submodules to the sha recorded in the parent:
git submodule update

# Update all submodules to their remote's latest:
git submodule update --remote

# Update a single submodule:
git submodule update --remote libs/shared-lib
```

### Pinning a submodule to a specific commit

```bash
cd libs/shared-lib
git checkout v2.5.0
cd ../..
git add libs/shared-lib
git commit -m "chore: pin shared-lib to v2.5.0"
```

### Removing a submodule

```bash
git submodule deinit libs/shared-lib
git rm libs/shared-lib
rm -rf .git/modules/libs/shared-lib
git commit -m "chore: remove shared-lib submodule"
```

### Common submodule pitfall

Forgetting to run `git submodule update --init` after cloning. Contributors see empty directories. Add a setup script (in `justfile` or `Makefile`) that runs this automatically:
```bash
just setup  # or make setup
# Inside: git submodule update --init --recursive
```

---

## Git subtrees

A subtree merges another repo's history into a subdirectory of the parent repo. The embedded code is just regular commits in the parent - no special Git knowledge required to clone and work.

### Adding a subtree

```bash
# Add a remote for the upstream repo:
git remote add shared-lib https://github.com/org/shared-lib.git
git fetch shared-lib

# Add the subtree (merges shared-lib's history into libs/shared-lib/):
git subtree add --prefix=libs/shared-lib shared-lib main --squash
```

The `--squash` flag collapses the subtree's entire history into a single merge commit in the parent. Omit `--squash` to import the full history (messier, but preserves individual commits).

### Pulling upstream changes

```bash
git subtree pull --prefix=libs/shared-lib shared-lib main --squash
```

### Pushing local changes back to the embedded repo

```bash
git subtree push --prefix=libs/shared-lib shared-lib feature/my-fix
```

This creates a new branch on `shared-lib`'s remote with only the commits that touched `libs/shared-lib/`. Open a PR from there.

### Subtree drawbacks

- Subtree commands are verbose and error-prone; the `--prefix` flag must always match exactly.
- History gets noisy (`git log --all` shows all the imported history interleaved).
- The `git subtree split` command exists to re-extract a subdirectory's history later, but it is slow on large repos.

---

## Sparse checkout as a monorepo alternative

For monorepos where all code is under one repo and teams work in distinct subdirectories, sparse checkout avoids both submodules and subtrees entirely. See `guides/07-lfs-and-large-files.md` for the sparse checkout setup.

```bash
# Each team member checks out only their packages:
git sparse-checkout set packages/team-a packages/shared
```

This is the lowest-friction approach when all code is owned by the same organization and shared tooling (CI, lint, test) benefits from being co-located.

---

## Summary recommendation

1. **Shared internal code, same org, same CI** → monorepo with sparse checkout or simple directory structure.
2. **Versioned dependency you consume but rarely modify** → submodule (pinned to a tag).
3. **Dependency you modify frequently and push changes upstream** → subtree.
4. **Third-party code you vendor and never push to** → copy the source (no submodule/subtree needed).

Sources: research/external/03-worktrees.md (monorepo section)
