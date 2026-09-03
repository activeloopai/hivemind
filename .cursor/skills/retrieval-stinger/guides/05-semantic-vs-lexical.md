# 05 - Semantic vs Lexical

The per-query decision: run semantic (`<#>`), lexical (BM25/ILIKE), or hybrid. The honest answer depends on the query, the corpus, and whether embeddings are even on.

---

## The three modes

| Mode | Mechanism | Best for |
|---|---|---|
| Lexical | BM25 / `ILIKE` | exact tokens the user remembers |
| Semantic | `<#>` cosine on 768-dim vectors | concepts the user can only describe loosely |
| Hybrid | `deeplake_hybrid_record(w1, w2)` | most real queries - blend, weighted by intent |

Hybrid is the general answer; pure lexical and pure semantic are the edges.

---

## Decide by query shape

- **The user typed an exact string** (an identifier, error, path, flag): lexical, or hybrid keyword-precise (0.3/0.7). The embedding will blur near-identical tokens; BM25 will not.
- **The user described a concept** ("how we handled the retry backoff", "that auth edge case"): semantic, or hybrid conceptual (0.7/0.3). Literal overlap is low; the embedding earns its keep.
- **Mixed or unknown**: hybrid balanced (0.5/0.5).

---

## Decide by corpus

Hivemind recall spans two columns with different texture:

- **`memory.summary`** - dense, model-written, vocabulary-normalized. Semantic recall shines here; the summary already paraphrased the session, so embeddings align well.
- **`sessions.message`** - raw dialogue, full of exact identifiers, commands, and error strings. Lexical recall shines here; the literal tokens the user remembers are present verbatim.

This is why the `UNION ALL` runs both arms over both tables - the hybrid score lets the right column win per query.

---

## Decide by what is actually on

The mode you *want* is constrained by the embeddings posture (`04-embeddings-integration.md`):

- Embeddings off entirely -> only lexical is available, period. Recommending semantic is recommending a feature flip, which is embeddings-runtime-worker-bee's call and a real 600MB + CPU cost.
- Embeddings on but the row predates the flip -> that row is NULL-embedded and only lexically recallable. Semantic will silently skip it.

Never recommend semantic without confirming embeddings are on and the rows in scope are embedded.

---

## The honest tradeoff

Semantic recall is not strictly better. It:

- costs the daemon + CPU per query,
- can over-generalize (returns conceptually-near but literally-wrong rows - the "noisy recall" failure, `10-recall-quality-eval.md`),
- blurs exact identifiers that lexical nails.

For a workload that is mostly exact-keyword recall, lexical may already be enough, and turning embeddings on buys little. State the tradeoff; do not assume semantic wins.

---

## Quick decision table

| Situation | Recommend |
|---|---|
| exact identifier / error string | lexical or keyword-precise hybrid |
| loose conceptual description | semantic or conceptual hybrid |
| mixed / unsure | balanced hybrid |
| embeddings off | lexical (and surface the flip as a separate decision) |
| rows predate embedding flip | expect lexical-only for those rows |
| recall returning near-but-wrong rows | shift weight toward lexical |
