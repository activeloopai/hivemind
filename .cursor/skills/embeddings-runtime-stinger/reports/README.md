# Reports - embeddings-runtime-stinger

This folder accumulates durable recommendation and audit reports produced by `embeddings-runtime-worker-bee`.

## Report types

- **On/off decision reports** - dated recommendations on whether to enable embeddings for a given workload, following the reasoning in `guides/05-embeddings-vs-bm25.md`.
- **Model swap reports** - recorded model-swap decisions following `templates/embedding-model-swap-plan.md`.
- **Dim migration reports** - completed dimension-change records following `templates/dim-migration-checklist.md`, noting the schema-heal handoff.
- **Runtime audit reports** - review of an existing embeddings setup against the stinger's severity rubric (must-fix / should-refactor / style): dim/schema agreement, warmup discipline, batching, quantization choice.

## Naming convention

```
YYYY-MM-DD-<scope-slug>-<report-type>.md
```

Examples:
- `2026-06-16-recall-on-off-decision.md`
- `2026-06-20-nomic-to-bge-model-swap.md`
- `2026-07-01-768-to-1024-dim-migration.md`
- `2026-07-15-embeddings-runtime-audit.md`

## Lifecycle

Reports are point-in-time documents. The runtime's ground truth (the nomic model, q8 quantization, 768 dim, the daemon architecture) is stable, so these reports age slowly, but re-validate recall claims when the corpus or query patterns change materially. Each report should state its date and a "re-evaluate when" trigger (for example, "if query patterns shift toward paraphrase-heavy recall").
