# Source: @huggingface/transformers (transformers.js) Runtime

**Source type:** Official documentation
**Authority:** High
**Date fetched:** 2026-06-16
**Package:** `@huggingface/transformers ^3`

## Key findings

- **In-process JS runtime.** `@huggingface/transformers` (transformers.js) runs models directly in a JS/Node process, no separate Python service, no native model server. This is what lets Hivemind embed a daemon (`src/embeddings/daemon.ts` + `nomic.ts`) that holds the model in-process.
- **ONNX / WASM backend.** Models run via an ONNX runtime with WASM (and where available, accelerated) backends. This is CPU-capable out of the box, which matches Hivemind's local-first, no-GPU-required posture.
- **Optional, ~600MB dependency.** It is an optional dependency in Hivemind, off by default. When embeddings are enabled, the engine plus the model install under the shared `~/.hivemind/embed-deps/` directory, roughly 600MB, paid once per machine.
- **Quantization support.** The runtime supports quantized model variants (Hivemind uses q8), keeping the footprint and CPU cost down without meaningfully hurting retrieval recall.
- **Feature-extraction / embedding pipeline.** transformers.js exposes a feature-extraction path that produces embeddings from text, the mechanism Hivemind uses to turn summaries and messages into 768-dim vectors via nomic-embed-text-v1.5.
- **Warmup cost.** The first inference after load pays a model-load + warmup cost; subsequent inferences are steady-state. This is why the warm daemon exists rather than a per-call spawn.

## Synthesis for stinger

- transformers.js is what makes a local, in-process embedding daemon practical in a TypeScript/Node project: no Python sidecar, no GPU requirement.
- The runtime's optional, ~600MB nature is exactly why embeddings are off by default and why turning them on must be justified.
- Warmup is a property of the runtime (model load on first inference), so the daemon's warm-once design is a direct response to it.
- The runtime supports q8, so the quantization default and the local-inference default reinforce each other.
