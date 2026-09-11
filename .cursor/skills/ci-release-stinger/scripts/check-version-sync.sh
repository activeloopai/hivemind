#!/usr/bin/env bash
# check-version-sync.sh - verify every harness manifest version matches root package.json.
#
# The version is single-sourced: root package.json -> sync-versions.mjs -> harness
# manifests -> esbuild `define`. A mismatch in a committed tree means someone hand-edited
# a manifest or skipped the build. See guides/02-sync-versions.md.
#
# Usage:
#   bash scripts/check-version-sync.sh           # checks the repo at CWD
#   bash scripts/check-version-sync.sh /path/to/repo
#
# Exit 0 = all match. Exit 1 = drift. Requires node.
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

[ -f package.json ] || { echo "no package.json at $ROOT"; exit 1; }
SRC="$(node -e 'console.log(require("./package.json").version)')"
echo "root package.json version: $SRC"
echo "== checking harness / plugin manifests =="

fail=0

# Find candidate manifests that carry a version (json manifests under harnesses + .claude-plugin).
mapfile -t MANIFESTS < <(find harnesses .claude-plugin -type f \
  \( -name "package.json" -o -name "*.plugin.json" -o -name "plugin.json" \) 2>/dev/null | sort -u)

for m in "${MANIFESTS[@]}"; do
  [ -e "$m" ] || continue
  v="$(node -e "try{const j=require('./$m');console.log(j.version||'')}catch(e){console.log('')}")"
  [ -z "$v" ] && continue   # manifest carries no version field
  if [ "$v" = "$SRC" ]; then
    echo "  OK    $m  ($v)"
  else
    echo "  DRIFT $m  ($v != $SRC)"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "FINDING: version drift. Bump root package.json and run \`npm run build\` (prebuild syncs). Never hand-edit a manifest version."
  exit 1
fi
echo "All manifests match root."
