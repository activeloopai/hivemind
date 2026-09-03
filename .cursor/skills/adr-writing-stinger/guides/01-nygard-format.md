# Nygard ADR Format

The Nygard format is the canonical ADR template, introduced by Michael Nygard in 2011. It answers four questions every engineer will eventually ask about a past architectural choice: What was the situation? What was decided? What were the trade-offs accepted? What alternatives were rejected?

---

## Template anatomy

```markdown
# NNNN. <Title>

Date: YYYY-MM-DD

## Status

<Proposed | Accepted | Superseded by ADR-NNNN | Deprecated | Rejected>

## Context

<The forces at play: technical constraints, team size, time pressure, adjacent systems, 
regulatory requirements. Write this as "here is the situation we were in", not as 
justification for the decision. A reader who disagrees with the decision should still 
recognize this as an accurate description of the context.>

## Decision

<The concrete choice made. Active voice, past tense. "We decided to fall back to BM25 
when embeddings are disabled." Not "BM25 should be used." Not "we plan to use." 
The decision is closed.>

## Consequences

<The trade-offs accepted, positive, negative, and neutral. Be honest about the negatives; 
they are the most valuable part of this section. A future engineer considering a change 
needs to know what was given up, not just what was gained.>

## Alternatives Considered

<Each alternative that was seriously evaluated, with a brief explanation of why it was 
rejected. This section prevents "why didn't we just use X?" conversations six months later.>

### Alternative: <Name>

<Two to four sentences on what it offers and why it was not chosen.>
```

---

## Worked example: retrieval fallback strategy

```markdown
# 0012. Fall back to BM25 when embeddings are disabled

Date: 2025-11-03

## Status

Accepted

## Context

Hivemind retrieval normally ranks library entries by embedding similarity against the
Deep Lake dataset. But embeddings are optional: a user can run with the embeddings daemon
off (no API key, offline, or cost-conscious), and a cold repo has no vectors yet. We need
retrieval to still return useful results in those states rather than returning nothing.
The library corpus is markdown, so a lexical ranker is viable without any model.

## Decision

We decided that `retrieval-worker-bee` falls back to a BM25 lexical ranker over the library
corpus whenever embeddings are unavailable (daemon off, missing vectors, or an embeddings
error). When embeddings are present, dense similarity is primary and BM25 is a secondary
re-rank signal. The fallback is automatic and logged, not a user-facing mode switch.

## Consequences

**Positive:**
- Retrieval works offline and with zero API cost; the daemon is a performance upgrade, not a hard dependency.
- A cold repo returns sensible results on day one before the embeddings backfill runs.
- BM25 needs no model, no GPU, and no network; it is trivial to test in Vitest.

**Negative:**
- BM25 quality is lower than dense retrieval for paraphrased queries; users on the fallback path get coarser ranking.
- Two ranking code paths must both be maintained and kept consistent in their result shape.

**Neutral:**
- The Deep Lake dataset schema is unchanged; BM25 reads the same markdown the embedder consumes.

## Alternatives Considered

### Alternative: hard-require embeddings

Refusing to return results when embeddings are off is simpler (one code path). Rejected
because it makes the embeddings daemon a hard dependency and breaks the offline and
cold-start cases, which are common in local Cursor usage.

### Alternative: cache the last dense results and serve stale

Serving the last successful dense ranking when the daemon is down avoids a second ranker.
Rejected because a cold repo has no cache, and stale rankings silently misrepresent a
corpus that has since changed.
```

---

## Filing conventions

- **Filename:** `NNNN-<kebab-case-title>.md`, always zero-padded to 4 digits.
  - Example: `0012-bm25-fallback-when-embeddings-off.md`
- **Directory:** `docs/decisions/` or `docs/adr/` (respect existing project convention).
- **Numbering:** scan the directory, take `max(existing numbers) + 1`. Never gap-fill.

---

## Common mistakes

| Mistake | Correction |
|---|---|
| Decision written in future tense ("we will use...") | Write past tense; the decision is closed |
| Missing Alternatives Considered | Always include; future engineers will rediscover the same options |
| Consequences section lists only positives | Include the negatives honestly; this is where ADRs earn their keep |
| Generic title ("Retrieval decision") | Specific title ("Fall back to BM25 when embeddings are disabled") |
| Status left blank | Always set one of the five statuses |
