# references/ - Retrieval Ground Truth

These are the load-bearing facts the recall and codify pipeline rests on. Unlike a "demoted alternatives" folder, every note here documents something Hivemind **actually uses** - the operators, models, weighting, and methods retrieval-worker-bee enforces. They exist so a finding can cite the mechanism, not just assert it.

Active recommendations live in `guides/`. References are the underlying truth a guide points at.

---

## Files in this folder

| File | What it documents |
|---|---|
| `deeplake-cosine-search.md` | the Deep Lake `<#>` cosine operator and how recall scores against `FLOAT4[]` columns |
| `hybrid-weighting.md` | `deeplake_hybrid_record` weighting math and the 0.7/0.3, 0.5/0.5, 0.3/0.7 presets |
| `nomic-embed-model.md` | nomic-embed-text-v1.5 (768-dim, q8) as the vector source recall depends on |
| `bm25-lexical-recall.md` | BM25 / ILIKE lexical recall - the fallback arm and the keyword-precise arm |
| `recall-quality-eval.md` | the precision/recall evaluation method for recall changes |
| `codebase-graph-extraction.md` | tree-sitter file/symbol/import extraction into the `codebase` Deep Lake table |
| `skillify-gate-rationale.md` | why the KEEP/MERGE/SKIP Haiku gate exists and how to keep it honest |
