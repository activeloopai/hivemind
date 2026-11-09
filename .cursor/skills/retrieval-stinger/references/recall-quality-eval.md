# Recall Quality Evaluation - the method

Reference for how recall changes are measured. The discipline is in `guides/10-recall-quality-eval.md`; this note is the definitions and the procedure.

## The two metrics

- **Precision** = (relevant rows returned) / (total rows returned). Measures noise. Low precision = recall dragged in junk.
- **Recall** = (relevant rows returned) / (total relevant rows in corpus). Measures misses. Low recall = recall left the right rows behind.

They trade off. More semantic weight usually lifts recall and risks precision; more lexical weight does the reverse.

## The procedure

1. **Fixed query set.** A representative, labeled set of real queries against a known corpus. For each query, mark which rows are relevant. The set must stay constant across runs.
2. **Before snapshot.** Run the set through current recall; record per-query and aggregate precision/recall.
3. **Change.** Weighting shift, pipeline edit, fast-path change, or embeddings flip.
4. **After snapshot.** Re-run the identical set.
5. **Compare.** Confirm the intended metric moved and check what regressed.

## Posture is part of the result

Every snapshot records: semantic on/off, the weighting (w1/w2), and which rows in the corpus are actually embedded. A "low recall" number with embeddings off is expected lexical behavior, not a tuning failure - the lever there is the embeddings flip, not the weights.

## The noisy-recall signature

Low precision with healthy recall, on an identifier-dense corpus = semantic over-weighted. Lots returned, little right. Shift toward lexical (0.3/0.7) or pure BM25.

## Output

A per-query and aggregate table, before vs after, with the posture stamped on it. This is the audit evidence handed to quality-worker-bee when a recall change ships. "Feels better" is not an entry in the table.
