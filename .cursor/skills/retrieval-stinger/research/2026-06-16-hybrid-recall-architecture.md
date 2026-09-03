# Hybrid Recall Architecture - UNION ALL over memory + sessions

**Source:** `src/shell/grep-core.ts` (`searchDeeplakeTables`), `src/hooks/grep-direct.ts` (fast path), `src/shell/grep-interceptor.ts` (slow path).
**Retrieved:** 2026-06-16
**Status:** LOAD-BEARING. This is the recall core the whole stinger is built around.

---

## TL;DR

Hivemind recall runs ONE `UNION ALL` query across two tables: `memory` (codified summaries,
column `summary`) and `sessions` (raw dialogue, column `message` JSONB). Both arms are ranked
together. Semantic ranking is Deep Lake `<#>` cosine on the FLOAT4[] embedding columns when
embeddings are on; BM25/`ILIKE` is the fallback when they're off. There is no separate vector
DB and no reranker.

---

## Key facts

- Two recall surfaces in one query: summaries (`memory.summary`) and dialogue (`sessions.message`).
  The codebase graph (`codebase` table) can be UNION'd in as a third.
- Fast path: `src/hooks/grep-direct.ts`, fired from pre-tool-use. Slow path: `grep-interceptor.ts`
  inside the deeplake shell. Both call into the shared `grep-core.ts`.
- `searchDeeplakeTables` returns `{ path, content }` rows; `refineGrepMatches` then applies the
  usual grep flags line by line.
- `sessions.message` is JSONB, so `normalizeSessionContent` flattens it to multi-line
  "Speaker: text" before regex refinement (see the session-normalization note).

---

## Implications for the guides

- The recall guide must describe BOTH arms of the UNION. A guide that only mentions summaries
  misses half the recall surface.
- "Hybrid" here means lexical + semantic in the same query, AND summary + dialogue in the same
  query. Two axes of hybridity.
- No reranker means precision levers are: embedding coverage, hybrid weights, and chunk/summary quality.

---

## Caveats

- A row with a NULL embedding column is invisible to the semantic arm at any weight - it only
  surfaces via the lexical arm. Coverage is therefore a recall-quality concern, not just hygiene.
- The UNION ranks flat across surfaces; there's no preference for summaries over raw turns at
  equal distance (see `gaps.md` item 7).
