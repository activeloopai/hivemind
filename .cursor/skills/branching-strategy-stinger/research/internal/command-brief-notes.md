# Internal Notes: branching-strategy-worker-bee Command Brief

## Bee identity

`branching-strategy-worker-bee` is an opinionated but context-aware advisor. It defaults to trunk-based development for most teams but knows when GitFlow or a release-train model is genuinely justified.

## Stinger identity

`branching-strategy-stinger` encodes decision frameworks, heuristics, anti-pattern catalog, and worked examples organized around four decision surfaces:

1. **Model selection** - trunk-based vs GitHub Flow vs GitFlow
2. **Merge-vs-rebase question** - squash vs merge commit vs rebase
3. **Release and hotfix patterns** - release branch lifecycle, hotfix protocol
4. **Feature-flag vs feature-branch trade-off** - the long-lived-branch trap

## Proposed guide structure (from Command Brief IDEAS section)

| File | Content |
|---|---|
| `guides/00-principles.md` | Trunk-first default, 2-working-day threshold, three canonical models, merge-vs-rebase guardrails, flag cost-benefit |
| `guides/01-model-selection.md` | Decision tree: team size, release cadence, environment count, maintenance obligations |
| `guides/02-release-and-hotfix.md` | Release branch lifecycle, hotfix protocol, GitHub Merge Queue as release-train accelerator |
| `guides/03-merge-vs-rebase.md` | Squash vs merge commit vs rebase; when each harms bisect or audit trails |
| `guides/04-feature-flag-vs-branch.md` | Long-lived-branch trap formalized, flag operational cost, decision matrix |
| `guides/05-migration-playbook.md` | GitFlow to trunk-based migration in an active repo |
| `guides/06-merge-queue.md` | GitHub Merge Queue setup, queue modes, rollback semantics, complexity cost |

## Critical directives from Command Brief

1. **Always ask for release cadence before recommending a model.** 10x/day = TBD. Quarterly = possibly GitFlow.
2. **Never recommend GitFlow as a default.** Surface the bias explicitly. Let team override with justification.
3. **Always surface the long-lived-branch trap.** Two working days = named threshold.
4. **Distinguish merge strategy from branch model.** These are separate configuration choices.
5. **Route to `github-repo-health-worker-bee` for protection ruleset changes, not `ci-release-worker-bee`.**

## Boundary map

| Domain | Owner |
|---|---|
| Rebase mechanics, interactive rebase, conflict resolution | `git-worker-bee` |
| Branch protection ruleset configuration in GitHub | `github-repo-health-worker-bee` |
| CI/CD pipeline topology | `ci-release-worker-bee` |
| Release communication downstream of branching model | `changelog-release-notes-worker-bee` |

## Refresh cadence

Annually, or when GitHub ships a major merge-queue feature update. Re-run scripture-historian at `shallow` tier on each Cursor major version.

## Key open question from Command Brief

- Monorepo vs polyrepo branching differences - should policy doc template include a section for this?
- GitLab merge trains vs GitHub merge queue - teams on GitLab need different guidance.
