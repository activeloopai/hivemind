# Quantization and Footprint - q8 and the CPU Daemon

Quantization decides how the model's weights are stored and computed, which sets the daemon's footprint, inference latency, and recall quality. Hivemind runs `nomic-embed-text-v1.5` at `q8`. This guide explains why and when to deviate.

## The default: q8

`q8` (8-bit integer quantization) is the default because, for an in-process CPU daemon, it sits at the best point on the three-way tradeoff:

- **Footprint:** the q8 weights keep the shared install under `~/.hivemind/embed-deps/` to roughly 600MB and the resident daemon memory modest.
- **Latency:** 8-bit math is fast on CPU; per-text and per-batch inference is quick once the daemon is warm.
- **Quality:** for retrieval embeddings, q8 recall is very close to full precision. Cosine similarity is robust to the small per-weight error that 8-bit quantization introduces, so the recall loss versus fp16/fp32 is minimal in practice.

## The tradeoff axes

| Quantization | Footprint | Latency | Recall quality | When |
|---|---|---|---|---|
| **q8** (default) | Smallest practical | Fastest on CPU | Very close to full precision | The default for the CPU daemon |
| fp16 | Larger | Slower on CPU than q8 | Marginally higher fidelity | Only if q8 recall is measurably insufficient |
| fp32 | Largest | Slowest on CPU | Full fidelity | Rarely worth it for retrieval; big footprint cost |
| q4 (lower) | Smaller than q8 | Fast | Noticeable recall degradation possible | Only if footprint is critically tight and recall loss is validated |

## Why heavier precision is rarely worth it here

The vectors feed a `<#>` cosine recall path. Cosine similarity normalizes magnitude and compares direction; the small rounding error from q8 quantization barely moves the ranking of nearby neighbors. Paying fp16 or fp32 footprint and latency for a recall difference you cannot measure on Hivemind's corpus is a should-refactor, not a win.

## When to go lighter (q4 and below)

Only consider sub-q8 quantization when footprint is critically constrained (a very memory-tight host) and you have validated that recall on Hivemind's actual queries does not degrade. Lower-bit quantization can start to blur near-neighbor distinctions, which is exactly the recall the embeddings exist to provide. Measure before adopting.

## Footprint accounting

The footprint is not only on disk. The warm daemon holds the model resident in memory:

- **Install size:** ~600MB for the engine plus the q8 model under `~/.hivemind/embed-deps/`.
- **Resident memory:** the q8 weights plus the working buffers for the current batch. Larger batches use more transient memory; this is the usual cause of daemon OOM crashes.
- **Dimension is independent of quantization:** quantization changes weight precision, not output width. The output stays 768-dim regardless of q8/fp16/fp32, so quantization changes are *not* a schema event. Only a dimension change touches the `FLOAT4[]` columns.

## Decision rule

1. Start at q8. It is the right default for this CPU daemon.
2. Move to fp16/fp32 only if q8 recall is measurably insufficient on Hivemind's corpus, and accept the footprint/latency cost.
3. Move below q8 only under hard footprint pressure, and only after validating recall does not degrade.
4. Remember: quantization never changes the 768-dim output, so it never triggers a schema migration. That is the one clean degree of freedom here.
