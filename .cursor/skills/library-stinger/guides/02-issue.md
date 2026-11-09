# Guide 02 - Issue IRD Authoring

Covers creating and managing IRDs (Issue Resolution Documents) for reactive bug and incident work.

## Trigger phrases

- "ingest new GitHub issues"
- "write an IRD for issue #42"
- "track this bug"
- "document this incident"

## Template

Start from the blank fill-in template at `templates/ird-template.md`. Copy it to the correct v2 path and replace every placeholder.

See `examples/ird-042-example.md` for a fully worked example.

## Pre-conditions

1. A GitHub issue **must already exist** for this repo. IRD numbers = GitHub issue numbers. Never invent.
2. Confirm the GitHub issue number before creating the IRD folder.

## Output path

```
library/issues/backlog/ird-<###>-<kebab-slug>/
  ird-<###>-<kebab-slug>-index.md    the single-scope fix plan
  qa/
    ird-<###>-<kebab-slug>-qa.md     QA report (authored by quality-worker-bee)
```

## Naming rules

- Folder: `ird-<###>-<kebab-slug>/` - `###` is the GitHub issue number (3-digit zero-padded)
- Index file: `ird-<###>-<kebab-slug>-index.md`
- Slugs: lowercase kebab-case, ≤ 60 chars
- No sub-IRDs. One issue = one IRD. Keep scope tight.

## IRD index structure

```markdown
# IRD-<###>: <Title>

> **GitHub Issue:** [#<###>](https://github.com/<org>/<repo>/issues/<###>)
> **Status:** Backlog | In Work | Resolved
> **Priority:** P0 | P1 | P2 | P3
> **Effort:** XS | S | M | L | XL

## Problem

<Precise description of the bug or incident. What is observed vs expected.>

## Root Cause

<Once known, fill in. Leave blank initially.>

## Fix Plan

<Step-by-step fix approach. Cite specific files and line numbers.>

## Acceptance Criteria

- [ ] The specific behaviour that confirms the fix works.

## Related

- [link to affected PRD or knowledge doc]
```

## Lifecycle moves

1. **Create** in `library/issues/backlog/`.
2. **Start work**: move entire `ird-<###>-<slug>/` folder to `library/issues/in-work/`.
3. **Resolve**: move entire folder to `library/issues/completed/`.

Always move the full folder. Never update lifecycle in frontmatter alone.

## QA folder

Create `qa/` inside the IRD folder on creation (empty). The `quality-worker-bee` agent writes `ird-<###>-<slug>-qa.md` there when a QA audit is requested. You own the folder structure; you never write QA content.
