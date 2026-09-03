# Happy Path - Terminal Productivity Setup from Scratch

A worked example of `terminal-bash-worker-bee` setting up a complete terminal productivity environment on a new macOS machine.

Demonstrates: shell config, modern CLI tool adoption, tmux, just, Starship prompt.

References: `guides/00-principles.md`, `guides/01-shell-audit.md`, `guides/02-modern-cli-tools.md`, `guides/03-shell-scripting.md`, `guides/04-tmux-zellij.md`, `guides/05-task-automation.md`

---

## Input

Developer says: "I just got a new Mac. I want to set up a productive terminal environment with modern tools. I use Zsh and vim, and I usually work on Node.js projects."

## Bee's procedure

### 1. Audit current state

```bash
echo $SHELL         # /bin/zsh
zsh --version       # zsh 5.9
cat ~/.zshrc        # minimal, mostly empty
```

Finding: Zsh 5.9 (good - ships with macOS 14+). `.zshrc` has only a PATH addition, no modern tools.

### 2. Install modern CLI tools via Homebrew

```bash
brew install \
  ripgrep \
  fd \
  fzf \
  bat \
  eza \
  zoxide \
  just \
  tmux \
  starship
```

### 3. Configure ~/.zshrc

```zsh
# ~/.zshrc

# XDG base dirs
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

# PATH additions (idempotent)
[[ ":$PATH:" != *":/usr/local/bin:"* ]] && export PATH="/usr/local/bin:$PATH"

# History
HISTSIZE=50000
SAVEHIST=50000
HISTFILE="$HOME/.zsh_history"
setopt HIST_IGNORE_DUPS
setopt HIST_VERIFY
setopt SHARE_HISTORY

# Modern CLI tool init
eval "$(fzf --zsh)"
eval "$(zoxide init zsh)"
eval "$(starship init zsh)"

export FZF_DEFAULT_COMMAND='fd --type f --hidden --exclude .git'
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'

# Aliases
alias grep='rg'
alias ls='eza'
alias ll='eza --long --git'
alias la='eza --long --all --git'
alias cat='bat --plain --no-pager'

# Source local config if present
[[ -f "$HOME/.zshrc.local" ]] && source "$HOME/.zshrc.local"
```

### 4. Set up Starship prompt

```bash
mkdir -p ~/.config
cat > ~/.config/starship.toml <<'EOF'
format = """
$directory\
$git_branch\
$git_status\
$nodejs\
$cmd_duration\
$line_break\
$character"""

[directory]
truncation_length = 3

[git_branch]
symbol = " "

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"
EOF
```

### 5. Set up tmux

```bash
mkdir -p ~/.config/tmux
cat > ~/.config/tmux/tmux.conf <<'EOF'
# Prefix
unbind C-b
set -g prefix C-a
bind C-a send-prefix

set -g mouse on
set -g history-limit 100000
set -g base-index 1
setw -g pane-base-index 1

# Splits
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"

# Reload
bind r source-file ~/.config/tmux/tmux.conf \; display "Reloaded"

# TPM
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'tmux-plugins/tmux-resurrect'
run '~/.tmux/plugins/tpm/tpm'
EOF

ln -sfn ~/.config/tmux/tmux.conf ~/.tmux.conf

# Install TPM
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

### 6. Set up justfile for the TypeScript/Node project

```bash
cat > justfile <<'EOF'
set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load

default:
    @just --list

## Install dependencies
install:
    npm ci

## Build (tsc types + esbuild bundle)
build:
    npm run build

## Test
test *args:
    npx vitest run {{args}}

## Quality gate (tsc --noEmit + duplication)
check:
    npm run typecheck
    npx jscpd src

## Clean
clean:
    rm -rf dist node_modules coverage

## CI: quality gate + test + build
ci: check test build
EOF
```

## Output

Bee delivers the above configurations as a findings report plus copy-paste snippets. Developer runs the install commands and copies in the config files. On restarting Zsh, all six modern tools are active, tmux has session persistence, and the justfile provides a self-documenting task runner.

**Gotchas surfaced:**
- `bat` on macOS is installed as `bat` (not `batcat` - that's Debian).
- `eza --icons` requires a Nerd Font terminal; add `--no-icons` if icons render as boxes.
- After installing zoxide, the `z` command 