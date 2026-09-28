# Example: Happy Path PR Review

A worked end-to-end example of `code-review-pr-worker-bee` handling a well-scoped PR: description audit, checklist generation, and comment coaching.

---

## Scenario

**PR title:** `feat: validate email in the digest-notification config loader`
**Author:** Alex Chen
**Reviewer request:** "Audit this PR description and generate a review checklist. Also coach one of the reviewer's comments."

**Existing PR description:**
```
Added email validation. Fixed a bug.
```

**Diff overview:**
- `src/config/loadNotificationConfig.ts` - 45 lines changed (adds `validateEmail` call when parsing the config)
- `src/utils/validation.ts` - 20 lines changed (adds email regex utility)
- `src/utils/validation.test.ts` - 60 lines changed (adds Vitest cases for valid/invalid emails)

**Reviewer comment to coach:**
> "This regex is way too simple. You'll need something better."

---

## Step 1: Description audit

| Element | Status | Notes |
|---|---|---|
| Motivation | ❌ Missing | "Added email validation" - no problem statement |
| Context | ❌ Missing | No issue link, no prior PR reference |
| What changed | ❌ Partial | "Added email validation" - not per-file |
| What did NOT change | ❌ Missing | No scope boundary |
| Testing proof | ❌ Missing | No CI link, no test run evidence |
| Reviewer hints | ❌ Missing | None |

**Audit result:** 0/6 elements present. Description needs full rewrite.

---

## Step 2: Rewritten PR description

```markdown
## Motivation

The digest-notification config loader currently accepts any string in the
`email` field. Malformed addresses propagate downstream and fail later with a
cryptic SMTP error instead of a clear config-validation message at load time.
Fixes #214.

## Context

- Closes: #214 (Operators seeing cryptic SMTP error from a malformed config email)
- No prior PR dependency

## What changed

- `src/config/loadNotificationConfig.ts`: Added `validateEmail` call during parse.
  Throws a typed config error early if the email is invalid.
- `src/utils/validation.ts`: Added `validateEmail(email: string): boolean` utility
  using RFC-5321-compatible regex (see code comment for source).
- `src/utils/validation.test.ts`: Added 8 Vitest cases covering valid emails,
  missing @, missing TLD, and empty string.

## What did NOT change

- SMTP transport logic is unchanged (separate ticket: #218)
- Existing persisted configs with malformed emails are not rewritten
  (no migration; this validates on load only)

## Testing proof

- [x] All 8 new test cases pass locally (`npx vitest run validation`)
- [x] CI passes: [link to CI run]
- [x] Manual test: loaded configs with `notanemail`, `@nodomain`, and valid
  `ops@example.com` - correct behavior in all three cases

## Reviewer hints

- Key logic is in `src/config/loadNotificationConfig.ts` lines 42-58
- `src/utils/validation.ts` is a simple utility - can skim
- Open question: should we also validate at send time, or is load-time
  validation sufficient given the loader is the only entry point?
```

---

## Step 3: Review checklist (scoped to this PR)

**Phase 1: Author checklist** - ✅ all items met after description rewrite.

**Phase 2: Reviewer checklist (context-scoped)**

### Correctness
- [ ] Does `validateEmail` correctly reject the edge cases named in the tests?
- [ ] What happens when the field is absent vs an empty string? (Both covered?)
- [ ] Is the thrown config error typed and does it name the offending field?

### TypeScript / Node additions
- [ ] Is `validateEmail` pure (no side effects)?
- [ ] Does the loader fail fast at parse time, before any downstream call?

### Style
- [ ] Is the regex source cited in a code comment? (non-obvious logic - `nit:`)

### Phase 3: Process
- [ ] CI passes
- [ ] At least one reviewer other than Alex

---

## Step 4: Coached reviewer comment

**Original comment:**
> "This regex is way too simple. You'll need something better."

**Coached version:**
> `suggestion:` The current regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) rejects the most common malformed emails but passes some technically-invalid ones (e.g., double dots in the local part). For a config loader this is likely acceptable - the goal is an early, clear failure, not RFC-5321 compliance, and the SMTP layer is the hard gate.
>
> If we want stricter validation, consider the `validator` library's `isEmail()` which handles the RFC edge cases. Trade-off: adds a dependency (and `dependency-audit-worker-bee` review); benefit: maintained regex we don't have to own.
>
> Not a merge gate - flagging so Alex can make a conscious choice. If staying with the current approach, suggest adding a code comment explaining the intentional simplicity.

---

## Outcome summary

| Action | Before | After |
|---|---|---|
| Description quality | 0/6 elements | 6/6 elements |
| Review checklist | None | 8-item scoped checklist |
| Reviewer comment | Vague + no tier | `suggestion:` with rationale, fix options, and tier clarity |
