---
name: embeddings-runtime-stinger
description: The embeddings runtime for Hivemind - the @huggingface/transformers + nomic-embed-text-v1.5 (768-dim, q8) daemon that generates vectors for Deep Lake recall. Covers daemon lifecycle (warmup, batching, socket IPC, crash recovery), the NDJSON Unix-socket protocol, embedding model and quantization selection scoped to Hivemind, the embeddings-on vs BM25-fallback decision, local-vs-hosted inference tradeoffs, and the dim-must-match-schema constraint (EMBEDDING_DIMS=768 ties to the FLOAT4[] columns). Use when the user says "should I turn embeddings on", "swap the embedding model", "the embed daemon is stuck", "why is recall falling back to BM25", "change the embedding dimension", or "is 600MB worth the semantic lift". Do NOT use for the Deep Lake dataset schema-heal mechanics themselves (deeplake-dataset stinger), API key security (security-worker-bee), or PRD authorship (library-worker-bee).
---

# embeddings-runtime Stinger

You are the playbook for `embeddings-runtime-worker-bee`. Every invocation produces one concrete artifact: a recommendation, an on/off decision, a model-swap plan, a daemon-lifecycle fix, or a configuration snippet. Every claim is backed by the ground truth in `research/` and the actual Hivemind source under `src/embeddings/`.

## Scope in one sentence

The embeddings runtime for Hivemind: the HF transformers + nomic 768-dim daemon, its IPC and lifecycle, model and quantization selection scoped to Hivemind, the embeddings-on vs BM25-fallback decision, and the dim-must-match-schema constraint. Nothing broader.

## Invocation modes (routing table)

Read the user's request and match to one mode. Most requests match one primary mode with one supporting mode.

| Mode | Trigger phrases | Primary guide |
|---|---|---|
| `daemon-lifecycle` | "embed daemon stuck", "warmup", "batching", "crash recovery", "daemon won't start", "first embedding is slow" | `guides/01-daemon-lifecycle.md` |
| `ipc-protocol` | "socket protocol", "NDJSON", "client can't reach daemon", "IPC handshake", "unix socket path" | `guides/02-ipc-protocol.md` |
| `model-selection` | "swap the embedding model", "which embedding model", "nomic vs other", "better recall quality" | `guides/03-embedding-model-selection.md` |
| `quantization` | "q8 vs fp32", "footprint", "latency tradeoff", "smaller model", "quantization quality" | `guides/04-quantization-and-footprint.md` |
| `on-vs-off` | "should I turn embeddings on", "is 600MB worth it", "BM25 fallback", "semantic search worth it" | `guides/05-embeddings-vs-bm25.md` |
| `local-vs-hosted` | "run embeddings locally or hosted", "offload to an API", "CPU cost", "self-host vs call out" | `guides/06-local-vs-hosted.md` |
| `schema-and-dim` | "change the dimension", "EMBEDDING_DIMS", "FLOAT4[] columns", "dim mismatch", "schema event" | `guides/07-schema-and-columns.md` |

## First action on every invocation

1. Read `guides/00-principles.md`, the non-negotiables that govern every output.
2. Match the request to the routing table above.
3. Open the relevant guide(s) before producing any output.

## Folder layout

```text
embeddings-runtime-stinger/
├── SKILL.md                            (this file, master index)
├── guides/
│   ├── 00-principles.md                (non-negotiables: dim-locks-schema, off-by-default, no-quality-cliff)
│   ├── 01-daemon-lifecycle.md          (warmup, batching, socket IPC, crash recovery, shared install)
│   ├── 02-ipc-protocol.md              (Unix-socket NDJSON protocol; client/daemon handshake; framing)
│   ├── 03-embedding-model-selection.md (Hivemind-scoped model rubric: quality vs latency vs footprint vs dim)
│   ├── 04-quantization-and-footprint.md(q8 vs fp32/fp16; footprint vs quality vs latency for the daemon)
│   ├── 05-embeddings-vs-bm25.md         (the on-vs-off decision; BM25/ILIKE lexical fallback; no quality cliff)
│   ├── 06-local-vs-hosted.md            (local transformers.js daemon vs a hosted embedding API; tradeoffs)
│   └── 07-schema-and-columns.md         (EMBEDDING_DIMS=768; FLOAT4[] columns; dim change = schema event)
├── examples/
│   ├── daemon-warmup-and-ipc.md        (warm the daemon, send a batch over the socket, read NDJSON back)
│   ├── embedding-model-comparison.md   (filled-in model comparison scoped to Hivemind recall)
│   └── enable-embeddings-workflow.md   (turn HIVEMIND_EMBEDDINGS + HIVEMIND_SEMANTIC_SEARCH on end-to-end)
├── templates/
│   ├── embedding-model-swap-plan.md    (the model/dim swap plan covering the schema migration)
│   └── dim-migration-checklist.md      (step-by-step dim-change checklist with the schema-heal handoff)
├── reports/
│   └── README.md                       (describes how past recommendation/audit reports accumulate)
└── research/
    ├── research-plan.md
    ├── research-summary.md
    ├── index.md
    ├── internal/
    │   └── command-brief-notes.md
    └── external/
        ├── nomic-embed-text-v1.5.md
        ├── q8-quantization-tradeoffs.md
        ├── transformers-js-runtime.md
        ├── deeplake-vector-columns.md
        ├── embedding-model-landscape.md
        └── local-vs-hosted-embeddings.md
```

## Canonical runtime defaults

These are the recommended defaults. Deviating requires explicit rationale.

| Decision | Recommended default | Rationale |
|---|---|---|
| Embeddings engine | **@huggingface/transformers ^3** (optional dep) | Pure JS/WASM runtime; runs in-process via a daemon; no native build needed |
| Embedding model | **nomic-ai/nomic-embed-text-v1.5** | Strong retrieval quality at 768 dim; the dim the schema is built around |
| Quantization | **q8** | Best footprint/latency/quality balance for CPU inference; ~600MB on-disk install |
| Dimension | **768** (`EMBEDDING_DIMS`) | Locked to the Deep Lake `FLOAT4[]` columns; changing it is a schema event |
| Default state | **OFF** | `HIVEMIND_EMBEDDINGS` and `HIVEMIND_SEMANTIC_SEARCH` both off; recall falls back to BM25/ILIKE |
| Recall when off | **BM25 / ILIKE lexical** | No quality cliff; just less semantic recall, no 600MB + CPU cost |
| Daemon transport | **Unix-socket NDJSON IPC** | `protocol.ts` + `client.ts`; one warm process, batched requests |
| Shared install | **`~/.hivemind/embed-deps/`** | One model/dep install reused across repos; warmup cost paid once |

## Severity rubric

Used to classify findings when auditing an existing embeddings setup.

- **Must-fix:** Embedding dimension does not match `EMBEDDING_DIMS=768` or the `FLOAT4[]` column width (recall returns garbage or errors); embeddings written with one model then queried as if another; a dim change shipped without running the schema-heal path.
- **Should-refactor:** Embeddings turned on with no measured recall lift over BM25 (paying 600MB + CPU for nothing); daemon spawned per-request instead of warmed once; no batching on bulk embedding writes; quantization heavier than q8 with no quality justification.
- **Style / nice-to-have:** No crash-recovery handling on the socket client; daemon warmup not surfaced to the user as a one-time cost; model choice undocumented.

## Cross-Bee handoffs

Surface these explicitly rather than attempting them inline:

- **deeplake-dataset stinger / worker-bee** for the actual schema-heal mechanics when a dim change forces a column-width migration. This Bee decides the dim and writes the swap plan; deeplake-dataset executes the schema event.
- **security-worker-bee** if a hosted embedding option is considered and an API key or data-egress review is needed.
- **library-worker-bee** for PRD authorship when turning embeddings on (or a model swap) needs to be documented as a feature requirement.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
