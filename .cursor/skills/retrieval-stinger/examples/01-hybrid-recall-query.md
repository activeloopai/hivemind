# Example 01 - Run a Hybrid Recall Query Against memory + sessions

Walkthrough of the core Hivemind recall path: one `UNION ALL` across the `memory`
table (summaries) and the `sessions` table (raw dialogue), scored by Deep Lake
`<#>` cosine when embeddings are on, falling back to BM25/`ILIKE` when they are off.

> **Reference:** `src/shell/grep-core.ts` (`searchDeeplakeTables`), `src/hooks/grep-direct.ts` (fast path), `src/embeddings/columns.ts`. Output shape: `templates/recall-query.sql`.

---

## Invocation

> "Recall everything we learned about the embeddings daemon socket path."

A grep against the deeplake VFS triggers `searchDeeplakeTables`. The query embedding
is computed by the EmbedClient against the daemon; if the daemon answers within
`HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS` (default 500ms) we run semantic, otherwise lexical.

---

## Step 1 - Confirm the pipeline state

| Lever | Source of truth | Verify |
|---|---|---|
| Embeddings on | `HIVEMIND_EMBEDDINGS` + `user-config.ts` | `getUserConfig().embeddings.enabled` |
| Semantic search on | `HIVEMIND_SEMANTIC_SEARCH !== "false"` | `grep-direct.ts:16` |
| Daemon reachable | Unix socket NDJSON IPC | `templates/daemon-health-check.ts` returns ok |
| Model | `nomic-ai/nomic-embed-text-v1.5` (q8, 768-dim) | `src/embeddings/nomic.ts` |

If all four are green, the recall runs semantic. If the daemon times out, `queryEmbedding`
is `null` and the same call silently runs BM25/`ILIKE`. That fallback is by design, not a bug.

---

## Step 2 - The query shape

Semantic path (embeddings on). The `<#>` operator is negative inner product, so
smaller is closer; we order ascending and negate for a 0..1-ish similarity:

```sql
SELECT path, summary AS content, (summary_embedding <#> $vec::float4[]) AS dist
  FROM memory
 WHERE summary_embedding IS NOT NULL
UNION ALL
SELECT path, message::text AS content, (message_embedding <#> $vec::float4[]) AS dist
  FROM sessions
 WHERE message_embedding IS NOT NULL
 ORDER BY dist ASC
 LIMIT 40;
```

Lexical fallback (embeddings off or daemon down):

```sql
SELECT path, summary AS content FROM memory   WHERE summary ILIKE $pat
UNION ALL
SELECT path, message::text AS content FROM sessions WHERE message::text ILIKE $pat
LIMIT 40;
```

`$vec` is the 768-dim FLOAT4[] query vector. `$pat` is the `sqlLike`-escaped pattern.

---

## Step 3 - Normalize session rows

`sessions.message` is a JSONB dialogue blob (a 5KB-ish turn array). Before line-wise
regex refinement, `normalizeSessionContent` serializes it to multi-line
`Speaker: text` so the grep refinement surfaces only matching turns, not the whole blob.
Memory rows (`summary`) are already plain text and pass through untouched.

---

## Step 4 - Refine and rank

`refineGrepMatches` applies the usual grep flags (ignore-case, word-match, invert,
fixed-string) line by line. In semantic mode the `ORDER BY dist` from the SQL already
ranks rows by closeness; the regex refinement is a second filter on top, not the ranker.

---

## Step 5 - Read the result

Expected for the example query:

```
/memory/embeddings/daemon-socket   summary  dist=0.08  "daemon listens on a unix socket, NDJSON one obj per line..."
/sessions/2026-06-10-xyz           message  dist=0.14  "user: where does the socket live / assistant: ~/.deeplake/..."
```

Two hits: one summary from `memory`, one raw turn from `sessions`. That cross-table
`UNION ALL` is the whole point of hybrid recall - codified summaries AND the dialogue
that produced them, ranked together.

---

## Notes

- No reranker call. Ranking is `<#>` cosine plus the regex filter. There is no second-stage
  model in the recall path.
- If you only see `memory` hits and never `sessions`, check that `message_embedding` is being
  populated at capture time (`src/hooks/*/capture.ts`); a NULL embedding column drops the row
  from the semantic branch.
