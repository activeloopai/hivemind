# Research Plan - embeddings-runtime-stinger

**Depth tier:** normal
**Time window:** model and runtime facts current as of 2026-06-16
**Page budget:** focused, Hivemind source plus a small set of authoritative external sources

## Scope

The embeddings runtime for Hivemind only: the `@huggingface/transformers` + `nomic-embed-text-v1.5` (768-dim, q8) daemon, its Unix-socket NDJSON IPC and lifecycle, model/quantization selection scoped to Hivemind recall, the embeddings-on vs BM25-fallback decision, local-vs-hosted tradeoffs, and the dim-must-match-schema constraint. Not a broad embedding-model survey or provider comparison.

## Queries / source areas

1. `nomic-ai/nomic-embed-text-v1.5`: architecture, 768 dim, retrieval quality, prefix conventions, license.
2. `@huggingface/transformers` (transformers.js) v3: in-process JS/WASM runtime, ONNX backend, quantization support.
3. q8 quantization for embedding models: footprint, latency, and recall-quality tradeoffs vs fp16/fp32.
4. Deep Lake `FLOAT4[]` vector columns and the `<#>` cosine operator + hybrid record path.
5. Embedding-model landscape filtered to locally-runnable, 768-dim-compatible candidates relevant to Hivemind.
6. Local transformers.js inference vs hosted embedding APIs: privacy, latency, footprint, cost.

## Source categories

- **Internal:** the Hivemind source under `src/embeddings/` (`daemon.ts`, `nomic.ts`, `protocol.ts`, `client.ts`, `columns.ts`), `embeddings/embed-daemon.js`, and `src/shell/grep-core.ts`; the command brief.
- **External/model:** the nomic-embed-text-v1.5 model card and HF transformers.js docs.
- **External/quantization:** quantization tradeoff notes for embedding inference.
- **External/storage:** Deep Lake vector column and cosine-recall references.

## Research summary location

See `research-summary.md` for the executive summary and most influential sources.
See `index.md` for the full source manifest with relevance scores.
