# Guide 03 - Feature PRD Authoring

Covers creating and managing PRDs (Product Requirement Documents) for planned product and feature work.

## Trigger phrases

- "write a PRD for X"
- "plan feature X"
- "spec out X"

## Template

Start from the blank fill-in template at `templates/prd-template.md`. Copy it to the correct v2 path and replace every placeholder.

See `examples/prd-007-example.md` for a fully worked example.

## Output path

```
library/requirements/backlog/prd-<###>-<kebab-slug>/
  prd-<###>-<kebab-slug>-index.md                module overview + feature list
  prd-<###><letter>-<kebab-slug>-<feature>.md    sub-feature PRD (optional, multiple allowed)
  qa/
    prd-<###>-<kebab-slug>-qa.md                 QA report (authored by quality-worker-bee)
```

## Naming rules

- Folder: `prd-<###>-<kebab-slug>/`
- `<###>` is repo-local sequential (3-digit zero-padded). **Before assigning**, list all `prd-*` folders across `backlog/`, `in-work/`, and `completed/`; take `max + 1`.
- Index file: `prd-<###>-<kebab-slug>-index.md`
- Sub-PRDs: `prd-<###><letter>-<kebab-slug>-<feature-name>.md` where `<letter>` is `a`, `b`, `c`, etc. - one letter per sub-feature, alphabetical.
- Optional ClickUp suffix on the index file only: `prd-<###>-<kebab-slug>-index-ck-<clickupId>.md`. The folder name never includes the ClickUp suffix.
- Slugs: lowercase kebab-case, ≤ 60 chars.

## PRD index structure

```markdown
# PRD-<###>: <Module Name>

> **Status:** Backlog | In Work | Shipped
> **Priority:** P0 | P1 | P2 | P3
> **Effort:** XS | S | M | L | XL
> **ClickUp:** [<id>](https://app.clickup.com/t/<id>) *(if applicable)*

## Overview

<What this module does and why it exists.>

## Goals

- <Specific outcome the module achieves>

## Non-Goals

- <What this module explicitly does NOT do>

## Features

| Sub-PRD | Feature | Status |
|---|---|---|
| [prd-<###>a-<slug>-<feature>](./prd-<###>a-<slug>-<feature>.md) | <Feature name> | Draft |

## Acceptance Criteria

- [ ] Top-level acceptance criteria for the module as a whole.

## Related

- [knowledge doc or ADR]
```

## Sub-PRD structure

Each sub-PRD (`prd-<###><letter>-<slug>-<feature>.md`) covers one discrete sub-feature. Keep it scoped. A sub-PRD is a full PRD for its feature: goals, non-goals, user stories, acceptance criteria, implementation notes, open questions.

## Lifecycle moves

1. **Create** in `library/requirements/backlog/`.
2. **Start work**: move entire `prd-<###>-<slug>/` folder to `library/requirements/in-work/`.
3. **Ship**: move entire folder to `library/requirements/completed/`.

Always move the full folder (index + sub-PRDs + `qa/`). Never update lifecycle in frontmatter alone.

## QA folder

Create `qa/` inside the PRD folder on creation (empty). `quality-worker-bee` writes `prd-<###>-<slug>-qa.md` there when a QA audit is requested. You own the structure; you never write QA content.
