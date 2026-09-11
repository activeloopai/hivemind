# justfile Template

Copy this to the repo root as `justfile` and customize the recipes.

```makefile
# justfile - {project-name}
# Run `just` with no arguments to see available recipes.

# ── Configuration ────────────────────────────────────────────────────────────
# Use bash with safety flags for all recipes
set shell := ["bash", "-euo", "pipefail", "-c"]

# Automatically load .env if present
set dotenv-load

# ── Default ──────────────────────────────────────────────────────────────────
## Show available recipes
default:
    @just --list

# ── Setup ────────────────────────────────────────────────────────────────────
## Install dependencies
install:
    # TODO: replace with your package manager
    npm ci

## Full environment setup (run once on new machine)
setup: install
    @echo "Setup complete"

# ── Development ──────────────────────────────────────────────────────────────
## Watch and rerun tests on file changes
test-watch:
    npx vitest --watch

# ── Build ────────────────────────────────────────────────────────────────────
## Build the package (tsc types + esbuild bundle)
build:
    npm run build

# ── Test ─────────────────────────────────────────────────────────────────────
## Run tests (pass extra args: just test -- --reporter=verbose)
test *args:
    npx vitest run {{args}}

# ── Quality gate ─────────────────────────────────────────────────────────────
## Type-check, duplication check, and shell lint
check:
    npm run typecheck   # tsc --noEmit
    npx jscpd src
    shellcheck scripts/*.sh

# ── Clean ────────────────────────────────────────────────────────────────────
## Remove build artifacts
clean:
    rm -rf dist coverage node_modules

# ── CI ───────────────────────────────────────────────────────────────────────
## Full CI run: quality gate + test + build
ci: check test build

# ── Release ──────────────────────────────────────────────────────────────────
## Sync the smoke test to a named host (just sync staging)
sync target:
    @echo "Syncing smoke test to {{target}}..."
    ./scripts/sync-smoke.sh {{target}}
```

## Key just patterns to remember

- `@` prefix silences command echo for a recipe line.
- `*args` captures zero or more trailing arguments.
- `(recipe "arg")` calls another recipe as a dependency with an argument.
- `just -n sync staging` does a dry-run (shows commands, does not execute).
- `just --choose` drops into fzf to select a recipe interactively.
- `just --justfile /path/to/justfile recipe` runs from a non-default location.
