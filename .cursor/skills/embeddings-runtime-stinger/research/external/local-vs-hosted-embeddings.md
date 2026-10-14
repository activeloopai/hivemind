# Source: Local vs Hosted Embeddings

**Source type:** Documentation + analysis
**Authority:** Medium-High
**Date fetched:** 2026-06-16

## Key findings

### Local inference (Hivemind's default)

- Runs `nomic-embed-text-v1.5` in-process via `@huggingface/transformers`, on CPU, on the user's machine.
- **Privacy:** nothing leaves the machine. For coding-agent memory (summaries, messages), this is the decisive property.
- **Cost:** no per-call fee; the cost is local CPU and the ~600MB install under `~/.hivemind/embed-deps/`.
- **Offline:** works with no connectivity.
- **Latency:** CPU inference plus a one-time warmup, but no network hop.
- **Dimension:** you control the model, so keeping it at 768 is straightforward.

### Hosted embedding APIs (the alternative)

- Text is sent to a third-party service that returns vectors.
- **Privacy:** text egresses to the provider - requires a data-egress review (security-worker-bee).
- **Cost:** per-token / per-call pricing.
- **Footprint:** nothing installed locally - relevant for a thin host that cannot carry 600MB + CPU.
- **Latency:** a network round-trip per request or batch.
- **Dimension risk:** the API's output dimension must equal 768 to fit the `FLOAT4[]` columns, or adopting it is a schema event.
- **Keys:** requires API key handling, which is security-worker-bee's domain.

## Synthesis for stinger

- For Hivemind - shared memory for coding agents - local is the natural default on privacy alone: no egress, no per-call cost, offline-capable.
- A hosted API is worth considering only under a concrete constraint: a host that cannot afford the local footprint, or a hosted model with a measured recall advantage on Hivemind data.
- Two gates before any hosted adoption: the output must be 768 dim (or accept a schema migration), and the key/egress review goes to security-worker-bee.
- A hosted path bypasses the Unix-socket daemon entirely - it is a different inference path, so the daemon lifecycle and IPC guides do not apply to it.
