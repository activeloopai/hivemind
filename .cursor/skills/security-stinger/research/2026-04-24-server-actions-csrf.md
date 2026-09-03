# Next.js Server Actions - Origin Validation & CSRF

**Sources:**
- https://nextjs.org/docs/app/guides/data-security
- https://nextjs.org/blog/security-nextjs-server-components-actions
- https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- https://github.com/vercel/next.js/security/advisories/GHSA-mq59-m269-xvcx (null origin CSRF bypass)
- https://advisories.gitlab.com/pkg/npm/next/CVE-2026-27978/
- https://blog.arcjet.com/next-js-server-action-security/

**Retrieved:** 2026-04-24
**Query used:** "Next.js Server Actions origin validation CSRF 2025"

## Summary

Next.js's built-in CSRF protection for Server Actions compares `Origin` to `Host` (or `X-Forwarded-Host`). Rejects cross-origin invocations. But this is NOT sufficient for authorization - origin validation answers "is this my site?", not "is this user allowed?". The Server Action must still call `auth()` / `verifySession()` internally.

## GHSA-mq59-m269-xvcx / CVE-2026-27978 - `null` origin bypass

A 2025 advisory: Next.js treated `Origin: null` as "missing", i.e., same-origin for the purposes of CSRF. Opaque contexts (sandboxed iframes, some data: URL flows, privacy-mode browsers) send `Origin: null`, which let attackers bypass CSRF validation on Server Actions.

**Fix:** treat `null` as an explicit cross-origin value. Do NOT add `'null'` to `experimental.serverActions.allowedOrigins` unless you know what you are doing.

## Hardening pattern

```ts
// app/actions/something.ts
'use server'
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function updateProfile(input: unknown) {
  // 1) Auth (framework does not do this for you)
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  // 2) Defense-in-depth origin check for self-hosters on older Next
  const h = headers();
  const origin = h.get('origin');
  const host = h.get('host');
  if (origin && new URL(origin).host !== host) {
    throw new Error('Cross-origin request rejected');
  }

  // 3) Validate with Zod .strict() - mitigates prototype pollution
  const parsed = ProfileSchema.strict().parse(input);

  // 4) Do the work
  ...
}
```

## Relevance to this stinger

- `guides/02-vibe-coding-patterns.md` A6 - server actions without auth are High, not Medium, because framework-level CSRF is about origin, not identity.
- `guides/05-remediation-playbooks.md` includes the hardened template above.
- `guides/06-cve-tracker.md` tracks the null-origin advisory as a second-tier Next.js CVE.
