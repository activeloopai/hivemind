# Shell Prompts - Research Note

**Source type:** community synthesis
**Authority:** medium
**Relevance:** secondary
**Date fetched:** 2026-05-20
**Queries used:** "Zsh Fish prompt starship powerlevel10k 2026"

---

## Starship (1.20+)

- Cross-shell: Bash, Zsh, Fish, Nu, PowerShell.
- Single `starship.toml` config file.
- Init: add `eval "$(starship init bash)"` / `zsh` / `fish` to shell config.
- Modules: git, node, python, rust, go, docker, kubernetes, time, and ~80 more.
- **Recommended for:** teams with mixed shell preferences; new setups; cross-platform dotfiles.

```toml
# ~/.config/starship.toml
format = """
$username\
$directory\
$git_branch\
$git_status\
$python\
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
```

## Powerlevel10k (p10k)

- Zsh-only; the most feature-rich Zsh prompt.
- Run `p10k configure` for interactive wizard; generates `~/.p10k.zsh`.
- **Caveat:** maintainer (romkatv) has reduced activity as of 2025; no new major features. Community is stable but future-uncertain.
- **Recommended for:** power users already invested in Zsh who want maximum customization.

## Fish + tide

- `tide` is the community-standard Fish prompt.
- Install: `fisher install IlanCosman/tide@v6`.
- Run `tide configure` for interactive setup.
- Works best in Fish-only setups.

## Decision matrix

| Scenario | Recommendation |
|---|---|
| New dotfiles, multi-shell | Starship |
| Already on Zsh, want maximum features | p10k |
| Fish-primary setup | tide |
| Minimal, no dependencies | oh-my-posh or pure (Zsh) |
