# {{Bee Display Name}} - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `{{bee-name}}`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`army/.cursor/agents/{{bee-name}}.md`](../../agents/{{bee-name}}.md)
**Stinger:** [`army/.cursor/skills/{{stinger-name}}/`](../../skills/{{stinger-name}}/)
**Command Brief:** [`army/{{bee-name}}-command-brief.md`](../../../{{bee-name}}-command-brief.md)
**Trigger policy:** {{proactive | on-demand}}

---

## Domain

{{One paragraph: what single domain does this Bee own? Lift from the Command Brief's IDENTITY & RESPONSIBILITY, tightened to 3-5 sentences.}}

## Trigger phrases

Route to `{{bee-name}}` when the user says any of:

- "{{trigger phrase 1}}"
- "{{trigger phrase 2}}"
- "{{trigger phrase 3}}"

Or when the request implicitly involves {{the domain area}}.

## Do NOT route when

- {{negative trigger 1 - names the other Bee that owns this}}
- {{negative trigger 2}}
- {{negative trigger 3}}

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let the broader one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- {{required input 1}}
- {{required input 2}}
- {{optional input - default behavior if absent}}

If a required input is missing, do not invoke yet - ask the user to supply it.

## Outputs the Bee produces

- {{primary deliverable + location}}
- {{secondary deliverable, if any}}
- {{commit/audit trail produced}}

## Multi-Bee sequences this Bee participates in

- {{sequence name}} - {{this Bee's position in the sequence and what hands off to it / from it}}

## Critical directives the orchestrator should respect

- {{directive 1 the user expects to be honored}}
- {{directive 2}}

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`army/.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
