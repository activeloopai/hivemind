#!/usr/bin/env bash
# audit-bundle.sh - diff esbuild outputs against the package.json `files` allowlist.
#
# Catches: a bundle esbuild builds (an outdir) that is NOT covered by `files`
# (built-but-unshipped), and a `files` entry that points at nothing real
# (shipped-but-missing). See guides/01-build-and-bundle.md and guides/06-npm-release.md.
#
# Usage:
#   bash scripts/audit-bundle.sh                 # audits the repo at CWD
#   bash scripts/audit-bundle.sh /path/to/repo
#
# Exit 0 = aligned. Exit 1 = findings. Requires node (for JSON parsing).
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

PKG="package.json"
ESB="esbuild.config.mjs"
fail=0

[ -f "$PKG" ] || { echo "no package.json at $ROOT"; exit 1; }
[ -f "$ESB" ] || { echo "no esbuild.config.mjs at $ROOT"; exit 1; }

# esbuild outdirs
mapfile -t OUTDIRS < <(grep -oE 'outdir:\s*"[^"]+"' "$ESB" | sed -E 's/.*"([^"]+)".*/\1/' | sort -u)

# files allowlist (as JSON array via node)
mapfile -t FILES < <(node -e 'const f=require("./package.json").files||[];f.forEach(x=>console.log(x))')

echo "== esbuild outdirs vs files allowlist =="
for od in "${OUTDIRS[@]}"; do
  covered=0
  for f in "${FILES[@]}"; do
    # an outdir is covered if a files entry equals it or is a prefix of it
    case "$od" in
      "$f"|"$f"/*) covered=1; break;;
    esac
  done
  if [ "$covered" -eq 1 ]; then
    echo "  OK    $od"
  else
    echo "  MISS  $od  (built but NOT in files allowlist - will not ship)"
    fail=1
  fi
done

echo "== files allowlist entries pointing at nothing on disk =="
for f in "${FILES[@]}"; do
  if [ ! -e "$f" ]; then
    echo "  WARN  $f  (in files but does not exist - run npm run build first, or it ships nothing)"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "FINDING: at least one esbuild output is not in the files allowlist."
  exit 1
fi
echo "Aligned."
