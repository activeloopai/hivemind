# 04 - Async-First Review Norms

How to structure code reviews for remote and hybrid teams where reviewers may be in different time zones. Covers the review-window pattern, SLA expectations, async comment hygiene, and the escalation path to a synchronous session.

Sources: `research/external/2026-05-20-propelcode-async-review-distributed.md`, `research/external/2026-05-20-viberails-remote-team-review.md`, `research/external/2026-05-20-stackfyi-best-practices-guide.md`.

---

## The async-first principle

Async-first does not mean async-only. It means the default mode is asynchronous, and synchronous sessions are reserved for situations where async genuinely fails. This discipline preserves deep-work time for both authors and reviewers.

**Async-first does NOT mean:**
- Waiting days before responding to a review
- Writing comments so terse that their intent is ambiguous
- Treating a PR as a formality rather than a communication event

**Async-first MEANS:**
- Every comment is self-contained - it does not require a follow-up question to understand
- The PR description is written for a reader who has zero context
- SLAs are explicit and team-agreed

---

## The review-window pattern

Remote teams in multiple time zones should agree on a "review window" - a time block when everyone is expected to be available for code review notifications. Reviews opened before the window should have a response within the window; reviews opened during or after should have a response by the next window.

**Typical patterns:**

| Team spread | Window duration | Typical SLA |
|---|---|---|
| Single time zone | Continuous | 2-4 hours for first response |
| 2 overlapping zones | 4-hour overlap | Same day |
| 3+ zones (follow-the-sun) | Rolling | 24 hours first response; 48 hours to approved/closed |

---

## Async comment hygiene

Every async comment should answer three questions:

1. **What is the issue?** (Describe the code concern, not the person)
2. **What tier is this?** (blocker / suggestion / nit / question - see `guides/00-principles.md`)
3. **What is the suggested fix?** (Or an explicit question if a fix is not obvious)

**Anti-pattern:**
> "This seems wrong."

**Async-compliant version:**
> `suggestion:` `getUserById` will return `null` for guest users and the call site doesn't handle that. Suggest adding a null guard here, or returning a guest user object from the function to make the interface consistent. See how we handled it in `auth.service.ts:line 42`.

The anti-pattern requires a follow-up exchange. The async-compliant version is self-contained and actionable without a call.

---

## Async resolution signals

Once a reviewer leaves comments, the author should:

1. **Reply to every comment** - not just act on it. Async reviewers cannot see which comments have been addressed unless the author explicitly confirms.
2. **Use the "resolved" / "outdated" flow correctly** - in GitHub, resolve only comments you have addressed. Do not mass-resolve to clear the inbox.
3. **Re-request review** when all blocker-tier comments are addressed - do not silently push new commits and expect reviewers to notice.

---

## The async-to-sync escalation path

Switch to a synchronous session when any of the following is true:

| Trigger | Escalation |
|---|---|
| 3+ rounds of comments on the same file/function without resolution | Schedule a 30-minute pair-review session |
| A comment is about a fundamental design decision (not implementation details) | Schedule an architecture discussion; do not resolve in PR comments |
| The author has been blocked for > 24 hours waiting for a review on a `blocker:` comment | Escalate to team lead for review assignment |
| The PR has been open > 5 business days without approval | Escalate to team lead |

---

## Review captain pattern (for teams of 10+)

Designate one team member per sprint as "review captain." The review captain:

- Monitors all open PRs
- Assigns reviewers when a PR has been open > X hours without engagement
- Escalates stuck reviews

This role is lightweight (30-60 minutes per week) and dramatically reduces the "open PRs gathering dust" problem. For smaller teams (< 10), use a simple rotation or a daily review reminder in the team channel.

---

## PR description for async readers

Async reviewers read the description before touching the diff. A description optimized for async review should:

- Front-load the motivation (the first paragraph is the most-read)
- Explicitly name the "What did NOT change" scope boundary (most-missed context in async reviews)
- Include a "Reviewer hints" section that tells the reviewer where to spend their limited attention

See `guides/01-pr-description.md` and `templates/pr-description.md` for the full six-element structure.
