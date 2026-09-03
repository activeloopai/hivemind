# 10 - Recall Quality Evaluation

Recall changes are measured, not vibed. This guide is the method: precision/recall over a fixed query set, run before and after any weighting or pipeline change, with explicit attention to the noisy-recall failure mode.

---

## The two numbers

For a query and a set of returned rows:

- **Precision** = relevant returned / total returned. "How much of what came back was actually useful." Low precision = noisy recall.
- **Recall** = relevant returned / total relevant in the corpus. "How much of what should have come back did." Low recall = misses.

The two trade off. Cranking the semantic weight up usually lifts recall (catches more paraphrases) but can drop precision (drags in conceptually-near-but-wrong rows). The keyword-precise weighting does the reverse.

---

## The method: a fixed query set

You cannot compare "before" and "after" without holding the queries constant.

1. **Build a query set.** A representative set of real recall queries against a known corpus - mix conceptual, exact-identifier, and mixed-intent (`05-semantic-vs-lexical.md`). Label, for each query, which rows are relevant.
2. **Snapshot before.** Run the set through current recall; record precision/recall per query and the aggregate.
3. **Make the change.** Weighting shift, pipeline edit, fast-path change, embeddings flip.
4. **Snapshot after.** Re-run the identical set.
5. **Compare.** Did aggregate precision/recall move the way you intended, and what regressed? A weighting change that lifts conceptual recall while tanking exact-identifier precision is a bad trade for an identifier-heavy workload.

"Feels better" is not a snapshot. No before/after for a pipeline change is a should-refactor.

---

## The noisy-recall failure mode

The signature symptom of over-weighted semantic recall: results that are conceptually adjacent but literally wrong - the query asked about `retryCount` and recall returned five rows about retries in general, none mentioning the identifier. Diagnosis:

- Precision is low while recall is fine (lots came back, little was right).
- Shifting weight toward lexical (0.3/0.7) or dropping to pure BM25 sharpens it.
- The corpus is identifier-dense (raw `sessions` dialogue) and the embedding blurred near-identical tokens.

The fix is usually a weighting change, sometimes a mode change - not "the embeddings are broken".

---

## State the posture in every eval

A precision/recall snapshot is only interpretable alongside the embeddings posture (`04-embeddings-integration.md`). A "low recall" number with embeddings off means lexical did not cover the paraphrases - that is expected, and the lever is turning embeddings on (a cost decision), not retuning weights. Always record: semantic on/off, which rows were embedded, which weighting.

---

## What to check on a recall-eval

1. **Is there a fixed, labeled query set?** Without it there is no measurement.
2. **Both numbers reported?** Precision alone hides misses; recall alone hides noise.
3. **Before AND after?** A single snapshot proves nothing about a change.
4. **Posture recorded?** Semantic on/off, weighting, embedded-row coverage.
5. **Per-query and aggregate?** An aggregate can hide a class of queries that regressed badly.
6. **Handed to quality-worker-bee** as audit evidence when the change ships.
