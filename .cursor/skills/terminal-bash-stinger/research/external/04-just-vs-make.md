# Just vs Make - Research Note

**Source type:** community synthesis
**Authority:** high
**Relevance:** primary
**Date fetched:** 2026-05-20
**Queries used:** "Just task runner Makefile alternative 2026"

---

## just (1.30+)

### Why just over make for task automation

- **No tab syntax:** just uses spaces; no silent-whitespace bugs.
- **No file-dependency semantics:** `just` is a command runner, not a build system. No `.PHONY` declarations needed.
- **Self-documenting:** `just --list` shows all recipes with doc comments.
- **Shell shebang support:** each recipe can declare `#!/usr/bin/env bash` or `#!/usr/bin/env python3`.
- **Cross-platform:** Windows, macOS, Linux; no `make` prerequisite.
- **Parameters with defaults:** `just deploy env="production"`.

### justfile structure

```makefile
# Default recipe shown by `just` with no args
default:
  @just --list

# Install dependencies
install:
  npm install

# Build with optional environment parameter
build env="development":
  #!/usr/bin/env bash
  set -euo pipefail
  echo "Building for {{env}}"
  npm run build:{{env}}

# Run tests and generate coverage
test *args:
  npm test -- {{args}}

# Clean build artifacts
clean:
  rm -rf dist/ .next/ node_modules/

# Deploy (requires explicit invocation)
deploy target:
  @echo "Deploying to {{target}}"
  ./scripts/deploy.sh {{target}}
```

### just tips

- `@` prefix silences command echo.
- `just -n deploy production` is a dry-run.
- `just --choose` drops into fzf to pick a recipe.
- Store the `justfile` at the repo root; `just` searches parent directories.
- Use `set dotenv-load` to auto-load `.env` files.

## When to keep Make

| Use case | Recommendation |
|---|---|
| C/C++ builds with file-dependency tracking | Make (designed for this) |
| Legacy repo where team knows Make | Keep Make; add a just wrapper if desired |
| Cross-language monorepo task automation | just |
| Docker/CI task runner | just |
| Python package (pyproject.toml) | just or make (both work) |

## Migration: Make → just

1. Copy each `.PHONY` target to a just recipe.
2. Replace `$(VARIABLE)` with `{{VARIABLE}}` or shell `$VARIABLE`.
3. Add `#!/usr/bin/env bash\nset -euo pipefail` to multi-line recipes.
4. Remove `.PHONY:` declarations.
5. Replace `@echo` with `@` prefix in just.
