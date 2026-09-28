<!--
Path on disk:
  library/requirements/issues/issue-042-password-reset-expiry/ird-issue-042-password-reset-expiry.md

Sibling folder for QA reports:
  library/requirements/issues/issue-042-password-reset-expiry/reports/
-->

# Issue #42: Password reset link expires too quickly

> **GitHub Issue #42** - Bug
>
> **Source:** https://app.example.com/login
> **Reporter:** Dana Kim (@danakim)
> **Reported via:** GitHub web

---

## Overview

The "Reset your password" email contains a link that expires after 15 minutes. Users on mobile clients frequently open the email in a preview pane (which does not follow the link immediately), then click later only to find the link dead. The intended behavior per the auth spec is a 60-minute window.

## Current state

The reset-token TTL is hardcoded in `api/src/services/auth-service.ts`:

```42:48:api/src/services/auth-service.ts
export function createResetToken(userId: string): ResetToken {
  return {
    token: randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  };
}
```

No env var or config option exists; the TTL is inline. `api/src/routes/password-reset.ts` validates the token but does not control the TTL.

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given the user requests a password reset, when the token is generated, then `expiresAt` is 60 minutes from `Date.now()`. |
| AC-2 | Given a reset token that is 59 minutes old, when the user submits the reset form, then the request succeeds. |
| AC-3 | Given a reset token that is 61 minutes old, when the user submits the reset form, then the API returns `410 Gone` with `code: "token_expired"`. |
| AC-4 | Given the `PASSWORD_RESET_TTL_MINUTES` env var is set, when a token is generated, then the TTL uses that value (fallback 60). |
| AC-5 | Given an existing token that was generated under the 15-minute TTL, when it is evaluated after the deploy, then it is validated against its original `expiresAt` (no grandfather logic needed - DB stores absolute time). |

## Proposed solution

Replace the hardcoded 15-minute TTL with a function that reads `PASSWORD_RESET_TTL_MINUTES` from env (default `60`). Keep `expiresAt` as an absolute timestamp in the DB so in-flight tokens are unaffected. Add a test that exercises AC-3 using fake timers.

## Implementation plan

1. Add `PASSWORD_RESET_TTL_MINUTES` to `api/src/lib/config.ts` (default `60`, validated as positive integer).
2. Refactor `createResetToken` in `api/src/services/auth-service.ts` to read the config.
3. Add a unit test in `api/tests/services/auth-service.spec.ts` covering AC-1 through AC-4.
4. Document the new env var in `library/knowledge-base/integrations/auth-env-vars.md`.

## Files touched

- `api/src/lib/config.ts`
- `api/src/services/auth-service.ts`
- `api/tests/services/auth-service.spec.ts`
- `library/knowledge-base/integrations/auth-env-vars.md`

## Out of scope

- Email copy changes. The email already says "this link will expire" without a specific minute count; no change needed.
- Resend / re-request rate limiting. Tracked separately under #044.

## Related

- [ird-issue-044-password-reset-rate-limit.md](../issue-044-password-reset-rate-limit/ird-issue-044-password-reset-rate-limit.md) - rate limiter for repeated requests.
- [kb-authentication-flow.md](../../../knowledge-base/architecture/authentication-flow.md) - architectural context.
