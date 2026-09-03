# Guide 05: The `.cursor/` Bee Army Layout

How the Bee Army is structured inside `.cursor/`, and the conventions that keep it working in Cursor.

## The Army is a `.cursor/` construct

The Army lives entirely under `.cursor/` and is read by Cursor's native machinery:

```text
.cursor/
+- rules/                       Cursor project rules (.mdc with frontmatter)
|  +- no-em-dashes.mdc
|  +- plan-construction-protocol.mdc
|  +- respect-agent-work-boundaries.mdc
+- agents/                      one Markdown file per Bee (subagent)
|  +- <base>-worker-bee.md
|  +- ... (cursor-ide, harness-integration, security, quality, etc.)
+- skills/                      one folder per Stinger + the orchestrator skills
|  +- <base>-stinger/           the Bee's paired arsenal (SKILL.md + guides/examples/templates/research)
|  +- beekeeper-suit/           the routing roster skill
|  +- hive-registrar/           registration skill
+- commands/                    slash commands the user types
|  +- the-beekeeper.md          route a task through the roster, dispatch armed Bees
|  +- the-smoker.md             drive PRDs to 100% completion in waves
+- model-comparison-matrix.md   scored model-routing rubric used when dispatching Bees
```

## The pairing convention

Every Bee is `<base>-worker-bee` and pairs with exactly one Stinger `<base>-stinger`:

- The **Bee** (`.cursor/agents/<base>-worker-bee.md`) is persona + guardrails: identity, procedure, critical directives, escalation, and Read-references into its Stinger.
- The **Stinger** (`.cursor/skills/<base>-stinger/`) is the procedural arsenal: a `SKILL.md` master index plus `guides/`, `examples/`, `templates/`, and `research/`.

This stinger pairs with `cursor-ide-worker-bee`. When you author or edit a Bee/Stinger, keep the names in lockstep and keep the Bee's Read-references pointing at real files in its Stinger.

## Rules

Cursor reads `.cursor/rules/*.mdc` as project rules. Frontmatter (`description` / `globs` / `alwaysApply`) selects the activation mode (see `guides/02`). The three live rules are Army-wide guardrails: the em-dash ban, the plan-construction protocol, and the work-boundary rule that keeps each Bee inside its assigned scope.

## Commands and orchestration

Two slash commands drive the Army:

- **`/the-beekeeper`** routes a task through the `beekeeper-suit` roster and dispatches the right Bee(s), each ARMED with its paired Stinger before it starts. Independent Bees run in parallel in one wave; dependent Bees run in sequence after their dependency is verified.
- **`/the-smoker`** takes a set of PRDs and drives every acceptance criterion to verified completion in waves, tracked in an execution ledger.

Both close out every implementation task with **`security-worker-bee` first, then `quality-worker-bee`** (never quality before security; a security fix can invalidate the QA result). Both pick a model per Bee using `.cursor/model-comparison-matrix.md`.

## The model-comparison-matrix

`.cursor/model-comparison-matrix.md` is a scored rubric (1-10 across reasoning, code quality, tool use, cost, speed, context, etc.) for routing each Bee to the best spawnable model. The orchestrator commands consult it when building a wave plan. It is reference data, not a rule; refresh it when the spawnable model slugs change.

## When editing the layout

- Keep `<base>-worker-bee` and `<base>-stinger` names matched.
- A new Bee needs: the agent file, the Stinger folder, a roster entry in `beekeeper-suit`, and (per the Army's process) registration via `hive-registrar`.
- Do not rename or substitute the Cursor-specific skill/agent/command names the orchestrators reference; they are matched by exact `name:` frontmatter.
- Author all of it without em dashes.
