# Example: Warm the Daemon and Embed a Batch over the Socket

This walks through the full local path: bring the daemon up, warm it, send a batch of texts over the Unix-socket NDJSON channel, read the 768-dim vectors back, and handle a crash. It mirrors the real architecture in `src/embeddings/` (`daemon.ts`, `nomic.ts`, `protocol.ts`, `client.ts`).

## Context

- Engine: `@huggingface/transformers`, model `nomic-ai/nomic-embed-text-v1.5`, q8, 768 dim.
- Shared install: `~/.hivemind/embed-deps/`.
- Goal: embed three record texts and confirm the vectors are 768-wide before they go near the `FLOAT4[]` columns.

## Step 1 - Ensure embeddings are enabled

The daemon only matters when the feature is on:

```bash
export HIVEMIND_EMBEDDINGS=1        # generate embeddings on the write path
export HIVEMIND_SEMANTIC_SEARCH=1   # use vector recall at query time
```

With these unset, there is no daemon and recall uses BM25/ILIKE. That is the safe default, not a failure.

## Step 2 - Warm the daemon (one-time cost)

The first request after start loads and warms the q8 model from `~/.hivemind/embed-deps/`. Warm it off the hot path so the first real query is already steady-state:

```ts
import { EmbedClient } from "./src/embeddings/client";

const client = new EmbedClient(); // connects to the daemon's Unix socket
await client.connect();           // spawns/attaches to the warm daemon

// A throwaway warmup embed pays the model-load cost up front.
await client.embed(["warmup"]);   // first call: seconds; subsequent: fast
```

Expect the first call to take noticeably longer (model load + warmup). Surface this to the user as a one-time cost.

## Step 3 - Send a batch (one socket round-trip, not three)

Batch multiple texts into a single request rather than one round-trip per text:

```ts
const texts = [
  "the auth handler rejects expired tokens",
  "summary: retrieval pipeline falls back to BM25 when embeddings are off",
  "message: warm the daemon before the first user query",
];

const vectors = await client.embed(texts); // one NDJSON request line, one response stream
```

Each request line and each response line is newline-delimited JSON (see `guides/02-ipc-protocol.md`). The client accumulates bytes until a newline before parsing a response.

## Step 4 - Validate the dimension before writing

Every vector must be 768-wide to match `EMBEDDING_DIMS` and the `FLOAT4[]` columns. Check it before the vectors go to storage:

```ts
const EMBEDDING_DIMS = 768;
for (const v of vectors) {
  if (v.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Embedding width ${v.length} != ${EMBEDDING_DIMS}; wrong model behind the daemon. ` +
      `Do NOT write this to summary_embedding / message_embedding.`,
    );
  }
}
// Safe to write into the FLOAT4[] columns; recall will query them with <#>.
```

A width other than 768 means the wrong model is loaded, a schema/data problem, not an IPC problem.

## Step 5 - Handle a daemon crash

The daemon is a separate process and can die (usually OOM on a large batch). A dead daemon should degrade to BM25/ILIKE, not crash retrieval:

```ts
try {
  const v = await client.embed(texts);
  return v;
} catch (err) {
  // Connection refused or dropped: respawn once, then fall back to lexical recall.
  if (await client.reconnect()) {
    return client.embed(texts);
  }
  // Embeddings unavailable: degrade gracefully. Recall still works via BM25/ILIKE.
  return null; // caller routes to the lexical path in src/shell/grep-core.ts
}
```

## What this example demonstrates

- Warmup is a one-time cost paid off the hot path.
- Batching is one socket round-trip, not one per text.
- The 768-dim check is the gate before any write to the `FLOAT4[]` columns.
- A dead daemon degrades to the lexical fallback rather than taking down recall.
