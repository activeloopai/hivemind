# research/index.md - retrieval-stinger

Index of research notes backing the retrieval-stinger guides. All dated 2026-06-16.
Ground truth is the Hivemind codebase, not vendor docs. The old generic-stack notes
(Qdrant / Cohere / Valkey / OpenRouter / GraphRAG) were removed - they described a stack
Hivemind does not run.

---

## Notes

| Note | Status | One-liner |
|---|---|---|
| `2026-06-16-hybrid-recall-architecture.md` | load-bearing | UNION ALL over memory + sessions is the recall core |
| `2026-06-16-deeplake-cosine-operator.md` | load-bearing | `<#>` negative inner product on FLOAT4[] columns |
| `2026-06-16-nomic-embeddings.md` | load-bearing | nomic-embed-text-v1.5 q8, 768-dim, daemon over unix socket |
| `2026-06-16-hybrid-weighting.md` | load-bearing | `deeplake_hybrid_record` weight presets |
| `2026-06-16-bm25-fallback.md` | load-bearing | the silent lexical fallback path |
| `2026-06-16-skillify-gate.md` | load-bearing | Haiku KEEP/MERGE/SKIP gate (Codify) |
| `2026-06-16-propagation.md` | informational | pull/auto-pull at SessionStart, scope me/team |
| `2026-06-16-codebase-graph.md` | informational | tree-sitter graph as a third recall surface |
| `2026-06-16-session-normalization.md` | load-bearing | JSONB dialogue -> grep-able multi-line turns |

---

## Scaffolding

- `research-plan.md` - what was researched and why repo files are the primary source.
- `gaps.md` - where coverage is partial.
- `open-questions.md` - what we don't know yet + the experiment to answer it.

---

## Source map (old generic stack -> Hivemind reality)

| Old | Hivemind |
|---|---|
| Qdrant vectors | Deep Lake FLOAT4[] + `<#>` cosine |
| Cohere rerank | hybrid weighting + Haiku skillify gate |
| Valkey / 3-tier memory | `memory` + `sessions` tables over VFS (`~/.deeplake/memory`) |
| OpenRouter | host CLI for summaries + HF transformers (nomic) for embeddings |
| AiTrace | `sessions` table + dashboard |
