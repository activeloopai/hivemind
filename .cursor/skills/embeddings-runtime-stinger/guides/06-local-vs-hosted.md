# Local vs Hosted Inference - Where the Embeddings Run

Hivemind's default is local: the `@huggingface/transformers` daemon runs `nomic-embed-text-v1.5` in-process on the user's machine. The alternative is calling a hosted embedding API. This guide weighs that tradeoff, scoped to Hivemind.

## The default: local transformers.js daemon

The shipped runtime is local. Text goes into the warm daemon over the Unix socket, the model runs on CPU, and 768-dim vectors come back, all on the same machine, no network egress. This is the right default for a tool that holds coding-agent memory.

## The two options compared

| Axis | Local daemon (default) | Hosted embedding API |
|---|---|---|
| Privacy / egress | Nothing leaves the machine | Text is sent to a third party; needs a data-egress review |
| Footprint | ~600MB install + resident model | None local; nothing to install |
| Latency | CPU inference + warmup, but no network hop | Network round-trip per request (or batch) |
| Cost model | Local CPU + disk (no per-call fee) | Per-token / per-call API cost |
| Offline | Works fully offline | Requires connectivity |
| Dim control | You pick the model; must be 768 | The API's dimension must equal 768 or it is a schema event |
| Key management | None | API key handling (hand to security-worker-bee) |

## When local is the right call (most of the time)

- The text being embedded is private (a coding agent's stored memory, summaries, messages) and should not transit a third party.
- You want zero per-call cost and offline operation.
- You can afford the ~600MB install and the CPU at inference.

For Hivemind's purpose, shared memory for coding agents, local is the natural fit on privacy alone.

## When a hosted API might be considered

- The host machine cannot afford the 600MB footprint or the CPU (a thin client).
- A hosted model produces measurably better recall on Hivemind's corpus *and* outputs 768 dim (or you accept the schema migration).
- Network latency to the API is acceptable for the write/query paths.

If a hosted option is seriously on the table, two things become mandatory:

1. **Dimension check.** The hosted model's output must be 768 to match the `FLOAT4[]` columns, or the swap is a schema event (`templates/embedding-model-swap-plan.md`).
2. **Security handoff.** API key storage and the data-egress review belong to security-worker-bee. This stinger weighs the tradeoff; it does not own the key or the egress sign-off.

## The honest default recommendation

Stay local. The privacy posture, zero per-call cost, and offline operation match what Hivemind is for. Recommend a hosted API only when a concrete constraint (footprint on a thin host, or a measured recall gap) makes the network round-trip and egress review worth it, and only after confirming the dimension stays 768. Note that a hosted path does not use the Unix-socket daemon at all; it is a separate inference path, so the lifecycle and IPC guides do not apply to it.
