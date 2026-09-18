#!/usr/bin/env bash
# ==============================================================================
# SCRIPT NAME: {script-name}.sh
# PURPOSE: {one-line description}
# USAGE: ./{script-name}.sh [-v] [-o output] input_file
# AUTHOR: {author}
# CREATED: {YYYY-MM-DD}
# ==============================================================================
set -euo pipefail

# ── Constants ──────────────────────────────────────────────────────────────────
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename "$0")"

# ── Defaults ──────────────────────────────────────────────────────────────────
VERBOSE=0
OUTFILE=""

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
  cat <<-USAGE
    Usage: $SCRIPT_NAME [OPTIONS] input_file

    Options:
      -h    Show this help message
      -v    Enable verbose output
      -o    Output file (default: stdout)

    Examples:
      $SCRIPT_NAME -v input.txt
      $SCRIPT_NAME -o output.txt input.txt
  USAGE
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
TMPFILE=""

cleanup() {
  [[ -n "$TMPFILE" && -f "$TMPFILE" ]] && rm -f "$TMPFILE"
}

trap cleanup EXIT
trap 'echo "Interrupted" >&2; exit 130' INT TERM

# ── Logging ───────────────────────────────────────────────────────────────────
log() {
  echo "[${SCRIPT_NAME}] $*" >&2
}

debug() {
  [[ $VERBOSE -eq 1 ]] && log "DEBUG: $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

# ── Dependency checks ─────────────────────────────────────────────────────────
require_cmd() {
  command -v "$1" &>/dev/null || die "'$1' is not installed. Install: $2"
}

# Uncomment the tools this script needs:
# require_cmd rg    "brew install ripgrep"
# require_cmd fd    "brew install fd"
# require_cmd just  "brew install just"

# ── Argument parsing ──────────────────────────────────────────────────────────
while getopts ":hvo:" opt; do
  case $opt in
    h) usage; exit 0 ;;
    v) VERBOSE=1 ;;
    o) OUTFILE="$OPTARG" ;;
    :) die "Option -$OPTARG requires an argument." ;;
    \?) die "Unknown option: -$OPTARG" ;;
  esac
done
shift $((OPTIND - 1))

# Validate required positional args
if [[ $# -lt 1 ]]; then
  echo "Error: input_file is required." >&2
  usage >&2
  exit 1
fi

INPUT_FILE="$1"

[[ -f "$INPUT_FILE" ]] || die "File not found: $INPUT_FILE"

# ── Main logic ────────────────────────────────────────────────────────────────
main() {
  TMPFILE=$(mktemp)
  debug "Working in $TMPFILE"

  # TODO: implement main logic here
  log "Processing $INPUT_FILE"

  if [[ -n "$OUTFILE" ]]; then
    # Write to file
    : > "$OUTFILE"  # truncate/create
    log "Output written to $OUTFILE"
  fi
}

main "$@"
