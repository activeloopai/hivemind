# 07 - Known Critical Issues (upgrade / config-only catalog)

**Last refreshed:** 2026-04-25
**Refresh cadence:** every 90 days, or immediately on any new advisory affecting a production dependency or the OpenClaw bundle.

This guide tracks issues whose remediation is **upgrade or reconfigure**, not "patch a code pattern." It complements `06-cve-tracker.md` - that guide is the live matrix the Bee skims on every run; this guide is the deeper "here is what each issue actually does and how the Bee detects it" reference. Read this when an `npm audit`, `npm run audit:openclaw`, or CodeQL finding lands on something in the catalog below.

If `Last refreshed` above is more than **120 days** stale, surface this in the audit report's Executive Summary and recommend re-running `forge-stinger` for `security-worker-bee`.

---

## Why a separate "upgrade/config-only" catalog?

`05-remediation-playbooks.md` covers **code-pattern fixes** (escape SQL, scope a query, redact a token, harden the credential file). Some issues cannot be fixed in application code - a vulnerable transitive dependency, a misconfigured CI scan, or a credential-file mode that umask silently weakened. This guide lists those, with detection steps.

---

## Tier 0 - Production dependency advisories (upgrade required)

### Critical/High `npm audit` advisory in a production dependency

- **Component:** any package reachable from `dependencies` in `package-lock.json`.
- **Why it matters here:** Hivemind is a long-lived Node process holding an Activeloop JWT. A compromised dependency runs with that token in scope - the worst case is silent token exfiltration to the dataset's owning account.
- **Detection:** `npm audit --json --audit-level=high`. The lockfile (not `package.json`) is the source of truth - it shows the resolved version actually installed.
- **Remediation:** `npm audit fix`, review the diff, commit the updated `package-lock.json`. If no fix is available, evaluate whether the vulnerable code path is reachable from Hivemind; document the reasoning if you downgrade severity.
- **Source:** GitHub Security Advisories <https://github.com/advisories> filtered by npm ecosystem.

---

## Tier 1 - OpenClaw bundle / supply-chain (scan + config)

### OpenClaw bundle flags a new pattern (ClawHub parity)

- **Component:** the OpenClaw harness bundle.
- **Affected:** any change that introduces a `child_process`, `eval`-shaped, or network-callout pattern the static scanner flags.
- **Detection:** `npm run audit:openclaw` (`scripts/audit-openclaw-bundle.mjs`). Compare against the known-good deliberate bypass.
- **Known-good (do NOT "fix"):** the `createRequire` + renamed `execFileSync` handle in `src/skillify/gate-runner.ts`, and the matching `spawn` bypass in `harnesses/openclaw/src/index.ts`. These are intentional, documented, and exist so the scanner's literal-symbol regex does not match while still spawning the gate agent CLI with a fixed argv.
- **Remediation:** if the flag is a NEW pattern, treat it as **High** (Critical if it spawns input-built commands) and revert / re-shape per `guides/05-remediation-playbooks.md` §gate-runner bypass. If it is the known-good pattern, confirm it is unchanged and document it as expected.

### Hidden Unicode in AI rules files (Rules File Backdoor)

- **Component:** `.cursor/rules/**`, `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`.
- **Detection:** the Unicode scan in `scripts/scan.sh` / `scan.ts` (zero-width + bidi codepoints).
- **Remediation:** delete the file, audit `git log`, rotate any token the compromised rules could have exfiltrated. See `guides/02-vibe-coding-patterns.md` A4. This one IS a code/config fix, but it lands here because detection is scan-driven and the response is "remove + rotate," not "patch a pattern."

---

## Audit procedure - detect affected versions / configs in this codebase

Run these in order during Phase 1. Outputs go to a local ephemeral scratch dir (e.g., `.scan-output/`, gitignored) per the standard scan workflow.

### Step 1 - Identify lockfile

```bash
ls package-lock.json 2>/dev/null
```

`package-lock.json` (not `package.json`) is the source of truth. `package.json` shows ranges; the lockfile shows the resolved version actually installed.

### Step 2 - Run the dependency + bundle scans

```bash
npm audit --json --audit-level=high | tee .scan-output/npm-audit.json
npm run audit:openclaw           2>&1 | tee .scan-output/openclaw-audit.txt
```

Any Critical/High advisory, or any new OpenClaw flag, gates the ship.

### Step 3 - Confirm the deliberate bypass is intact

```bash
grep -n "createRequire" src/skillify/gate-runner.ts
grep -n "execFileSync\|spawn" src/skillify/gate-runner.ts harnesses/openclaw/src/index.ts
```

Confirm the renamed handle and the documenting comment block are present and unchanged. A stripped comment or a new undocumented spawn is a finding.

### Step 4 - Confirm the SQL guards are intact

```bash
grep -n "sqlIdent\|sqlStr\|sqlLike" src/utils/sql.ts
grep -nE '"\$\{[^}]+\}"' src/deeplake-api.ts   # identifiers - each must be sqlIdent-wrapped
```

A weakened `sqlIdent` regex, or an interpolated identifier with no `sqlIdent`, is **Critical** per `00-principles.md` rule #4.

### Step 5 - Confirm credential-file modes

```bash
grep -nE "credentials\.json|0o?600|0o?700|mode:" src/cli/auth.ts src/commands/auth*.ts src/config.ts
```

A write to the credential file without an explicit mode → **High**.

### Step 6 - Regression test that must accompany every dependency bump

For any production-dependency upgrade, the audit report must require:

1. **Build succeeds:** `npm run build` completes without error.
2. **Test suite green:** the full test suite passes against the new dependency tree.
3. **Type check:** `tsc --noEmit` reports no new errors.
4. **Lock-file freshness:** `package-lock.json` is committed alongside the upgrade - never let CI resolve the new version.
5. **Bundle re-scan:** `npm run audit:openclaw` and CodeQL re-run clean after the bump.

A dependency bump without these five checks is a half-finished remediation. The audit report should call it out as `NEEDS REGRESSION TEST` rather than passing.

---

## Subscription pattern - how to track future advisories

The Bee reads `06-cve-tracker.md` on every run and this guide on demand. Both stay current via a manual quarterly refresh.

### Authoritative sources (in priority order)

1. **GitHub Security Advisories database** - <https://github.com/advisories>. Filter by ecosystem npm and the top production dependencies (Deep Lake client, MCP SDK, etc.).
2. **`npm audit`** - the canonical resolved-tree advisory view for this exact lockfile.
3. **CodeQL alerts** - the GitHub code-scanning alerts produced by the javascript-typescript workflow in CI.
4. **ClawHub / OpenClaw bundle policy** - whatever scan rules ClawHub publishes; `scripts/audit-openclaw-bundle.mjs` should track them.
5. **Activeloop / Deep Lake advisories** - any security note from the dataset/API provider, since the SQL-over-HTTP contract is theirs.
6. **NVD** - <https://nvd.nist.gov/vuln/search> for any specific CVE ID on a named dependency.

### `npm audit` cadence

Every audit this Bee runs should, at minimum:

- **CI gate:** `npm audit --audit-level=high` on every PR. Fail the build on High or Critical findings. (`scripts/scan.sh` already does this in Phase 1.)
- **Bundle gate:** `npm run audit:openclaw` on every PR touching the harness.
- **Weekly Dependabot/Renovate scan:** automated PRs for dependency patch releases. Approve same-day for Critical/High advisories.
- **Quarterly manual sweep:** the security-stinger owner refreshes `06-cve-tracker.md` + this guide against the sources above.

### What "subscription" looks like in practice

Pick one of:

- **Dependabot security alerts** (lowest friction): enable on the repo; new advisories arrive as PRs/alerts.
- **GitHub Advisory database RSS / API** for the named production dependencies.
- **Watch the Deep Lake / Activeloop release notes** for changes to the SQL-over-HTTP contract that could affect the escaping assumptions in `src/utils/sql.ts`.

When a Critical/High advisory drops, the response sequence is:

1. Owner adds the advisory to `06-cve-tracker.md` Tier 1.
2. Owner adds the detailed entry to this guide if there's nothing actionable in application code - i.e., it's an upgrade/config-only fix.
3. Owner runs `forge-stinger` for security-worker-bee to refresh `Last refreshed` dates and review `scripts/scan.sh` sweep logic.
4. Audit report templates pick up the new check on next Bee invocation.

---

## Cross-references

- `06-cve-tracker.md` - the live dependency + bundle-scan matrix (skim first on every run).
- `02-vibe-coding-patterns.md` - AI-generated code failure patterns (A5 hallucinated deps, A8 gate-runner tampering).
- `05-remediation-playbooks.md` - code-pattern fixes (NOT applicable to the upgrade/config-only issues in this guide).
- `research/cve-watchlist.md` - source-of-truth refresh log.

---

*Citations:* every advisory entry should cite at least the GitHub Security Advisory / NVD URL and one corroborating source. Refer to those for the authoritative version matrix at any future date.
