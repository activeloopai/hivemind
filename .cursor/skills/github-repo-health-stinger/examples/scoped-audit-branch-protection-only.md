# Example: Scoped Audit - Branch Protection Only

*Demonstrates: scoped invocation ("just branch protection"), API scope declaration, handoff to ci-release-worker-bee.*

## Invocation

User: "Just check our branch protection - are we meeting the 2026 minimum for `owner/repo`?"

Bee: "Running **branch protection only** audit. API mode: GitHub REST API with read token (no branch modification). Data collection limited to branch rules; all other dimensions out of scope for this run."

---

## Branch Protection Audit: owner/repo

**Audit date:** 2026-05-20
**Scope:** Branch protection / rulesets only
**Default branch:** `main`

### Ruleset detection

```
GET /repos/owner/repo/rulesets → [
  { id: 12, name: "main-protection", enforcement: "active", target: "branch" }
]
GET /repos/owner/repo/rules/branches/main → [
  "required_pull_request": { required_approving_review_count: 1 },
  "non_fast_forward": {},
  "required_status_checks": { strict: true, checks: ["typecheck", "test"] }
]
```

### Finding

| Rule | Status | 2026 minimum? | Notes |
|---|---|---|---|
| `required_pull_request` | ✅ Enabled | ✅ | 1 reviewer (team has 5 engineers - recommend 2) |
| `required_status_checks` | ✅ Enabled | ✅ | typecheck + test (missing build, codeql) |
| `non_fast_forward` | ✅ Enabled | ✅ | |
| `dismiss_stale_reviews` | ❌ Disabled | ✅ Required | Security gap: approvals persist after new commits |
| `required_linear_history` | ❌ Disabled | Nice-to-have | |
| `required_signatures` | ❌ Disabled | Nice-to-have | |

**Score: 6/10** - meets the bare minimum (`required_pull_request` + status checks + force-push block) but `dismiss_stale_reviews` is off, which is a security gap.

### Remediation

1. Enable `dismiss_stale_reviews` - Settings > Branches > Edit ruleset > check "Dismiss stale reviews" (effort: 2 minutes).
2. Increase required reviewers to 2 for a team of 5 (effort: 1 minute).
3. Add `build` to required status checks once CI has a named build job (effort: depends on CI; hand off CI stage gap to `ci-release-worker-bee`).

**Handoff:** Required status checks missing `build` and `codeql` -> invoke `ci-release-worker-bee` to add those stages to `.github/workflows/ci.yaml`.
