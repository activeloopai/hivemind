# Quality Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `quality-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/quality-worker-bee.md`](../../../agents/quality-worker-bee.md)
**Stinger:** [`.cursor/skills/quality-stinger/`](../../quality-stinger/)
**Trigger policy:** proactive (the final checkpoint of every plan execution loop)

---

## Domain

`quality-worker-bee` is the final checkpoint in the plan to implement to security to QA loop. It verifies a completed implementation against its source plan document (a feature PRD or an issue IRD) for completeness, correctness, alignment, and regressions, and produces a structured findings report classified by severity. It owns one job: catch gaps between plan and code before work is marked done. It does not write implementations, choose the plan, or substitute its own judgment for what the plan actually specified. It runs after `security-worker-bee`, never before.

## Trigger phrases

Route to `quality-worker-bee` when the user says any of:

- "QA this" / "run quality-worker-bee"
- "Check the implementation" / "audit the implementation"
- "Audit against the plan" / "check the plan against the code" / "verify the PRD was built"
- "Is this done?"

Or at the end of every plan execution, immediately after `security-worker-bee` has run.

## Do NOT route when

- The user wants the security audit (injection, the pre-tool-use gate, trace PII, supply chain) - that is `security-worker-bee`, which runs first.
- The user wants the implementation itself - that is the relevant domain Bee.
- The user wants to judge plan quality - that is `library-worker-bee` (this Bee treats the plan as the source of truth).
- `quality-worker-bee` has already run for this cycle, or `security-worker-bee` has not yet run - flag the ordering violation and wait.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The source plan document (the feature PRD or issue IRD the implementation was built against).
- The completed implementation (the branch or files to audit).
- Confirmation that `security-worker-bee` has already run for this cycle.

If the source plan is missing, do not invoke yet - ask the user which plan to audit against.

## Outputs the Bee produces

- A structured QA findings report classified by severity (Critical / Warning / Suggestion), each finding citing `file.ts:LN` plus a snippet.
- The report lands in the source plan's `reports/` subfolder, or in `library/qa/<domain>/<date>-qa-report.md` for standalone audits.
- A full report even on a clean pass (no silent passes).

## Multi-Bee sequences this Bee participates in

- **Plan execution loop** - the implementation Bee produces the change, `security-worker-bee` audits and remediates Critical/High findings, then `quality-worker-bee` verifies the final implementation against the source plan. Running QA before security is a documented anti-pattern.

## Critical directives the orchestrator should respect

- **Evidence over opinion** - every finding cites `file.ts:LN` plus a snippet.
- **The plan is the source of truth** - plan says X, code does Y, that is a gap regardless of whether Y is reasonable.
- **Severity matters** - Critical blocks ship; inflating severity erodes trust.
- **No silent passes** - even a clean audit produces the full report.
- **Report, don't fix.**
- **Run after `security-worker-bee`, never before** - flag and halt on an ordering violation.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
