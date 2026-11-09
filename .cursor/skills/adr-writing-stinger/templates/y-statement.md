# Y-Statement Template

A Y-statement compresses the Nygard four-question framework into a single, grammatically constrained sentence. All five clauses are required.

## Template

```
In the context of <situation>,
facing <concern / challenge>,
we decided <option chosen>,
to achieve <quality / outcome>,
accepting <downside / trade-off>.
```

## Usage

- As the **opening sentence** of a Nygard or MADR "Decision" section (summary before the full record).
- As a **one-line entry** in an ADR log index (`adr-log.md`).
- Do NOT use as the sole format for a consequential decision, Y-statements omit Alternatives Considered.

## Example

```
In the context of Hivemind retrieval over a Deep Lake dataset where embeddings are optional,
facing offline and cold-start states with no vectors,
we decided to fall back to a BM25 lexical ranker when embeddings are unavailable,
to achieve usable results with zero model dependency,
accepting that BM25 ranking is coarser than dense similarity for paraphrased queries.
```

## Anti-pattern (missing "accepting")

```
In the context of the TypeScript monorepo, we decided to ship as an ESM-only npm package, to achieve a modern module layout.
```

The "accepting" clause is missing. This is a marketing pitch, not an engineering record.
