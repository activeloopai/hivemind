# Registration Procedure: long form

This is the careful, edge-case-aware version of Steps 2-4 of hive-registrar's SKILL.md. Read it when the simple flow doesn't apply: duplicate names, missing templates, malformed roster tables, or registrations that require touching the orchestration section.

---

## Reading Beekeeper-Suit's SKILL.md

Beekeeper-Suit's SKILL.md is the source of truth for the roster. Read it end to end before editing; don't pattern-match on a fragment.

Look for these landmarks in order:

1. The YAML frontmatter: confirms you're editing the correct skill.
2. A heading named **Roster** (or close variants like "## The Roster", "## The Roster: N Active Bees", "## Active Bees"). The first markdown table after that heading is the roster.
3. A heading named **Multi-Bee orchestration** (or variants like "## Orchestration sequences", "## Known sequences"). The content under it lists ordered Bee sequences.
4. A heading named **How to use this skill** or **Adding a new Bee**. These document the conventions the file expects you to follow; read them before editing.

If Beekeeper-Suit's SKILL.md is missing any of these landmarks, do not try to invent them. Stop and ask the user how to proceed: the host's Beekeeper-Suit skill may be a different version than this registrar assumes.

---

## Identifying the roster table

The roster table is markdown with these typical columns:

- **Bee**: the bee name as inline code.
- **Domain**: a short prose summary.
- **Trigger keywords** OR **Proactive?** OR **Key handoffs**: varies by version.
- **Guide**: a relative link to `guides/<bee>.md`.

If the column count or names differ from what's shown in this registrar's SKILL.md, match the file's actual structure. Do not reformat the table to match this registrar's assumptions; preserve the host's conventions.

---

## Adding the new row safely

Use the Edit tool to add a single new row. The safest pattern is:

1. Find the last existing row in the roster table (by reading the file).
2. Edit by replacing that last row with itself plus the new row appended.
3. Re-read the file and confirm the table renders correctly.

If the rows look sorted alphabetically, insert in alphabetical order instead of appending. If they look sorted by registration date (oldest first), append. If you can't tell, append.

Never use `replace_all` for table edits: it's too easy to clobber unrelated rows that happen to share a prefix.

---

## Authoring the guide file

The guide is created by reading `.cursor/skills/beekeeper-suit/templates/guide-template.md` and substituting every `{{placeholder}}` with content derived from the three source artifacts (Command Brief, Stinger SKILL.md, Bee file).

### Sourcing each placeholder

- **`{{Bee Display Name}}`**: Title Case the bee name with the suffix capitalized normally: `mcp-protocol-worker-bee` -> `MCP Protocol Worker-Bee`, `typescript-node-worker-bee` -> `TypeScript Node Worker-Bee`. If unsure, ask the user.
- **`{{bee-name}}`**: the slug as it appears in the bee file's frontmatter.
- **`{{stinger-name}}`**: the slug of the paired stinger folder.
- **Domain paragraph**: pull from the Command Brief's IDENTITY & RESPONSIBILITY section, tighten to 3-5 sentences. Drop any meta-commentary; the orchestrator needs only what the Bee owns.
- **Trigger phrases**: extract 3-5 from the Bee file's `description` frontmatter field. Each should be a phrase a user would actually say.
- **Do NOT route when**: look for "Do not invoke for X" in the Bee description, plus any negative scope statements in the Command Brief's IDENTITY & RESPONSIBILITY ("It does not design the schema, tune recall, ..."). State the competing Bee by name where possible.
- **Inputs the Bee needs**: restate the Command Brief's EXPECTED INPUT bullets, with "if absent, ..." notes for optional ones.
- **Outputs the Bee produces**: restate EXPECTED OUTPUT, naming format + destination.
- **Multi-Bee sequences**: only fill if the Bee file's procedure or critical directives names other Bees, or if the Command Brief explicitly mentions handoffs. Otherwise write "None yet: this Bee currently runs standalone."
- **Critical directives**: top 2-3 from the Bee file. Don't duplicate the full list; link to the Bee file for the rest.
- **Trigger policy**: copy the Bee file's `proactive:` frontmatter value.

### Path normalization

If Beekeeper-Suit's template still uses `army/.cursor/` notation, normalize when filling in:

- `army/.cursor/agents/<bee>.md` -> `.cursor/agents/<bee>.md`
- `army/.cursor/skills/<stinger>/` -> `.cursor/skills/<stinger>/`
- `army/<bee>-command-brief.md` -> `ai-tools/command-briefs/<bee>-command-brief.md`

Relative links inside the guide (which lives at `.cursor/skills/beekeeper-suit/guides/<bee>.md`):

- to the Bee file: `../../agents/<bee>.md`
- to the Stinger folder: `../../skills/<stinger>/`
- to the Command Brief: `../../../command-briefs/<bee>-command-brief.md`

---

## Updating Multi-Bee orchestration

Default: leave it alone. Multi-Bee sequences are domain decisions the user should be involved in.

Update only when at least one of these is true:

1. The Command Brief's IDEAS, SUGGESTIONS, QUESTIONS or NOTES section explicitly names the sequence.
2. The Bee file's Procedure or Critical directives section names upstream or downstream Bees (for example, "after this Bee runs, hand off to `quality-worker-bee`").
3. The user has told you which sequence to add the Bee to.

When updating, preserve the existing sequence structure. Add the Bee as a new numbered step, or extend an existing list. Never reorder existing sequences without asking.

---

## Edge cases

### The Bee was already registered

If a roster row exists with a guide file behind it, the Bee is already in the system. Tell the user:

> "`<bee-name>` is already registered in Beekeeper-Suit's roster, guide at `.cursor/skills/beekeeper-suit/guides/<bee-name>.md`. No action taken. If you want to refresh the guide (for example, the Bee's description or directives changed), confirm and I'll rewrite it."

Wait for explicit confirmation before re-authoring.

### A guide exists but no roster row points at it

This usually means a prior registration was half-finished. Show the user the orphan guide and ask whether to add a roster row, delete the guide, or rewrite from scratch.

### The Bee file references a Stinger that doesn't exist

Stop. Don't register. Tell the user the Stinger folder is missing and route them to `/forge-stinger`.

### The Beekeeper-Suit template is missing or empty

Tell the user Beekeeper-Suit's `templates/guide-template.md` is missing or empty, and ask whether they'd like to author it first or proceed with a built-in fallback structure. Do not silently invent a guide structure.

### The roster table is missing or malformed

Stop. Tell the user the Roster table can't be parsed and offer to either fix it manually first or proceed with adding a section that this registrar can extend. Do not append rows to a broken table.

---

## Verification

After every edit, re-read the modified file and confirm:

- The new content is in the right location.
- Surrounding content was not accidentally altered.
- Markdown syntax is intact (table pipes, link brackets, code fences).

The done checklist in `done-checklist.md` is the full validation pass.
