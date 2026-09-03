# library-worker-bee - Companion Resources

This directory holds everything the `library-worker-bee` agent needs to do its job. Organized into three layers: **guides** (workflow rules), **examples** (exemplars to imitate), **templates** (files copied on `initialize`).

> **Agent entry point:** [`.cursor/agents/library-worker-bee.md`](../library-worker-bee.md) (repo-local). The agent reads files from this directory by path; it does not auto-load everything into context.
>
> **QA authorship is out of scope.** A separate sibling agent - [`quality-worker-bee`](../quality-worker-bee.md) - owns the authorship of QA reports. Reports tied to a PRD land in `library/requirements/<lifecycle>/prd-<###>-<slug>/qa/prd-<###>-<slug>-qa.md`; reports tied to an IRD land in `library/issues/<lifecycle>/ird-<###>-<slug>/qa/ird-<###>-<slug>-qa.md`; standalone audits land in `library/qa/<domain>/<date>-qa-report.md`. This agent still owns the folder structure, numbering invariants, and lifecycle moves, but does not write QA content.

## Directory map

```
library-stinger/
├── README.md            # you are here
├── guides/              # workflow rules - the agent MUST read one before executing
│   ├── 00-initialize.md
│   ├── 01-knowledge-base.md
│   ├── 02-issue.md
│   ├── 03-feature-prd.md
│   ├── 05-backwards-prd.md
│   └── 06-maintenance.md
├── examples/            # stripped, generic exemplars - mirror these when writing
│   ├── issue-042-example.md
│   ├── feature-007-example.md
│   ├── kb-architecture-example.md
│   ├── kb-api-reference-example.md
│   └── kb-how-to-guide-example.md
└── templates/           # seed files copied into library/ on `initialize`
    ├── documentation-framework.md
    ├── library-README.md
    ├── notes-README.md
    ├── knowledge-base-README.md
    ├── requirements-README.md
    ├── issues-README.md
    ├── features-README.md
    └── qa-README.md
```

> **Note on numbering:** `guides/04-qa.md` and `examples/qa-003-example.md` used to live here when this agent also authored QA reports. Both were removed when QA authorship moved to `quality-worker-bee`. The `04` slot is intentionally left empty - do not renumber the remaining guides.

## Guides - which one to read

The agent dispatches based on user intent. Read the matching guide **before** acting.

| User intent | Read |
|---|---|
| "initialize library" / "set up docs" | [`guides/00-initialize.md`](guides/00-initialize.md) |
| "document <topic>" / "write a guide" / "kb doc" | [`guides/01-knowledge-base.md`](guides/01-knowledge-base.md) |
| "ingest new issues" / "triage" | [`guides/02-issue.md`](guides/02-issue.md) |
| "write a PRD for <feature>" / "plan <feature>" | [`guides/03-feature-prd.md`](guides/03-feature-prd.md) |
| "backwards-PRD" / "document existing code" | [`guides/05-backwards-prd.md`](guides/05-backwards-prd.md) |
| "run a sync audit" / "check for drift" | [`guides/06-maintenance.md`](guides/06-maintenance.md) |
| "write a QA report" / "audit this" | **Hand off to [`quality-worker-bee`](../quality-worker-bee.md).** Not in this agent's scope. |

## Examples - which one to mirror

When writing a new doc, open the matching example and imitate structure, section order, and tone.

| Writing a… | Open |
|---|---|
| Issue PRD | [`examples/issue-042-example.md`](examples/issue-042-example.md) |
| Feature PRD | [`examples/feature-007-example.md`](examples/feature-007-example.md) |
| Architecture doc | [`examples/kb-architecture-example.md`](examples/kb-architecture-example.md) |
| API reference | [`examples/kb-api-reference-example.md`](examples/kb-api-reference-example.md) |
| How-to guide | [`examples/kb-how-to-guide-example.md`](examples/kb-how-to-guide-example.md) |
| QA report | - see the `quality-worker-bee` agent for the template. |

All examples use the placeholder project "ExampleApp" and generic features. Real PRDs should reference the repo's actual project name, files, and labels.

**Path conventions (for outputs, not for examples themselves):** PRDs land in `library/requirements/backlog/prd-<###>-<slug>/prd-<###>-<slug>-index.md` (the index filename may carry an optional `-ck-<clickupId>` suffix) with a `qa/` subfolder; they move through `in-work/` to `completed/` by relocating the whole folder. IRDs land in `library/issues/backlog/ird-<###>-<slug>/ird-<###>-<slug>-index.md` with a `qa/` subfolder, moving through the same lifecycle. Knowledge docs go under `library/knowledge/{public,private}/<domain>/`. The example files in this folder are reference artifacts; the comment headers inside them show the on-disk path they would have when used in a real repo. See [`SKILL.md`](SKILL.md) for the full path table.

## Templates - used by `initialize`

Templates seed the `library/` folder in a new repo. The agent copies them verbatim on first run via `cp -n` (no-clobber - existing files are preserved). See [`guides/00-initialize.md`](guides/00-initialize.md) for the full copy map.

After `initialize`:

1. Edit `library/knowledge/private/standards/documentation-framework.md` - replace placeholders like "(fill in on init)".
2. Customize `library/README.md` with the repo's name + any repo-specific notes.
3. Commit.

The seeded `library/requirements/qa/README.md` (`templates/qa-README.md`) intentionally points downstream readers at the `quality-worker-bee` agent for report authorship - this agent only maintains the folder, not its contents.

## For the agent (self-operation notes)

When a user invokes you:

1. Parse intent → match the user's request to exactly one row in the guides table above.
2. If the intent is QA authorship → stop and hand off to `quality-worker-bee`.
3. `Read` the matching guide in full. Treat it as non-negotiable.
4. If writing a doc, also `Read` the matching example for structural reference.
5. If the task is `initialize`, consult `templates/` and use `cp -n` for idempotent copies.
6. Enforce invariants (numbering, folder state, `notes/` protection, documentation-framework conformance).
7. Produce the artifact and report concisely.

## Supersession

This agent consolidates 4 predecessors; archived at `~/.cursor/archive/`:

- `prd-generator` (was `~/.cursor/agents/prd-generator.md`)
- `documentation-worker-bee` (was `.cursor/skills/documentation-worker-bee/` in a repo)
- `issue-worker-bee` (was `.cursor/skills/issue-worker-bee/` in a repo)
- `backwards-prd` (was `.cursor/skills/backwards-prd/` in a repo)

The former `implementation-qa` predecessor is NOT folded in here - it was kept as a sibling and renamed `quality-worker-bee`. See `.cursor/agents/quality-worker-bee.md`.

Do not read archived sources; the guides in this directory are authoritative.
