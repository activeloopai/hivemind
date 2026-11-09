# Tmux and Zellij - Research Note

**Source type:** community synthesis
**Authority:** high
**Relevance:** primary
**Date fetched:** 2026-05-20
**Queries used:** "Tmux Zellij terminal multiplexer dotfiles 2026"

---

## Tmux (3.4)

### Minimal .tmux.conf

```bash
# Change prefix from C-b to C-a (screen-compatible)
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# Enable mouse support
set -g mouse on

# Increase history
set -g history-limit 50000

# Start windows and panes at 1 (not 0)
set -g base-index 1
setw -g pane-base-index 1

# Use vi keys in copy mode
setw -g mode-keys vi

# Enable true color
set -g default-terminal "screen-256color"
set -ga terminal-overrides ",*256col*:Tc"

# Reload config
bind r source-file ~/.tmux.conf \; display "Config reloaded"

# Intuitive split bindings
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
```

### Plugin management (TPM)

```bash
# Install TPM: git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'tmux-plugins/tmux-resurrect'   # session persistence
set -g @plugin 'tmux-plugins/tmux-continuum'   # auto-save

run '~/.tmux/plugins/tpm/tpm'
```

## Zellij (0.40+)

- Config location: `~/.config/zellij/config.kdl`
- Uses KDL (Kuriously Designed Language) format.

### Minimal config.kdl

```kdl
// Change keybindings
keybinds {
    normal {
        bind "Ctrl a" { SwitchToMode "tmux"; }
    }
}

// Layout: default is "default", can use "compact", "disable-status-bar"
default_layout "compact"

// Copy command (system clipboard)
copy_command "xclip -selection clipboard"  // Linux
// copy_command "pbcopy"  // macOS
```

## Comparison

| Feature | tmux | Zellij |
|---|---|---|
| Config format | `.tmux.conf` (bash-like) | `config.kdl` (KDL) |
| Plugin manager | TPM (manual install) | Built-in |
| Session persistence | via tmux-resurrect | via zjstatus plugin |
| Learning curve | Steep (many modes, key chords) | Gentler (status bar guidance) |
| Scripting support | Mature (`tmux list-sessions`, etc.) | Limited (newer) |
| Best for | Power users, existing muscle memory | New users, modern setups |

## Dotfile pattern for both

Store configs at:
- tmux: `~/.config/tmux/tmux.conf` (symlinked to `~/.tmux.conf`)
- Zellij: `~/.config/zellij/config.kdl`

Use a bootstrap script that symlinks from a dotfiles repo.
