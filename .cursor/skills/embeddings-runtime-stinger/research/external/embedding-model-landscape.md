# Source: Embedding Model Landscape (Hivemind-Filtered)

**Source type:** Model cards + retrieval benchmarks
**Authority:** Medium
**Date fetched:** 2026-06-16

## Scope note

This is not a general embedding-model survey. It is the landscape filtered to one question: which models are realistic candidates for Hivemind's daemon - locally runnable via `@huggingface/transformers`, and either 768-dim (drop-in) or truncatable to 768?

## Key findings

| Model | Native dim | 768-compatible | Local via transformers.js | Notes |
|---|---|---|---|---|
| **nomic-embed-text-v1.5** | 768 | Yes (native) | Yes | Current default; retrieval-tuned; Matryoshka truncation; q8 footprint ~600MB |
| bge-base-en-v1.5 | 768 | Yes (native) | Yes | Same dimension; only adopt on a measured recall win over nomic on Hivemind data |
| gte-base | 768 | Yes (native) | Yes | 768-dim alternative; evaluate on real recall, not benchmark rank |
| all-MiniLM-L6-v2 | 384 | No - dim event | Yes | Small and fast, but 384 dim = schema migration; weaker on longer text |
| bge-large / e5-large class | 1024 | No - dim event | Varies | Higher dim; forces a column resize + full re-embed; high migration cost |

## What matters for selection

- **Dimension first.** Only 768-dim models are drop-in. Anything else is a schema migration regardless of benchmark quality.
- **Recall on Hivemind's corpus, not leaderboards.** Public retrieval benchmarks (MTEB-style) are a weak proxy for recall on coding-agent summaries and messages. The deciding evidence is an A/B on real records and queries through the `<#>` path.
- **Footprint and CPU latency.** The model runs in-process on CPU. A larger model must earn its added latency and memory with a recall win.

## Synthesis for stinger

- The realistic drop-in field is small: nomic-embed-text-v1.5 (default), and same-dimension alternatives like bge-base-en-v1.5 / gte-base worth A/B testing only if there is a recall reason.
- Off-dimension models (384, 1024) are migration decisions, not swaps - reserve them for a large, measured recall need.
- Keep the rubric tight: dimension gate, then recall on Hivemind data, then latency, then footprint. Do not import a broad provider/leaderboard comparison into this skill.