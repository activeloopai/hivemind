# 03 - Commit History Quality Audit

*Research basis: `research/external/02-conventional-commits-spec.md`*

## What to inspect (last 100 commits)

1. **Conventional Commits format adherence** (the primary metric)
2. **Average subject line length** (target: <= 72 characters)
3. **Generic/noise commits** ("wip", "fix", "update", "stuff", "minor")
4. **Merge commit discipline** (merge commits vs. squash vs. rebase - consistent with configured merge strategy?)
5. **Co-author attribution** for pair/AI-assisted work
6. **Breaking change documentation** (`BREAKING CHANGE:` footer or `!` suffix)

## Data collection

```bash
# Last 100 commit messages
git log --oneline -100

# Count CC-adherent commits (regex check)
git log --oneline -100 | grep -cP '^[a-f0-9]{7,} (feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?!?: '

# Average subject line length
git log --format='%s' -100 | awk '{ total += length($0); count++ } END { print total/count }'

# Generic commit messages
git log --format='%s' -100 | grep -iE '^(wip|fix|update|minor|stuff|changes|more|done|test)'
```

## Conventional Commits format

Valid format: `type[(scope)][!]: description`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

```
feat(auth): add OAuth2 provider support
fix(payments): handle Stripe webhook retry correctly
chore!: drop Node 16 support
```

## Scoring rubric

| CC adherence rate | Score |
|---|---|
| 90-100% | 10 |
| 75-89% | 8 |
| 50-74% | 6 |
| 25-49% | 4 |
| 10-24% | 2 |
| < 10% | 0 |

Deduct 1 point if > 10% of commits are generic/noise messages.
Add 1 point (max 10) if `commitlint` or equivalent is configured in CI.

## Tooling remediation paths

| Tool | What it does | Effort |
|---|---|---|
| `commitlint` + `@commitlint/config-conventional` | Enforces CC format at commit-msg hook | Low (30 min) |
| `commitizen` | Interactive CC prompt for `git commit` | Low (15 min) |
| `amannn/action-semantic-pull-request` | Validates PR title follows CC format | Low (15 min) |
| `semantic-release` | Automates semver bumps + CHANGELOG from CC history | Medium (2-4 hours) |

## Report section template

```markdown
### Commit Quality - Conventional Commits (Score: X/10)

**Sample:** Last 100 commits (git log --oneline -100)

| Metric | Value |
|---|---|
| CC-adherent commits | 72/100 (72%) |
| Average subject length | 48 chars |
| Generic/noise commits | 4 ("wip", "fix", "update", "minor") |
| Breaking changes documented | 1 (correct BREAKING CHANGE footer) |
| commitlint configured | No |

**Findings:**
- RECOMMEND: Add `commitlint` with `@commitlint/config-conventional` to enforce CC format at commit time.
- RECOMMEND: Adopt `amannn/action-semantic-pull-request` to validate PR titles.
- Consider `semantic-release` for automated CHANGELOG + semver if the team ships versioned releases.
```

## Worked example

See `examples/commit-audit-happy-path.md` for a full 100-commit sample analysis.
