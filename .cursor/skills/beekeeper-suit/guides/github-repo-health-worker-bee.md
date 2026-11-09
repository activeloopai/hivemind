# GitHub Repo Health Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `github-repo-health-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/github-repo-health-worker-bee.md`](../../../agents/github-repo-health-worker-bee.md)
**Stinger:** [`.cursor/skills/github-repo-health-stinger/`](../../github-repo-health-stinger/)
**Trigger policy:** proactive

---

## Domain

`github-repo-health-worker-bee` is a read-only repository hygiene auditor for GitHub repositories. It audits branch protection rulesets (2025 GA), Conventional Commits adherence, CODEOWNERS coverage, CI workflow density, README/docs presence, `.gitignore` coverage, issue/PR templates, and repository settings (merge strategy, secret scanning, auto-delete). It scores every dimension and produces a priority-ranked remediation plan ordered by impact times effort. It never modifies repo files, settings, or branch protection.

## Trigger phrases

Route to `github-repo-health-worker-bee` when the user says any of:

- "Audit this repo" / "repo health check" / "GitHub repo hygiene"
- "Check branch protection"
- "CODEOWNERS audit"
- "Are our CI checks configured correctly" / "CI checks configured"
- "Check PR templates" / "repository settings review"

Or when the request implicitly involves GitHub repository hygiene or settings review.

## Do NOT route when

- The user wants deep CI/CD architecture (Dockerfile hygiene, reusable workflows, OIDC, cache strategy) - that is `ci-release-worker-bee`. This Bee checks whether CI is configured; ci-release designs it.
- The user wants code correctness or security vulnerability remediation - that is `security-worker-bee`. This Bee checks whether secret scanning is enabled; security handles what leaked.
- The user wants the Deep Lake dataset schema - that is `deeplake-dataset-worker-bee`.
- The user wants README content quality - that is `readme-writing-worker-bee`. This Bee checks README presence; readme-writing improves it.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The repository to audit (and whether GitHub API access is available, or local-clone-only mode).
- Optional: the specific dimensions of concern (branch protection, CODEOWNERS, templates).

If the repository is unclear, do not invoke yet - ask which repo to audit.

## Outputs the Bee produces

- A scored report across every dimension (even 10/10 dimensions), each finding citing an exact file path or GitHub Settings URL.
- An API-scope declaration at the top of the report.
- A remediation plan prioritized by impact times effort, actionable in one sprint.

## Multi-Bee sequences this Bee participates in

- Hands off CI architecture depth to `ci-release-worker-bee`, secret-scanning results to `security-worker-bee`, and README content quality to `readme-writing-worker-bee`.

## Critical directives the orchestrator should respect

- **Never modify repo files, settings, or branch protection** - read-only auditor.
- **Cite the exact file path or GitHub Settings URL for every finding.**
- **Always declare API scope at the top of every report.**
- **Score every dimension, even when the score is 10/10.**
- **Prioritize remediation by impact times effort, not dimension order.**
- **Hand off CI architecture depth and secret-scanning results to the right Bee.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
