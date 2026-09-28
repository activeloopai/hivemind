---
source_type: official_docs
authority: high
relevance: repo_settings
topic: GitHub repository security and merge settings (2026)
url: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features
fetched: 2026-05-20
---

# Repository Security and Merge Settings - Synthesis

## Key settings to audit

### Merge options (Settings > General > Pull Requests)
- **Allow merge commits** (default: enabled) - creates merge commits; can pollute history
- **Allow squash merging** - squashes all commits; clean history
- **Allow rebase merging** - replays commits on top of base; linear history
- **Always suggest updating pull request branches** - prompts contributors to sync
- **Automatically delete head branches** - auto-deletes merged feature branches (highly recommended)
- **Allow auto-merge** - allows PRs to merge automatically when all checks pass

### Security settings (Settings > Security)
- **Secret scanning** - detects committed secrets (enabled by default on public repos; opt-in for private)
- **Push protection** - blocks pushes containing detected secrets (2025: enabled by default on new repos)
- **Dependency review** - blocks PRs that introduce vulnerable dependencies (requires GitHub Advanced Security or public repo)
- **Dependabot alerts** - alerts on vulnerable dependencies
- **Dependabot security updates** - auto-opens PRs to fix vulnerable dependencies
- **Dependabot version updates** - opens PRs to keep dependencies current

## Scoring rubric (repo settings dimension)

| Condition | Score |
|---|---|
| Auto-delete branches on + squash/rebase only + secret scanning + push protection + dependency review | 10 |
| Auto-delete + secret scanning + push protection | 7 |
| Auto-delete only | 5 |
| All three merge types allowed, no auto-delete, no security settings | 3 |
| Default settings unchanged | 2 |
