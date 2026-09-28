# Shell Audit Guide

How to audit an existing shell configuration file (`.bashrc`, `.zshrc`, `config.fish`).

Sources: `research/external/02-bash-scripting-patterns.md`, `research/internal/01-command-brief.md`

See also: `examples/happy-path.md` for a worked dotfile setup from scratch.

---

## Step 1 - Identify the shell and version

```bash
echo "$SHELL"          # current shell path
bash --version         # Bash version
zsh --version          # Zsh version
fish --version         # Fish version
```

Flag if the developer is on macOS Bash 3.2 (Apple ships this for licensing reasons). Recommend `brew install bash` and setting it as default.

## Step 2 - Check for the critical anti-patterns

Scan the config file for these red flags:

| Anti-pattern | Why it's a problem | Fix |
|---|---|---|
| `export PATH=$HOME/bin:$PATH` | Unquoted; word-splits on spaces in path | `export PATH="$HOME/bin:$PATH"` |
| `alias grep=grep --color` | Unquoted alias with flags | `alias grep='grep --color=auto'` |
| `source ~/.aliases 2>/dev/null` | Silent failure hides missing file | `[[ -f ~/.aliases ]] && source ~/.aliases` |
| `. ~/scripts/setup` | `source` preferred over `.` in Bash | `source ~/scripts/setup` |
| Duplicate PATH additions | Accumulates on each shell open | Add idempotency guard (see `guides/00-principles.md`) |
| `cd /some/path` at top level | Changes directory on shell start | Move to a function or alias |

## Step 3 - Check init snippet completeness for modern tools

For each modern CLI tool the developer has installed, verify the init snippet is present:

```bash
# ripgrep: no init snippet needed (it's just an alias)
# fd: no init snippet needed
# fzf
eval "$(fzf --zsh)"           # Zsh
eval "$(fzf --bash)"          # Bash
fzf --fish | source           # Fish

# zoxide
eval "$(zoxide init zsh)"     # Zsh
eval "$(zoxide init bash)"    # Bash
zoxide init fish | source     # Fish

# Starship
eval "$(starship init zsh)"   # Zsh
eval "$(starship init bash)"  # Bash
starship init fish | source   # Fish
```

## Step 4 - Check environment variable hygiene

- `HISTSIZE` and `HISTFILESIZE` should be large (≥10000) for useful history.
- `HISTCONTROL=ignoredups:erasedups` to deduplicate history.
- `EDITOR` and `VISUAL` should be set (needed by git, etc.).
- Sensitive secrets must NOT be in dotfiles - they belong in a secrets manager or `.env` (gitignored).

## Step 5 - Produce the audit report

Use `templates/findings-report.md` as the output shape. Summarize:
- Shell version and OS
- Critical anti-patterns found (severity: high/medium/low)
- Missing tool init snippets
- Environment variable gaps
- Recommended actions with copy-paste fixes
