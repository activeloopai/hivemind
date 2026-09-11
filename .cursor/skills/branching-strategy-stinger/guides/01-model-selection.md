# Model Selection: Decision Tree and Migration Paths

**Research sources:** `research/external/2026-03-31-tbd-vs-gitflow-comparison-novvista.md` (primary - 9-factor matrix, DORA stats, mobile SDK case study), `research/external/2026-04-18-gitflow-github-flow-comparison-palakorn.md` (80/15/4/1 split confirmation).

**Example:** `examples/happy-path-github-flow.md`, `examples/edge-case-gitflow-justified.md`

---

## The 9-factor decision matrix

Assess the team against these nine factors. The rightmost column that applies determines the recommended model.

| Factor | GitHub Flow | Trunk-Based Dev | GitLab Flow | GitFlow |
|---|---|---|---|---|
| **Branch lifetime target** | 1-3 days | Hours (or none) | 1-3 days | Days to weeks |
| **Release model** | Continuous / sprint | Continuous | Environment-gated | Versioned releases |
| **Multi-version support** | No | No | No | Yes |
| **Feature flag infra** | Optional | Required | Optional | Not needed |
| **Team size** | 2-50 | 50+ (or small with flag infra) | Any | Any |
| **CI/CD complexity** | Simple | Simple (requires fast CI) | Moderate | Complex (3-4x overhead) |
| **Merge conflict frequency** | Low | Very low | Low | High |
| **Onboarding difficulty** | Low | Medium | Medium | High |
| **Rollback strategy** | Revert commit / redeploy | Revert commit / feature flag | Environment redeploy | Release branch rollback |

**Interpretation rule:** If ANY row shows a GitFlow characteristic that the team actually requires (specifically multi-version support AND an external release gate), GitFlow is in scope. Otherwise, start with GitHub Flow.

---

## Decision tree

```
Does the team support multiple live product versions simultaneously?
├── YES → Does an external gate (App Store review, enterprise upgrade cycle) force
│         a release stabilization window?
│         ├── YES → GitFlow is justified. See "GitFlow when warranted" section below.
│         └── NO  → GitLab Flow with explicit release branches. Very rare case.
│
└── NO  → Does the team have feature flag infrastructure already deployed?
           ├── YES + CI < 10 min + commits ≥ daily → Trunk-Based Development
           └── NO or CI > 10 min or branch lifetime > 1 day → GitHub Flow (default)
```

---

## GitHub Flow (the 80% default)

**When to recommend:** SaaS/web/API team, up to ~50 engineers, deploys on merge or on a sprint cadence, no multi-version requirement.

**Core rules:**
1. `main` is always deployable.
2. All work happens on short-lived feature branches (target: ≤ 2 working days).
3. Every branch gets a PR with at least one review before merge.
4. Squash-merge into main; delete the source branch on merge.
5. Deploy from main (or tag main for releases).

**Branch naming convention:**
- `feat/short-description` - new feature
- `fix/short-description` - bug fix
- `chore/short-description` - maintenance, refactor
- `hotfix/short-description` - emergency fix (see `guides/02-release-and-hotfix.md`)

---

## Trunk-Based Development (the 15% high-performers answer)

**Prerequisites (all three required):**
1. Feature flag infrastructure is deployed and the team uses it for incomplete features.
2. CI runs in under 10 minutes and is consistently green.
3. Engineers commit to main (or merge to main via short-lived < 1 day branches) at least daily.

**Do not recommend TBD** if any prerequisite is unmet. A team that adopts the TBD label without the prerequisites ends up with disguised GitHub Flow at best, or a broken trunk at worst.

**Reference:** `research/external/2026-02-26-tbd-elite-teams-javacodegeeks.md`, `research/external/2026-04-04-tbd-discipline-codecraftdiary.md`

---

## GitFlow when warranted

GitFlow is justified ONLY for:
- Mobile SDK / desktop software teams managing simultaneous support for v2, v3, v4.
- Projects with external release gates (App Store review, hardware firmware, enterprise "release train" contracts).

**The mobile SDK case study** (from `research/external/2026-03-31-tbd-vs-gitflow-comparison-novvista.md`): A 25-engineer mobile SDK team used GitFlow's release branch model during App Store review cycles. The external constraint (app approval can take 3-14 days) forced a stabilization window. GitFlow's release branch was a natural fit. The team acknowledged TBD + feature flags + a release train approach could have achieved the same outcome but required more upfront investment.

**GitFlow branch map:**
- `main` - production-ready code, tagged at each release
- `develop` - integration branch; source for feature branches
- `feature/X` - branched from develop, merged back to develop
- `release/X.Y.Z` - branched from develop when entering release-candidate phase; bug-fix only; merged to main AND develop on release
- `hotfix/X` - branched from main tag; merged to main AND develop; triggers patch version

---

## Migration paths

When the team needs to change models, see `guides/05-migration-playbook.md` for the step-by-step playbook.

Quick reference:
- **Ad-hoc → GitHub Flow:** Add branch protection to main, establish PR review requirement, agree on naming conventions, enforce squash-merge. 1-2 days of setup.
- **GitFlow → GitHub Flow:** Gradually shorten feature branch lifetimes, introduce feature flags for incomplete work, merge develop into main and delete develop once the team is comfortable. See `guides/05-migration-playbook.md` for the 5-step sequence.
- **GitHub Flow → TBD:** Deploy feature flag infrastructure first. Do not attempt until flag infra is live.

> TODO: open question - GitLab Merge Trains coverage. The Command Brief notes Merge Queue availability varies by platform. Teams on GitLab need guidance on merge trains, which differ from GitHub's queue. See `research/external/2026-05-20-gitlab-merge-trains.md` for the limited coverage available. A targeted search is recommended before advising GitLab teams on merge trains specifically. (`research/research-summary.md` open question 1)
