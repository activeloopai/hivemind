# Y-Statement Format

Y-statements are a single-sentence ADR form attributed to Olaf Zimmermann. They compress the Nygard four-question framework into a grammatically constrained sentence that forces precision.

---

## The Y-statement grammar

```
In the context of <situation>,
facing <concern / challenge>,
we decided <option chosen>,
to achieve <quality / outcome>,
accepting <downside / trade-off>.
```

All five clauses are required. Omitting "accepting" turns the statement into a marketing pitch rather than an honest engineering record.

---

## When to use Y-statements

**As a supplement inside Nygard or MADR:** Place the Y-statement as the opening sentence of the "Decision" or "Decision Outcome" section. It gives a reader a 30-second summary before they read the full record.

**As a standalone in an ADR log index:** An `adr-log.md` file that lists all ADRs can include the Y-statement as the one-line summary next to each entry.

**Do NOT use as the sole format** when the decision warrants an Alternatives Considered section or detailed Consequences. Y-statements do not capture what was rejected or why.

---

## Worked examples

### Good Y-statement

> In the context of Hivemind retrieval over a Deep Lake dataset where embeddings are optional, facing offline and cold-start states with no vectors, we decided to fall back to a BM25 lexical ranker when embeddings are unavailable, to achieve usable results with zero model dependency, accepting that BM25 ranking is coarser than dense similarity for paraphrased queries.

Every clause is present. The "accepting" clause names a concrete, non-trivial trade-off.

### Weak Y-statement (missing "accepting")

> In the context of the TypeScript monorepo, we decided to ship as an ESM-only npm package, to achieve a modern module layout.

No "accepting" clause. No stated concern. Useless as an engineering record.

---

## Y-statement as an ADR log summary

In an `adr-log.md`:

```markdown
## ADR Index

| # | Title | Status | Summary |
|---|---|---|---|
| 0012 | Fall back to BM25 when embeddings off | Accepted | In the context of... accepting that... |
| 0013 | Adopt trunk-based development | Accepted | In the context of... accepting that... |
| 0014 | String-based pre-tool-use gate | Superseded by 0021 |, |
```

---

## Relationship to Nygard / MADR

The Y-statement maps onto Nygard sections as follows:

| Y-statement clause | Nygard section |
|---|---|
| "In the context of" | Context (situation part) |
| "facing" | Context (challenge/forces part) |
| "we decided" | Decision |
| "to achieve" | Consequences (positive) |
| "accepting" | Consequences (negative / trade-off) |

It does NOT map to Alternatives Considered, that is why Y-statements should supplement, not replace, full ADRs for consequential decisions.
