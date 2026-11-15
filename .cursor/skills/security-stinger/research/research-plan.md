# Research Plan - security-stinger

**Forge date:** 2026-04-24
**Bee:** security-worker-bee
**Stinger:** security-stinger

## Objective

Verify and extend the pre-researched vulnerability intelligence in the existing Bee body (`.cursor/agents/security-worker-bee.md`, 333 lines) with authoritative 2025-2026 sources. The Stinger's guides must trace every factual claim to a source in this folder.

## Search queries to run

Pulled from the brief's REFERENCE MATERIAL and the existing Bee body:

1. "CVE-2025-29927 Next.js middleware authorization bypass patch versions"
2. "CVE-2025-55182 React2Shell Next.js RSC deserialization RCE"
3. "Veracode 2025 AI-generated code security report JavaScript pass rate"
4. "OWASP Top 10 2025 current edition"
5. "Next.js security advisories GitHub 2025 2026"
6. "Stripe PCI DSS compliance Elements vs raw card"
7. "JWT algorithm confusion attack HS256 none 2025"
8. "prototype pollution Node.js mitigation Object.hasOwn"
9. "IDOR detection patterns Next.js App Router server components"
10. "Server Actions origin validation Next.js"
11. "GDPR Article 17 right to erasure Article 20 portability"
12. "semgrep rulesets Next.js TypeScript eslint-plugin-security"
13. "React dangerouslySetInnerHTML DOMPurify XSS"
14. "Rules file backdoor zero-width Unicode Cursor Copilot"

## Authoritative sources to fetch directly

- https://owasp.org/Top10/ (current OWASP Top 10)
- https://github.com/vercel/next.js/security/advisories (Next.js security advisory feed)
- https://nextjs.org/docs/app/building-your-application/authentication (Next.js auth docs)
- https://stripe.com/docs/security (Stripe security / PCI DSS)
- https://react.dev/reference/react-dom/components/common#common-security-pitfalls (React security pitfalls)
- https://nodejs.org/en/learn/getting-started/security-best-practices (Node.js security best practices)
- https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html (JWT cheat sheet)
- https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html (SQL injection cheat sheet)
- https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html (XSS cheat sheet)
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html (CSRF cheat sheet)
- https://nvd.nist.gov/vuln/detail/CVE-2025-29927 (CVE-2025-29927 detail)
- https://gdpr-info.eu/art-17-gdpr/ + https://gdpr-info.eu/art-20-gdpr/ (GDPR articles)

## Open questions carried from brief IDEAS section

These are tracked in `research/open-questions.md` - they should be resolved by the user, not by research:

- Should the Stinger track a local `research/cve-watchlist.md` with dates? (90-day refresh cadence)
- Should a host-repo-specific section (tenantId scoping, requireRole("admin")) exist separately from the generic catalog?
- What is the policy for zero-day CVEs appearing between audits?

## Target output

- 8-12 dated research notes in `research/YYYY-MM-DD-<topic>.md`.
- `research/cve-watchlist.md` as a living file with patched-version data.
- `research/open-questions.md` for user resolution.
- Every factual claim in `guides/*.md` traceable to one of these files.
