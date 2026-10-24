# Daemon Lifecycle - Warmup, Batching, Crash Recovery

The embeddings runtime is built around a long-lived daemon so the model is loaded once and reused. The daemon lives in `src/embeddings/daemon.ts` and runs the model through `nomic.ts`; there is also an `embeddings/embed-daemon.js` at the repo root. Clients reach it through `client.ts` over a Unix-socket NDJSON channel (see `guides/02-ipc-protocol.md`).

## Why a daemon at all

`@huggingface/transformers` loads `nomic-ai/nomic-embed-text-v1.5` (q8, 768 dim) into memory and runs inference on CPU. Loading and warming the model is the expensive step. Spawning a process per embedding would pay that cost on every call. The daemon pattern pays it once:

- One warm process holds the model in memory.
- Many requests are batched into the warm process over the socket.
- The retrieval pipeline (`src/shell/grep-core.ts`) and the write path both talk to the same warm daemon.

## Shared install

The engine and model live under `~/.hivemind/embed-deps/`, a shared install reused across repos and projects on the same machine. Consequences:

- The ~600MB download and install happen once per machine, not once per repo.
- A new repo that turns embeddings on reuses the existing install with no re-download.
- The install is an optional dependency; it only appears when embeddings are enabled.

## Warmup

The first embedding request after the daemon starts is slow because the model is being loaded and warmed. After that, inference is steady-state.

- Surface warmup to the user as a one-time cost, not a bug. A first-call latency in the seconds range, then sub-second batches, is expected.
- If warmup happens on a hot path (a user-facing query), warm the daemon ahead of time so the first real query is already steady-state.
- Warmup also brings the q8 weights into memory; expect memory to rise to the model's resident size and stay there.

## Batching

Batch bulk work into single socket requests:

- When embedding many records (a backfill, a bulk write), send them as one batched request rather than one socket round-trip per text.
- Batching amortizes the per-request overhead and lets the model process texts together.
- The write path that populates `summary_embedding` and `message_embedding` should batch wherever it has more than one record in hand.

## Crash recovery

The daemon is a separate process and can die (OOM, an unhandled error in inference, the socket being removed). The client should treat the daemon as restartable:

- On a broken socket or a connection refusal, the client should be able to respawn or reconnect to the daemon rather than failing the whole request path.
- Because the feature is off by default and BM25/ILIKE is the fallback, a dead daemon should degrade to lexical recall rather than taking down retrieval. Confirm the failure path lands on the fallback, not an exception that propagates to the user.
- A repeatedly crashing daemon usually means OOM (the model plus batch did not fit) or a corrupt install under `~/.hivemind/embed-deps/`. Reinstalling the shared deps clears the latter.

## Lifecycle checklist

When auditing or fixing daemon behavior:

1. Is the model loaded once (warm daemon) or per request (spawn-per-call)? Spawn-per-call is a must-fix on production paths.
2. Are bulk writes batched into single socket requests?
3. Is warmup surfaced as a one-time cost, and warmed off the hot path where it matters?
4. Does a dead daemon degrade to BM25/ILIKE rather than throwing?
5. Is the shared install under `~/.hivemind/embed-deps/` intact?
