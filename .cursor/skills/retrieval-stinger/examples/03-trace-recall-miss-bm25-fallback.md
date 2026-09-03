# Example 03 - Trace Why a Recall Missed (embeddings off -> BM25 fallback)

A user expected a paraphrase recall to hit and it didn't. This is the canonical
investigation for "semantic recall should have found this but returned lexical-only junk."
The usual root cause: the query silently ran the BM25/`ILIKE` fallback instead of `<#>` cosine.

> **Reference:** `src/hooks/grep-direct.ts`, `src/shell/grep-interceptor.ts`, `src/user-config.ts`, `src/embeddings/daemon.ts`. Tooling: `scripts/recall-trace.ts`, `scripts/daemon-health.ts`.

---

## Symptom

> "I searched 'how do we keep vectors warm' and got nothing, but I know we wrote a summary
> about RAM-resident embedding columns."

Paraphrase recall failing while the exact-word version works is the signature of the lexical
fallback firing. BM25 can't bridge "keep vectors warm" -> "RAM-resident", embeddings can.

---

## Step 1 - Is semantic search even on?

Check both toggles. Either one off means every recall is BM25.

```bash
node -e "import('./dist/user-config.js').then(m => console.log(m.getUserConfig().embeddings))"
echo "HIVEMIND_EMBEDDINGS=$HIVEMIND_EMBEDDINGS"
echo "HIVEMIND_SEMANTIC_SEARCH=$HIVEMIND_SEMANTIC_SEARCH"
```

- `HIVEMIND_EMBEDDINGS` unset or `false` -> embeddings disabled (read once at first run, see `user-config.ts`).
- `HIVEMIND_SEMANTIC_SEARCH=false` -> recall stays lexical even if embeddings are populated.

**Finding pattern:** if either is off, that's the answer. Turn them on, restart, re-run.

---

## Step 2 - Is the daemon reachable?

Even with toggles on, a dead daemon means `queryEmbedding` comes back `null` and the call
falls through to BM25. The timeout is `HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS` (default 500ms).

```bash
node scripts/daemon-health.ts
```

A slow daemon (cold model load) can intermittently blow the 500ms budget, giving the
flaky "sometimes semantic, sometimes not" behavior. Warm the model or raise the timeout.

---

## Step 3 - Is the row's embedding column populated?

If embeddings were off when the summary was captured, its `summary_embedding` landed NULL,
so it is permanently invisible to the semantic branch until re-embedded.

```sql
SELECT path,
       summary_embedding IS NULL AS no_vec
  FROM memory
 WHERE summary ILIKE '%RAM-resident%';
```

`no_vec = true` -> the row exists but was never embedded. Backfill it (re-run the embed
worker over that path) and the paraphrase recall will start hitting.

---

## Step 4 - Confirm which path actually ran

```bash
node scripts/recall-trace.ts "how do we keep vectors warm"
# prints: mode=lexical|semantic, daemon_ms, rows_memory, rows_sessions
```

If `mode=lexical` while you expected semantic, you've localized it to one of Steps 1-3.

---

## Resolution table

| Finding | Fix |
|---|---|
| `HIVEMIND_EMBEDDINGS` off | enable + restart |
| `HIVEMIND_SEMANTIC_SEARCH=false` | unset it |
| daemon unreachable / slow | restart daemon, warm model, or raise embed timeout |
| row `summary_embedding` NULL | backfill embeddings over that path |
| all green, still missing | widen `LIMIT`, shift hybrid weights toward semantic (see example 02) |

---

## Note

The fallback is intentional - recall must never hard-fail just because the daemon hiccuped.
The bug is never "fallback happened"; the bug is "fallback happened and nobody could tell."
`recall-trace.ts` exists to make the silent path loud.
