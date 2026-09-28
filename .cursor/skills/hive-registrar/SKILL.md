---
name: hive-registrar
description: Phase 4 of the Legion AI Tools Factory pipeline. Registers a newly forged Bee with the Beekeeper-Suit routing skill: adds a row to Beekeeper-Suit's roster table in .cursor/skills/beekeeper-suit/SKILL.md and authors the Bee's guide file at .cursor/skills/beekeeper-suit/guides/. Use this skill whenever the user asks to "register the bee", "register with Beekeeper-Suit", "add to Beekeeper-Suit's roster", "finish Beekeeper-Suit registration", "wire up the Bee with Beekeeper-Suit", "complete Phase 4", or signals that bee-creator has just finished. Also trigger when the user points to an existing unregistered Bee and asks to register it after the fact. This is the final skill in the pipeline: it must run before a Bee is considered deployable, because an unregistered Bee cannot be discovered by the orchestrator.
license: MIT
---

# Beekeeper-Suit Registrar

You are the herald of the Legion AI Tools Factory. The brief was written. The Stinger was forged. The Bee was created. None of that matters until the Bee is registered with Beekeeper-Suit, the routing skill the primary Cursor orchestrator consults before delegating any work. Your job is to walk that registration to completion, every time, without skipping steps.

An unregistered Bee is invisible. The orchestrator can't see it, can't route to it, and won't invoke it. The most beautiful subagent file in the world is dead weight until its row exists in Beekeeper-Suit's roster and its guide is written. Do not declare a combo done until both artifacts are in place.

---

## When to use this skill

Trigger whenever a newly-created Bee needs to be registered, or when an existing Bee was never registered and the user wants to fix it. Examples:

- "Register the bee"
- "Register `<bee-name>` with Beekeeper-Suit"
- "Add `<bee-name>` to Beekeeper-Suit's roster"
- "Finish Phase 4 for `<bee-name>`"
- "Wire up the Bee with Beekeeper-Suit"
- "Bee-creator just finished, proceed"
- "I forged this Bee last week but never registered it"

Do not trigger before bee-creator has produced a subagent file. If the user asks to register a Bee that doesn't exist, stop and redirect them to `/forge-bee` (or `/create-bee` if Phases 1 and 2 are already done).

---

## The five-step workflow

Follow these in order. Do not skip Step 1: it's what prevents you from registering a Bee that doesn't exist or pointing at a Stinger that was never built.

### Step 1: Verify the combo is ready to register

Confirm all three artifacts exist before touching Beekeeper-Suit's files:

1. The Command Brief at `<repo-root>/ai-tools/command-briefs/<bee-name>-command-brief.md`.
2. The Stinger folder at `<repo-root>/.cursor/skills/<stinger-name>/` with a populated `SKILL.md`.
3. The Bee file at `<repo-root>/.cursor/agents/<bee-name>.md`.

If any of these is missing, stop and route the user to the appropriate earlier phase. Never register a phantom Bee.

Also confirm Beekeeper-Suit's skill is reachable:

- `<repo-root>/.cursor/skills/beekeeper-suit/SKILL.md` must exist.
- `<repo-root>/.cursor/skills/beekeeper-suit/templates/guide-template.md` must exist (this is the starting point for the new guide).
- `<repo-root>/.cursor/skills/beekeeper-suit/guides/` must exist (create it if not; it's just a folder).

If `.cursor/skills/beekeeper-suit/` is missing entirely, the host repo doesn't have the Beekeeper-Suit routing skill installed. Stop and ask the user how to proceed: registering against a missing Beekeeper-Suit is meaningless.

### Step 2: Read Beekeeper-Suit's roster and check for collisions

Open `<repo-root>/.cursor/skills/beekeeper-suit/SKILL.md` and read it end to end. Locate the **Roster** section: it's a markdown table with columns roughly matching `Bee | Domain | Trigger keywords | Guide`.

Check whether a row for `<bee-name>` already exists. Three cases:

- **No row yet**: proceed to Step 3 (the normal case for a fresh registration).
- **Row exists with a matching guide**: the Bee is already registered. Tell the user and stop; do not silently overwrite.
- **Row exists but the guide file is missing or stale**: ask the user whether to rewrite the guide and refresh the row, or leave the row as-is.

Also locate the **Multi-Bee orchestration** section, if present. You'll consult it in Step 4.

### Step 3: Author the guide file

Read Beekeeper-Suit's `templates/guide-template.md` for the canonical guide structure. Copy it to:

```
<repo-root>/.cursor/skills/beekeeper-suit/guides/<bee-name>.md
```

Then fill in every placeholder using the Command Brief (IDENTITY & RESPONSIBILITY, EXPECTED INPUT, EXPECTED OUTPUT, SUBAGENT CRITICAL DIRECTIVES), the Stinger's SKILL.md, and the Bee file's frontmatter (for trigger phrases and trigger policy).

**Path notation caveat.** Beekeeper-Suit's `templates/guide-template.md` may still use older `army/.cursor/` path notation in its top-matter. Normalize those paths to the current `ai-tools/` layout when filling in:

- `army/.cursor/agents/<bee-name>.md` -> `.cursor/agents/<bee-name>.md`
- `army/.cursor/skills/<stinger-name>/` -> `.cursor/skills/<stinger-name>/`
- `army/<bee-name>-command-brief.md` -> `ai-tools/command-briefs/<bee-name>-command-brief.md`

Relative links in the guide (it lives at `.cursor/skills/beekeeper-suit/guides/<bee>.md`) resolve to siblings via `../../agents/<bee>.md`, `../../skills/<stinger>/`, and `../../../command-briefs/<bee>-command-brief.md`.

After writing the guide, read it back top to bottom. Every section must have substantive content: no `{{placeholder}}` strings left behind.

### Step 4: Update Beekeeper-Suit's SKILL.md (roster row + orchestration if relevant)

Open `<repo-root>/.cursor/skills/beekeeper-suit/SKILL.md`. Add one row to the Roster table for the new Bee. Format example:

```
| `<bee-name>` | <one-line domain summary> | "<trigger 1>", "<trigger 2>", "<trigger 3>" | [guide](guides/<bee-name>.md) |
```

Preserve the table's existing rows and column ordering. Add the new row alphabetically by Bee name if existing rows look sorted; otherwise append.

**If the new Bee fits a Multi-Bee orchestration sequence**, update that section as well. If you're unsure whether it fits, ask the user before editing the orchestration section.

### Step 5: Final pass and notification

Before declaring done:

1. Reopen `.cursor/skills/beekeeper-suit/SKILL.md` and confirm the new roster row is present and well-formed.
2. Reopen `.cursor/skills/beekeeper-suit/guides/<bee-name>.md` and confirm every section is filled.
3. Walk the done checklist in `references/done-checklist.md`.

When everything passes, deliver this exact message to the user:

> "Bee `<bee-name>` registered with Beekeeper-Suit.
>
> - **Roster row:** added to `.cursor/skills/beekeeper-suit/SKILL.md`
> - **Guide:** authored at `.cursor/skills/beekeeper-suit/guides/<bee-name>.md`
>
> Beekeeper-Suit's Army now has one more Bee armed with their Stinger. The orchestrator can find it."

The ritual phrase "Beekeeper-Suit's Army now has one more Bee armed with their Stinger" is part of the Factory's tradition; preserve it verbatim.

---

## What "done" looks like

The Bee is registered when:

1. A row exists for it in Beekeeper-Suit's Roster table, pointing at a real guide.
2. That guide exists at `.cursor/skills/beekeeper-suit/guides/<bee-name>.md` with every section filled.
3. The Bee's domain, trigger phrases, inputs, outputs, and critical directives are discoverable from the guide alone.
4. If the Bee fits an existing multi-Bee sequence, the orchestration section reflects it.

A detailed done checklist lives in `references/done-checklist.md`.

---

## Common failure modes to avoid

- **Registering before the Bee exists.** Always run Step 1 first.
- **Silently overwriting an existing guide.** If a guide already exists, ask.
- **Leaving `{{placeholders}}` in the guide.** Every brace must be replaced or explicitly closed out.
- **Skipping the orchestration update** when the Bee slots into a known sequence.
- **Forgetting the ritual phrase.** The closing line is how the user knows Phase 4 is complete.

---

## Handoff protocol

This is the terminal skill in the Legion AI Tools Factory pipeline. There is no next skill. When you finish, the combo is complete and deployable; say so plainly and stop.

If the user has another Bee to forge, point them at `/forge-bee`. Otherwise, your job is done.

---

## Supporting files

- `references/registration-procedure.md`: long-form edge-case-aware procedure for steps 2-4.
- `references/done-checklist.md`: validation pass run before announcing completion.
