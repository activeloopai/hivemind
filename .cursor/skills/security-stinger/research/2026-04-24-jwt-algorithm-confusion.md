# JWT Algorithm Confusion & `alg: none`

**Sources:**
- https://portswigger.net/web-security/jwt/algorithm-confusion
- https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
- https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/
- https://www.apisec.ai/blog/jwt-security-vulnerabilities-prevention
- https://pentesterlab.com/blog/jwt-vulnerabilities-attacks-guide

**Retrieved:** 2026-04-24
**Query used:** "JWT algorithm confusion attack none HS256 RS256 mitigation"

## Summary

Two JWT attack classes the Stinger must detect:

1. **`alg: none`** - the token header declares no signature. Libraries that allow `none` in the accepted-algorithms list will treat an unsigned token as valid.
2. **Algorithm confusion (RS256 → HS256)** - attacker flips the header from RS256 to HS256 and signs with the server's **public** key as the HMAC secret. A `verify(token, publicKey)` call with no algorithm whitelist accepts this.

## Mitigation (canonical)

```ts
jwt.verify(token, process.env.JWT_SECRET, {
  algorithms: ['HS256'],   // pin single algorithm
  issuer: 'your-app',      // also pin iss
  audience: 'your-api',    // and aud
});
```

Never:

- `algorithms: ['HS256', 'none']` - never include `none`.
- `jwt.verify(token, decodedHeader.jwk)` - never take the key from the token itself.
- Dynamic algorithm: `algorithms: [header.alg]` - defeats the whole point.

## Also check

- JWKS endpoint hardening - if the app fetches a JWKS URL, cache it and validate `kid`.
- Token expiration - `exp` claim verified by library by default; ensure `clockTolerance` is small (≤30s).
- Refresh token rotation - reuse detection invalidates the family.

## Relevance to this stinger

- `guides/03-owasp-top-10.md` B3 (Broken Authentication → A07:2025) - JWT subsection lists the `none`/confusion patterns as **High**.
- `guides/05-remediation-playbooks.md` has the one-line remediation template above.
- `scripts/scan.sh` greps for `algorithms: [` containing `'none'` or missing entirely.
