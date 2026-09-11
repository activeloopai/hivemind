#!/usr/bin/env bash
# scripts/scan.sh - Phase 1 deterministic security scans for security-worker-bee,
# tuned for the Hivemind codebase (TypeScript CLI + MCP server + Deep Lake API).
#
# Runs the checks a human or a grep can do - so the Bee spends its reasoning
# on the judgment calls (missing sqlIdent, gate path weakness, scope coercion).
#
# Outputs land in .scan-output/ (ephemeral, gitignored - regenerate per audit).
# The Bee reads them, dedupes with its own observations, and promotes findings
# into the audit report.
#
# Usage (from the Hivemind repo root):
#   bash .cursor/skills/security-stinger/scripts/scan.sh
#
# Exit code is always 0 - the Bee decides what's fatal.

set -u
OUT_DIR=".scan-output"
mkdir -p "$OUT_DIR"

hr() { printf '\n============================================================\n%s\n============================================================\n' "$*"; }

# ----------------------------------------------------------------------------
# 1. npm audit
# ----------------------------------------------------------------------------
hr "1. npm audit (high+)"
if [ -f package-lock.json ]; then
  npm audit --audit-level=high --json > "$OUT_DIR/npm-audit.json" 2>/dev/null || true
else
  echo "no package-lock.json found" > "$OUT_DIR/npm-audit.json"
fi
echo "  -> $OUT_DIR/npm-audit.json"

# ----------------------------------------------------------------------------
# 2. OpenClaw bundle static scan (ClawHub parity)
# ----------------------------------------------------------------------------
hr "2. OpenClaw bundle scan (npm run audit:openclaw)"
if grep -q '"audit:openclaw"' package.json 2>/dev/null; then
  npm run audit:openclaw > "$OUT_DIR/openclaw-audit.txt" 2>&1 || true
else
  echo "audit:openclaw script not found in package.json" > "$OUT_DIR/openclaw-audit.txt"
fi
echo "  -> $OUT_DIR/openclaw-audit.txt"

# ----------------------------------------------------------------------------
# 3. Rules File Backdoor - hidden Unicode in AI rules files
# ----------------------------------------------------------------------------
hr "3. Unicode scan (.cursor/rules, .cursorrules, AGENTS.md, CLAUDE.md, copilot-instructions)"
: > "$OUT_DIR/unicode-scan.txt"
UNICODE_RE='[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2069}\x{FEFF}]'
SCAN_GLOBS=(
  ".cursor/rules"
  ".cursorrules"
  "AGENTS.md"
  "CLAUDE.md"
  ".github/copilot-instructions.md"
)
for target in "${SCAN_GLOBS[@]}"; do
  if [ -e "$target" ]; then
    if command -v rg >/dev/null 2>&1; then
      rg -n -P "$UNICODE_RE" "$target" >> "$OUT_DIR/unicode-scan.txt" 2>/dev/null || true
    else
      grep -rnP "$UNICODE_RE" "$target" >> "$OUT_DIR/unicode-scan.txt" 2>/dev/null || true
    fi
  fi
done
if [ ! -s "$OUT_DIR/unicode-scan.txt" ]; then
  echo "clean - no zero-width or bidirectional Unicode detected" > "$OUT_DIR/unicode-scan.txt"
fi
echo "  -> $OUT_DIR/unicode-scan.txt"

# ----------------------------------------------------------------------------
# 4. Pattern sweeps - Hivemind-specific vulnerable patterns
# ----------------------------------------------------------------------------
hr "4. Vulnerable-pattern regex sweep"
: > "$OUT_DIR/grep-findings.txt"

section() { printf '\n--- %s ---\n' "$1" >> "$OUT_DIR/grep-findings.txt"; }

# prefer rg
RG_OR_GREP() {
  local pattern="$1"; shift
  local paths="$*"
  if command -v rg >/dev/null 2>&1; then
    rg -n --no-heading -g '!node_modules' -g '!dist' -g '!build' "$pattern" $paths 2>/dev/null || true
  else
    grep -rnE --include='*.ts' --include='*.mjs' --include='*.js' \
      --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
      "$pattern" $paths 2>/dev/null || true
  fi
}

section "Interpolated SQL identifiers (must be sqlIdent-wrapped)"
RG_OR_GREP 'FROM\s+"\$\{|INTO\s+"\$\{|UPDATE\s+"\$\{|TABLE\s+"\$\{' src/ >> "$OUT_DIR/grep-findings.txt"

section "Query building outside src/deeplake-api.ts (should be centralized)"
RG_OR_GREP '\.query\(\s*`' src/ >> "$OUT_DIR/grep-findings.txt"

section "Token / Bearer / JWT in source"
RG_OR_GREP '(Bearer\s+\$\{|eyJ[A-Za-z0-9._-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|-----BEGIN)' src/ >> "$OUT_DIR/grep-findings.txt"

section "console.* near auth / api / hooks (token-in-logs risk)"
RG_OR_GREP 'console\.(log|error|info|warn)\(' src/deeplake-api.ts src/cli src/commands src/hooks >> "$OUT_DIR/grep-findings.txt"

section "Credential file writes (check explicit 0600/0700 mode)"
RG_OR_GREP '(credentials\.json|\.deeplake)' src/ >> "$OUT_DIR/grep-findings.txt"

section "Capture sites (must honor HIVEMIND_CAPTURE=false)"
RG_OR_GREP 'HIVEMIND_CAPTURE' src/ >> "$OUT_DIR/grep-findings.txt"

section "Org id / scope sourced from input (scope coercion risk)"
RG_OR_GREP '(orgId|org_id|scope)\s*[:=]\s*(toolArgs|args|req|input|params)\.' src/ >> "$OUT_DIR/grep-findings.txt"

section "Runtime-computed paths near the gate (gate bypass risk)"
RG_OR_GREP '(os\.homedir\(\)|process\.env\.HOME)\s*[+,]' src/hooks src/shell >> "$OUT_DIR/grep-findings.txt"

section "Child-process / spawn outside the documented gate-runner bypass"
RG_OR_GREP '(child_process|execFileSync|execSync|spawn\(|exec\(\s*`)' src/ >> "$OUT_DIR/grep-findings.txt"

section "Prototype pollution sinks"
RG_OR_GREP '(Object\.assign\(.*JSON\.parse|_\.merge\(|_\.defaultsDeep\(|_\.mergeWith\()' src/ >> "$OUT_DIR/grep-findings.txt"

echo "  -> $OUT_DIR/grep-findings.txt"

# ----------------------------------------------------------------------------
# 5. Env files review
# ----------------------------------------------------------------------------
hr "5. Environment files summary"
: > "$OUT_DIR/env-summary.txt"
for f in .env .env.local .env.production .env.development .env.example; do
  if [ -f "$f" ]; then
    echo "--- $f (keys only, values stripped) ---" >> "$OUT_DIR/env-summary.txt"
    sed -E 's/=.*/=***/' "$f" >> "$OUT_DIR/env-summary.txt"
    echo "" >> "$OUT_DIR/env-summary.txt"
  fi
done

if git ls-files 2>/dev/null | grep -qE '^\.env(\.|$)' ; then
  echo "WARNING: .env* file(s) tracked by git:" >> "$OUT_DIR/env-summary.txt"
  git ls-files | grep -E '^\.env(\.|$)' >> "$OUT_DIR/env-summary.txt"
fi
echo "  -> $OUT_DIR/env-summary.txt"

# ----------------------------------------------------------------------------
# 6. SQL guard integrity (src/utils/sql.ts)
# ----------------------------------------------------------------------------
hr "6. SQL guard integrity check"
: > "$OUT_DIR/sql-guards.txt"
if [ -f src/utils/sql.ts ]; then
  echo "--- src/utils/sql.ts guard signatures ---" >> "$OUT_DIR/sql-guards.txt"
  grep -nE 'export function (sqlStr|sqlLike|sqlIdent)|A-Za-z_' src/utils/sql.ts >> "$OUT_DIR/sql-guards.txt" 2>/dev/null || true
  if grep -q 'A-Za-z_\]\[a-zA-Z0-9_' src/utils/sql.ts 2>/dev/null || grep -q '\[a-zA-Z_\]\[a-zA-Z0-9_\]' src/utils/sql.ts 2>/dev/null; then
    echo "  sqlIdent regex looks intact" >> "$OUT_DIR/sql-guards.txt"
  else
    echo "  WARNING: confirm sqlIdent regex still rejects anything outside [A-Za-z_][A-Za-z0-9_]*" >> "$OUT_DIR/sql-guards.txt"
  fi
else
  echo "src/utils/sql.ts not found - confirm escaping layer location" >> "$OUT_DIR/sql-guards.txt"
fi
echo "  -> $OUT_DIR/sql-guards.txt"

hr "scan.sh complete - outputs in $OUT_DIR/"
exit 0
