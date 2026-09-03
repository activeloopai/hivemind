# Source: q8 Quantization Tradeoffs for Embedding Inference

**Source type:** Documentation + community analysis
**Authority:** Medium-High
**Date fetched:** 2026-06-16

## Key findings

- **q8 = 8-bit integer quantization** of the model weights. It is the quantization Hivemind runs `nomic-embed-text-v1.5` at.
- **Footprint.** q8 keeps the shared install under `~/.hivemind/embed-deps/` to roughly 600MB and the resident daemon memory modest, important because the model lives in-process, not on dedicated hardware.
- **Latency.** 8-bit integer math is fast on CPU. Once the daemon is warm, per-text and per-batch inference is quick, which matters for both the write path and the query path.
- **Recall quality.** For retrieval embeddings, q8 recall sits very close to full precision (fp32). The reason: recall is computed with cosine similarity, which compares vector direction and is robust to the small per-weight rounding error 8-bit quantization introduces. Near-neighbor rankings barely move.
- **Quantization does not change output dimension.** q8, fp16, and fp32 all produce 768-dim vectors. Precision is independent of width. Therefore a quantization change is never a schema event; only a dimension change is.
- **Lower-bit (q4 and below).** Smaller and fast, but can start to blur near-neighbor distinctions, exactly the recall embeddings exist to provide. Only acceptable under hard footprint pressure and only after validating recall does not degrade on real data.
- **Higher precision (fp16/fp32).** Larger footprint and slower CPU inference for a fidelity gain that is usually not measurable on retrieval recall. Rarely worth it for this use.

## Synthesis for stinger

- q8 is the right default for an in-process CPU embedding daemon: smallest practical footprint, fastest CPU inference, recall essentially indistinguishable from full precision.
- Move to fp16/fp32 only if q8 recall is measurably insufficient on Hivemind's corpus.
- Move below q8 only under hard memory pressure and only with validated recall.
- Crucially: changing quantization is a free degree of freedom; it never touches the 768-dim columns and never triggers a schema migration.
