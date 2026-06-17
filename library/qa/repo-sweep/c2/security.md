# Security Audit Report: repo-sweep C2 - CLI + scripts

**Audit date:** 2026-06-16
**Auditor:** security-worker-bee subagent
**Branch:** `pr/05-security-quality-repo-sweep`
**Chunk:** C2 - CLI + scripts
**Scope (files reviewed):**
- `src/cli/index.ts`
- `src/cli/util.ts`
- `src/cli/version.ts`
- `src/cli/auth.ts`
- `src/cli/update.ts`
- `src/cli/embeddings.ts`
- `src/cli/install-scan.ts`
- `src/cli/skillify-spec.ts`
- `src/cli/install-claude.ts`
- `src/cli/install-codex.ts`
- `src/cli/install-cursor.ts`
- `src/cli/install-hermes.ts`
- `src/cli/install-openclaw.ts`
- `src/cli/install-pi.ts`
- `src/cli/install-mcp-shared.ts`
- `scripts/audit-openclaw-bundle.mjs`
- `scripts/ensure-tree-sitter.mjs`
- `scripts/pack-check.mjs`
- `scripts/sync-versions.mjs`
- `scripts/verify-install.sh`

Supporting (read for context, not in remediation scope): `src/commands/auth.ts` (token persistence boundary), `harnesses/openclaw/src/setup-config.ts` (allowlist patcher referenced by `install-openclaw.ts`).

**Node version audited:** >=22 (ESM)
**`npm audit` result:** not run this pass (chunk-scoped; dependency tree owned by `dependency-audit-worker-bee`). `npm install` was explicitly out of scope for this run.
**OpenClaw bundle scan:** `scripts/audit-openclaw-bundle.mjs` reviewed as source (the scanner itself), not executed against a built bundle this pass.
**CVE watchlist:** not re-evaluated this pass (chunk-scoped to the listed CLI + script files).

---

## Executive Summary

The C2 CLI + scripts surface is in good shape. Every installer derives its filesystem targets from `homedir()` (`HOME`) and the package root resolved by `pkgRoot()`; no command-line flag, environment variable, or config value flows into a copy, symlink, or write destination, so the path-traversal and arbitrary-hook-insertion vectors called out for this chunk are not reachable with attacker-controlled input. Directory copies use `cpSync` with `dereference: false`, so a malicious symlink planted in a source bundle is copied verbatim rather than followed out of the tree. The hooks.json / config merge logic in every harness reads the user's existing file, strips only hivemind-owned entries (matched by fixed install-path fragments), appends our fixed-path entries, and preserves all other user content. Credential handling in `auth.ts` never logs the token value (only the source label, `--token flag` vs `HIVEMIND_TOKEN`), there are no hardcoded secrets, and the only `chmod` (`embeddings.ts`) sets `0o755` with no setuid/setgid bit, so there is no privilege-escalation path.

No Critical or High findings were reachable with attacker-controlled input. One Medium defense-in-depth gap was found in `scripts/pack-check.mjs` (the publish-time secret gate, an explicit focus area for this chunk): its forbidden-filename catalog covered `.npmrc`, `.env`, `secrets/`, `.github`, and `.git`, but not private-key material (`*.pem`, `*.key`, `id_rsa`, etc.) or a stray `credentials.json`. The repo's current `files` allowlist ships only bundles, skills, manifests, and scripts, so none of the new patterns can false-positive; the gap was closed in-session under the <5-line Medium exception so the secret gate ships hardened.

---

## Scorecard

| Category | Status | Findings |
|---|---|---|
| Credential / Token Exposure (hardcoded or logged) | OK | 0 |
| Captured-Trace PII (sessions/memory) | OK | 0 |
| Path Traversal (installer copy / symlink) | OK | 0 |
| hooks.json / config injection (marker, arbitrary hook insert) | OK | 0 |
| Bundle provisioning (unsafe copy, unvalidated source) | OK | 0 |
| Command Injection (`verify-install.sh`, child_process) | OK | 0 |
| Privilege Escalation (chmod) | OK | 0 |
| Secret-publish gate (`pack-check.mjs`) | ATTN | 1 (Medium, fixed) |

Legend: **OK** = zero findings · **ATTN** = Medium/Low findings documented · **FAIL** = Critical/High findings.

---

## Critical Findings (fixed in this session)

None detected.

---

## High Findings (fixed in this session)

None detected.

---

## Medium Findings

### M1 - `pack-check.mjs` secret gate missing private-key / credential filename patterns (FIXED)

- **File:** `scripts/pack-check.mjs:9-15` (the `FORBIDDEN` array)
- **Category:** PII/financial catalog - "`pack-check` secret-publish gate" / defense in depth.
- **Description:** The publish guard refuses an `npm pack` tarball that contains forbidden filenames, but the catalog only matched `.npmrc`, `.env`, `secrets/`, `.github`, and `.git`. A future change to `package.json`'s `files` array (or a permissive `.npmignore`) that pulled in a private key (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`/`id_ed25519`) or a `credentials.json` would not be blocked. This is a gap in a backstop control, not an active exposure: nothing in the current `files` allowlist ships such material, so it is **Medium**, not Critical.
- **Fix applied (under the <5-line Medium exception, in an explicit focus area):** added three patterns to `FORBIDDEN`:
  - `/(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/`
  - `/\.(pem|key|p12|pfx)$/`
  - `/(^|\/)credentials\.json$/`
- **False-positive check:** the `files` allowlist (`bundle`, `harnesses/**/bundle`, `harnesses/**/skills`, `*.plugin.json`, `harnesses/**/package.json`, `.claude-plugin`, `scripts`, `README.md`, `LICENSE`) ships no file matching any new pattern, so the gate stays green on a clean publish.

---

## Low Findings (documented only, not fixed)

### L1 - `verify-install.sh` does not set `pipefail` / `errexit`

- **File:** `scripts/verify-install.sh:16` (`set -u` only)
- **Description:** The verifier uses `set -u` but not `set -o pipefail` or `set -e`. This is a robustness concern (a failing command inside a pipe can be masked), not a security one: every command operates on fixed, `$HOME`-rooted paths and fixed JSON literals, with no untrusted input interpolated into any command, so there is no command-injection surface. Left as-is to honor minimal blast radius; a maintainer may add `set -uo pipefail` opportunistically.

### L2 - `ensure-tree-sitter.mjs` builds npm command strings via `execSync` interpolation

- **File:** `scripts/ensure-tree-sitter.mjs:71,80,92`
- **Description:** The native-binding healer composes `npm install ...` / `npm rebuild ...` strings from a hardcoded package list and version ranges read from the shipped `package.json`, then runs them via `execSync`. Both the package names (hardcoded) and the version specs (from the package's own trusted `package.json`) are repo-controlled, not user-controlled, so there is no injection vector. Preferring `execFileSync` with an argv array would be marginally cleaner hygiene but is not a security fix; documented only.

---

## Categories Explicitly Checked - "None detected"

- **Path traversal in installer copy/symlink operations:** None. All destinations (`PLUGIN_DIR`, bundle dirs, symlink targets) are built from `HOME`/`pkgRoot()` with literal segments; no flag/env/config value reaches a path. `copyDir` uses `dereference: false`.
- **hooks.json / config marker injection or arbitrary hook insertion:** None. `install-cursor.ts`, `install-codex.ts`, `install-hermes.ts` merge by stripping hivemind-owned entries (fixed install-path match) and appending fixed-path command entries; the `_hivemindManaged` marker is a fixed object. Foreign/duplicate dev-clone entries are surfaced, not silently trusted.
- **Bundle provisioning / unvalidated source paths:** None. Sources resolve under the installed package via `pkgRoot()`; `existsSync` guards precede every copy; `copyFileSync` is used for single files and `cpSync`/`dereference:false` for trees.
- **`scripts/verify-install.sh` command injection:** None. No untrusted input is interpolated into any executed command; all node/jq invocations target fixed `$HOME`-rooted paths with fixed JSON-RPC literals.
- **Privilege escalation via chmod:** None. Only `chmodSync(SHARED_DAEMON_PATH, 0o755)`; no setuid/setgid/world-writable bits. `mkdirSync` for the update lock uses `0o700`; the lockfile uses `0o600`.
- **Credentials/tokens hardcoded or logged:** None. `auth.ts` accepts a token from `--token`/`HIVEMIND_TOKEN`, passes it to the persistence layer, and logs only the source label, never the value. No secrets are embedded in source. `_isDaemonAliveOnSocket` embeds a path into a `node -e` snippet via `JSON.stringify` (safe escaping) and the path is uid-derived, not user-supplied.

---

## Files Changed (remediation diff)

| File | Lines | Change |
|---|---|---|
| `scripts/pack-check.mjs` | +4 | Added private-key / `credentials.json` filename patterns to the publish secret gate (M1). |

`git diff --stat`: `1 file changed, 4 insertions(+)`.

---

## Follow-ups / Handoffs

- **`dependency-audit-worker-bee`:** run a tree-wide `npm audit` and the `js-yaml` version check (used by `install-hermes.ts` via `yaml.load`, which is the safe schema in js-yaml v4) as a separate pass.
- **Maintainer (optional hygiene, non-blocking):** L1 (`set -uo pipefail` in `verify-install.sh`) and L2 (`execFileSync` argv form in `ensure-tree-sitter.mjs`).
- **Ordering:** no `quality.md` exists for C2 yet, so this audit ran before `quality-worker-bee`, as required.
