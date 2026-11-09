---
name: terminal-bash-stinger
description: Terminal productivity specialist - Bash/Zsh/Fish configuration, modern CLI tools (ripgrep, fd, fzf, bat, eza, zoxide), shell scripting best practices, dotfile architecture, tmux/Zellij setup, and just/make task automation. Use when the user says "improve my dotfiles", "review this shell script", "set up tmux", "modern CLI tools", "bash best practices", "just vs make", or "help me with my terminal setup". Do NOT use for CI/CD pipelines running in containers (ci-release-worker-bee) or TypeScript/Node build and packaging (typescript-node-worker-bee).
---

# terminal-bash Stinger

The procedural arsenal for `terminal-bash-worker-bee`. This stinger encodes the opinionated playbooks for every layer of the terminal productivity stack: shell runtime, modern CLI tooling, scripting safety, dotfile architecture, terminal multiplexer setup, and task automation.

**When invoked, read `SKILL.md` first, then the relevant guide(s) for the task at hand. Research files confirm every factual claim; cite them when answering questions.**

---

## Scope and non-scope

**In scope:**
- Bash, Zsh, Fish shell configuration and migration
- Modern CLI tool adoption: ripgrep, fd, fzf, bat, eza, zoxide
- Shell scripting: safety patterns, quoting, error handling, trapping, getopts
- Dotfile architecture: XDG layout, bootstrap scripts, idempotency
- Terminal multiplexers: tmux 3.4+, Zellij 0.40+
- Task automation: just 1.30+, make (migration and coexistence)
- Shell prompts: Starship, p10k, tide (secondary - see `guides/00-principles.md`)

**Not in scope:**
- CI/CD pipelines running inside containers -> ci-release-worker-bee
- TypeScript/Node build and packaging (`tsconfig.json`, `esbuild`, npm publish) -> typescript-node-worker-bee
- OS-level system administration beyond a developer workstation

---

## Seven-action playbook

The Bee performs seven distinct actions. Each maps to a guide:

| Action | Guide |
|---|---|
| Audit shell configuration | `guides/01-shell-audit.md` |
| Adopt modern CLI tools | `guides/02-modern-cli-tools.md` |
| Review and fix shell scripts | `guides/03-shell-scripting.md` |
| Design dotfile structure | `guides/03-shell-scripting.md` (dotfile section) |
| Set up tmux or Zellij | `guides/04-tmux-zellij.md` |
| Set up or migrate task automation | `guides/05-task-automation.md` |
| Author findings report | `templates/findings-report.md` |

---

## Critical directives (from Command Brief)

These are non-negotiables. Full justifications in `guides/00-principles.md`.

1. **Check portability first.** Before writing Bash-specific syntax, determine whether the script must run on POSIX `sh`. Always ask or default to POSIX-safe unless context is clearly Bash-only.
2. **Never `set -e` alone.** The full trio is `set -euo pipefail`. Half-measures leave pipeline failures and unbound variables silent.
3. **Quote every variable expansion.** `"$var"` not `$var`. Exception: arithmetic contexts `$((...))`.
4. **Explain tool trade-offs.** ripgrep ignores hidden files by default. fd skips dotfiles. bat is not a drop-in pipe replacement. Always surface the gotcha when recommending.
5. **Keep dotfile changes idempotent.** Bootstrap scripts run repeatedly; source-guarding and `mkdir -p` patterns prevent accumulation.
6. **Escalate container scripts to ci-release-worker-bee.** Container environments may have different shell versions and missing tools. Overlapping silently produces fragile CI.

---

## Folder layout

```text
terminal-bash-stinger/
├── SKILL.md                       (this file - master index)
├── README.md                      (human overview)
├── guides/
│   ├── 00-principles.md           (portability tiers, escalation rules, shellcheck policy)
│   ├── 01-shell-audit.md          (how to audit .bashrc/.zshrc/config.fish)
│   ├── 02-modern-cli-tools.md     (replacement matrix + init snippets)
│   ├── 03-shell-scripting.md      (set -euo pipefail, quoting, traps, dotfiles)
│   ├── 04-tmux-zellij.md          (config, plugins, session persistence)
│   └── 05-task-automation.md      (just vs make, justfile patterns)
├── examples/
│   ├── happy-path.md              (full dotfile setup from scratch)
│   └── script-review.md          (review of a real-world shell script)
├── templates/
│   ├── bash-script-template.sh    (safe Bash script skeleton)
│   ├── justfile-template.md       (documented justfile starter)
│   └── findings-report.md        (report shape for terminal audits)
├── reports/
│   └── README.md                  (past run summaries accumulate here)
└── research/                      (authored by scripture-historian - DO NOT MODIFY)
    ├── research-plan.md
    ├── research-summary.md
    ├── index.md
    ├── internal/
    └── external/
```

---

## Quick reference: the modern CLI stack

| Legacy | Modern | Key gotcha |
|---|---|---|
| `grep` | `rg` (ripgrep) | Ignores hidden files by default; use `--hidden` |
| `find` | `fd` | Skips dotfiles by default; use `-H` |
| `cat` | `bat` | Not a drop-in for pipes; use `--plain --no-pager` |
| `ls` | `eza` | Not in all distro repos; may need cargo install |
| `cd` | `zoxide` | Requires visit-history; `z` won't work on unvisited dirs |
| `Ctrl-R` | `fzf` | Preview spawns subshell; expensive in large repos |

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
