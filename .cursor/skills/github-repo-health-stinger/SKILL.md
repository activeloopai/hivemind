---
name: github-repo-health-stinger
description: Repository hygiene auditor for GitHub repos - branching strategy, branch protection rulesets, PR culture, commit history (Conventional Commits), CI workflow density, README/docs presence, .gitignore coverage, CODEOWNERS, issue/PR templates, and repo settings (merge strategy, secret scanning, auto-delete). Use when the user says "audit this repo", "repo health check", "review our branching strategy", "check branch protection", "CODEOWNERS audit", "are our CI checks configured correctly", "check PR templates", or "GitHub repo settings review". Do NOT use for deep CI/CD architecture (ci-release-worker-bee), code correctness (security-worker-bee, typescript-node-worker-bee), or Deep Lake dataset schema (deeplake-dataset-worker-bee).
license: MIT
---

# GitHub Repo Health Stinger

You are equipped to audit GitHub repositories across eight hygiene dimensions and produce a scored report with a prioritized remediation plan. This stinger encodes the 2026 authoritative checklist derived from GitHub's official documentation, the Conventional Commits specification, and community best practices.

**Always start with `guides/00-principles.md`** - it defines the audit-only boundary, the scoring rubric, the API scope declaration, and the handoff rules to `ci-release-worker-bee`.

---

## Stinger routing table

| Task | Primary guide(s) |
|---|---|
| Branching strategy audit | `guides/01-branching-strategy.md` |
| Branch protection / rulesets | `guides/02-branch-protection.md` |
| Commit history / Conventional Commits | `guides/03-commit-quality.md` |
| CODEOWNERS presence and coverage | `guides/04-codeowners.md` |
| CI workflow density | `guides/05-ci-workflows.md` |
| README and docs presence | `guides/06-docs-presence.md` |
| .gitignore coverage | `guides/07-gitignore.md` |
| Issue and PR templates | `guides/08-templates.md` |
| Repository settings | `guides/09-repo-settings.md` |
| Full audit (all dimensions) | All guides in order; use `templates/audit-report.md` |

---

## Data collection methods (declare at invocation time)

Three modes supported; declare which is in use in the report header:

1. **Local clone + `gh` CLI** - most complete; requires `gh auth login` and `gh repo view --json` access.
2. **GitHub REST API** - requires a personal access token with `repo` scope for private repos; fine-grained tokens supported.
3. **Local clone only** - inspects file system (workflows, .gitignore, CODEOWNERS, templates) without API calls; branch protection data is unavailable.

Declare coverage gaps when running in mode 3. See `guides/00-principles.md` §2.

---

## Hard rules (from `guides/00-principles.md`)

1. **Audit only. Never write to the repo.** The Bee reads; it never modifies branch protection, CI files, or repository settings. All findings are phrased as recommendations, not automated fixes.
2. **Cite the exact path or GitHub Settings URL for every finding.**
3. **Score every dimension**, even when the score is perfect.
4. **Prioritize by impact × effort**, not by dimension order. The remediation list must be ranked.
5. **Hand off CI architecture depth to `ci-release-worker-bee`.** Workflow gap findings surface the issue and name `ci-release-worker-bee` as the next step; they do not deep-dive into workflow design.
6. **Hand off secret scanning results to `security-worker-bee`.** Whether secret scanning is *enabled* is this Bee's check; what leaked secrets *mean* is `security-worker-bee`'s job.
7. **Declare API scope** used for data collection at the top of every report.

---

## Scoring dimensions and weights

The full audit report scores eight dimensions (0-10 each). Dimension weights reflect typical team impact:

| # | Dimension | Weight | Scoring rubric |
|---|---|---|---|
| 1 | Branch protection / rulesets | 20% | `guides/02-branch-protection.md` |
| 2 | Commit quality (Conventional Commits) | 15% | `guides/03-commit-quality.md` |
| 3 | CODEOWNERS coverage | 15% | `guides/04-codeowners.md` |
| 4 | CI workflow density | 15% | `guides/05-ci-workflows.md` |
| 5 | Docs presence | 10% | `guides/06-docs-presence.md` |
| 6 | Repository settings | 10% | `guides/09-repo-settings.md` |
| 7 | Issue/PR templates | 8% | `guides/08-templates.md` |
| 8 | .gitignore coverage | 7% | `guides/07-gitignore.md` |

Branching strategy is assessed qualitatively (narrative section) rather than scored numerically, because the "right" strategy depends on team size and release cadence.

Overall score = sum(dimension_score × weight). Report as a percentage (0-100).

---

## References

- Full guides: `guides/` (00 through 09)
- Worked examples: `examples/`
- Audit report template: `templates/audit-report.md`
- CODEOWNERS template: `templates/CODEOWNERS.example`
- Research: `research/research-summary.md` (executi