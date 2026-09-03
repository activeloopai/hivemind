# Modern CLI Tools - Research Note

**Source type:** community synthesis
**Authority:** high
**Relevance:** primary
**Date fetched:** 2026-05-20
**Queries used:** "Modern CLI tools ripgrep fd fzf bat eza zoxide 2026"

---

## ripgrep (rg)

- Version 14.x as of 2026; actively maintained by BurntSushi.
- Key flags: `--type`, `--glob`, `--hidden`, `--no-ignore`, `--multiline`, `-A/-B/-C` (context), `--json` (machine-readable).
- `.ripgreprc` file supports persistent config (set `--type-add`, `--smart-case`, etc.).
- Respects `.gitignore`, `.ignore`, `.rgignore` by default - use `--no-ignore` to disable.
- **Gotcha:** does NOT search hidden files by default; add `--hidden` or set in `.ripgreprc`.

## fd

- Version 10.x; replaces `find` for interactive use.
- Simpler syntax: `fd PATTERN [PATH]` vs `find PATH -name PATTERN`.
- Runs in parallel by default, respects `.gitignore`.
- **Gotcha:** skips hidden files by default; use `-H` flag or `--hidden`.
- `fd -x` executes a command per match (like `find -exec`) with parallel execution.

## fzf

- Version 0.50+; interactive fuzzy finder.
- Shell integration: `CTRL-R` (history), `CTRL-T` (file picker), `ALT-C` (cd).
- `--preview` spawns a subshell - use `bat --color=always {}` for syntax-highlighted preview.
- `FZF_DEFAULT_COMMAND` env var controls the source (default: `find`; recommend `fd --type f`).
- **Gotcha:** `--preview` is CPU-intensive; add `--preview-window=hidden` to toggle on demand.

## bat

- Version 0.24+; syntax-highlighted `cat` replacement.
- `bat FILE` shows line numbers and syntax highlighting.
- **Pipe-safe flags:** `bat --plain --no-pager FILE` or use `batcat` on Debian/Ubuntu.
- Supports a `~/.config/bat/config` for persistent options.
- `bat --list-themes` shows available themes; `--theme=TwoDark` is popular in dark terminals.

## eza

- Successor to `exa` (which was archived); community-maintained.
- `eza --long --git` shows git status per file in `ls -l` output.
- `eza --tree --level=2` is a safer `tree` alternative.
- **Gotcha:** not in all distro package managers yet; install via cargo or direct binary download.

## zoxide

- Version 0.9+; smart `cd` that learns frequently-visited directories.
- Init: `eval "$(zoxide init bash)"` / `zsh` / `fish` - adds `z` command and optionally `cd` override.
- `z partial_path` fuzzes across visited dirs; `zi` drops into fzf for interactive selection.
- **Gotcha:** first-time use requires building a visits database - directories must be visited at least once before `z` can jump to them.

## Recommended aliases (all shells)

```sh
alias grep='rg'
alias find='fd'
alias cat='bat --plain --no-pager'
alias ls='eza'
alias ll='eza --long --git'
alias la='eza --long --all --git'
```
