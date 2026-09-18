---
source_type: official_docs
authority: high
relevance: codeowners
topic: GitHub CODEOWNERS syntax and patterns
url: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
fetched: 2026-05-20
---

# GitHub CODEOWNERS - Synthesis

## File location (precedence order)

1. `CODEOWNERS` (repo root)
2. `.github/CODEOWNERS` (recommended for teams)
3. `docs/CODEOWNERS`

## Syntax

```
# Comment
*.js                    @org/frontend-team
src/backend/**          @org/backend-team
/config/secrets.yml     @org/platform-leads
docs/                   @org/docs-team @org/engineering-leads
*.md                    @username
```

- Last matching rule wins (bottom of file takes precedence)
- Patterns follow `.gitignore` glob syntax
- Teams: `@org/team-name` (team must exist in the organization)
- Individuals: `@username`
- Multiple owners: space-separated

## Coverage gap detection

Run: compare all repo paths against CODEOWNERS entries. Any path with no matching rule is "unowned". For a healthy repo:
- All source directories should have a team owner (not just individual)
- Security-sensitive paths (secrets, config, CI) should have a restricted owner list
- Wildcard catch-all (`*`) at the top of file is a common pattern for repos without full coverage

## Monorepo patterns

```
# Package-level ownership
packages/auth/          @org/auth-team
packages/payments/      @org/payments-team
packages/shared/        @org/platform-team

# Infrastructure
.github/workflows/      @org/devops-team @org/platform-team
terraform/              @org/platform-team
```

## Scoring rubric

| Condition | Score |
|---|---|
| CODEOWNERS exists, no syntax errors, full coverage, team ownership | 10 |
| CODEOWNERS exists, minor coverage gaps, team ownership | 8 |
| CODEOWNERS exists, individual ownership only (not teams) | 6 |
| CODEOWNERS exists but has syntax errors or >30% unowned paths | 4 |
| No CODEOWNERS | 0 |
