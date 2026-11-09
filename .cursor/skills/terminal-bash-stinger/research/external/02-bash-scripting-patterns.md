# Bash Scripting Patterns - Research Note

**Source type:** community synthesis
**Authority:** high
**Relevance:** primary
**Date fetched:** 2026-05-20
**Queries used:** "Shell scripting Bash patterns error handling 2026"

---

## The safety trio

Every non-interactive Bash script should start with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

- `set -e`: exit on any command returning non-zero.
- `set -u`: treat unset variables as errors.
- `set -o pipefail`: propagate failures through pipes (without this, `false | true` exits 0).

**POSIX note:** `-o pipefail` is Bash/ksh-specific. POSIX `sh` scripts must use explicit exit code capture instead.

## Quoting rules

- Quote every variable: `"$var"` not `$var`.
- Quote command substitutions: `"$(command)"`.
- Use arrays when passing variable argument lists: `"${arr[@]}"`.
- **Exception:** arithmetic: `$(( $a + $b ))` - no quoting needed inside `$((...))`.

## Signal trapping

```bash
cleanup() {
  # Remove temp files, kill background jobs
  rm -f "$TMPFILE"
}
trap cleanup EXIT          # runs on any exit (clean or error)
trap 'cleanup; exit 1' INT TERM  # runs on Ctrl-C or kill
```

## Argument parsing with getopts

```bash
while getopts ":hvo:" opt; do
  case $opt in
    h) usage; exit 0 ;;
    v) VERBOSE=1 ;;
    o) OUTFILE="$OPTARG" ;;
    :) echo "Option -$OPTARG requires an argument." >&2; exit 1 ;;
    \?) echo "Unknown option: -$OPTARG" >&2; exit 1 ;;
  esac
done
shift $((OPTIND - 1))
```

## Local variables in functions

```bash
my_function() {
  local result
  result=$(some_command)
  echo "$result"
}
```

## Heredoc hygiene

```bash
# Use <<- to allow indented heredoc content (strips leading tabs)
cat <<-EOF
	Line 1
	Line 2
EOF
```

## Checking command existence

```bash
if ! command -v rg &>/dev/null; then
  echo "ripgrep is not installed" >&2
  exit 1
fi
```

## shellcheck integration

- Run `shellcheck script.sh` before committing any shell script.
- Add as a GitHub Actions step: `uses: ludeeus/action-shellcheck@master`.
- Common suppressions (use sparingly): `# shellcheck disable=SC2034` for unused-by-design variables.
- Key rules: SC2086 (double-quote), SC2164 (cd without checking), SC2155 (declare and assign separately).
