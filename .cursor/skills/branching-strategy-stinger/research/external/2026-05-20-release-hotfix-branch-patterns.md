---
source_url: https://www.ezdevops.cloud/gitlessons/git-branching-strategies.html
fetched: 2026-05-20
source_type: blog
authority: high
relevance: high
topic: release-branch-hotfix-pattern
summary: "Detailed reference covering Gitflow release and hotfix branch patterns. Covers: release branches cut from develop at feature-complete milestone (bug fixes only, no new features, merged into both main and develop, tagged on main, then deleted). Hotfix branches always from main (never develop), contain minimum possible fix, merged into both main and develop (or current open release branch), tagged with patch version, deleted after merge. Includes practical git commands. Notes that GitFlow is excellent for multi-version support but adds overhead for teams deploying multiple times per week."
---

# Git Branching Strategies Guide 2026 - TBD, GitHub and Gitflow

## Summary
Comprehensive Gitflow reference with detailed release and hotfix branch mechanics. Provides ASCII diagram of the full Gitflow model, branch naming conventions, and the decision matrix comparing all three major strategies on 6 criteria.

## Key quotations / statistics

On release branches:
- "Branch off from develop at release-feature-complete milestone"
- "Only apply bug fixes and minor release-prep changes"
- "No new features allowed - feature freeze enforced here"
- "Merged into both main (production release) and develop (back-merge the fixes)"
- "Tagged with the release version on main"
- "Deleted after merging"

On hotfix branches:
- "Branch off from main only - never from develop"
- "Contains the minimum possible change to fix the bug"
- "Merged back into both main AND develop after the fix"
- "Tagged with a patch version on main (e.g., v4.28.1)"
- "Deleted after merging"
- DISCIPLINE NOTE: "Hotfixes must contain the minimum possible change to fix the bug. Resist the temptation to include other improvements - a hotfix that introduces new behaviour can itself cause production incidents."

## Decision matrix from source

| Strategy | Complexity | Release Frequency | Team Size | CI/CD Fit | Multi-version |
|---|---|---|---|---|---|
| Trunk-Based Dev | Low | Many times/day | Any (with discipline) | Excellent | Hard |
| GitHub Flow | Low | Daily to weekly | Small to medium | Very good | Limited |
| Gitflow | High | Weekly to monthly | Medium to large | Good | Excellent |

## Recommendation from source
"For most modern SaaS and web products deploying multiple times per week, GitHub Flow offers the best balance of simplicity and rigour. For large enterprise products with formal quarterly releases or LTS versions, Gitflow provides the structure needed. For organisations with strong DevOps maturity and full CI/CD automation, Trunk-Based Development is the gold standard."

## Annotations for stinger-forge
- The release branch lifecycle (cut, bug-fix only, merge to main+develop, tag, delete) is the canonical pattern for `guides/02-release-and-hotfix.md`
- The hotfix discipline note ("minimum possible change") is a critical directive
- The "hotfix always from main, never from develop" rule must be called out explicitly
- The back-merge requirement (hotfix → develop too) is the most commonly forgotten step in real-world GitFlow usage
