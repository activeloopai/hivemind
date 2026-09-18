# Branching Strategy Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `branching-strategy-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/branching-strategy-worker-bee.md`](../../../agents/branching-strategy-worker-bee.md)
**Stinger:** [`.cursor/skills/branching-strategy-stinger/`](../../branching-strategy-stinger/)
**Trigger policy:** proactive

---

## Domain

`branching-strategy-worker-bee` is the branching strategy advisor for Git-based teams. It owns model selection (trunk-based development, GitHub Flow, GitFlow), release and hotfix branch patterns, the merge-vs-rebase argument, the long-lived-branch trap, the feature-flag vs feature-branch decision, and Merge Queue setup. It anchors recommendations to release cadence and the 2-working-day branch-lifetime threshold, and it explicitly separates merge strategy from branch model.

## Trigger phrases

Route to `branching-strategy-worker-bee` when the user says any of:

- "Which branching model should we use"
- "GitFlow or trunk-based?"
- "Merge or rebase?"
- "Feature flag or branch?" / "should I use a feature flag or a branch?"
- "Set up Merge Queue" / "set up GitHub Merge Queue"
- "Migrate from GitFlow" / "we have too many merge conflicts" / "our release process is broken"

Or when a PR, retrospective, or architecture discussion surfaces branching pain.

## Do NOT route when

- The user wants the Git mechanics (interactive rebase, conflict resolution, history rewriting) - that is `git-worker-bee`. This Bee picks the model; git runs the operation.
- The user wants branch protection ruleset configuration - that is `github-repo-health-worker-bee`.
- The user wants CI/CD pipeline topology - that is `ci-release-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The team's release cadence (the single strongest predictor of the right model).
- The current branching pain (merge conflicts, long-lived branches, release confusion).
- Optional: team size and whether multiple released versions are maintained.

If release cadence is missing, do not invoke yet - ask for it before recommending a model.

## Outputs the Bee produces

- A model recommendation (trunk-based / GitHub Flow / GitFlow) justified by cadence, with merge-strategy and feature-flag-vs-branch guidance.
- Migration plans (e.g., GitFlow to trunk-based) and Merge Queue setup.

## Multi-Bee sequences this Bee participates in

- Routes Git mechanics to `git-worker-bee`, protection-ruleset configuration to `github-repo-health-worker-bee`, and CI topology to `ci-release-worker-bee`.

## Critical directives the orchestrator should respect

- **Always ask for release cadence before recommending a model.**
- **Never recommend GitFlow as a default** - state the bias explicitly and require justification.
- **Always surface the 2-working-day threshold** for branch lifetime.
- **Distinguish merge strategy from branch model** - they are independent choices.
- **Route protection-ruleset configuration to `github-repo-health-worker-bee`, not `ci-release-worker-bee`.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
