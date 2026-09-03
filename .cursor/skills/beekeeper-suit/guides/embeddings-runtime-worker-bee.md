# Embeddings Runtime Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `embeddings-runtime-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/embeddings-runtime-worker-bee.md`](../../../agents/embeddings-runtime-worker-bee.md)
**Stinger:** [`.cursor/skills/embeddings-runtime-stinger/`](../../embeddings-runtime-stinger/)
**Trigger policy:** proactive

---

## Domain

`embeddings-runtime-worker-bee` is the single authority on the embeddings runtime for Hivemind. It owns every decision between a piece of text and a vector landing in a Deep Lake `FLOAT4[]` column: whether embeddings should be on at all, which embedding model and quantization to run, how the daemon warms up and batches, how the Unix-socket NDJSON IPC behaves, how the daemon recovers from a crash, and the constraint that the embedding dimension must match `EMBEDDING_DIMS=768` and the column width. Its canonical defaults are the `@huggingface/transformers` engine running `nomic-ai/nomic-embed-text-v1.5` at 768 dim with `q8` quantization, OFF by default with a BM25/ILIKE fallback, a warmed daemon over a Unix socket, and a shared install at `~/.hivemind/embed-deps/`.

## Trigger phrases

Route to `embeddings-runtime-worker-bee` when the user says any of:

- "Should I turn embeddings on" / "enable semantic search" / "is 600MB worth the semantic lift"
- "Swap the embedding model" / "nomic-embed" / "change the embedding dimension"
- "The embed daemon is stuck" / "warmup is slow" / "embeddings daemon"
- "Why is recall falling back to BM25" / "BM25 fallback"
- "q8 quantization" / "768-dim"

Or when the request implicitly involves the embedding model, the daemon, quantization, or the on-vs-off decision.

## Do NOT route when

- The user wants recall quality, hybrid weighting, or why a query missed (how the vectors are *used*) - that is `retrieval-worker-bee`. This Bee owns the model and daemon; retrieval owns the recall that consumes them.
- The user wants the Deep Lake dataset schema-heal mechanics or the `FLOAT4[]` column definition itself - that is `deeplake-dataset-worker-bee`. A dim change is a schema event this Bee plans but hands to the dataset Bee to execute.
- The user wants API-key security - that is `security-worker-bee`.
- The user wants feature PRD authorship - that is `library-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The runtime symptom or decision (turn on/off, swap model, daemon stuck, slow warmup, fallback unexpectedly).
- The current env flags (`HIVEMIND_EMBEDDINGS`, `HIVEMIND_SEMANTIC_SEARCH`) and the workload's recall expectations.
- Optional: latency, footprint, and dim-compatibility constraints for a model swap.

If the symptom or the decision is unclear, do not invoke yet - ask the user what they are trying to change.

## Outputs the Bee produces

- An on-vs-off recommendation with the 600MB-plus-CPU tradeoff stated honestly for the workload.
- Model/quantization swap plans, each with the full migration checklist and the dim-compatibility check.
- Daemon lifecycle diagnoses (warmup, batching, IPC, crash recovery) with fixes.

## Multi-Bee sequences this Bee participates in

- **Memory / retrieval feature** - `embeddings-runtime-worker-bee` owns any change to the embedding model or daemon that feeds the `FLOAT4[]` columns; a dim change is a schema event handed to `deeplake-dataset-worker-bee`.
- **Schema-touching feature** - pulled in when the change touches an EMBEDDING column dimension.

## Critical directives the orchestrator should respect

- **The embedding dimension locks the schema** - vectors live in `FLOAT4[]` columns sized to `EMBEDDING_DIMS=768`; a dim change without the schema-heal path corrupts recall.
- **Embeddings are off by default and that is fine** - with the flags off, recall falls back to BM25/ILIKE; never frame off as broken.
- **Justify the 600MB plus CPU before turning embeddings on** - recommend it only when the semantic lift over BM25 is real for the workload.
- **Warm the daemon once; never spawn per request.**
- **Match the model to Hivemind, not to a broad leaderboard** (quality vs latency vs footprint vs 768-dim compatibility).
- **Never strand a dim change mid-migration** - always provide the full swap plan and hand schema execution to `deeplake-dataset-worker-bee`.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
