# Tmux and Zellij Guide

Configuration, plugins, session management, and the decision matrix for choosing between tmux and Zellij.

Source: `research/external/03-tmux-zellij.md`

See also: `examples/happy-path.md` for a full tmux setup walkthrough.

---

## Decision matrix

| Factor | Favor tmux | Favor Zellij |
|---|---|---|
| Experience level | Power user, existing muscle memory | New to multiplexers |
| Scripting needs | Strong (tmux CLI is scriptable) | Weaker (newer API) |
| Config format preference | Script-like `.tmux.conf` | Declarative KDL |
| Plugin ecosystem | Mature (TPM, resurrect, etc.) | Growing (built-in plugin support) |
| Sharing sessions | `tmux attach -t session` is universal | Less universal |
| Team standard | Established tmux configs in dotfiles | Greenfield setup |

---

## tmux (3.4+)

### Minimal production `.tmux.conf`

```bash
# Prefix: C-a (screen-compatible; easier to reach than C-b)
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# Mouse support
set -g mouse on

# History
set -g history-limit 100000

# Window/pane numbering from 1
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on

# Vi keys in copy mode
setw -g mode-keys vi
bind -T copy-mode-vi v send -X begin-selection
bind -T copy-mode-vi y send -X copy-selection-and-cancel

# True color
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*256col*:Tc"

# Intuitive splits that inherit current path
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %

# Quick window navigation
bind -n M-Left  select-pane -L
bind -n M-Right select-pane -R
bind -n M-Up    select-pane -U
bind -n M-Down  select-pane -D

# Reload config
bind r source-file ~/.tmux.conf \; display "Config reloaded"

# TPM plugins
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'

set -g @continuum-restore 'on'
set -g @resurrect-capture-pane-contents 'on'

run '~/.tmux/plugins/tpm/tpm'
```

### Installing TPM

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
# Then in tmux: prefix + I to install plugins
```

### Useful tmux commands

```bash
tmux new -s mysession         # new named session
tmux attach -t mysession      # attach to session
tmux ls                        # list sessions
tmux kill-session -t mysession # kill session
prefix + d                     # detach from session
prefix + s                     # session picker
prefix + w                     # window picker
```

---

## Zellij (0.40+)

### Minimal `~/.config/zellij/config.kdl`

```kdl
// Change to a compact status bar
default_layout "compact"

// Set scrollback limit
scroll_buffer_size 50000

// Copy to system clipboard
copy_command "pbcopy"  // macOS
// copy_command "xclip -selection clipboard"  // Linux

// Disable mouse mode if it conflicts with terminal selections
// mouse_mode false

// Key bindings (example: remap to tmux-like prefix)
keybinds {
    normal {
        bind "Ctrl a" { SwitchToMode "tmux"; }
    }
    tmux {
        bind "\"" { NewPane "Down"; SwitchToMode "Normal"; }
        bind "%" { NewPane "Right"; SwitchToMode "Normal"; }
        bind "d" { Detach; }
        bind "s" { SwitchToMode "session"; }
    }
}
```

### Zellij layout file

Save as `~/.config/zellij/layouts/dev.kdl`:

```kdl
layout {
    pane size=1 borderless=true {
        plugin location="zellij:tab-bar"
    }
    pane split_direction="vertical" {
        pane {
            name "editor"
        }
        pane split_direction="horizontal" size="40%" {
            pane {
                name "terminal"
            }
            pane {
                name "git"
                command "lazygit"
            }
        }
    }
    pane size=2 borderless=true {
        plugin location="zellij:status-bar"
    }
}
```

Start with layout: `zellij --layout dev`

---

## Session persistence comparison

| Approach | tmux | Zellij |
|---|---|---|
| Plugin | tmux-resurrect + tmux-continuum | zjstatus plugin |
| Auto-save | tmux-continuum saves every 15 min | Manual or via plugin |
| Restore on start | `@continuum-restore 'on'` | Plugin-dependent |
