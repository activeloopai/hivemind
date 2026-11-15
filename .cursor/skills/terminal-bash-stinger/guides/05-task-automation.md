# Task Automation Guide

`just` vs `make` decision matrix, justfile patterns, and migration guide.

Source: `research/external/04-just-vs-make.md`

See also: `templates/justfile-template.md` for a ready-to-use starter, `examples/happy-path.md` for a worked migration.

---

## When to use just vs make

| Use case | Recommendation |
|---|---|
| Developer task automation in any language | **just** - no tab sensitivity, self-documenting |
| C/C++/Fortran builds with file dependencies | **make** - designed for this; DAG is the feature |
| Legacy project where team knows make | Keep make; optionally add a thin `justfile` wrapper |
| Cross-platform scripts (Windows + Unix) | **just** - works on all platforms without extra tools |
| Needs `.PHONY` everywhere | **just** - phony is the default, not the exception |
| CI runner doesn't have just installed | Either; make is universal; just is one `brew/apt` install |

---

## justfile anatomy

```makefile
# justfile - stored at repo root; just searches parent directories

# Set shell for all recipes (default: sh)
set shell := ["bash", "-euo", "pipefail", "-c"]

# Load .env automatically
set dotenv-load

# Show available recipes
default:
    @just --list

# ── Variables ────────────────────────────────────────────
app_name := "hivemind"
build_dir := "dist"

# ── Dependencies ────────────────────────────────────────
install:
    npm ci

# ── Build ───────────────────────────────────────────────
# Build the package (tsc types + esbuild bundle)
build:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Building {{app_name}}"
    npm run build

# ── Test ────────────────────────────────────────────────
test *args:
    npx vitest run {{args}}

test-watch:
    npx vitest --watch

# ── Quality gate ─────────────────────────────────────────
check:
    npm run typecheck   # tsc --noEmit
    npx jscpd src
    shellcheck scripts/*.sh

# ── Clean ───────────────────────────────────────────────
clean:
    rm -rf {{build_dir}} node_modules coverage

# ── Release ──────────────────────────────────────────────
# Explicit: requires target argument
sync target:
    @echo "Syncing smoke test to {{target}}..."
    ./scripts/sync-smoke.sh {{target}}

# Composite: run quality gate + tests before build
ci: check test build
```

---

## Key justfile patterns

### Self-documentation

`just --list` shows all recipes with their doc comments. Add a `##` comment above any recipe to make it visible:

```makefile
## Run the test watcher
watch:
    npx vitest --watch
```

### Parameters with defaults

```makefile
# just sync staging  OR  just sync
sync env="staging":
    ./scripts/sync-smoke.sh {{env}}
```

### Dry-run

```bash
just -n sync staging   # shows commands without running
```

### fzf integration

```bash
just --choose   # drops into fzf to pick a recipe interactively
```

---

## Makefile → justfile migration

1. Copy each `.PHONY` target to a justfile recipe.
2. Replace `$(VARIABLE)` with `{{VARIABLE}}` or `$VARIABLE` (shell variable).
3. Remove all `.PHONY:` declarations (just has no file-dependency semantics).
4. Replace `@echo` with the `@` prefix on the recipe line.
5. Add `set shell := ["bash", "-euo", "pipefail", "-c"]` at the top.
6. Test with `just recipe-name` and `just -n recipe-name`.

### Before (Makefile)

```makefile
.PHONY: build test clean

build:
	@echo "Building..."
	npm run build

test: build
	npm test

clean:
	rm -rf dist
```

### After (justfile)

```makefile
set shell := ["bash", "-euo", "pipefail", "-c"]

## Build the application
build:
    @echo "Building..."
    npm run build

## Run tests (builds first)
test: build
    npm test

## Remove build artifacts
clean:
    rm -rf dist
```
