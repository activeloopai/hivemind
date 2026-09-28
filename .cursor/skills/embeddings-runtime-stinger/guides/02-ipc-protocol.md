# IPC Protocol - Unix-Socket NDJSON

The client and daemon talk over a Unix domain socket using newline-delimited JSON (NDJSON). The protocol shape lives in `src/embeddings/protocol.ts`; the client side that connects, sends, and reads responses lives in `client.ts`. This guide describes how the channel behaves and how to reason about its failure modes.

## Why a Unix socket + NDJSON

- A Unix domain socket keeps the channel local to the machine: no TCP port, no network exposure, low overhead.
- NDJSON (one JSON object per line) is a simple, streamable framing: each request is a line, each response is a line. No length-prefix bookkeeping, easy to debug by eye.
- It pairs naturally with the warm-daemon model: the client opens the socket, streams requests as lines, and reads response lines back.

## Message framing

Each message is a single JSON object terminated by a newline. The two directions are:

- **Request (client -> daemon):** a batch of texts to embed, plus whatever identifies the request so responses can be matched.
- **Response (daemon -> client):** the resulting 768-dim vectors (or an error), one line per response.

Because framing is line-delimited, a partial line means the message is not complete yet; the client accumulates bytes until it sees a newline before parsing. Never parse a half-buffered chunk as JSON.

## Handshake and connection

1. The client connects to the daemon's Unix socket path.
2. If the daemon is not running or the socket file is stale, the connection is refused. This is the signal to start (or restart) the daemon, or to fall back to BM25/ILIKE.
3. Once connected, the client streams NDJSON request lines and reads NDJSON response lines.

## Failure modes

| Symptom | Likely cause | Handling |
|---|---|---|
| Connection refused / no such socket | Daemon not running, or stale socket file | Start/restart the daemon; if embeddings are non-critical, degrade to BM25/ILIKE |
| Connection drops mid-request | Daemon crashed (often OOM) | Reconnect/respawn; retry the batch; see `guides/01-daemon-lifecycle.md` crash recovery |
| Response never arrives | Daemon stuck in warmup or a large batch | Allow for warmup latency; reduce batch size if it is OOM-ing |
| JSON parse error on a line | Buffering bug parsing a partial line | Accumulate to the newline before parsing |
| Dimension mismatch in stored vectors | Wrong model behind the daemon | This is a schema/data problem, not an IPC problem; see `guides/07-schema-and-columns.md` |

## Protocol invariants

- One JSON object per line, newline-terminated, both directions.
- The vectors returned are 768-dim to match `EMBEDDING_DIMS`; a daemon returning a different width means the wrong model is loaded and must not be written to the `FLOAT4[]` columns.
- The socket is local-only; there is no remote transport here. A hosted embedding option (see `guides/06-local-vs-hosted.md`) does not use this socket at all; it is a different path.
- The client should be resilient: a refused or dropped connection degrades to the lexical fallback rather than throwing into the retrieval pipeline.

## Debugging the channel

- A line-by-line dump of what crosses the socket is the fastest way to see whether the request framing or the daemon's response is malformed.
- A refused connection plus a present-but-stale socket file usually means a previous daemon died without cleaning up; removing the stale socket and restarting clears it.
- If responses come back but recall is wrong, the IPC is fine; look at the model and dimension, not the protocol.
