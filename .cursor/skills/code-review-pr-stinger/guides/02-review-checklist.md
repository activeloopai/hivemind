# 02 - Review Checklist: Context-Specific Generation

How to generate a review checklist scoped to the file types and concerns in a specific diff. Covers the canonical review phases, the priority ordering, and the difference between a logic checklist and a performance checklist.

Sources: `research/external/2026-05-20-pandev-checklist-11-rules.md`, `research/external/2026-05-20-pillaiinfotech-comment-taxonomy.md`, `research/external/2026-05-20-stackfyi-best-practices-guide.md`, `research/external/2026-05-20-ardura-implementation-guide.md`.

Template: `templates/review-checklist.md`
Example: `examples/happy-path-pr-review.md`

---

## The three review phases

A review checklist has three parts corresponding to the three phases of the PR lifecycle:

### Phase 1: Author checklist (before opening the PR)
The author's self-check. Reduces trivial reviewer feedback.

- [ ] Description has all six elements (see `guides/01-pr-description.md`)
- [ ] PR is under 400 changed lines (see `guides/03-small-prs.md`)
- [ ] PR has a single logical concern (no mixed-scope changes)
- [ ] All tests pass in CI
- [ ] Self-reviewed the diff: no debug artifacts, no console.log, no TODO without a tracking issue
- [ ] Added/updated tests for new logic branches

### Phase 2: Reviewer checklist (during review)
Ordered by priority: correctness first, design second, performance third, style last.

**Correctness:**
- [ ] Does the code do what the PR description says it does?
- [ ] Are all edge cases handled? (null, empty, overflow, timeout, auth failure)
- [ ] Are there race conditions or state mutations without proper locking?
- [ ] Are error paths handled explicitly? No silent failures.

**Design:**
- [ ] Does the change follow the existing architectural patterns in this codebase?
- [ ] Is the public API surface (function signatures, exports, REST endpoints) intentional and documented?
- [ ] Is there duplication that should be extracted?
- [ ] Does the change respect the single responsibility principle at the module level?

**Performance (flag if applicable):**
- [ ] Are there N+1 query patterns? (ORM lookups inside loops)
- [ ] Are there unbounded loops over collections that could be large in production?
- [ ] Are there blocking I/O calls on a hot path?
- [ ] Is caching appropriate here? (Is this path read-heavy? Is the data stable enough?)

**Security (surface to security-worker-bee if found):**
- [ ] Are user inputs validated and sanitized before use?
- [ ] Are secrets/credentials managed via env vars or secret stores, not hardcoded?
- [ ] Is PII handled appropriately? (Not logged, not over-exposed in API responses)

**Style and readability (nit-tier):**
- [ ] Are variable and function names self-documenting?
- [ ] Are there comments that explain the "why" (not just the "what") for non-obvious logic?
- [ ] Is the diff consistent with the surrounding code style?

### Phase 3: Team process checklist (when merging)
- [ ] All `blocker:` comments addressed or escalated
- [ ] At least one reviewer other than the author has approved
- [ ] CI passes
- [ ] Merge strategy is appropriate (squash for features, merge for long-lived branches)

---

## Generating a context-specific checklist

When the Bee generates a checklist for a specific PR, it should scope the checklist to the file types and concerns visible in the diff:

| File type | Checklist emphasis |
|---|---|
| TypeScript / Node (ESM) | Strict types (no stray `any`), explicit `.js` import extensions, no top-level await in CJS interop |
| Deep Lake dataset code | Tensor schema/commit correctness, recall query filters, embedding dimension match |
| Harness integration code | Adapter contract honored, transcript parsing edge cases, idempotent writes |
| MCP tool / protocol code | Tool schema matches `mcp-tool-docs`, error envelope shape, no unbounded payloads |
| Config / env | No secrets hardcoded, env var names documented |
| Tests (Vitest) | Coverage of new branches, no implementation-coupled assertions |

The full three-phase checklist is always the baseline. Context-specific items are appended under each relevant section.

---

## Priority ordering (reviewer focus)

When a reviewer has limited time, the canonical priority order (from Google Engineering Practices) is:

1. **Correctness** -- Does the code work as intended?
2. **Design** -- Does the architecture fit the system?
3. **Performance** -- Is it fast enough for production?
4. **Naming** -- Are identifiers communicative?
5. **Comments / docs** -- Is the "why" documented?
6. **Style** -- Does it match surrounding code?

Source: `research/external/2026-05-20-google-eng-practices-standard.md`. Never let style block correctness feedback -- prioritize accordingly.

---

## The "author merges, not reviewer" rule

The reviewer's job is to advise, not to merge. Once all `blocker:` comments are addressed, the author merges. If the reviewer merges for the author, it removes the author's accountability for the final state of the PR. Source: `research/external/2026-05-20-pandev-checklist-11-rules.md`.
