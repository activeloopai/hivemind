# Research Index - embeddings-runtime-stinger

| File | Source type | Authority | Relevance | Topic |
|---|---|---|---|---|
| `external/nomic-embed-text-v1.5.md` | Model card + docs | High | Core | The embedding model: 768 dim, retrieval quality, truncation, license |
| `external/q8-quantization-tradeoffs.md` | Docs + community | Medium-High | Core | q8 vs fp16/fp32 footprint, latency, recall-quality tradeoffs |
| `external/transformers-js-runtime.md` | Official docs | High | Core | `@huggingface/transformers` in-process JS/WASM/ONNX runtime |
| `external/deeplake-vector-columns.md` | Deep Lake docs | High | Core | `FLOAT4[]` columns, `<#>` cosine, hybrid record path |
| `external/embedding-model-landscape.md` | Model cards + benchmarks | Medium | Supporting | 768-dim, locally-runnable candidate models for Hivemind recall |
| `external/local-vs-hosted-embeddings.md` | Docs + analysis | Medium-High | Core | Local transformers.js vs hosted embedding APIs |
| `internal/command-brief-notes.md` | Internal | Internal | Supporting | Worker-Bee scope and constraints |

## Coverage gaps

- Deep Lake dataset schema-heal mechanics (deliberately out of scope; owned by deeplake-dataset-worker-bee; this stinger only triggers the handoff).
- Broad embedding-model leaderboard surveys (deliberately out of scope; the rubric is Hivemind recall, not general benchmarks).
- API key storage / data-egress review for hosted options (out of scope; handed to security-worker-bee).
