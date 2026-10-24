# Template: Recall Quality Audit

Canonical shape for a recall-quality audit of a Hivemind deployment. Confirms the pipeline
is configured right, embeddings are populated, and recall isn't silently degraded to BM25.

> **Source of truth:** `src/shell/grep-core.ts`, `src/embeddings/*`, `src/hooks/grep-direct.ts`. Scripts: `scripts/recall-precision.ts`, `scripts/daemon-health.ts`, `scripts/bm25-vs-semantic.ts`.

---

## 1. Pipeline state

| Lever | Expected | Verify |
|---|---|---|
| `HIVEMIND_EMBEDDINGS` | on | `getUserConfig().embeddings.enabled` |
| `HIVEMIND_SEMANTIC_SEARCH` | not `false` | `grep-direct.ts` |
| Embeddings daemon | reachable, warm | `scripts/daemon-health.ts` |
| Model | `nomic-ai/nomic-embed-text-v1.5` (q8, 768-dim) | `nomic.ts` |
| `EMBEDDING_DIMS` | 768 | `columns.ts` |

Finding: _________

---

## 2. Embedding coverage

How many rows are actually embedded vs sitting NULL (invisible to semantic recall).

```sql
SELECT 'memory'   AS tbl, count(*) total, count(summary_embedding)  embedded FROM memory
UNION ALL
SELECT 'sessions' AS tbl, count(*) total, count(message_embedding)  embedded FROM sessions
UNION ALL
SELECT 'codebase' AS tbl, count(*) total, count(chunk_embedding)    embedded FROM codebase;
```

Target: embedded/total > 0.95 on each table. Gaps mean backfill needed.

Finding: _________

---

## 3. BM25 vs semantic hit mix

Over a fixture query set, what fraction of recalls ran semantic vs fell back to lexical.

```bash
node scripts/bm25-vs-semantic.ts fixtures/recall-queries.json
```

Sustained high lexical share with embeddings "on" -> daemon flaking the 500ms budget,
or rows un-embedded. Investigate per `examples/03-trace-recall-miss-bm25-fallback.md`.

Finding: _________

---

## 4. Recall precision over fixtures

```bash
node scripts/recall-precision.ts fixtures/recall-fixtures.json
```

Each fixture: a query + the path(s) that should appear in top-K. Precision = hits / queries.

| Metric | Target | Watch | Alert |
|---|---|---|---|
| Top-5 precision | > 0.7 | 0.4-0.7 | < 0.4 sustained |

Finding: _________

---

## 5. Hybrid weighting sanity

Spot-check that keyword-shaped fixtures aren't being smeared by default conceptual weights.
Re-run the keyword fixtures at 0.3/0.7 and confirm lift. See `templates/hybrid-weight-worksheet.md`.

Finding: _________

---

## 6. Pillar ratings

Ratings: Solid / Drifting / Needs work

| Pillar | Rating | Headline |
|---|---|---|
| Toggle + daemon config | | |
| Embedding coverage | | |
| BM25 vs semantic mix | | |
| Recall precision | | |
| Hybrid weighting | | |

---

## 7. Findings

### Must-fix
1.

### Should-refactor
1.

### Style
1.

---

## 8. Output

Save the audit and feed precision signals into the next eval cadence.
