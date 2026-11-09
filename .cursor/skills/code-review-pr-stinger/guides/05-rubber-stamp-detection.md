# 05 - Rubber-Stamp Detection

Signals of rubber-stamp review culture, how to diagnose it from PR timelines, and a remediation playbook.

Sources: `research/external/2026-05-20-codepulsehq-toxic-culture-signs.md`, `research/external/2026-05-20-stackfyi-best-practices-guide.md`, `research/external/2026-05-20-octopus-mentorship-ai-loop.md`.

---

## What is rubber-stamp culture?

A rubber-stamp review is an approval without substantive engagement. The reviewer clicks "Approve" (or types "LGTM") without reading the diff meaningfully. Rubber-stamp culture is a team health indicator: it signals that reviewers feel unsafe leaving comments, that reviews are treated as a bureaucratic gate rather than a quality mechanism, or that the team has never established norms for what a "good review" looks like.

The 2026 impact: AI-assisted coding tools are generating more code faster. Without active rubber-stamp detection, the volume increase will make rubber-stamp approvals the path of least resistance.

---

## Diagnostic signals (single PR level)

Flag a PR review as a potential rubber-stamp when ANY of the following is observed:

| Signal | Threshold | Severity |
|---|---|---|
| Review time | < 5 minutes for a PR > 200 lines | High |
| Comment count | 0 comments, immediate approval | High (unless PR is truly trivial) |
| Comment content | "LGTM", "looks good", "👍", "ship it" with no substantive comment | Medium |
| Blocker-tier issues exist but no blocking comment was left | (Requires diff inspection) | High |
| Reviewer approved their own PR after a self-review | Not applicable in GitHub (blocked), but detectable in older systems | High |

---

## Diagnostic signals (repo culture level)

Run a culture audit across the last 30 PR timelines. Flag when:

| Metric | Warning threshold | Critical threshold |
|---|---|---|
| % of PRs with 0 reviewer comments | > 30% | > 50% |
| Median review time (minutes) | < 10 for PRs > 300 lines | < 5 for PRs > 300 lines |
| % of PRs approved by reviewer within 2 minutes of opening | > 20% | > 40% |
| Reviewer diversity (same reviewer pairs) | Same pair > 40% of PRs | Same pair > 60% of PRs |
| % of PRs merged without any review comment | > 25% | > 50% |

---

## Culture audit workflow (GitHub API method)

The Bee can pull PR timeline data when given GitHub API access:

```
1. List PRs merged in last 30 days: GET /repos/{owner}/{repo}/pulls?state=closed&per_page=100
2. For each PR, get the reviews: GET /repos/{owner}/{repo}/pulls/{pr_number}/reviews
3. For each PR, get the review comments: GET /repos/{owner}/{repo}/pulls/{pr_number}/comments
4. Compute metrics: review latency, comment count, comment depth, reviewer diversity
5. Emit a culture scorecard (see templates/culture-scorecard.md)
```

The output is a markdown report at `library/qa/code-review/<date>-pr-culture-audit.md`.

---

## Remediation playbook

### Step 1: Name the problem without blame

Do not identify individual rubber-stampers by name in public. Diagnose the system, not the individuals. Example team announcement:

> "We ran a code review health check on the last 30 PRs. We're seeing fewer review comments than we'd expect for our PR size distribution. This affects our ability to catch bugs and share knowledge. Let's talk about norms."

### Step 2: Establish the three-tier taxonomy team-wide

Run a 20-minute workshop. Give examples of `blocker:`, `suggestion:`, and `nit:` on a real recent PR (anonymize if needed). The goal is to give reviewers a shared vocabulary so that leaving a comment feels structured rather than confrontational.

### Step 3: Introduce the author checklist

If the PR description is unclear, reviewers default to approving rather than asking what the PR actually does. Adopt the six-element description structure (see `guides/01-pr-description.md`). Better descriptions produce more substantive reviews.

### Step 4: Model behavior from senior engineers

Rubber-stamp culture is contagious but so is thorough review culture. When senior engineers leave detailed, tiered, non-personal review comments, junior engineers learn both the vocabulary and the expectation. The review-as-mentorship lens (see `guides/06-comment-coaching.md`) makes detailed comments a teaching act rather than a gatekeeping act.

### Step 5: Track trends over time

Run the culture audit monthly. Celebrate improvement. The metric is not "zero rubber stamps" (some PRs are genuinely trivial); the metric is "we are trending toward more substantive reviews on non-trivial PRs."

---

## False positives

Not every fast approval is a rubber-stamp. Legitimate fast approvals:

- PR is < 30 lines and the change is obviously correct (e.g., config value update, dependency bump)
- The reviewer is the domain expert and already has full context from pairing on the feature
- The PR is a merge commit, changelog update, or documentation-only change

The Bee distinguishes rubber-stamps from legitimate fast approvals by checking PR size and content type against review time and comment count together.
