# Modern CLI Tools Guide

The 6-tool replacement matrix and installation/configuration instructions for each.

Source: `research/external/01-modern-cli-tools.md`

See also: `examples/happy-path.md` for the full bootstrap script.

---

## The replacement matrix

| Legacy | Modern | Install | Key gotcha |
|---|---|---|---|
| `grep` | `rg` (ripgrep) | `brew install ripgrep` / `apt install ripgrep` | Ignores hidden files; respects `.gitignore` - use `--hidden --no-ignore` to bypass |
| `find` | `fd` | `brew install fd` / `apt install fd-find` (binary: `fdfind` on Debian) | Skips dotfiles; use `-H` flag |
| `cat` | `bat` | `brew install bat` / `apt install bat` (binary: `batcat` on Debian) | Not drop-in for pipes; use `--plain --no-pager` |
| `ls` | `eza` | `brew install eza` / `cargo install eza` | May not be in distro repos; use `--icons` only in terminals that support Nerd Fonts |
| `cd` | `zoxide` | `brew install zoxide` / `cargo install zoxide` | Needs visit history; `z dir` fails if dir never visited |
| `Ctrl-R` | `fzf` | `brew install fzf` / `apt install fzf` | `--preview` is CPU-intensive; use `FZF_DEFAULT_COMMAND='fd --type f'` to replace the default `find` source |

---

## Shell init snippets

Add to `.bashrc` / `.zshrc` / `config.fish`:

### Bash

```bash
# fzf
eval "$(fzf --bash)"
export FZF_DEFAULT_COMMAND='fd --type f --hidden --exclude .git'
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'

# zoxide
eval "$(zoxide init bash)"

# Starship prompt
eval "$(starship init bash)"

# Aliases
alias grep='rg'
alias find='fd'
alias ls='eza'
alias ll='eza --long --git'
alias la='eza --long --all --git'
alias cat='bat --plain --no-pager'
```

### Zsh

```zsh
# fzf
eval "$(fzf --zsh)"
export FZF_DEFAULT_COMMAND='fd --type f --hidden --exclude .git'

# zoxide
eval "$(zoxide init zsh)"

# Starship
eval "$(starship init zsh)"

# Aliases (same as bash)
alias grep='rg'
alias ls='eza'
alias ll='eza --long --git'
```

### Fish

```fish
# fzf (add to config.fish)
fzf --fish | source
set -x FZF_DEFAULT_COMMAND 'fd --type f --hidden --exclude .git'

# zoxide
zoxide init fish | source

# Starship
starship init fish | source

# Abbreviations (Fish uses abbr instead of alias)
abbr -a grep rg
abbr -a ls eza
abbr -a ll 'eza --long --git'
```

---

## bat configuration

Create `~/.config/bat/config`:

```
--theme=TwoDark
--style=numbers,changes,header
--pager=less -FR
```

Pipe-safe alias (preserves syntax highlighting in less):
```bash
alias bat='bat --color=always'
alias batp='bat --plain --no-pager'
```

---

## ripgrep configuration

Create `~/.ripgreprc` and set `RIPGREP_CONFIG_PATH=~/.ripgreprc`:

```
# Default: search hidden files
--hidden
# Case-insensitive unless pattern has uppercase
--smart-case
# Show context lines
--context=2
# Skip .git directory
--glob=!.git
```

---

## fzf preview with bat

```bash
# Use bat for syntax-highlighted file preview
export FZF_DEFAULT_OPTS="
  --preview 'bat --color=always --style=numbers --line-range=:500 {}'
  --preview-window=right:60%:wrap
"
```
