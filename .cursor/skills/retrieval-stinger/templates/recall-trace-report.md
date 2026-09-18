# Template: Recall Trace Report

Output shape for a single recall investigation - "why did this query return what it did."
Produced by `scripts/recall-trace.ts`; this template is how you write it up.

> **Source of truth:** `src/shell/grep-core.ts`, `src/hooks/grep-direct.ts`, `examples/03-trace-recall-miss-bm25-fallback.md`.

---

## Query

> "{the exact query string}"

Run: {ISO timestamp}

---

## Path taken

| Field | Value |
|---|---|
| Mode | semantic / lexical |
| Daemon round-trip | {N} ms (budget: `HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS`, default 500) |
| `HIVEMIND_EMBEDDINGS` | on / off |
| `HIVEMIND_SEMANTIC_SEARCH` | on / off |
| Query vector | 768-dim / null (null -> fell back to BM25) |

If `Mode = lexical` while semantic was expected, the rest of this report explains why.

---

## Results (top-K)

| Rank | Table | Path | dist / score | Matched on |
|---|---|---|---|---|
| 1 | memory | | | |
| 2 | sessions | | | |
| 3 | codebase | | | |

`dist` for semantic (`<#>`, lower = closer). `score` for hybrid (`deeplake_hybrid_record`, higher = better).

---

## Per-table counts

| Table | Rows scanned | Rows embedded | Rows returned |
|---|---|---|---|
| memory | | | |
| sessions | | | |
| codebase | | | |

A table with `embedded << scanned` is leaking recall - those rows can't be reached semantically.

---

## Diagnosis

- [ ] Toggles on?
- [ ] Daemon reachable and within budget?
- [ ] Expected row's embedding column populated (not NULL)?
- [ ] Hybrid weights appropriate for the query shape (keyword vs conceptual)?

Root cause: _________

---

## Fix

| Finding | Action |
|---|---|
| | |

See the resolution table in `examples/03-trace-recall-miss-bm25-fallback.md`.
