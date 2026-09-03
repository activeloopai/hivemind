# Shell Scripting Guide

Safety patterns, quoting rules, error handling, and dotfile architecture for Bash scripts.

Source: `research/external/02-bash-scripting-patterns.md`

See also: `templates/bash-script-template.sh` for the skeleton, `examples/script-review.md` for a worked review.

---

## The essential safety preamble

Every non-interactive Bash script starts with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

- `-e`: exit immediately on non-zero command exit code.
- `-u`: treat unset variables as errors (catches typos in `$VARNAME`).
- `-o pipefail`: propagate failures through pipelines (`false | true` would otherwise exit 0).

**POSIX note:** `-u` and `-o pipefail` are not POSIX; for `sh` scripts omit them and handle errors manually.

---

## Quoting rules (critical)

| Pattern | Status | Reason |
|---|---|---|
| `"$var"` | Correct | Prevents word-splitting and globbing |
| `$var` | Dangerous | Splits on whitespace, expands globs |
| `"$(command)"` | Correct | Same - command substitution output needs quoting |
| `"${arr[@]}"` | Correct | Expands each array element as a separate word |
| `${#arr[@]}` | Correct | Array length; no quoting needed |
| Inside `$((...))` | No quoting | Arithmetic context does not word-split |

Golden rule: **when in doubt, quote**.

---

## Signal trapping and cleanup

```bash
TMPFILE=$(mktemp)

cleanup() {
  rm -f "$TMPFILE"
}

# Run cleanup on any exit, including errors
trap cleanup EXIT

# Also handle Ctrl-C and kill
trap 'echo "Interrupted" >&2; exit 130' INT TERM
```

---

## Argument parsing with getopts

```bash
usage() {
  echo "Usage: $0 [-v] [-o output_file] input_file"
}

VERBOSE=0
OUTFILE=""

while getopts ":hvo:" opt; do
  case $opt in
    h) usage; exit 0 ;;
    v) VERBOSE=1 ;;
    o) OUTFILE="$OPTARG" ;;
    :) echo "Error: -$OPTARG requires an argument." >&2; exit 1 ;;
    \?) echo "Error: Unknown option -$OPTARG" >&2; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

# Remaining positional args are in "$@"
if [[ $# -lt 1 ]]; then
  echo "Error: input_file required" >&2
  usage >&2
  exit 1
fi

INPUT_FILE="$1"
```

---

## Local variables in functions

Always declare local variables with `local`:

```bash
process_file() {
  local filepath="$1"
  local result
  result=$(wc -l < "$filepath")
  echo "$result"
}
```

Without `local`, variables leak into the global scope.

---

## Checking command existence

```bash
require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: '$1' is not installed or not in PATH." >&2
    echo "Install it: $2" >&2
    exit 1
  fi
}

require_cmd rg   "brew install ripgrep"
require_cmd fd   "brew install fd"
require_cmd just "brew install just"
```

---

## Dotfile architecture

### XDG base directories

```bash
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
```

Prefer `$XDG_CONFIG_HOME/toolname/` over tool-specific dotfiles in `$HOME`.

### Idempotent bootstrap pattern

```bash
#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="${DOTFILES_DIR:-$HOME/.dotfiles}"

# Idempotent symlink
link() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then
    return 0  # already linked correctly
  fi
  ln -sfn "$src" "$dst"
  echo "Linked: $dst -> $src"
}

link "$DOTFILES_DIR/zsh/.zshrc"     "$HOME/.zshrc"
link "$DOTFILES_DIR/tmux/tmux.conf" "$HOME/.config/tmux/tmux.conf"
link "$DOTFILES_DIR/git/.gitconfig" "$HOME/.gitconfig"
```

### Recommended dotfiles structure

```
~/.dotfiles/
├── bootstrap.sh           (idempotent setup script)
├── env.sh                 (shell-agnostic env vars, sourced by all shells)
├── bash/
│   ├── .bashrc
│   └── .bash_profile
├── zsh/
│   ├── .zshrc
│   └── .zshenv
├── fish/
│   └── config.fish
├── tmux/
│   └── tmux.conf
├── git/
│   └── .gitconfig
└── tools/
    ├── .ripgreprc
    └── starship.toml
```
