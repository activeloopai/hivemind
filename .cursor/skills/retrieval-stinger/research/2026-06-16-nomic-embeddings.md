# Nomic Embeddings - nomic-embed-text-v1.5, 768-dim

**Source:** `src/embeddings/daemon.ts`, `src/embeddings/nomic.ts`, `src/embeddings/columns.ts`, `src/user-config.ts`.
**Retrieved:** 2026-06-16
**Status:** LOAD-BEARING. The embedding model and IPC define the entire semantic branch.

---

## TL;DR

Embeddings come from a local daemon running `nomic-ai/nomic-embed-text-v1.5` (q8) via HF
transformers, producing 768-dim vectors (matryoshka-truncated). The daemon speaks NDJSON over
a unix socket. Toggled by `HIVEMIND_EMBEDDINGS` and `HIVEMIND_SEMANTIC_SEARCH`.

---

## Key facts

| Field | Value |
|---|---|
| Model | `nomic-ai/nomic-embed-text-v1.5` |
| Quantization | q8 |
| Dims | 768 (`EMBEDDING_DIMS`, matryoshka-truncated) |
| Runtime | HF transformers, local |
| IPC | unix socket, NDJSON (one JSON object per line) |
| Vector type | FLOAT4[] |

- `HIVEMIND_EMBEDDINGS` is read EXACTLY ONCE at first run (`user-config.ts`); unset/`false`
  means embeddings disabled and every column lands NULL at capture.
- `HIVEMIND_SEMANTIC_SEARCH !== "false"` gates whether recall even attempts the semantic branch.
- Recall-time embed has a budget: `HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS` (default 500ms). Blow it ->
  `queryEmbedding` null -> BM25 fallback.

---

## Implications for the guides

- The model is pinned. Any guide that suggests swapping embedders must flag the full re-embed
  of `memory`, `sessions`, and `codebase` plus the `EMBEDDING_DIMS` change.
- Cold model load is the top cause of flaky semantic recall - warming the daemon matters more
  than raising the timeout.
- Columns are populated at capture time by `src/hooks/*/capture.ts`; if embeddings were off then,
  the row needs a backfill to become semantically reachable.

---

## Caveats

- nomic-embed-text-v1.5 supports larger dims via matryoshka; Hivemind truncates to 768. Don't
  document a different dim.
- The q8 quantization trades a little quality for speed/memory; the pipeline accepts that for
  local-first operation.
