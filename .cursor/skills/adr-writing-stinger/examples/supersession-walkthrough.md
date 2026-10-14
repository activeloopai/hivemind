# Example: Full Supersession Walkthrough

This example walks through a complete ADR supersession: an old embeddings-storage decision is replaced by a new one, and both records are updated correctly.

---

## Scenario

ADR-0012 recorded the decision to UPDATE embedding vectors in place on the Deep Lake dataset. Re-embedding a changed document silently overwrote prior vectors, so the team could not reproduce which model version produced a given retrieval result. A new ADR adopting append-only version bumps is needed.

---

## Before: ADR-0012 (current state)

```markdown
# 0012. UPDATE embedding vectors in place

Date: 2025-02-14

## Status

Accepted

## Context
...

## Decision
We decided to overwrite each row's embedding column in place when a document is re-embedded...

## Consequences
...
```

---

## Step 1: Create the new ADR

```bash
adr new -s 12 "Append-only version-bump for embedding rows"
# Creates: docs/decisions/0025-append-only-version-bump.md
# Automatically appends: "Supersedes: 0012"
```

---

## Step 2: Fill in ADR-0025

```markdown
# 0025. Append-only version-bump for embedding rows

Date: 2026-04-08

## Status

Accepted

Supersedes ADR-0012

## Context

ADR-0012 chose in-place UPDATE of embedding vectors in the Deep Lake dataset. In Q1 2026
the embeddings daemon switched models, and we could no longer reproduce which model
version produced a given retrieval hit. In-place overwrite destroyed the prior vector,
so debugging a regression in `retrieval-worker-bee` results meant re-running the whole
pipeline with no ground truth to compare against.

An append-only scheme writes a new row with an incremented `embedding_version` instead of
overwriting. The dataset keeps every historical vector, and a read filters to the latest
version per document. This trades storage for full reproducibility.

## Decision

We decided to make embedding writes append-only. Each re-embed appends a new tensor row
with `embedding_version = previous + 1` rather than mutating the existing row. Reads in
`retrieval-worker-bee` filter to `MAX(embedding_version)` per `doc_id`. A scheduled
compaction job in the embeddings daemon prunes versions older than the two most recent.

## Consequences

**Positive:**
- Every retrieval result is reproducible against the exact model version that produced it.
- A bad embedding model rollout can be rolled back by pinning the read to a prior version.
- The schema-heal job can verify version monotonicity as an invariant.

**Negative:**
- Storage grows with each re-embed until compaction runs. The compaction job is now load-bearing.
- Reads carry a `MAX(embedding_version)` filter; queries that forget it return stale vectors.

**Neutral:**
- BM25 fallback path is unaffected; it never read the embedding tensors.
- The Deep Lake dataset schema gains one integer column.

## Alternatives Considered

### Alternative: keep in-place UPDATE, add an audit log

Logging each overwrite to a side table would record that a change happened but not the
prior vector itself. Rejected because the audit log cannot reproduce a past retrieval result.

### Alternative: snapshot the whole dataset per model version

Full dataset snapshots per model version are simpler conceptually but multiply storage by
the number of versions across all rows, not just changed ones. Rejected on cost.
```

---

## Step 3: Update ADR-0012

Open `docs/decisions/0012-update-embeddings-in-place.md` and change only the Status section:

```markdown
## Status

Superseded by ADR-0025
```

Do not modify any other content.

---

## Step 4: Verify the bidirectional link

- ADR-0025 says: `Supersedes ADR-0012` (present)
- ADR-0012 says: `Superseded by ADR-0025` (present)

---

## Step 5: Update the ADR log index (if manual)

```markdown
| 0012 | UPDATE embedding vectors in place | ~~Accepted~~ Superseded by 0025 | ... |
| 0025 | Append-only version-bump for embedding rows | Accepted, Supersedes 0012 | ... |
```

If using Log4brains, regenerate the site:

```bash
npx log4brains build
```

---

## Step 6: Reference in the migration commit

```
feat(embeddings): switch to append-only version-bump for embedding rows (ADR-0025)

Closes ENG-499. Supersedes ADR-0012.
```

---

## Result

The audit trail is complete. Any engineer who reads ADR-0012 is immediately directed to ADR-0025. Any engineer who reads ADR-0025 can trace the lineage back to ADR-0012. The git history, the ADR log, and the PR descriptions all cross-reference each other.
