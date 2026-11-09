#!/usr/bin/env bash
# audit-workflow.sh - static audit of Hivemind's GitHub Actions workflows.
#
# Catches: actions pinned to a floating major or @main (not a fixed version/SHA),
# a floating node-version, a workflow with no `permissions:` block, and obvious
# secret echoing in run steps. See guides/04-workflows.md.
#
# Usage:
#   bash scripts/audit-workflow.sh               # audits .github/workflows/
#   bash scripts/audit-workflow.sh path/to/dir
#
# Exit 0 = clean. Exit 1 = findings.
set -euo pipefail

DIR="${1:-.github/workflows}"
[ -d "$DIR" ] || { echo "no workflow dir at $DIR"; exit 1; }
fail=0

for wf in "$DIR"/*.y*ml; do
  [ -e "$wf" ] || continue
  echo "== $wf =="

  # Actions pinned to a floating major (@v6) or @main / @master.
  if grep -nE 'uses:\s*[^@]+@(main|master)\b' "$wf" >/dev/null; then
    echo "  MUST-FIX: action pinned to @main/@master:"
    grep -nE 'uses:\s*[^@]+@(main|master)\b' "$wf" | sed 's/^/    /'
    fail=1
  fi
  if grep -nE 'uses:\s*[^@]+@v[0-9]+\s*$' "$wf" >/dev/null; then
    echo "  SHOULD-REFACTOR: action pinned to a floating major (prefer @vX.Y.Z or @<sha>):"
    grep -nE 'uses:\s*[^@]+@v[0-9]+\s*$' "$wf" | sed 's/^/    /'
  fi

  # Floating node-version (e.g. node-version: latest / lts/* / *).
  if grep -nE 'node-version:\s*(latest|lts/?\*?|\*)' "$wf" >/dev/null; then
    echo "  MUST-FIX: floating node-version:"
    grep -nE 'node-version:\s*(latest|lts/?\*?|\*)' "$wf" | sed 's/^/    /'
    fail=1
  fi

  # No permissions: block anywhere in the file.
  if ! grep -nE '^\s*permissions:' "$wf" >/dev/null; then
    echo "  SHOULD-REFACTOR: no permissions: block (inherits repo default - may be broader than intended)"
  fi

  # Obvious secret echoing.
  if grep -nE 'echo .*\$\{\{\s*secrets\.' "$wf" >/dev/null; then
    echo "  MUST-FIX: a run step appears to echo a secret:"
    grep -nE 'echo .*\$\{\{\s*secrets\.' "$wf" | sed 's/^/    /'
    fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "Clean." || { echo "FINDING: must-fix workflow issues above."; exit 1; }
