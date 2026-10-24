# Runbook Writing Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `runbook-writing-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/runbook-writing-worker-bee.md`](../../../agents/runbook-writing-worker-bee.md)
**Stinger:** [`.cursor/skills/runbook-writing-stinger/`](../../runbook-writing-stinger/)
**Trigger policy:** proactive

---

## Domain

`runbook-writing-worker-bee` is the operational runbook authorship specialist. It owns the canonical templates (break-fix, scheduled operation, diagnostic), the no-implied-context audit protocol, exact-command discipline, escalation-path architecture, rollback-procedure standards, runbook-as-test (game day) methodology, and postmortem-to-runbook linkage. For Hivemind, the operational surfaces that get runbooks are the embeddings daemon, schema-heal, and npm release ops. Every command is exactly copy-pasteable, every state-changing step has a rollback, and every runbook names an escalation contact.

## Trigger phrases

Route to `runbook-writing-worker-bee` when the user says any of:

- "Write a runbook"
- "Audit this runbook" / "our runbooks are out of date" / "our on-call docs are weak"
- "We need a runbook for this alert"
- "Turn this postmortem into a runbook"
- "Schedule a game day"

Or when the request implicitly involves authoring or auditing operational runbooks.

## Do NOT route when

- The user wants incident-management tooling setup (PagerDuty/OpsGenie) or infrastructure provisioning decisions - route to `ci-release-worker-bee`.
- The user wants documentation culture or process design beyond the runbook format - route to `library-worker-bee`.
- The user wants the writing-craft review of prose quality - that is `technical-writing-craft-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The operation or alert the runbook covers (and the exact commands/queries/scripts it runs).
- The escalation contact (person, team, or channel) and a response-time expectation.
- Optional: the postmortem to convert, and whether the procedure has been tested.

If the exact commands are unknown, do not invoke yet - ask for them; implied steps are not a runbook.

## Outputs the Bee produces

- A runbook in the right canonical template with exact copy-pasteable commands, a named escalation path, and rollback for every state-changing step.
- A prominent `## TEST STATUS: UNTESTED` header when the procedure has not been exercised.

## Multi-Bee sequences this Bee participates in

- Routes tooling setup and provisioning to `ci-release-worker-bee`, and documentation-process design to `library-worker-bee`.

## Critical directives the orchestrator should respect

- **Never use implied commands** - exact flags, dataset paths, and daemon names.
- **Never skip the escalation path** - a named contact with a response-time expectation.
- **Always include rollback for every state-changing step** (or a documented irreversibility acknowledgment).
- **Mark untested runbooks prominently** with the `## TEST STATUS: UNTESTED` header.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
