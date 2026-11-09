# Dataset Versioning - Commit, Branch, Merge, Tag, Revert

**Sources:**
- Activeloop Deep Lake docs - dataset version control (commit / branch / merge / tag / revert_to)
- Hivemind data-layer code review

**Retrieved:** 2026-06-16

## Summary

Deep Lake datasets carry git-like version history at the whole-dataset level. Hivemind uses it to snapshot, branch, and roll back the dataset - distinct from the per-row append-only version-bump on skills / rules / goals / kpis (`research/2026-06-16-deeplake-types-jsonb-embedding-versioning.md`).

## The operations

| Operation | What it does | When |
|---|---|---|
| `commit` | snapshots current state with a message | after a meaningful batch of writes |
| `branch` | forks a named line from the current commit | experimental schema or bulk re-embed |
| `merge` | folds a branch back into its parent | when the experiment proves out |
| `tag` | names a specific commit | releases, known-good checkpoints |
| `revert_to` | resets the dataset to a prior commit | recovering from a bad bulk write |

## Discipline

- **Commit** after bulk ingest, before a schema heal, and at the end of a session that materially changed skills / rules / goals / kpis. Write the message like a git commit.
- **Branch** before risky work (re-embedding a whole table, restructuring the JSONB `message` shape, trialing a backend). Keeps main clean; abandon the branch if it fails.
- **Tag** the commits you will want to name later (a release, a pre-migration baseline).
- **revert_to** a commit or tag for whole-dataset recovery when damage spans rows or tables.

## Versioning vs version-bump - do not conflate

| Dataset versioning (this note) | Append-only version-bump |
|---|---|
| commit / branch / merge / tag / revert_to | INSERT version+1; latest via `ORDER BY version DESC` |
| whole-dataset git-like history | row-level history on skills / rules / goals / kpis |
| recover with `revert_to` | edit by appending a new version, never UPDATE |

A review that treats one as the other is a finding.

## Relevance to this stinger

Spine of `guides/04-versioning-branches.md`. Cross-referenced from `guides/06-embeddings-jsonb-versioning.md` so dataset versioning and the per-row version-bump stay distinct.
