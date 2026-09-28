# 04 - Embeddings Integration

How recall consumes vectors. This guide covers the column/dimension contract, the toggles, and the null-vector handshake. The daemon that *produces* vectors (lifecycle, model, quantization) belongs to embeddings-runtime-worker-bee - this guide stops at the boundary.

---

## The column contract (`src/embeddings/columns.ts`)

```
EMBEDDING_DIMS = 768
SUMMARY_EMBEDDING_COL = "summary_embedding"   // memory.summary_embedding
MESSAGE_EMBEDDING_COL = "message_embedding"   // sessions.message_embedding
```

- Both are Deep Lake `FLOAT4[]` columns sized to 768.
- `summary_embedding` is the embedding of the row's `summary` text.
- `message_embedding` is the embedding of the row's `message` JSONB content.
- Recall's `<#>` cosine arm runs against these. A query vector that is not 768-dim cannot score against them - must-fix.

The dimension is set by the model: `nomic-ai/nomic-embed-text-v1.5` (q8) outputs 768. Recall does not choose the dimension; it inherits it. Changing it is a schema event (deeplake-dataset-worker-bee), not a recall tuning knob.

---

## The toggles

| Toggle | Effect | Read at |
|---|---|---|
| `HIVEMIND_EMBEDDINGS` | generate embeddings for stored records | `src/user-config.ts` (read exactly once), capture hooks |
| `HIVEMIND_SEMANTIC_SEARCH` | use vector recall at query time | `src/hooks/grep-direct.ts`, `src/shell/grep-interceptor.ts` |

`HIVEMIND_EMBEDDINGS=false` or unset -> embeddings disabled; `embed()` returns null and the column lands NULL (see the capture-hook comments in `src/hooks/*/capture.ts`). `HIVEMIND_SEMANTIC_SEARCH !== "false" && !embeddingsDisabled()` is the gate both recall entry points check before computing a query vector.

The two are independent: you can capture embeddings but disable semantic search, or run semantic search only on rows captured while embeddings were on (older rows stay NULL and surface via lexical only).

---

## The null-vector handshake

Recall asks the `EmbedClient` for a query vector:

- **Vector returned** -> semantic / hybrid path with `<#>`.
- **`null` returned** -> the daemon was unreachable. `SearchOptions.queryEmbedding` is set to `null`; the core sticks with BM25/`LIKE`. This is the contract (`grep-core.ts` documents it on the `queryEmbedding` field).

Recall MUST treat `null` as "go lexical", never as an error. A path that throws on a null vector, or runs `<#>` against an empty operand, is a must-fix.

---

## What recall owns vs what the daemon owns

| Recall (this Bee) | Daemon (embeddings-runtime) |
|---|---|
| reading `summary_embedding` / `message_embedding` | populating those columns |
| the `<#>` query and the 768-dim assertion | the model that makes 768-dim vectors |
| the null-vector -> lexical fallback | whether the socket answered or returned null |
| picking semantic / lexical / hybrid per query | daemon warmup, batching, crash recovery |

When a recall finding traces back to "the daemon was down" or "warmup was slow", state the symptom and hand the daemon mechanics to embeddings-runtime-worker-bee.

---

## What to check on an embeddings-integration finding

1. **Is the query vector 768-dim?** Any other length is a must-fix.
2. **Is it cast `::float4[]`** where the SQL expects it?
3. **Does the null path go lexical** without throwing?
4. **Are the rows in scope embedded?** Rows captured while `HIVEMIND_EMBEDDINGS` was off are NULL and only lexically recallable - that is expected, not a bug.
5. **Are both toggles where the user thinks they are?** Capture-on / search-off (and vice versa) is a common surprise.
