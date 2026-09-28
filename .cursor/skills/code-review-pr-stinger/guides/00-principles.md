# 00 - Principles: Code Review as Culture

The three axioms, the three-tier comment taxonomy, the six-element description structure, and the scope boundaries that make `code-review-pr-worker-bee` useful and safe.

Sources: `research/external/2026-05-20-google-eng-practices-standard.md`, `research/external/2026-05-20-stackfyi-best-practices-guide.md`, `research/external/2026-05-20-octopus-mentorship-ai-loop.md`, `research/external/2026-05-20-codepulsehq-toxic-culture-signs.md`.

---

## The three axioms

### Axiom 1: Small PRs are a forcing function for good design

A large PR is almost always a symptom of a design problem, not just a review problem. When an engineer commits to working in small, reviewable increments, they are forced to think in composable units. The 400-line threshold is not arbitrary: DORA 2025 data shows 75%+ defect detection for PRs of 200-400 lines versus 31% for PRs over 1,000 lines. In 2025, AI-assisted coding increased the volume of code by 40-60% per engineer, and the 2025 DORA Report found this caused a 91% increase in code review time -- making small PRs more urgent, not less. See `guides/03-small-prs.md`.

### Axiom 2: A PR description is a first-class communication artifact

A reviewer should never need to schedule a call to understand what a PR does and why. The PR description is the asynchronous brief. A description that explains motivation, context, what changed, what did NOT change, testing proof, and reviewer hints gives reviewers the context to do their job without interrupting the author. Companies that adopt PR description standards report 30-50% faster time-to-merge. See `guides/01-pr-description.md`.

### Axiom 3: Review comments have tiers; ambiguous comments erode trust

A comment that does not state its tier forces the author to guess whether it must be fixed before merge or can be addressed in a follow-up. Ambiguous comments are the primary driver of review friction and rework. The canonical three-tier taxonomy (blocker / suggestion / nit) with two optional sub-tiers (question / praise) creates shared vocabulary that makes every comment actionable. See `guides/06-comment-coaching.md`.

---

## The three-tier comment taxonomy (canonical)

| Tier | Prefix | Meaning | Author action |
|---|---|---|---|
| 1 | `blocker:` | Must fix before merge. Correctness, security, design invariant, or contract violated. | Mandatory |
| 2 | `suggestion:` | Worth doing, but not a merge gate. Better design, improved readability. | Author's call |
| 3 | `nit:` | Cosmetic. Style, naming, formatting. Low stakes. | Optional |
| + | `question:` | Seeks understanding. No change implied. | Answer only |
| + | `praise:` | Names something done well. Reinforces good patterns. | No action needed |

**Decision rule:** If you would block the merge over this, it is a `blocker:`. If you would let it merge but think it should be addressed, it is a `suggestion:`. Everything else is a `nit:` or `question:`.

Source: `research/external/2026-05-20-google-eng-practices-comments.md` (Nit: origin), `research/external/2026-05-20-pillaiinfotech-comment-taxonomy.md` (emoji variant), `research/external/2026-05-20-ardura-implementation-guide.md` (ARDURA taxonomy), `research/external/2026-05-20-pandev-checklist-11-rules.md` (must-fix / should-fix / nit mapping).

---

## The six-element PR description structure

Every PR description the Bee produces contains exactly these six elements. See `guides/01-pr-description.md` for the full authoring guide.

1. **Motivation** -- Why does this PR exist? What problem does it solve?
2. **Context** -- What background does the reviewer need?
3. **What changed** -- Human-readable summary of the diff.
4. **What did NOT change** -- Explicit scope boundary. Names what was intentionally excluded.
5. **Testing proof** -- How was this validated?
6. **Reviewer hints** -- Where to focus; what to probe.

---

## Scope boundaries

**This Bee owns:** PR descriptions, review checklists, review comment quality, PR size evaluation, async review norms, rubber-stamp detection, review culture metrics.

**Handoff triggers:**

| Request | Route to |
|---|---|
| Security vulnerabilities found in the diff | `security-worker-bee` |
| Logic correctness issues in TypeScript/Node code | `typescript-node-worker-bee` |
| Deep Lake dataset schema or recall query issues | `deeplake-dataset-worker-bee` |
| CI pipeline design or CI failure investigation | `ci-release-worker-bee` |
| Branch protection rules, CODEOWNERS, PR template enforcement | `github-repo-health-worker-bee` |

---

## The review-as-mentorship lens

The highest-leverage code review is one where both the reviewer and the author learn something. Source: `research/external/2026-05-20-octopus-mentorship-ai-loop.md`.

**Reviewer heuristics:**
- Comment about code, not the developer. "This function has O(n²) complexity" not "You wrote an O(n²) function."
- Ask questions instead of making demands. "Have you considered caching here?" instead of "You need to cache this."
- Name good decisions explicitly (`praise:` tier). Positive reinforcement shapes culture faster than criticism alone.
- Teach the "why". A `suggestion:` comment with a link to an ADR or doc is worth 10x more than the same comment without context.

**Anti-patterns to flag:**
- One-word approvals ("LGTM", "looks good") on PRs with no other comments.
- Rapid approvals (< 5 minutes for a 300+ line PR).
- The same reviewer always approving the same author with no meaningful comments.
- Comments framed as personal attacks rather than code observations.

See `guides/05-rubber-stamp-detection.md` for detection methodology.
