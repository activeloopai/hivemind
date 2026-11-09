# Open Questions - security-stinger

Surfaced during the 2026-04-24 forge pass. These are NOT research gaps; they are decisions the user should make before the Stinger is considered fully authoritative.

---

## 1. Host-repo-specific known-good pattern catalog

The brief IDEAS section asks whether the Stinger should encode codebase-specific conventions (e.g., `tenantId` scoping, `requireRole("admin")` helpers) so the Bee can cross-reference them during audits.

**Recommended next action:** once `library-worker-bee` has been deployed in the host repo and has produced a handful of plans, harvest the canonical helper names from those plans and add a `guides/07-host-repo-patterns.md` file. Too early right now - the catalog would be speculative.

## 2. Zero-day CVE feed policy

The brief asks: should the Bee check a designated feed before every scan? The `research/cve-watchlist.md` file addresses this partially - it fails loudly if older than 120 days - but does not solve the zero-day problem.

**Options:**
- (a) Require the Bee to run a `web_search` for "Next.js zero-day" at the start of every audit. Adds 15-30 s but catches same-day disclosures.
- (b) Rely on the 90-day refresh cadence on `cve-watchlist.md` and accept that any CVE published in the interval is found by `npm audit` (as long as NVD has ingested it) rather than by the Stinger.
- (c) Subscribe a human (Mario) to the Vercel security advisory RSS and bump the watchlist manually.

**Recommended:** (b) + (c). Web search at audit time is slow, high-variance, and sometimes wrong. The watchlist + `npm audit` combination is high confidence. A manual RSS subscription picks up the long tail.

## 3. `safeLog()` implementation - where does it live?

The Stinger ships a reference implementation in `templates/safe-log.ts`. Open question: should the Bee copy it into each project it audits, or is there a central `@<host>/safe-log` package the Bee should suggest importing?

**Recommended next action:** publish a `@<host>/safe-log` internal package so the Bee's remediation is `pnpm add @<host>/safe-log` rather than copy-paste. Until that exists, the Bee copies `templates/safe-log.ts` into `src/lib/safe-log.ts` as part of the fix.

## 4. Report destination convention

Convention: standalone audits go to `library/qa/security/<date>-security-audit.md`; feature-tied audits go to `library/requirements/features/feature-<###>-<title>/reports/<date>-security-audit.md`. Other QA Bees (e.g., `quality-worker-bee`) write under the same `library/qa/<domain>/` tree, which gives the host repo one consistent place to discover audit history.

No open question - documented here only for traceability.
