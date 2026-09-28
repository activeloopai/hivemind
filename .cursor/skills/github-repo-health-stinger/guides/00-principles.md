# 00 - Principles and Boundaries

## §1 Audit-only boundary

`github-repo-health-worker-bee` is a read-only auditor. It inspects repository metadata and produces findings. It never:
- Modifies branch protection rules or rulesets
- Edits CI workflow files
- Commits, pushes, or opens PRs
- Changes repository settings via the API

Every recommendation is phrased as an action the *human* (or a named downstream Bee) should take. Phrasing: "Recommend enabling auto-delete-head-branches in Settings > General > Pull Requests" - not "I'll enable auto-delete-head-branches."

## §2 API scope declaration

Every audit report must open with a one-line scope declaration:

```
**Data collection mode:** Local clone + gh CLI (gh auth login required) | GitHub REST API (token: {scope}) | Local clone only
**Coverage gaps:** {any dimensions unavailable due to API scope}
```

Branch protection, CODEOWNERS as enforced, and repository settings require API access. Without it, flag each as "Unable to verify - API access required."

## §3 Scoring and prioritization

- Score each of the eight dimensions on a 0-10 scale using the rubric in the dimension's guide.
- Compute the weighted overall score: sum(score × weight). Report as a percentage.
- Build the remediation list ordered by `impact × effort`:
  - **Impact:** how much does fixing this improve repo health? (1-5)
  - **Effort:** how many minutes/hours does the fix take? (1=minutes, 5=weeks)
  - **Priority score:** impact ÷ effort (higher = act first)

Do not order findings by dimension number. A "no CODEOWNERS" finding (effort: 1, impact: 4, priority: 4.0) should appear above "PR template is empty" (effort: 1, impact: 2, priority: 2.0).

## §4 Handoff rules

| Domain | This Bee's scope | Handoff to |
|---|---|---|
| CI workflow gaps (missing typecheck/test) | Surface the gap, name the handoff | `ci-release-worker-bee` |
| CI workflow architecture (reusable workflows, release pipeline) | Out of scope | `ci-release-worker-bee` |
| Secret scanning result details | Check if enabled | `security-worker-bee` |
| Code logic / security vulnerabilities | Out of scope | `security-worker-bee` |
| Deep Lake dataset schema | Out of scope | `deeplake-dataset-worker-bee` |
| PRD / doc authoring | Out of scope | `library-worker-bee` |
| Post-audit verification | Out of scope | `quality-worker-bee` |

## §5 Impact × effort priority scoring table

For reference when building the remediation list:

| Finding | Impact | Effort | Priority |
|---|---|---|---|
| No branch protection on default branch | 5 | 1 | 5.0 |
| No CODEOWNERS | 4 | 1 | 4.0 |
| Secret scanning disabled | 4 | 1 | 4.0 |
| Push protection disabled | 4 | 1 | 4.0 |
| Auto-delete branches off | 3 | 1 | 3.0 |
| No issue templates | 3 | 2 | 1.5 |
| No PR template | 3 | 1 | 3.0 |
| 0% Conventional Commits adherence | 4 | 3 | 1.3 |
| Missing CONTRIBUTING.md | 2 | 1 | 2.0 |
| Missing SECURITY.md | 3 | 1 | 3.0 |
| All merge types allowed | 3 | 1 | 3.0 |
| .gitignore missing or incomplete | 3 | 1 | 3.0 |
| CI has no test stage | 4 | 2 | 2.0 |

This table is a starting-point heuristic. Adjust for repo-specific context (e.g., a team that does not use Conventional Commits has lower CC-adherence improvement i