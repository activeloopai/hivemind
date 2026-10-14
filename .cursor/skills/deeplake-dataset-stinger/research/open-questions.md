# Open Questions - deeplake-dataset-stinger

Tracked unknowns surfaced during the forge. Refresh on each Stinger iteration.

## For the user / orchestrator

1. **Will the embedding model change off nomic-embed-text-v1.5?** Everything assumes 768-dim `FLOAT4[]`. A model swap changes the dimension and forces a re-embed; the schema and `<#>` queries would need the new dim. Flag for v2 if a swap is on the roadmap.
2. **Should the memory-table BM25 oid bug be tracked upstream?** BM25 (`deeplake_index`) is disabled on the memory table today. If Activeloop fixes the oid bug, `guides/02-indexing.md` can re-enable standalone BM25 on memory.
3. **Is the UPDATE-coalescing quirk going to be fixed?** The append-only version-bump exists to dodge it. If Deep Lake fixes UPDATE coalescing, the version-bump is still defensible for history, but the "must never UPDATE" rule could soften.

## For future research refresh

1. **Deep Lake SQL surface additions** - new operators or index types beyond `deeplake_index` / `<#>` / `deeplake_hybrid_record`. Revisit `guides/02-indexing.md`.
2. **BYOC backend additions** - new storage schemes or credential models beyond `creds_key`. Revisit `guides/08-storage-backends.md`.
3. **DeeplakeApi tuning** - whether `MAX_RETRIES=3` / `MAX_CONCURRENCY=5` change as load grows. Revisit `guides/05-querying-deeplakeapi.md`.

## Resolved during this forge

- ~~Does this Bee own retrieval / RAG?~~ -> No. It picks the `FLOAT4[]` shape and search operator, then hands off to `retrieval-worker-bee`.
- ~~Heal directly or propose-and-verify?~~ -> Author the additive heal plan; `quality-worker-bee` verifies after.
- ~~Where does dataset versioning live vs the per-row version-bump?~~ -> `guides/04` for dataset versioning; `guides/06` for the per-row version-bump. Never conflated.
