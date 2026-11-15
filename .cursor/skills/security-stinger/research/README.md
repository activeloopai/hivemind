# research/ - security-stinger

Audit trail for the Stinger's factual claims. Every guide in `../guides/` cites at least one file here. When you update a guide, either cite an existing note or add a new one.

## Index (2026-04-24)

| File | Topic |
|---|---|
| `research-plan.md` | Query list, sources, open questions at forge time |
| `cve-watchlist.md` | Living list of CVEs with patch versions, refresh log |
| `open-questions.md` | Decisions pending user resolution |
| `gaps.md` | Tools / sources that were unavailable at forge time |
| `2026-04-24-cve-2025-29927-middleware-bypass.md` | Next.js middleware auth bypass |
| `2026-04-24-cve-2025-55182-react2shell.md` | React RSC deserialization RCE (+ Next.js CVE-2025-66478) |
| `2026-04-24-veracode-genai-2025-report.md` | AI-code security failure statistics |
| `2026-04-24-owasp-top-10-2025.md` | Current OWASP Top 10 ordering |
| `2026-04-24-rules-file-backdoor.md` | Hidden-Unicode prompt injection in AI IDEs |
| `2026-04-24-stripe-pci-dss.md` | PCI DSS: SAQ A vs. SAQ D |
| `2026-04-24-server-actions-csrf.md` | Next.js Server Actions origin validation |
| `2026-04-24-jwt-algorithm-confusion.md` | JWT `alg: none` and RS→HS confusion |
| `2026-04-24-prototype-pollution.md` | Node.js prototype pollution defenses |
| `2026-04-24-gdpr-17-20.md` | Right to erasure + data portability |
| `2026-04-24-nextjs-security-headers.md` | `next.config.js` headers, CSP, HSTS |
| `2026-04-24-dompurify-xss.md` | Safe `dangerouslySetInnerHTML` usage |
| `2026-04-24-semgrep-tooling.md` | Deterministic scanners (npm audit, semgrep, eslint-plugin-security) |

## Refresh cadence

The CVE watchlist has a hard 90-day refresh target. Other research notes refresh opportunistically - when a guide's claim feels stale, re-research and overwrite the note with a fresh `Retrieved:` date.
