# research-plan.md - retrieval-stinger

Research notes backing the retrieval-stinger guides. The focus is Hivemind's REAL recall
pipeline: hybrid lexical+semantic search over the `memory` and `sessions` tables, Deep Lake
`<#>` cosine on 768-dim nomic embeddings, the BM25/ILIKE fallback, the skillify gate, and
propagation. No Qdrant / Cohere / Valkey / OpenRouter - those were the old generic stack
and have been removed.

Notes dated 2026-06-16. Each maps to a load-bearing fact in `guides/`.

---

## Notes

| # | Note | Topic |
|---|---|---|
| 1 | `2026-06-16-hybrid-recall-architecture.md` | UNION ALL over memory + sessions, the core recall shape |
| 2 | `2026-06-16-deeplake-cosine-operator.md` | `<#>` negative inner product, ranking, FLOAT4[] |
| 3 | `2026-06-16-nomic-embeddings.md` | nomic-embed-text-v1.5 q8, 768-dim, daemon IPC |
| 4 | `2026-06-16-hybrid-weighting.md` | `deeplake_hybrid_record`, 0.7/0.3 vs 0.3/0.7 presets |
| 5 | `2026-06-16-bm25-fallback.md` | the silent lexical fallback path and when it fires |
| 6 | `2026-06-16-skillify-gate.md` | Haiku KEEP/MERGE/SKIP gate, Codify loop |
| 7 | `2026-06-16-propagation.md` | pull / auto-pull at SessionStart, scope me/team |
| 8 | `2026-06-16-codebase-graph.md` | tree-sitter graph, `codebase` table as a recall surface |
| 9 | `2026-06-16-session-normalization.md` | JSONB dialogue -> grep-able multi-line turns |

Plus the scaffolding: this plan, `gaps.md`, `open-questions.md`, and `index.md`.

---

## How notes are structured

- **Source:** the repo file(s) that establish the fact (primary source - this is our own code).
- **Retrieved:** 2026-06-16.
- **Status:** `load-bearing` (cited as a hard rule in a guide) or `informational`.
- **TL;DR.**
- **Key facts.**
- **Implications for the guides.**
- **Caveats / what's NOT covered.**

---

## Why repo files are the primary source

Unlike a generic RAG stinger that cites vendor docs, retrieval-stinger's ground truth IS the
Hivemind codebase. Vendor behavior (Deep Lake operators, nomic model card) is secondary;
what matters is how `src/shell/grep-core.ts`, `src/embeddings/*`, `src/skillify/*`, and
`src/graph/*` actually wire it together.

---

## Open questions

See `research/open-questions.md` and `research/gaps.md`.
