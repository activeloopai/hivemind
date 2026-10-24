# Example 02, Blocker-Heavy Audit

Demonstrates an implementation with multiple Critical findings (plan gaps, an N+1 dataset read, a scope-filter leak) and several Warnings. Illustrates the report at its most impactful: dense, specific, and prioritized.

**Illustrates guides:** `03-cross-reference-audit.md` (thorough traceability), `04-five-axis-evaluation.md` (multiple axes failing), `05-severity-classification.md` (Critical vs. Warning judgment), `07-common-gaps.md` (scope filter, N+1, missing gate).

---

## Input, Plan document excerpt

Plan file: `library/requirements/features/feature-013-library-search/prd-feature-013-library-search.md`

```markdown
# PRD: Library Search (Phase 3)

## Goal
Let a user search the library corpus and get ranked results. Part of the retrieval rollout.

## User Stories
- US-1: As a user, I run `hivemind search "<query>"` and see ranked entries with title, path, and score.
- US-2: As a user, I open a result to view its full entry.
- US-3: As a user, results respect the public/private split of the library.
- US-4: As a user, when embeddings are disabled the search falls back to BM25 automatically and labels the result mode.

## Acceptance Criteria
- AC-1: Search is scoped to the requested library partition (public vs private); private entries never leak into a public search.
- AC-2: Only the pre-tool-use gate-approved query path reaches the dataset; raw queries are validated first.
- AC-3: Empty-result message shown when nothing matches.
- AC-4: Results are capped (20 per call, cursor-based).

## Non-Goals
- NG-1: No re-embedding of the corpus in this phase.
- NG-2: No changes to the embeddings daemon lifecycle.
```

## Input, Diff (summary)

```
A  src/search/search-command.ts
A  src/search/result-view.ts
A  src/search/format-result.ts
A  src/search/search-service.ts
A  src/embeddings/restart-daemon.ts        <- out-of-scope
M  src/dataset/schema.ts
```

Key excerpts (abridged):

**`src/search/search-service.ts`**
```ts
export async function search(query: string) {
  const hits = await dataset.query({ text: query });   // no partition filter, no limit
  return Promise.all(
    hits.map(async (h) => ({
      ...h,
      entry: await dataset.get(h.id),                   // one read per hit (N+1)
    }))
  );
}

export async function onEmbeddingsOff() {
  logger.warn("embeddings unavailable");
  // TODO: BM25 fallback
}
```

**`src/search/search-command.ts`**
```ts
export async function searchCommand(query: string) {
  const results = await search(query);
  for (const r of results) {
    process.stdout.write(formatResult(r) + "\n");
  }
}
```

**`src/search/result-view.ts`**, no partition/visibility check.

**`src/embeddings/restart-daemon.ts`**, 52 lines restarting the embeddings daemon, violating NG-2.

---

## Output, QA Report

Written to `library/requirements/features/feature-013-library-search/reports/2026-04-24-qa-report.md`.

```markdown
# QA Report: feature-013 Library Search

**Plan document:** `library/requirements/features/feature-013-library-search/prd-feature-013-library-search.md`
**Audit date:** 2026-04-24
**Base branch:** `main`
**Head:** `feat/library-search`
**Auditor:** quality-worker-bee

## Summary

The library-search implementation has three Critical blockers that must be addressed before merge: a partition-scoping gap that leaks private entries into public search (AC-1), a missing gate/validation on the query path (AC-2), and the BM25 fallback from US-4 is entirely absent. Four Warnings surfaced in addition, including an N+1 dataset read on the result path and an out-of-scope daemon-restart file that violates NG-2. The happy-path ranking works but the implementation is not ship-ready.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ❌ | US-4 BM25 fallback absent; AC-4 cursor capping not implemented |
| Correctness   | ❌ | Partition scoping missing, correctness of the public/private split compromised |
| Alignment     | ⚠️ | Out-of-scope daemon-restart file added (NG-2 violation) |
| Gaps          | ❌ | No gate/validation, no empty-result message, no error path on dataset read |
| Detrimental   | ⚠️ | N+1 dataset read on result path; no capping; dead TODO in fallback handler |

## Critical Issues (must fix)

- [ ] **Partition leak, search is not scoped to the requested public/private partition (AC-1)**, `src/search/search-service.ts:2`

  `dataset.query({ text: query })` searches every entry, public and private, not just the requested partition. This leaks private library entries into a public search. AC-1 explicitly requires the partition split to hold.

  Suggested: thread the requested partition into the service and filter: `dataset.query({ text: query, where: { visibility } })`. Add a compile-time guard so `search` requires a `visibility` arg.

  ```ts
  export async function search(query: string) {
    const hits = await dataset.query({ text: query });   // <- missing where: { visibility }
  ```

- [ ] **Missing gate and validation on the query path (AC-2)**, `src/search/result-view.ts:1-24`

  The result path reaches the dataset with the raw query string and never routes through the pre-tool-use gate or validates the input. A crafted query can reach the dataset unchecked.

  Suggested: validate the query with the shared `zod`/`valibot` schema and route the call through the gate before it reaches `dataset.query`.

- [ ] **US-4 BM25 fallback not implemented**, `src/search/search-service.ts:14-17`

  The `onEmbeddingsOff` handler logs and returns. No BM25 ranking runs, so search returns nothing when embeddings are disabled. This is a core plan requirement, not an edge case.

  Suggested: call the BM25 ranker over the library corpus and label the result mode `bm25-fallback`.

  ```ts
  export async function onEmbeddingsOff() {
    logger.warn("embeddings unavailable");
    // TODO: BM25 fallback   <- entire requirement lives in this TODO
  }
  ```

## Warnings (should fix)

- [ ] **N+1 dataset read on result path**, `src/search/search-service.ts:2-8`

  The result path runs one query for hits and then one `dataset.get` per hit. For 200 hits, this is 201 dataset reads.

  Suggested: replace the `Promise.all(...map)` pattern with a single batched read that returns the full entry inline.

- [ ] **Missing result capping (AC-4)**, `src/search/search-service.ts:2`

  `dataset.query` returns the full result set. AC-4 specifies 20 per call with a cursor.

  Suggested: accept `{ cursor, take: 20 }` args, return `{ items, nextCursor }`.

- [ ] **Out-of-scope daemon-restart flow (NG-2 violation)**, `src/embeddings/restart-daemon.ts:1-52`

  NG-2 explicitly excludes changes to the embeddings daemon lifecycle in this phase. A full 52-line daemon-restart implementation landed in this PR.

  Suggested: remove the file, or open a scope-amendment PRD with `library-worker-bee` if daemon changes are now desired for this phase.

- [ ] **Missing empty-result message (AC-3)**, `src/search/search-command.ts:1-7`

  AC-3 calls for an empty-result message when nothing matches. The current command prints nothing.

  Suggested: branch on `results.length === 0` and print a "No matches" message.

## Suggestions (consider improving)

- [ ] **Extract the embeddings-state handler to a thin adapter**, `src/search/search-service.ts:14-17`

  Once the fallback logic lands, the handler will carry non-trivial branching. Consider moving the embeddings-availability knowledge to a separate `embeddings-state.ts` adapter and keep `search-service.ts` ranking-agnostic.

## Plan Item Traceability

| #    | Plan Requirement                                    | Status | Implementation Location                              | Notes |
|------|-----------------------------------------------------|--------|-------------------------------------------------------|-------|
| US-1 | User runs search, sees ranked entries               | ⚠️ | `src/search/search-command.ts:1-7`                  | Renders, but with partition leak and N+1 |
| US-2 | User opens a result to view the entry               | ⚠️ | `src/search/result-view.ts:1-24`                   | Works, but no gate/validation |
| US-3 | Results respect public/private split                | ❌ | `src/search/search-service.ts:2`                   | No partition filter |
| US-4 | BM25 fallback when embeddings off                   | ❌ | `src/search/search-service.ts:14-17`               | TODO only, not implemented |
| AC-1 | Search scoped to requested partition                | ❌ | `src/search/search-service.ts:2`                   | No partition filter |
| AC-2 | Query path gated and validated                      | ❌ | `src/search/result-view.ts`                        | No gate, no validation |
| AC-3 | Empty-result message                                | ❌ | `src/search/search-command.ts`                     | Prints nothing |
| AC-4 | Capping (20/call, cursor-based)                     | ❌ | `src/search/search-service.ts:2`                   | No capping |
| NG-1 | No re-embedding of the corpus                       | ✅ |,                                                    | Honored |
| NG-2 | No embeddings daemon lifecycle changes              | ❌ | `src/embeddings/restart-daemon.ts:1-52`            | Violated, 52-line daemon restart added |

## Files Changed

- `src/search/result-view.ts` (A), result detail view; missing gate/validation (AC-2 gap)
- `src/search/format-result.ts` (A), result formatter; US-1 ✅
- `src/search/search-command.ts` (A), CLI command; empty-result message absent, partition leak inherited from service
- `src/embeddings/restart-daemon.ts` (A), out-of-scope daemon restart (NG-2 violation)
- `src/search/search-service.ts` (A), central service; three Critical issues and one Warning live here
- `src/dataset/schema.ts` (M), adds the search index tensor to the Deep Lake schema
```

---

## Why the audit looks this way

- **Three Criticals, four Warnings.** Each Critical matches a bullet in the `05-severity-classification.md` decision tree (plan requirement missing, data-correctness risk, plan requirement absent). Each Warning is "should fix", non-hot-path N+1, scope creep, implied gap.
- **Partition leak is Critical, not Warning**, per `07-common-gaps.md`, a scope-filter violation that mixes private and public data is always Critical.
- **Daemon restart is Warning, not Critical.** The code itself works; it just violates a non-goal. If the restart code were broken, severity would escalate.
- **The report names each axis even though three have failed**, no silent passes (`00-principles.md`).
- **Traceability table includes both NG rows.** One is Pass, one is Fail, so scope auditing is visible.
