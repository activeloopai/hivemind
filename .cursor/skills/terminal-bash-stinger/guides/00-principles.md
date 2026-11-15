# Principles - terminal-bash-stinger

Core rules that govern every invocation of `terminal-bash-worker-bee`. Read before any other guide.

Sources: `research/internal/01-command-brief.md`, `research/external/02-bash-scripting-patterns.md`

---

## Shell portability tiers

Not all shells are equal. The tier determines which syntax is legal:

| Tier | Target | Constraints |
|---|---|---|
| POSIX sh | `#!/bin/sh` | No arrays, no `[[`, no `pipefail`, no `local`, no `$((...))` |
| Bash 4+ | `#!/usr/bin/env bash` | All Bash features; macOS ships Bash 3.2 - use `brew install bash` |
| Zsh | `#!/usr/bin/env zsh` | Superset of POSIX; use for interactive config, rarely for scripts |
| Fish | N/A (not POSIX) | Interactive only; scripts live in `~/.config/fish/functions/` |

**Rule:** Ask the developer which tier they need before writing a script. Default to Bash 4+ unless they say "must run on Alpine" or "POSIX only".

## The shellcheck-first rule

Every shell script must pass `shellcheck` before review is complete. Run:

```bash
shellcheck --shell=bash script.sh
```

or add as a GitHub Actions step:

```yaml
- uses: ludeeus/action-shellcheck@master
  with:
    scandir: './scripts'
```

Never mark a finding as "acceptable" without a written justification comment `# shellcheck disable=SC#### -- reason`.

## The escalation rule

When the terminal context is a Docker container, Kubernetes init container, or CI runner image, the appropriate owner is `ci-release-worker-bee`, not `terminal-bash-worker-bee`. The difference:

- **Workstation dotfiles:** terminal-bash-worker-bee
- **CI step that runs `npm ci` in a GitHub Actions job:** ci-release-worker-bee
- **Shell script that publishes the npm package:** ci-release-worker-bee (even if the script is Bash)

When in doubt: "Would this script run identically on a developer's laptop as on a CI runner?" If no - escalate.

## The idempotency rule for dotfiles

Every dotfile change must be safe to apply multiple times. Patterns:

```bash
# Guard sourcing
if [[ -f "$HOME/.aliases" ]]; then
  source "$HOME/.aliases"
fi

# Guard PATH additions
if [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
  export PATH="/usr/local/bin:$PATH"
fi

# Idempotent mkdir
mkdir -p "$HOME/.config/tmux"
```

Bootstrap scripts run at shell startup or on system setup. They must not accumulate duplicate entries.

## The "explain the gotcha" rule

When recommending a modern CLI tool, always surface the primary gotcha alongside the recommendation. Reference `research/external/01-modern-cli-tools.md` for the full list. Minimum:

- `rg`: ignores hidden files and `.gitignore`-excluded files by default.
- `fd`: skips dotfiles by default.
- `bat`: not a drop-in `cat` for pipes; use `--plain --no-pager`.
- `zoxide`: requires building visi