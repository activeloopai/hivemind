# Terminal Bash Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `terminal-bash-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/terminal-bash-worker-bee.md`](../../../agents/terminal-bash-worker-bee.md)
**Stinger:** [`.cursor/skills/terminal-bash-stinger/`](../../terminal-bash-stinger/)
**Trigger policy:** proactive

---

## Domain

`terminal-bash-worker-bee` is the terminal-productivity specialist. It owns Bash/Zsh/Fish configuration, modern CLI tools (ripgrep, fd, fzf, bat, eza, zoxide), shell-scripting best practices, dotfile architecture, tmux/Zellij setup, and just/make task automation. It writes portable, safe shell (the `set -euo pipefail` trio, quoted expansions, idempotent dotfiles) and explains the trade-offs of any modern CLI replacement before recommending mass adoption.

## Trigger phrases

Route to `terminal-bash-worker-bee` when the user says any of:

- "Improve my dotfiles" / "set up my terminal"
- "Review this shell script" / "bash scripting best practices" / "bash best practices"
- "Set up tmux"
- "Modern CLI tools" / "help me with modern CLI tools"
- "just vs make"

Or when the request implicitly involves shell configuration, shell scripting, or terminal tooling.

## Do NOT route when

- The user wants CI/CD pipelines running inside containers (different shell versions, missing tools) - that is `ci-release-worker-bee`.
- The user wants TypeScript/Node build and packaging - that is `typescript-node-worker-bee` (and the build/CI mechanics are `ci-release-worker-bee`).

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The shell script, dotfile, or terminal-setup goal in scope.
- The target shell and environment (Bash-only vs POSIX `sh`, container vs workstation).
- Optional: the tools they already use (drives replacement recommendations).

If the target is unclear, do not invoke yet - ask what they are configuring.

## Outputs the Bee produces

- Reviewed or authored shell scripts (portable, `set -euo pipefail`, quoted expansions).
- Idempotent dotfile setups and tmux/Zellij/just/make configurations with trade-offs explained.

## Multi-Bee sequences this Bee participates in

- Escalates CI shell steps running in containers to `ci-release-worker-bee`.

## Critical directives the orchestrator should respect

- **Always check portability before writing Bash-specific syntax** - default to POSIX-safe unless clearly Bash-only.
- **Never add `set -e` alone** - the `-e -u -o pipefail` trio is the minimum safe guard.
- **Quote every shell variable expansion** unless deliberately word-splitting.
- **Always explain the trade-offs when recommending a modern CLI replacement.**
- **Keep dotfile changes idempotent.**
- **Escalate to `ci-release-worker-bee` for CI shell steps running in containers.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
