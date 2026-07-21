# Security Audit Report

**Date:** 2026-06-12
**Branch:** hivemind-doc-reverse-document (worktree)
**Auditor:** security-guardian
**Scope:** `library/knowledge/private/**/*.md` (22 markdown documentation files)
**Stack note:** Documentation-only audit. No executable code in scope. CVE version checks and `npm audit` are not applicable to markdown files; OWASP and PII catalogs applied to documentation content instead.

---

## Executive Summary

**Result: PASS - No Medium or higher findings.**

22 markdown files in `library/knowledge/private/` were audited across four focus areas:
accidental credential exposure, unsafe shell commands, PII in examples, and malicious URLs.
All examples use clearly synthetic placeholder values. All shell patterns are restrictive
(not permissive). No real tokens, email addresses, or PII were found. All URLs reference
legitimate first-party or well-known third-party services.

**Fixes applied:** None required.

---

## Files Audited

| File | Lines | Result |
|---|---|---|
| `ai/embeddings-retrieval.md` | - | PASS |
| `ai/session-capture.md` | - | PASS |
| `ai/skillify-pipeline.md` | - | PASS |
| `ai/wiki-summary-workers.md` | - | PASS |
| `architecture/session-lifecycle.md` | - | PASS |
| `architecture/system-overview.md` | - | PASS |
| `auth/auth-architecture.md` | - | PASS |
| `collaboration/team-skills-sharing.md` | - | PASS |
| `data/codebase-graph.md` | - | PASS |
| `data/deeplake-tables-schema.md` | - | PASS |
| `data/memory-virtual-filesystem.md` | - | PASS |
| `frontend/cursor-extension-architecture.md` | - | PASS |
| `infrastructure/monorepo-build-release.md` | - | PASS |
| `multi-tenant/org-workspace-model.md` | - | PASS |
| `operations/cli-command-architecture.md` | - | PASS |
| `operations/notifications-and-health.md` | - | PASS |
| `overview.md` | - | PASS |
| `plugins/hook-lifecycle.md` | - | PASS |
| `plugins/integration-model.md` | - | PASS |
| `plugins/mcp-and-extension-surfaces.md` | - | PASS |
| `security/credential-storage.md` | - | PASS |
| `security/trust-boundaries.md` | - | PASS |

---

## Findings

### Category A - Accidental Credentials / Real Tokens

**Result: None detected.**

Patterns checked:
- Real JWT tokens (`eyJ....<sig>` three-part structure with non-truncated payload)
- Live Stripe keys (`sk_live_`, `rk_live_`, `pk_live_`)
- AWS access keys (`AKIA*`, `ASIA*`)
- GitHub tokens (`ghp_`, `ghs_`)
- Supabase anon/service keys (full JWT)
- High-entropy base64 strings (>=32 chars, not labeled placeholder)
- WorkOS / DeepLake API key values
- Any `API_KEY=<value>` assignments with real-looking values

One reviewed match in `security/credential-storage.md:72`:
```json
"token": "eyJ...<truncated>",
```
This is explicitly truncated with `<truncated>` and is a documentation example showing
the shape of the credentials file. The `eyJ` prefix is the standard base64url encoding of
`{"` (JWT header start) and is universally used in JWT documentation. **Not a real token.**

### Category B - Unsafe Shell Commands (chmod weakening, curl|bash, eval)

**Result: None detected.**

Patterns checked:
- `chmod 777`, `chmod o+w`, `chmod a+w`, `chmod 0777`, `chmod 666`
- `sudo chmod/chown/rm -rf/dd`
- `curl ... | bash`, `curl ... | sh`, `wget ... | bash`
- `` eval $( `cmd` ) ``, `exec curl`

The only chmod permissions mentioned in documentation are:
- `0700` (`rwx------`) on `~/.deeplake/` - restrictive (owner only)
- `0600` (`rw-------`) on `~/.deeplake/credentials.json` - restrictive (owner only)

These are security-positive patterns documenting correct least-privilege file permissions.

### Category C - PII in Examples

**Result: None detected.**

Patterns checked:
- Real email addresses (non-`example.com` domains with personal names)
- Social Security Numbers (`NNN-NN-NNNN`)
- Credit/debit card numbers (Luhn-checkable patterns)
- Phone numbers
- Real personal names paired with contact information
- IP addresses (internal RFC-1918 ranges)

All example values are clearly synthetic:
- `"orgId": "acme-inc"` - fictional company
- `"orgName": "Acme Inc"` - standard placeholder
- `"userName": "alice"` - generic test name
- `"savedAt": "2026-06-12T23:00:00.000Z"` - no PII

### Category D - Malicious or Suspicious URLs

**Result: None detected.**

Patterns checked:
- Short-link services (`bit.ly`, `tinyurl`, `t.co`, `goo.gl`, `ow.ly`)
- Suspicious TLDs (`.xyz`, `.tk`, `.ml`, `.ga`, `.cf`, `.pw`, `.top`, `.click`, `.download`)
- Unknown or uncommon domain names in code examples

All URLs found in the documentation:
| URL | File | Assessment |
|---|---|---|
| `https://api.deeplake.ai` | `security/credential-storage.md`, `multi-tenant/org-workspace-model.md` | Legitimate - Activeloop/DeepLake production API |

No other external URLs were present in the 22 files.

---

## Observations (Informational - No Action Required)

**OBS-1 [Low] - No keychain integration documented as a known tradeoff**
`security/credential-storage.md` Section 6 explicitly acknowledges that `~/.deeplake/credentials.json` is not protected by an OS keychain. This is documented as a deliberate tradeoff (cross-platform compatibility). The mitigations (mode 0600, 365-day org-bound token, env-var override for CI) are clearly described. No change needed in documentation; the tradeoff is accurately stated.

**OBS-2 [Low] - JWT decoded without verification (auth-architecture.md)**
`auth-architecture.md` Section 4 documents that `decodeJwtPayload()` does not verify the JWT signature. The document accurately explains the rationale (routing only, not access control; server-side verification covers security). This is a correct description of a standard pattern. No change needed.

---

## Fixes Applied

**None.** No Medium or higher findings were identified. No documentation was modified.

---

## Scan Coverage Confirmation

| Check | Tool/Method | Status |
|---|---|---|
| Real tokens / API keys | `rg` regex sweep (15+ patterns) | Checked |
| Unsafe chmod patterns | `rg` pattern match | Checked |
| curl/wget pipe to shell | `rg` pattern match | Checked |
| PII patterns (email, SSN, CC, phone) | `rg` regex sweep | Checked |
| Suspicious / malicious URLs | `rg` + TLD allowlist filter | Checked |
| Hardcoded passwords | `rg` pattern match | Checked |
| High-entropy strings | `rg` + exclusion filter | Checked |
| Private/internal hostnames | `rg` pattern match | Checked |
| Internal IP address ranges | `rg` RFC-1918 filter | Checked |
| AWS access keys | `rg` AKIA/ASIA pattern | Checked |
| Private key blocks (PEM) | `rg` pattern match | Checked |

Note: CVE version checks (`npm audit`, Next.js/React version matrix from `guides/06-cve-tracker.md`) are not applicable - this branch contains documentation markdown only, with no `package.json` or executable code in scope.
