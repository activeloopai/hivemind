---
source_type: specification
authority: high
relevance: commit_quality
topic: Conventional Commits v1.0.0
url: https://www.conventionalcommits.org/en/v1.0.0/
fetched: 2026-05-20
---

# Conventional Commits v1.0.0 - Synthesis

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Required types: `feat`, `fix`
Common types (community convention): `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`
Breaking changes: append `!` after type/scope, or add `BREAKING CHANGE:` footer

## semantic-release compatibility

semantic-release (2026 canonical version management tool) maps Conventional Commits types to semver bumps:
- `feat:` → minor bump
- `fix:` → patch bump
- `feat!:` or `BREAKING CHANGE:` → major bump
- All other types → no bump (patch only if `fix` is present)

## Scoring rubric for audit (last 100 commits)

| Adherence rate | Score |
|---|---|
| 90-100% | 10 |
| 75-89% | 8 |
| 50-74% | 6 |
| 25-49% | 4 |
| 10-24% | 2 |
| <10% | 0 |

## Signals to check

- Commit message starts with `type:` or `type(scope):` (regex: `^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?!?:`)
- Commit subject line <= 72 characters
- Commit body (if present) wraps at 100 characters
- No generic messages: "wip", "fix", "update", "minor changes", "stuff"
- Co-Author trailers present for pair/AI-assisted commits

## Tooling integration

- `commitlint` with `@commitlint/config-conventional` - enforces format at commit time
- `semantic-release` - automates version bumps and CHANGELOG generation from commit history
- `commitizen` - interactive prompt for Conventional Commit format
- GitHub Actions `amannn/action-semantic-pull-request` - validates PR titles follow CC format
