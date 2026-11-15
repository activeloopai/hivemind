# retrieval-stinger scripts

Deterministic checks for the Hivemind recall pipeline. Each surfaces a finding without
judgment - the worker reads the output and decides.

| Script | Purpose | Exit code |
|---|---|---|
| `daemon-health.ts` | Probe the embeddings daemon (socket, 768-dim round-trip, toggles) | 1 if degraded |
| `embedding-coverage.ts` | Count embedded vs NULL rows across memory/sessions/codebase | 1 if any table < 0.95 |
| `bm25-vs-semantic.ts` | Over a query set, count semantic vs BM25 fallback hits | 1 if lexical share > 0.2 with embeddings on |
| `recall-precision.ts` | Measure top-K precision over a recall fixture set | 1 if precision < 0.4 |

---

## Running

All scripts run with node (build first or use tsx):

```bash
# Daemon + coverage - no fixtures needed
node .cursor/skills/retrieval-stinger/scripts/daemon-health.ts
node .cursor/skills/retrieval-stinger/scripts/embedding-coverage.ts

# Fixture-driven
node .cursor/skills/retrieval-stinger/scripts/bm25-vs-semantic.ts fixtures/recall-queries.json
node .cursor/skills/retrieval-stinger/scripts/recall-precision.ts  fixtures/recall-fixtures.json --k=5
```

Each script ships with a stubbed driver (`recall()`, `embedProbe()`, `runCount()`, `recallMode()`)
that throws until wired to the real path. Wire them to:

- `searchDeeplakeTables` in `src/shell/grep-core.ts` (the recall UNION ALL),
- the EmbedClient in `src/embeddings/*` (query vectors + daemon probe),
- the `DeeplakeApi` for raw counts.

This keeps the scripts honest - they describe the exact check and refuse to fake a result.

---

## Toggles they respect

| Env | Effect |
|---|---|
| `HIVEMIND_EMBEDDINGS` | master on/off (read once at first run) |
| `HIVEMIND_SEMANTIC_SEARCH` | gate semantic recall independently |
| `HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS` | per-query embed budget (default 500ms) |

`recall-precision.ts` and `bm25-vs-semantic.ts` refuse / alert when `HIVEMIND_SEMANTIC_SEARCH=false`
because a precision number over a pure-BM25 path would be misleading.

---

## In CI

`daemon-health.ts` and `embedding-coverage.ts` are the cheap, high-leverage checks. Recommended
as a scheduled job, not a merge gate (they need DB + daemon access):

```yaml
- run: node .cursor/skills/retrieval-stinger/scripts/daemon-health.ts
- run: node .cursor/skills/retrieval-stinger/scripts/embedding-coverage.ts
```

Non-zero exit -> recall is degraded -> page the owner.

---

## What these scripts do NOT cover

- **Hybrid weight quality** - judgment call; use `templates/hybrid-weight-worksheet.md`.
- **Skillify gate calibration** - needs a labeled set; see `templates/skillify-gate-rubric.md`.
- **Graph staleness** - covered by the graph build (git hook); spot-check with `examples/05-inspect-codebase-graph-chunk.md`.

These gaps are intentional - the scripts cover the deterministic highest-leverage checks, not everything.

---

## Adding a new script

1. Header comment: purpose, run command, source-of-truth file references.
2. Exit code reflects severity (0 = clean, > 0 = finding).
3. Output is markdown to stdout so CI can capture and post.
4. Add to the table above and the `SKILL.md` scripts section.
5. Wire any new data dependency (DeeplakeApi, EmbedClient) explicitly - no fake results.
