# Guide 07 - ADR Detection From Commit Messages

Phase 5 of the six phases (per [`guides/03-the-six-phases.md`](03-the-six-phases.md)) scans commit messages in `git_context.recent_commits` for decision-encoding patterns and files high-confidence matches as ADR pages in `library/knowledge/private/architecture/` (schema-v2 convention: `ADR-<n>-<slug>.md`).

The catalog below is the single authority. NEVER fabricate a decision the commit message does not actually express.

## The two-tier classifier

### Tier 1 - high confidence (file as ADR)

A commit qualifies for Tier 1 if it matches AT LEAST ONE of:

- **Footer:** `^BREAKING CHANGE:` (case-insensitive).
- **Subject marker:** `!:` immediately after the type - `feat!:`, `refactor!:`, `chore!:`. Per the Conventional Commits spec, this is equivalent to a `BREAKING CHANGE` footer.
- **Body keyword (case-insensitive regex on its own line):**
  - `\bdecision:\s+`
  - `\brationale:\s+`
  - `\brfc[\s-]?\d+`
  - `\badr[\s-]?\d+`
- **Subject switch-verb patterns (case-insensitive):**
  - `\b(switch(?:ing|ed)?\s+from)\s+(.+?)\s+to\s+(.+)`
  - `\b(replace(?:s|d)?)\s+(.+?)\s+with\s+(.+)`
  - `\b(migrate(?:s|d)?\s+from)\s+(.+?)\s+to\s+(.+)`
  - `\b(deprecate(?:s|d)?)\s+(.+)`
  - `\b(adopt(?:s|ing|ed)?)\s+(.+)`

Multiple Tier-1 hits are extra confidence. ANY hit qualifies.

**Action:** copy [`templates/decision.md`](../templates/decision.md), fill the Nygard 5-section structure (Status / Context / Decision / Consequences plus Sources), and write to `library/knowledge/private/architecture/ADR-<n>-<slug>.md` where `<n>` is `<pending>` (the graph driver allocates the next number atomically in the post-pass). Use a temp slug filename like `library/knowledge/private/architecture/ADR-pending-<commit_sha-short>-<slug>.md`; the driver renames after allocation.

### Tier 2 - low confidence (file as `questions/` for human confirmation)

A commit qualifies for Tier 2 if it matches AT LEAST ONE of:

- Subject is `refactor:` or `chore:` AND body is multi-paragraph (>200 chars).
- Subject contains `rewrite | redesign | rearchitect` but NO Tier-1 verb pattern.
- Body contains a tradeoff phrase (`instead of | rather than | we considered`) AND the body is structured (numbered list of options or a `Considered:` header) - unstructured tradeoff prose alone is too noisy.

**Action:** copy [`templates/question.md`](../templates/question.md), frame the question as "Did commit `{sha}` encode an architectural decision worth filing as an ADR?", and write to the knowledge area's `questions/<short-question>.md`. The human decides during a later review whether to promote to an ADR.

### Filter - ignore (do NOT treat as ADR signals)

- `docs:` / `style:` / `test:` / `chore: bump deps` / dependabot-authored commits.
- Single-line commits with no body (insufficient evidence).
- Commits with `Revert "..."` subject - these update the prior ADR's `status` to `superseded` instead of filing a new one (see Supersession protocol below).

## ADR shape (Nygard format)

Per [`templates/decision.md`](../templates/decision.md), filed as:

```markdown
---
type: decision
status: accepted
adr_number: <pending>
decision_date: 2026-04-29
deciders: []
commit_sha: abc123
supersedes: []
superseded_by: ""
related: []
tags: [adr, decision]
---

# ADR <n>: Switch graph extraction to tree-sitter

## Status
Accepted - 2026-04-29

## Context
[Forces in tension, value-neutral. Cite the commit's body.]

## Decision
We will [active voice]. [Cite the commit's subject and key body lines.]

## Consequences
- **Positive:** [from commit body or implied from diff]
- **Negative:** [from commit body or implied from diff]
- **Affected entities:** [[entities/...]], [[entities/...]]

## Sources
- Commit `abc123` by alice on 2026-04-15
- Message: "graph: switch extraction from ts-morph to tree-sitter"
- Body: > [verbatim quote of commit body if present]
```

The `<n>` placeholder is filled by the graph driver in the post-pass for parallel-safe ADR allocation. wiki-worker-bee writes `adr_number: <pending>` and uses a temp slug filename until the driver renames.

## Supersession protocol

When a `Revert "X"` commit is detected:

1. Find the ADR whose `commit_sha` matches the reverted commit. If found:
   - Update its `status` to `superseded`.
   - Set its `superseded_by` to a wikilink referring to the revert (which itself becomes a new ADR if it qualifies for Tier 1, OR a `questions/` page if Tier 2).
2. If no matching ADR exists, the revert is informational only - file as a Tier 2 question to surface for human review.

When a Tier-1 commit explicitly mentions superseding ("supersedes ADR-0042", "replaces decision in commit X"):

1. The new ADR's `supersedes:` includes the prior ADR wikilink.
2. The prior ADR's `superseded_by:` is updated to the new ADR wikilink.
3. The prior ADR's `status` flips to `superseded`.

This is a Phase 6 operation (it's a contradiction in the ADR graph) - apply the contradiction protocol per [`guides/06-contradiction-protocol.md`](06-contradiction-protocol.md).

## Output to the response payload

Every Tier-1 ADR filed shows up in `decisions_filed:` in the response payload (per [`guides/10-response-payload.md`](10-response-payload.md)). Every Tier-2 question filed shows up in `pages_created:` under `questions/`. The driver consumes both for index updates and for sidebar surfacing.

## Why not allocate ADR numbers in the agent

Parallel ingestion: multiple wiki-worker-bee invocations may run concurrently against different chunks. If each agent allocated its own ADR number, two agents could pick `7` simultaneously. The graph driver runs serially in the post-pass and atomically allocates next-numbers without collisions - this is the locked architecture.

## Source

- Tier classification: `research/2026-04-29-conventional-commits-decisions.md` (BREAKING CHANGE footer rule, switch-verb regex set).
- ADR shape: `research/2026-04-29-adr-format.md` (Nygard 5-section template), aligned to the schema-v2 `library/knowledge/private/architecture/ADR-<n>-<slug>.md` convention.
- Numbering scheme: serial driver-side allocation in the snapshot post-pass.
