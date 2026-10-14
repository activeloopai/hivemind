# 06 - Comment Coaching

How to rewrite vague, aggressive, or ambiguous review comments into the three-tier framing (blocker / suggestion / nit) with a rationale. Covers the "question not demand" heuristic, tone calibration, and worked rewrites.

Sources: `research/external/2026-05-20-google-eng-practices-comments.md`, `research/external/2026-05-20-pillaiinfotech-comment-taxonomy.md`, `research/external/2026-05-20-ardura-implementation-guide.md`, `research/external/2026-05-20-octopus-mentorship-ai-loop.md`.

---

## Why comment coaching matters

A review comment is a communication act between two engineers. When the comment is vague ("this is wrong"), aggressive ("why would you do this?"), or untierced ("fix this"), the author spends cognitive load guessing the reviewer's intent instead of fixing the code. Comment coaching transforms that communication friction into clarity without losing the technical substance.

The review-as-mentorship lens changes the frame: every comment is an opportunity for both the reviewer and the author to become better engineers. A well-written comment teaches; a poorly-written comment defends.

---

## The three-step coaching process

When coaching a review comment, apply these three steps:

### Step 1: Identify the tier

Classify the original comment as `blocker:`, `suggestion:`, or `nit:` based on its intent. If the original comment is ambiguous, default to the tier the reviewer most likely intended (ask if genuinely unclear).

**Decision rule:** Would this issue cause a bug, security hole, or design regression if merged unaddressed? → `blocker:`. Would it improve the code but is not a merge gate? → `suggestion:`. Is it cosmetic? → `nit:`.

### Step 2: Separate the code from the person

Rewrite all person-directed language ("you wrote", "why did you", "you should") to code-directed language ("this function", "this pattern", "the approach here").

### Step 3: Add the "what" and the "why"

A complete comment names (a) what the issue is, (b) what tier it is, and (c) why it matters or what a fix looks like. All three elements must be present.

---

## Worked rewrites

### Vague comment
**Before:** "This seems wrong."
**After:** `suggestion:` `validateEmail` accepts any string without checking for the `@` symbol. In production, a malformed email will reach the database layer and cause a unique-constraint error rather than a user-friendly validation message. Suggest adding `if (!email.includes('@')) return { valid: false, error: 'Invalid email format' }` before the database write.

---

### Aggressive comment
**Before:** "Why would you use a raw SQL query here? That's dangerous."
**After:** `blocker:` This Deep Lake SQL string concatenates `userId` directly into the query, which creates a SQL injection vector if `userId` ever comes from recalled memory or tool input. Suggest routing the value through the repo's SQL guards: `sqlStr(userId)` (or `sqlIdent` / `sqlLike` as appropriate) before interpolation. See `typescript-node-worker-bee` for the SQL-guarding pattern.

---

### Ambiguous tier comment
**Before:** "Consider using a constant for this magic number."
**After:** `nit:` The `432000` in `session_ttl = 432000` is not self-documenting. Suggest extracting to `SESSION_TTL_SECONDS = 60 * 60 * 24 * 5` (5 days) for readability. Not a merge gate - happy to leave this for a follow-up if it's out of scope.

---

### Demand rewritten as question
**Before:** "You need to add error handling here."
**After:** `blocker:` If `fetchUserProfile` rejects (e.g., network timeout), the unhandled promise rejection will crash the handler. Have you considered adding a try/catch here, or would a `Promise.allSettled` pattern fit better given the surrounding code? Either works - flagging because this is a merge gate.

---

### Praise comment (reinforcing good patterns)
**Before:** (no comment at all on a good decision)
**After:** `praise:` Good call wrapping the Stripe client in a singleton. This pattern avoids connection pool exhaustion under load and is consistent with how we handle the DB client. Worth documenting in the architecture guide if it isn't already.

---

## The "question not demand" heuristic

When in doubt, frame the comment as a question. "Have you considered X?" is less defensive than "You should do X." Both surface the same concern, but the question form:

- Acknowledges that the author may have considered and rejected the suggestion
- Invites dialogue rather than compliance
- Reduces the emotional cost of receiving the comment

Apply this heuristic for `suggestion:` and `nit:` tier comments. For `blocker:` comments, be direct - the merge is at stake and clarity matters more than softness.

---

## When NOT to soften a blocker

A `blocker:` comment should be direct. Over-softening a blocker creates ambiguity about whether the author must act before merging.

**Too soft (creates ambiguity):**
> `blocker:` Maybe we should think about adding auth here? Just a thought.

**Appropriately direct:**
> `blocker:` This endpoint does not check for authentication. Any unauthenticated caller can access user data. Auth middleware must be added before this merges. See how `api/users.ts` handles it.

The goal is directness without aggression. The issue is the code, not the developer.
