# 04 - Dataset Versioning, Branches & Tags

Deep Lake datasets carry git-like version history. Hivemind uses it to snapshot, branch, and roll back the dataset as a whole - distinct from the per-row append-only version-bump on skills / rules / goals / kpis (that lives in `guides/06-embeddings-jsonb-versioning.md`).

Source: `research/2026-06-16-versioning-branches-tags.md`.

## The operations

| Operation | What it does | When to reach for it |
|---|---|---|
| `commit` | Snapshots the current dataset state with a message | After a meaningful batch of writes you may want to return to |
| `branch` | Forks a named line of history from the current commit | Experimental schema or bulk re-embed you do not want on main |
| `merge` | Folds a branch back into its parent | When the experiment proves out |
| `tag` | Names a specific commit for easy reference | Releases, known-good checkpoints |
| `revert_to` | Resets the dataset to a prior commit | Recovering from a bad bulk write |

## Commit discipline

A `commit` is cheap and is the unit of recovery. Commit:

- After a bulk ingest into `codebase` or `memory`.
- Before a schema heal that adds columns, so `revert_to` is available if validation surprises you.
- At the end of a session that materially changed skills / rules / goals / kpis.

Each commit carries a message; write it like a git commit - what changed and why.

## Branching for risky work

When a change is large or uncertain - re-embedding an entire table under a new model, restructuring the JSONB `message` shape, trialing a different storage backend - branch first:

```
branch  ->  do the risky work  ->  verify  ->  merge (or abandon the branch)
```

A branch keeps main clean. If the experiment fails, you drop the branch instead of unwinding writes on main.

## Tags for known-good checkpoints

Tag the commits you will want to name later: a release, the last-known-good state before a migration window, a baseline you benchmark against. Tags are stable references; `revert_to` a tag is the cleanest rollback.

## revert_to for recovery

If a bulk write goes wrong, `revert_to` the prior commit (or tag) resets the dataset state. This is whole-dataset recovery - it is not the same as the per-row version-bump, which only ever appends. Use `revert_to` when the damage spans rows or tables; use the version-bump path when a single skill / rule / goal / kpi needs a new version.

## Versioning vs version-bump - do not conflate

- **Dataset versioning** (this guide): commit / branch / merge / tag / revert_to - the whole dataset's git-like history.
- **Append-only version-bump** (`guides/06`): editing a skill / rule / goal / kpi INSERTs version+1; latest wins via `ORDER BY version DESC`. Row-level, never an UPDATE.

A review that treats one as the other is a finding.

## Cross-references

- `06-embeddings-jsonb-versioning.md` - the per-row append-only version-bump and the UPDATE-coalescing quirk.
- `08-storage-backends.md` - the backend the versioned dataset lives on.
- `templates/ADR.md` - record a branching / versioning decision as an ADR when it is architectural.
