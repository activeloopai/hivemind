# 05 - CI Workflow Density Audit

*Research basis: `research/external/01-github-rulesets-docs.md` (required status checks), `research/external/05-repo-security-settings.md` (dependency review)*

> **Scope boundary:** This guide audits workflow *presence and density* - are the right stages configured, and are they triggered correctly? It does NOT audit workflow architecture (reusable workflow design, release pipeline, OIDC, cache backends, cross-node matrix). Hand those to `ci-release-worker-bee`.

## What to inspect

For each workflow file in `.github/workflows/`:

1. **Triggers:** `push`, `pull_request`, `schedule`, `workflow_dispatch` - are the right events covered?
2. **Stage coverage:** Does the workflow have at least lint, test, and build stages?
3. **Missing stages:** Security scan, dependency review, E2E tests, type check?
4. **Timeout settings:** Missing timeouts allow runaway jobs.
5. **Artifact retention:** Are build artifacts retained for debugging?
6. **Required status check alignment:** Are the workflows referenced in branch protection `required_status_checks`?

## Data collection

```bash
# List all workflow files
ls .github/workflows/

# List triggers for each workflow (Hivemind uses .yaml)
for f in .github/workflows/*.y*ml; do
  echo "=== $f ==="; grep -A 10 '^on:' "$f"; done

# Check jobs in each workflow
for f in .github/workflows/*.y*ml; do
  echo "=== $f jobs ==="; grep '^  [a-z].*:$' "$f"; done
```

## Density scoring rubric

Score each active workflow out of 10, then average across all workflows:

| Stage present | Points |
|---|---|
| Quality gate (duplication via jscpd, format/lint where present) | +2 |
| Type check (`tsc --noEmit`) | +2 |
| Unit/integration tests (Vitest, cross-node, windows-smoke) | +2 |
| Build (tsc + esbuild bundle) | +2 |
| Security scan (CodeQL, dependency-review, Snyk) | +2 |

Deductions:
- No `timeout-minutes` on any job: -1
- Workflow not referenced in required_status_checks: -1 per workflow
- Workflow triggers only `push` to main (no PR trigger): -1

## Report section template

```markdown
### CI Workflow Density (Score: X/10)

**Workflows found:** 3 (ci.yaml, codeql.yaml, release.yaml)

| Workflow | Triggers | Quality | Type | Test | Build | Security | Timeout | In required checks |
|---|---|---|---|---|---|---|---|---|
| ci.yaml | pull_request | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| release.yaml | push:tags | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | N/A |

**Findings:**
- RECOMMEND: Add `dependency-review` action to `ci.yaml` to block PRs that introduce vulnerable dependencies.
- RECOMMEND: Add `timeout-minutes: 20` to `release.yaml` jobs to prevent runaway publishes.
- HAND OFF: `ci-release-worker-bee` - `release.yaml` uses a deprecated `actions/cache@v2`; recommend upgrading to v4 and tightening the publish-smoke-test gate.
```

## Handoff trigger

When findings include release-pipeline issues, workflow architecture improvements (reusable workflows, OIDC, cross-node matrix), or cache/runner optimization - explicitly name `ci-release-worker-bee` in the finding and do not prescribe the solution. Example:
> "Workflow architecture issue: `ci.yaml` reinstalls the full toolchain on ever