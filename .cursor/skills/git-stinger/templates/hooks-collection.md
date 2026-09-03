# Hooks Collection Template

Ready-to-use Git hook scripts for pre-commit, commit-msg, and pre-push.

---

## How to use

Place in `.githooks/` and configure:
```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

Or use with Husky (`.husky/<hook-name>`) or lefthook (`lefthook.yml`).

---

## pre-commit: type-check + duplication + fast tests

Hivemind has no ESLint/Prettier. The quality gate is `tsc --noEmit` plus `jscpd` duplication, wired through husky + lint-staged.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Staged TypeScript files only
STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|mts|cts)$' || true)

if [ -n "$STAGED" ]; then
  echo "TypeScript type-check..."
  npm run typecheck   # tsc --noEmit

  echo "Duplication check..."
  npx jscpd $STAGED
fi

echo "Unit tests..."
npx vitest run --silent
```

---

## commit-msg: enforce conventional commits

```bash
#!/usr/bin/env bash
set -euo pipefail

MSG=$(cat "$1")
PATTERN="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?(!)?: .{1,100}"

if echo "$MSG" | grep -qE "^(Merge|Revert|fixup!|squash!)"; then
  exit 0  # Allow merge commits, reverts, autosquash markers
fi

if ! echo "$MSG" | grep -qE "$PATTERN"; then
  echo "ERROR: commit message must follow Conventional Commits."
  echo "Pattern: type(scope): description (max 100 chars)"
  echo "Types: feat fix docs style refactor perf test build ci chore revert"
  echo "Example: feat(retrieval): add Deep Lake recall filter"
  exit 1
fi
```

---

## pre-push: block force-push to protected branches

```bash
#!/usr/bin/env bash
set -euo pipefail

PROTECTED="main master develop"

while read local_ref local_sha remote_ref remote_sha; do
  BRANCH="${remote_ref##refs/heads/}"

  for PROTECTED_BRANCH in $PROTECTED; do
    if [ "$BRANCH" = "$PROTECTED_BRANCH" ]; then
      # Detect force-push (remote sha is not an ancestor of local sha)
      if [ "$remote_sha" != "0000000000000000000000000000000000000000" ]; then
        if ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
          echo "ERROR: Force-push to $PROTECTED_BRANCH is blocked."
          echo "Use a feature branch and open a PR."
          exit 1
        fi
      fi
    fi
  done
done

exit 0
```

---

## lefthook.yml configuration

```yaml
pre-commit:
  parallel: true
  commands:
    typecheck:
      run: npm run typecheck   # tsc --noEmit
    duplication:
      glob: "*.{ts,mts,cts}"
      run: npx jscpd {staged_files}
    test:
      run: npx vitest run --silent

commit-msg:
  commands:
    conventional:
      run: npx commitlint --edit {1}

pre-push:
  commands:
    tests:
      run: npx vitest run --silent
```
