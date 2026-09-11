# Command Brief Notes - embeddings-runtime-stinger

## Source

`ai-tools/command-briefs/embeddings-runtime-worker-bee-command-brief.md`

## Key scope decisions captured in brief

**In scope:**
- Daemon lifecycle: warmup, batching, the shared install at `~/.hivemind/embed-deps/`, crash recovery (`daemon.ts`, `nomic.ts`).
- The Unix-socket NDJSON IPC protocol (`protocol.ts`, `client.ts`).
- Embedding model selection scoped to Hivemind recall (quality vs latency vs footprint vs 768-dim compatibility).
- Quantization vs quality/latency/footprint tradeoffs (q8 default).
- The embeddings-on vs BM25/ILIKE-fallback decision (`HIVEMIND_EMBEDDINGS`, `HIVEMIND_SEMANTIC_SEARCH`).
- Local-vs-hosted inference tradeoffs.
- The dim-must-match-schema constraint (`EMBEDDING_DIMS=768`, `FLOAT4[]` columns).

**Explicitly out of scope (handed to other Bees):**
- Deep Lake dataset schema-heal mechanics for a dim change -> `deeplake-dataset-worker-bee`.
- API key handling / data-egress review for a hosted embedding option -> `security-worker-bee`.
- Feature PRD authorship -> `library-worker-bee`.

## Critical directives from brief

1. The embedding dimension locks the schema; check it before any model swap.
2. Embeddings are off by default and that is fine; BM25/ILIKE fallback has no quality cliff.
3. Justify the ~600MB + CPU before turning embeddings on; measure the lift.
4. Warm the daemon once; never spawn per request; batch bulk writes.
5. Match the model to Hivemind recall, not to a broad leaderboard.
6. Never strand a dim change mid-migration; hand schema execution to deeplake-dataset-worker-bee.

## Refresh cadence

The runtime ground truth (nomic model, q8, 768 dim, daemon architecture) is stable. Re-validate recall claims when the corpus or query patterns change materially, or if the model / `@huggingface/transformers` version changes. Notes current as of 2026-06-16.
