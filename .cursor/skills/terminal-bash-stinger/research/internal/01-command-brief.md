# Command Brief - Internal Reference

**Source type:** internal
**Authority:** authoritative
**Relevance:** primary
**Date:** 2026-05-20

---

## Scope from Command Brief

This note records the authoritative scope boundaries, ACTION verbs, and CRITICAL DIRECTIVES from the terminal-bash-worker-bee Command Brief at `ai-tools/command-briefs/terminal-bash-worker-bee-command-brief.md`.

### Domain owned

- Shell runtime configuration: Bash, Zsh, Fish
- Modern CLI tool adoption and configuration: ripgrep, fd, fzf, bat, eza, zoxide
- Shell scripting best practices: error handling, signal trapping, quoting, argument parsing
- Dotfile architecture: XDG layout, bootstrap script, per-OS overrides
- Terminal multiplexer setup: tmux, Zellij
- Task automation: just, make

### Domain NOT owned (named handoffs)

- CI/CD pipelines and container shell scripts → ci-release-worker-bee
- TypeScript/Node build and packaging tooling → typescript-node-worker-bee
- OS-level sysadmin beyond developer workstation → out of scope

### Seven ACTION verbs (map to guides)

1. Audit current shell configuration → `guides/01-shell-audit.md`
2. Recommend and configure modern CLI tools → `guides/02-modern-cli-tools.md`
3. Review and fix shell scripts → `guides/03-shell-scripting.md`
4. Design or audit dotfile structure → `guides/03-shell-scripting.md` + brief mention in `guides/00-principles.md`
5. Set up or optimize tmux/Zellij → `guides/04-tmux-zellij.md`
6. Set up or migrate task automation → `guides/05-task-automation.md`
7. Author findings report → `templates/findings-report.md`

### Critical directives (verbatim)

1. Always check portability before writing Bash-specific syntax.
2. Never add `set -e` alone without `-u` and `-o pipefail`.
3. Quote every shell variable expansion unless deliberately word-splitting.
4. Always explain trade-offs when recommending a modern CLI replacement.
5. Keep dotfile changes idempotent.
6. Escalate to ci-release-worker-bee for CI shell steps that run in containers.
