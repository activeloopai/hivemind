# 06 - Fast Path: grep-direct

`src/hooks/grep-direct.ts` is the pre-tool-use fast path into recall. It answers common queries without the full `deeplake-shell` round-trip. It calls the same shared core as the slow path, and its correctness MUST match.

---

## Two paths, one core

| Path | Entry | Calls |
|---|---|---|
| Slow | `src/shell/grep-interceptor.ts` inside `deeplake-shell` | `grep-core.ts` |
| Fast | `src/hooks/grep-direct.ts` from pre-tool-use | `grep-core.ts` |

The fast path exists for latency: it intercepts a recall before the agent spawns a shell, so common lookups return immediately. It is an optimization layer over the same `searchDeeplakeTables` / `normalizeSessionContent` / `refineGrepMatches` core - not a second algorithm.

---

## The semantic gate

`grep-direct.ts` computes:

```
const SEMANTIC_ENABLED = process.env.HIVEMIND_SEMANTIC_SEARCH !== "false" && !embeddingsDisabled();
```

`grep-interceptor.ts` computes the equivalent `SEMANTIC_SEARCH_ENABLED`. Both gates must agree: if one path would run semantic and the other lexical for the same query and posture, recall is inconsistent depending on which path served it. That divergence is a must-fix.

---

## The correctness contract

For the same query, posture, and corpus, the fast path must return the same matches the slow path would. Specifically:

1. **Same arms** - both `UNION ALL` arms (`memory` + `sessions`).
2. **Same mode** - semantic iff the gate is on AND a query vector was obtained; lexical otherwise.
3. **Same normalization** - session blobs turned into `Speaker: text` lines before regex.
4. **Same refinement** - the grep flags applied identically.
5. **Same null-vector handling** - daemon-down -> lexical, no throw.

If the fast path skips an arm, skips normalization, or applies the gate differently, it can return a *subset* or *superset* of the slow path. Either is a recall correctness bug.

---

## What the fast path is allowed to differ on

Latency-only differences are fine: caching (`src/hooks/query-cache.ts`), early-out when the cache is warm, or declining to handle a query shape it does not optimize (falling through to the slow path). What it may not do is return *different matches* for a query it does handle.

---

## What to check on a fast-path-change

1. **Does `SEMANTIC_ENABLED` mirror the interceptor's gate?** Same env read, same `embeddingsDisabled()` check.
2. **Does it call the shared core**, or has it grown its own query? A divergent query is the classic regression.
3. **Both arms?** A fast path that only checks the `memory` summary table to "be fast" silently drops raw-session recall.
4. **Null vector -> lexical, no throw?**
5. **Cache invalidation** - a stale `query-cache` entry can serve outdated matches; confirm the cache key includes the posture (semantic vs lexical) so a toggle flip does not serve the wrong mode.
