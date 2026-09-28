# Next.js Security Headers - `next.config.js` / CSP / HSTS

**Sources:**
- https://nextjs.org/docs/app/guides/content-security-policy
- https://nextjs.org/docs/pages/api-reference/config/next-config-js/headers
- https://blog.logrocket.com/using-next-js-security-headers/
- https://github.com/jagaapple/next-secure-headers

**Retrieved:** 2026-04-24
**Query used:** "Next.js security headers next.config.js 2025 Content Security Policy HSTS"

## Summary

Next.js lets you attach response headers via an `async headers()` export in `next.config.js`. For apps using App Router with nonces, set the CSP in `middleware.ts` so a per-request nonce can be generated. Both approaches are valid; the Stinger flags absence, not approach.

## Required baseline (Stinger rule - any missing header = Medium)

| Header | Recommended value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | Block MIME sniffing |
| `X-Frame-Options` | `DENY` (or use CSP `frame-ancestors`) | Clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leak control |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` (app-specific) | Feature access |
| `Content-Security-Policy` | See below | XSS / injection defense-in-depth |

Note: `X-XSS-Protection` is deprecated in modern browsers; setting it is harmless but no longer a must-have. CSP replaces it.

## Minimum CSP for a typical Next.js app (adjust per integrations)

```
default-src 'self';
script-src 'self' 'nonce-{{NONCE}}' 'strict-dynamic';
style-src 'self' 'nonce-{{NONCE}}';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
form-action 'self';
base-uri 'self';
```

- `'unsafe-inline'` in script-src = Medium finding (degrades CSP to near-useless).
- `'unsafe-eval'` = High finding unless a legitimate need (e.g., WASM-to-JS) is documented.

## Relevance to this stinger

- `guides/03-owasp-top-10.md` B5 cites this table as the baseline.
- `examples/medium-missing-header.md` uses HSTS absence as the worked case.
- `scripts/scan.sh` greps `next.config.js` for each header name; missing → flag.
