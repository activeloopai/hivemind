# Guide 00 - Initialize Command

Scaffolds or migrates a repository's `library/` folder to schema v2.

## Trigger phrases

- "initialize library"
- "set up docs"
- "scaffold documentation"
- "set up library-worker-bee"

## How to scaffold

This repo has no `standardize-library` script. Create the v2 tree manually using the folder README seeds in `templates/`. Each `templates/*-README.md` is the canonical seed for the matching folder - copy it in, do not invent new frontmatter.

If a future deployment ships an idempotent scaffold script, prefer running it over hand-creating folders (it guarantees consistent README seeding). Absent that, the manual procedure below is authoritative.

## What to create (v2 target tree)

```
library/
  README.md
  knowledge/
    README.md
    public/
      README.md
      overview/
      guides/
      faqs/
    private/
      README.md
      architecture/                 (ADRs go here)
      standards/
        documentation-framework.md
  requirements/
    README.md
    in-work/   README.md
    backlog/   README.md
    completed/ README.md
    reports/   README.md
  issues/
    README.md
    in-work/   README.md
    backlog/   README.md
    completed/ README.md
  notes/
    README.md
```

Every folder gets a seeded `README.md` with YAML frontmatter (`ai_description`, `human_description`) explaining the folder's invariants. The seeds live in this skill's `templates/` folder.

## v1 -> v2 migration map

| v1 path | v2 path |
|---|---|
| `library/knowledge-base/<domain>/` | `library/knowledge/private/<domain>/` |
| `library/knowledge-base/overview/` | `library/knowledge/public/overview/` |
| `library/architecture/ADR-*.md` | `library/knowledge/private/architecture/ADR-*.md` |
| `library/requirements/features/feature-NNN-slug/` | `library/requirements/backlog/prd-NNN-slug/` |
| `library/requirements/features/.../prd-feature-NNN-slug.md` | `library/requirements/backlog/prd-NNN-slug/prd-NNN-slug-index.md` |
| `library/requirements/features/.../reports/` | `library/requirements/backlog/prd-NNN-slug/qa/` |
| `library/requirements/issues/issue-NNN-slug/` | `library/issues/backlog/ird-NNN-slug/` |
| `library/qa/` | `library/requirements/reports/` |

## Post-flight

After scaffolding:

1. Confirm every folder in the target tree exists and has its seeded `README.md`.
2. Confirm `notes/` was created but otherwise left untouched.
3. Tell the user: what was created/migrated, that `notes/` is human-only, and the next steps for creating content.

## Error handling

- **Conflict on migration**: if a v2 destination already exists with different content, do NOT overwrite. Report the collision to the user for manual resolution.
- **Partial v1 tree**: migrate only the paths that exist; do not fabricate empty v1 folders to "complete" the map.
- **Not actually a repo root**: confirm you are at the repository root (where `library/` should live) before creating anything.
