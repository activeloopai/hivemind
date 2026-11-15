# Code Review / PR Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `code-review-pr-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/code-review-pr-worker-bee.md`](../../../agents/code-review-pr-worker-bee.md)
**Stinger:** [`.cursor/skills/code-review-pr-stinger/`](../../code-review-pr-stinger/)
**Trigger policy:** proactive

---

## Domain

`code-review-pr-worker-bee` owns code review culture and the PR lifecycle. It audits PR descriptions against the canonical six-element structure, generates context-specific review checklists, evaluates PR size (the 400-line threshold), diagnoses rubber-stamp patterns, and coaches review comments into the three-tier taxonomy (blocker / suggestion / nit). It treats review as mentorship and advises on human decisions rather than making merge calls itself.

## Trigger phrases

Route to `code-review-pr-worker-bee` when the user says any of:

- "Audit our PR culture" / "improve code review"
- "Write a PR description"
- "Create a review checklist"
- "Coach this review comment"
- "Is this PR too large?"
- "How do we improve code review on our team?"

Or when reviewing any PR for description quality or cultural health.

## Do NOT route when

- The user wants the security audit findings - that is `security-worker-bee`.
- The user wants implementation correctness review of the TypeScript itself - that is `typescript-node-worker-bee`.
- The user wants CI/CD pipeline setup - that is `ci-release-worker-bee`.
- The user wants branch protection configuration - that is `github-repo-health-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The PR description, the review comment, or the team's review process in scope.
- Optional: the PR diff size and the team's existing review norms.

If the artifact to review is missing, do not invoke yet - ask the user to paste the PR description or comment.

## Outputs the Bee produces

- An audit table (pass/fail/warn per element) scored before any rewrite.
- Rewritten PR descriptions including a "What did NOT change" section.
- Review checklists and coached review comments (tone and clarity preserved, technical position intact).

## Multi-Bee sequences this Bee participates in

- Surfaces security findings to `security-worker-bee`, implementation-correctness questions to `typescript-node-worker-bee`, and protection configuration to `github-repo-health-worker-bee`.

## Critical directives the orchestrator should respect

- **Always score before rewriting** - emit the audit table first.
- **Every PR description rewrite must include a "What did NOT change" section.**
- **Never approve or block a merge** - merge decisions belong to humans and CI.
- **Size threshold is advisory, not a hard block.**
- **Comment coaching must preserve the reviewer's intent** - never invert the technical position.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
