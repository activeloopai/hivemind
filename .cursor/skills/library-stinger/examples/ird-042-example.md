<!--
Schema v2 paths on disk:
  library/issues/backlog/ird-042-password-reset-expiry/ird-042-password-reset-expiry-index.md

IRD number = GitHub issue number (42). Never invented.
QA report lives in the qa/ subfolder:
  library/issues/backlog/ird-042-password-reset-expiry/qa/ird-042-password-reset-expiry-qa.md

Move entire ird-042-password-reset-expiry/ folder to in-work/ then completed/ as lifecycle changes.
-->

# IRD-042: Password reset link expires too quickly

> **GitHub Issue:** [#42](https://github.com/<org>/<repo>/issues/42) - Bug
>
> **Status:** Backlog
> **Priority:** P2
> **Effort:** S (1-3h)
> **Reporter:** Dana Kim (@danakim)

---

## Problem

The "Reset your password" email contains a link that expires after 15 minutes. Users on mobile clients frequently open the email in a preview pane (which does not follow the link), then click later only to find the link dead. The intended behavior per the auth spec is a 60-minute window.

## Current state

The reset-token TTL is hardcoded in `src/services/auth-service.ts`:

```typescript
export function createResetToken(userId: string): ResetToken {
  return {
    token: randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes ← wrong
  };
}
```

No env var or config option exists. The TTL is inline. The route at `src/routes/password-reset.ts` validates the token but does not control the TTL.

## Root cause

Hardcoded constant was never updated after the auth spec changed from 15 → 60 minutes in sprint 3.

## Fix plan

1. Add `PASSWORD_RESET_TTL_MINUTES` to `src/lib/config.ts` (default `60`, validated as positive integer).
2. Refactor `createResetToken` in `src/services/auth-service.ts` to read the config value.
3. Add unit tests covering:
   - Token generated with 60-min TTL (AC-1)
   - Token accepted at 59 minutes (AC-2)
   - Token rejected at 61 minutes with `410 Gone` + `code: "token_expired"` (AC-3)
   - `PASSWORD_RESET_TTL_MINUTES` env var respected (AC-4)
4. Update `library/knowledge/private/integrations/auth-env-vars.md` with the new env var.

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given the user requests a password reset, when the token is generated, then `expiresAt` is 60 minutes from `Date.now()`. |
| AC-2 | Given a reset token that is 59 minutes old, when the user submits the reset form, then the request succeeds. |
| AC-3 | Given a reset token that is 61 minutes old, when the user submits the reset form, then the API returns `410 Gone` with `code: "token_expired"`. |
| AC-4 | Given the `PASSWORD_RESET_TTL_MINUTES` env var is set, when a token is generated, then the TTL uses that value (fallback 60). |

## Files touched

- `src/lib/config.ts`
- `src/services/auth-service.ts`
- `src/tests/services/auth-service.spec.ts`
- `library/knowledge/private/integrations/auth-env-vars.md`

## Out of scope

- Email copy changes (email says "this link will expire" without a specific minute count - no change needed).
- Resend / re-request rate limiting (tracked separately in IRD-044).

## Related

- [`ird-044-password-reset-rate-limit`](../ird-044-password-reset-rate-limit/ird-044-password-reset-rate-limit-index.md) - rate limiter for repeated reset requests.
- [`library/knowledge/private/auth/auth-architecture.md`](../../../knowledge/private/auth/auth-architecture.md) - architectural context.
