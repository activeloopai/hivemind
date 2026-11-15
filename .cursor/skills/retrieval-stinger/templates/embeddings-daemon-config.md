# Template: Embeddings Daemon Config

Reference shape for the embeddings daemon - the process that turns text into the 768-dim
FLOAT4[] vectors the `<#>` cosine branch needs. Recall degrades to BM25 the moment this is
off, dead, or slow.

> **Source of truth:** `src/embeddings/daemon.ts`, `nomic.ts`, `columns.ts`, `src/user-config.ts`.

---

## Model

| Field | Value |
|---|---|
| Model | `nomic-ai/nomic-embed-text-v1.5` |
| Quantization | q8 |
| Output dims | 768 (matryoshka-truncated; `EMBEDDING_DIMS` in `columns.ts`) |
| Runtime | HF transformers, local |
| Vector type | FLOAT4[] |

The whole stack is pinned to 768. Changing the model means re-embedding every row in
`memory`, `sessions`, and `codebase`, and updating `EMBEDDING_DIMS`. Not a casual swap.

---

## IPC

| Field | Value |
|---|---|
| Transport | Unix socket |
| Protocol | NDJSON (one JSON object per line) |
| Socket path | under `~/.deeplake` (moves with the home dir - a classic silent-fallback cause) |

---

## Toggles

| Env | Effect | Read |
|---|---|---|
| `HIVEMIND_EMBEDDINGS` | master on/off; read EXACTLY ONCE at first run (`user-config.ts`) | unset/`false` -> disabled |
| `HIVEMIND_SEMANTIC_SEARCH` | gate semantic recall independently of capture | `false` -> recall stays BM25 |
| `HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS` | per-query embed budget at recall time | default `500` |

Both `HIVEMIND_EMBEDDINGS` (on) and `HIVEMIND_SEMANTIC_SEARCH` (not `false`) must hold for
semantic recall to run. Either off -> every query is lexical.

---

## Health checklist

```bash
node scripts/daemon-health.ts
```

1. Socket exists and is connectable.
2. A round-trip embed returns a 768-length FLOAT4[] within the timeout.
3. Model is warm (cold load can blow the 500ms budget and cause flaky fallback).

---

## Failure modes -> recall impact

| Failure | Recall effect |
|---|---|
| daemon not running | `queryEmbedding` null -> BM25 fallback |
| socket path moved (home dir change) | connect fails -> BM25 fallback |
| cold model load > 500ms | intermittent fallback ("flaky semantic") |
| embeddings off at capture | rows land with NULL embedding -> invisible to `<#>` until backfilled |

The fallback is by design - recall must not hard-fail. The risk is it failing silently.
Keep `scripts/daemon-health.ts` in the loop so the silent path stays visible.
