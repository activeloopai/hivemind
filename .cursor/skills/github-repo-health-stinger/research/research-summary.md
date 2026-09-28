---
bee: github-repo-health-worker-bee
stinger: github-repo-health-stinger
depth_tier: normal
conducted_by: scripture-historian (inline synthesis for slot-mode pipeline)
date: 2026-05-20
sources_consulted: 12
open_questions: 2
---

# Research Summary - github-repo-health-stinger

## Depth consumed

Normal tier: 12 primary sources synthesized across the five query domains. Time window: 2025-11 to 2026-05. No sources older than 18 months were used as primary guidance; older sources were treated as historical context only.

## Five most influential sources

1. **GitHub Docs - Rulesets (2025 GA)** - Branch protection rulesets replaced legacy branch protection rules as the GA standard in 2025. Rulesets introduce organization-level enforcement, bypassable actors, and required workflows as status check equivalents. This is the authoritative surface for `guides/02-branch-protection.md`.
2. **Conventional Commits v1.0.0 specification** - The community-standard format for structured commit messages. Directly drives `guides/03-commit-quality.md`'s adherence scoring rubric and is the basis for semantic-release compatibility checks.
3. **GitHub Docs - CODEOWNERS** - Official CODEOWNERS syntax reference, including glob patterns, team syntax (`@org/team`), wildcard ownership, and the `CODEOWNERS` file location options (root, `.github/`, or `docs/`). Drives `guides/04-codeowners.md`.
4. **GitHub Docs - Issue and PR templates / Community health files** - Covers `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`, and the community health file checklist (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, LICENSE). Drives `guides/06-docs-presence.md` and `guides/08-templates.md`.
5. **GitHub Docs - Repository security settings (2026)** - Covers secret scanning, dependency review enforcement, push protection, and the security overview dashboard. Drives `guides/09-repo-settings.md`.

## Additional sources synthesized

- GitHub CLI reference (`gh repo view`, `gh api /repos/{owner}/{repo}/branches`, `gh ruleset list`) - drives the data-collection section of `guides/00-principles.md`.
- github/gitignore repository - canonical per-language `.gitignore` templates; referenced in `guides/07-gitignore.md`.
- semantic-release docs (conventional commit format requirements) - referenced in `guides/03-commit-quality.md`.
- GitHub Actions `required_status_checks` API - referenced in `guides/02-branch-protection.md`.
- GitHub Engineering Blog - "Introducing GitHub Rulesets" (2023, GA 2025) - historical context for the Rulesets GA transition.
- Trunk-Based Development (trunkbaseddevelopment.com) - branching strategy comparison; referenced in `guides/01-branching-strategy.md`.
- GitHub Docs - Auto-delete head branches, allowed merge types - referenced in `guides/09-repo-settings.md`.

## Open questions (flags for the user, not guesses)

1. **GitHub CLI vs. REST API scope:** The audit can run via `gh repo view --json` (requires `gh auth login`), REST API with a token, or local clone inspection only. The best default for teams with varying GitHub API access is not yet decided. Recommend the Stinger support all three modes and let the user declare scope at invocation time.
2. **Monorepo sub-package README audit opt-in:** For large monorepos (50+ packages), auditing README presence at every sub-package root is expensive. Should this be on by default or require an explicit `--monorepo` flag? Pending user preference.

## Sources to re-fetch if refreshing

- GitHub Docs - Rulesets (re-fetch annually; rulesets API surface is evolving).
- Conventional Commits spec (stable; re-fetch only on major version bump).
- github/gitignore (re-fetch semi-annually; new language/framework templates added regularly).
