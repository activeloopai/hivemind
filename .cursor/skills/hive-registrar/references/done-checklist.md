# Done Checklist for a Registered Bee

Walk this before announcing registration is complete. Each item should be "done" or "consciously skipped with a note".

---

## Inputs verified

- [ ] Command Brief exists at `ai-tools/command-briefs/<bee-name>-command-brief.md`.
- [ ] Stinger folder exists at `.cursor/skills/<stinger-name>/` with a populated `SKILL.md`.
- [ ] Bee file exists at `.cursor/agents/<bee-name>.md`.
- [ ] Beekeeper-Suit's `SKILL.md`, `templates/guide-template.md`, and `guides/` folder all exist.

## Collision check

- [ ] No prior roster row exists for this Bee (or the user explicitly approved replacing it).
- [ ] No prior guide file exists at `.cursor/skills/beekeeper-suit/guides/<bee-name>.md` (or the user approved overwriting it).

## Guide file (`guides/<bee-name>.md`)

- [ ] File exists at the correct path.
- [ ] Title and `{{bee-name}}` references replaced with real values.
- [ ] Bee, Stinger, and Command Brief links in the top-matter point at real files using current `ai-tools/` paths.
- [ ] Domain paragraph is 3-5 sentences, lifted from the Command Brief.
- [ ] Trigger phrases section lists 3+ realistic user phrases.
- [ ] "Do NOT route when" section is non-empty (or explicitly notes "no known competing Bees").
- [ ] Inputs and Outputs sections match the Command Brief.
- [ ] Critical directives section pulls 2-3 highlights from the Bee file.
- [ ] Trigger policy matches the Bee file's `proactive:` value.
- [ ] No `{{placeholder}}` strings remain anywhere in the file.

## Roster row (`SKILL.md`)

- [ ] One new row added to the Roster table.
- [ ] Bee name uses backticks: `` `<bee-name>` ``.
- [ ] Domain summary is 15 words or fewer.
- [ ] Trigger keywords are 2-4 short, quoted user phrases.
- [ ] Guide link is relative (`[`guides/<bee-name>.md`](guides/<bee-name>.md)`) and resolves.
- [ ] Table markdown is intact: pipes line up, no broken cells, no extra blank rows.

## Multi-Bee orchestration

- [ ] If the Bee fits an existing sequence, the orchestration section was updated.
- [ ] If a new sequence is being introduced, the user was asked before it was added.
- [ ] If no sequence applies, the orchestration section was left untouched.

## Cross-references

- [ ] Every link in the new guide resolves on disk.
- [ ] The Bee file (`.cursor/agents/<bee-name>.md`) is reachable from the guide.
- [ ] The Stinger folder is reachable from the guide.
- [ ] The Command Brief is reachable from the guide.

## Handoff

- [ ] The final user message names both artifacts that were written (roster row + guide).
- [ ] The ceremonial line is present: "Beekeeper-Suit's Army now has one more Bee armed with their Stinger."
- [ ] The user is told the pipeline is complete and no further phase remains.
