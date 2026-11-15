# Source: nomic-embed-text-v1.5

**Source type:** Model card + documentation
**Authority:** High
**Date fetched:** 2026-06-16
**Identifier:** `nomic-ai/nomic-embed-text-v1.5`

## Key findings

- **Output dimension: 768.** This is the dimension Hivemind's schema is built around (`EMBEDDING_DIMS=768`) and the width of the `summary_embedding` / `message_embedding` `FLOAT4[]` columns. A model emitting any other width is a schema event.
- **Purpose-built for retrieval.** It is a text embedding model tuned for semantic search / retrieval, which is exactly Hivemind's use: turning stored summaries and messages into vectors recalled via cosine similarity.
- **Matryoshka representation.** v1.5 supports Matryoshka-style truncation: a longer vector can be truncated to a shorter one with graceful quality loss. This means a higher-native-dim variant could in principle be truncated to 768 to stay schema-compatible, but truncated recall must be validated, not assumed.
- **Prefix conventions.** nomic models use task prefixes (for example a search-document prefix when embedding stored text and a search-query prefix when embedding a query). Using the right prefix on each side matters for recall quality; document text and query text should be embedded with their matching prefixes.
- **Runs locally via transformers.js.** The model is available in a form runnable by `@huggingface/transformers` in-process, which is how Hivemind's daemon loads it, no external API call.
- **Quantization.** Hivemind runs it at q8, which keeps the install near ~600MB and inference fast on CPU while preserving recall quality (see `q8-quantization-tradeoffs.md`).

## Synthesis for stinger

- nomic-embed-text-v1.5 at 768 dim is the schema-native default; it is the model the `FLOAT4[]` columns are sized for.
- Any swap candidate must either output 768 dim (drop-in) or truncate to 768 (validate) or be treated as a schema migration.
- Get the document/query prefixes right; a recall regression that looks like a model problem is sometimes just a missing or swapped prefix.
