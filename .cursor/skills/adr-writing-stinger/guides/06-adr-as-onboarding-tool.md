# ADR Log as an Onboarding Tool

The ADR log is the engineering team's institutional memory in its most navigable form. For a new engineer, reading the ADR log chronologically answers the question "how did this codebase get to be the way it is?" in a way that code and wikis cannot.

---

## The three value categories for onboarding

### 1. Decision archaeology

New engineers inevitably ask: "Why do we use X instead of Y?" Without an ADR log, the answer is "because that's how it was when I joined", or a painful historical reconstruction from git blame and Slack search.

With an ADR log, the answer is: "See ADR-0012, we considered Y but rejected it because of Z."

The Alternatives Considered section is especially valuable here. It prevents experienced engineers from relitigating decisions and gives new engineers the evidence they need to propose a reversal only when circumstances have genuinely changed.

### 2. Change attribution

ADRs are linked from commit messages and PR descriptions:

```
feat(harness): add string-based pre-tool-use gate (ADR-0031)
```

When a new engineer reads a commit that changed the harness dispatch path, the ADR reference takes them directly to the decision record with full context, rationale, and trade-offs.

### 3. Architecture overview

The ADR log, sorted by topic area, gives a new engineer a map of the major architectural choices. It is not a complete architecture document, but it covers the decisions that deviated from defaults and therefore require explanation.

---

## Linking ADRs from code

### Code comments

```typescript
// Using optimistic locking here per ADR-0019 (concurrent update safety)
// See docs/decisions/0019-optimistic-locking-for-concurrent-updates.md
```

### Commit messages

```
refactor(db): adopt expand-contract migration pattern (ADR-0024)
```

### PR description template

Add to your `.github/pull_request_template.md`:

```markdown
## Related ADRs
<!-- List any ADRs this PR implements, supersedes, or relates to -->
- ADR-NNNN: <title>
```

---

## Structuring the ADR log for readability

### Sequential numbering is required but topic grouping helps

Log4brains allows filtering and categorization. For manual browsing, add an `adr-log.md` index grouped by topic:

```markdown
# ADR Log

## Retrieval & Data Layer
- [0012 - Fall back to BM25 when embeddings off](docs/decisions/0012-bm25-fallback.md), Accepted
- [0022 - Append-only version-bump for embedding rows](docs/decisions/0022-append-only-version-bump.md), Accepted

## Harness Safety
- [0015 - Self-policing tool safety per bee](docs/decisions/0015-self-policing-tool-safety.md), Accepted
- [0031 - String-based pre-tool-use gate](docs/decisions/0031-string-based-pre-tool-use-gate.md), Accepted, Supersedes 0015

## Release
- [0008 - npm publish flow for @deeplake/hivemind](docs/decisions/0008-npm-publish-flow.md), Accepted
```

---

## Onboarding reading order

In the onboarding guide, point new engineers to the ADR log with this framing:

> "Read the ADR log in chronological order for the first 30 minutes. Pay special attention to ADRs marked `Superseded`, they show you where we changed direction and why. After that, use the topic index to find decisions related to the area you'll be working in first."

For teams using Log4brains, the HTML interface provides filtering by status, date, and package, direct new engineers to the rendered site.

---

## What makes an ADR log a good onboarding artifact

| Quality | Indicator |
|---|---|
| Complete | Major architectural choices are recorded; the log doesn't have mysterious gaps |
| Honest | Consequences sections include negatives; Alternatives Considered sections are substantive |
| Current | Recent decisions are recorded; the log didn't stop in 2023 |
| Linked | Key ADRs are cited in commit messages and PR descriptions |
| Indexed | A topic-grouped index or Log4brains UI makes it navigable |
