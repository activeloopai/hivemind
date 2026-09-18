# Research Summary - terminal-bash-stinger

**Depth tier consumed:** shallow
**Time window:** 2025-11 to 2026-05
**Files written:** 10 (5 external, 1 internal per query pattern, plus this summary and index)
**Conducted:** 2026-05-20

---

## Key findings

### Modern CLI tools (ripgrep, fd, fzf, bat, eza, zoxide)

All six tools are actively maintained as of 2026. ripgrep 14.x remains the gold standard for text search - significantly faster than grep on large repos, respects `.gitignore` by default. fd 10.x is the idiomatic `find` replacement with simpler syntax and parallel execution. fzf 0.50+ ships with a built-in preview window and improved shell integration. bat 0.24+ supports syntax-highlighted paging with a `--plain` flag for pipe-safe output. eza (successor to exa) is maintained and supports git-aware column output. zoxide 0.9+ integrates with all three major shells via `eval "$(zoxide init <shell>)"`.

**Key gotcha:** bat is NOT a drop-in `cat` replacement in pipes - `--plain --no-pager` flags are required, or use `batcat` alias on Debian. fzf's `--preview` flag spawns a subshell, so it is CPU-intensive in large repos.

### Shell scripting best practices

The `set -euo pipefail` trio remains the standard preamble for non-interactive Bash scripts. shellcheck v0.10 (2025) is available as a GitHub Action and VSCode extension. Key patterns: always quote `"$variable"`, use `$(...)` not backticks, use `local` for function variables, use `trap cleanup EXIT` for teardown, prefer `[[ ]]` over `[ ]` for Bash conditionals. POSIX portability is a separate concern - scripts targeting `sh` must avoid Bash-isms entirely.

### Tmux vs Zellij

tmux 3.4 (2024) is stable and widely deployed. Zellij 0.40+ (2026) offers a Rust-native alternative with built-in layout management and a plugin ecosystem. The primary tradeoff: tmux has decades of muscle memory and scripting support; Zellij has a gentler learning curve and a modern TUI. For dotfiles, tmux requires a `.tmux.conf` with manual plugin management (TPM); Zellij uses a `config.kdl` file. Both support session resurrection via plugins.

### just vs make

`just` 1.30+ (2026) is a cross-platform command runner that avoids Make's file-dependency semantics. Key advantages: no tab-sensitive syntax, built-in parameter support, `#!/usr/bin/env bash` recipe shebang, `--list` flag for self-documentation, no implicit `.PHONY` requirement. Make remains appropriate when file-dependency tracking is needed (C/C++ builds, LaTeX). For most developer-facing task automation in polyglot repos, `just` is the better choice.

### Shell prompts (Starship, p10k)

Starship 1.20+ (2026) is the cross-shell choice - works identically in Bash, Zsh, Fish, and Nu. Powerlevel10k remains the most feature-rich Zsh-only option but the maintainer has reduced activity; the community is migrating to `p10k`-compatible themes for Starship. Fish's built-in prompt is configurable via `fish_prompt` function; `tide` is the community favorite.

---

## Five most influential sources

1. BashFAQ (mywiki.wooledge.org) - canonical reference for quoting, globbing, and `set` options; authority = very high.
2. ripgrep README (github.com/BurntSushi/ripgrep) - definitive source for rg flags, `.ripgreprc`, and performance tuning.
3. just README (github.com/casey/just) - comprehensive reference for justfile syntax, parameters, and cross-platform patterns.
4. shellcheck wiki (github.com/koalaman/shellcheck/wiki) - SC-code-annotated explanations for every warning shellcheck emits.
5. Zellij docs (zellij.dev/documentation) - `config.kdl` reference and plugin API.

---

## Open questions

1. Should the Stinger cover shell prompt configuration (Starship vs p10k) as a full guide, or only a mention? (Low priority for shallow tier; flag for user decision.)
2. Is POSIX portability a first-class concern for this team's scripts, or is Bash-only acceptable? (Determine at invocation time from context.)
3. Does the team use a dotfile manager (chezmoi, yadm, stow)? The Stinger covers manual dotfiles; a separate guide may be warranted.

---

## Sources to re-fetch if needed

- `https://starship.rs/config/` for latest Starship module reference (changes with each minor version).
- `https://just.systems/man/en/` for just's latest built-in functions (added frequently).
