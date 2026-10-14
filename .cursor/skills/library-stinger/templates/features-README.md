# library/requirements/features/

Forward-looking feature PRDs - planned work that does not require a GitHub issue. Use this for product roadmap items, architectural initiatives, and backwards-PRDs for already-shipped features.

## Folder + filename

```
feature-<###>-<kebab-title>/
├── prd-feature-<###>-<kebab-title>.md           # main PRD
└── reports/                                 # QA reports + adjacent artifacts
    └── <date>-qa-report.md                  # written by quality-worker-bee
```

When the feature is sourced from a ClickUp task, the main filename gains a `-ck-<clickupId>` suffix:

```
feature-<###>-<kebab-title>/
└── prd-feature-<###>-<kebab-title>-ck-<clickupId>.md
```

The folder name never includes the ClickUp suffix; only the main file does.

> **Note on the `prd-` prefix.** The folder is `feature-<###>-<title>/`; the document inside gains a `prd-` prefix (`prd-feature-<###>-<title>.md`) so the document type is unambiguous in indexes, drift reports, and grep output. This mirrors the `ird-` prefix on issue documents.

- `<###>` = **repo-local sequential number**, zero-padded to 3 digits (4+ digit natural width).
- `<kebab-title>` = lowercase, hyphen-separated, ≤60 chars, derived from the feature name.

## Numbering

Feature numbers have **no relationship** to GitHub issue numbers. Each repo maintains its own sequence.

To find the next number:

```bash
{ ls -d library/requirements/features/feature-* 2>/dev/null; \
  ls -d library/requirements/features/completed/feature-* 2>/dev/null; } | \
  sed -E 's|.*/feature-([0-9]+)-.*|\1|' | sort -n | tail -1
```

Take `max + 1`. Zero-pad.

## Folder lifecycle

- **`features/feature-<###>-<title>/`** = work in progress (not yet shipped).
- **`features/completed/feature-<###>-<title>/`** = shipped. Move the entire folder (PRD + `reports/` + any adjacent artifacts) when work lands.

When the feature ships, `git mv` the folder; never split the PRD from its `reports/` history.

## Scope guidance

Each PRD should be implementable in roughly one focused session:

- ~1-3 hours of AI development time
- ~500 lines of change, give or take
- ≤ 8-10 files touched

If your feature is larger, **decompose into sequenced PRDs** (e.g., backend → frontend → admin surface → observability). Each PRD references its dependencies.

## Sections (required)

1. Phase Overview (Goals, Scope, Out of scope, Dependencies)
2. User Stories (with acceptance criteria)
3. Data Model Changes
4. API / Endpoint Specs
5. UI/UX Description
6. Technical Considerations
7. Files Touched
8. Test Plan
9. Risks and Open Questions
10. Related

Write "N/A" if a section truly does not apply; do not skip.

## Example

See the bundled example at `.cursor/skills/library-stinger/examples/feature-007-example.md`.

## Backwards-PRDs

When documenting already-shipped code, use this folder shape with a header noting "(Retroactive)":

```markdown
# Feature #<###>: <Title> (Retroactive)

> **Status:** Shipped (documented retroactively <YYYY-MM-DD>)
```

See `.cursor/skills/library-stinger/guides/05-backwards-prd.md`.

## Workflow

The agent handles:

1. **Plan** - "write a PRD for <feature>" creates the folder, the main PRD, and the empty `reports/` subfolder.
2. **Decompose** - "break down <capability> into PRDs" creates sequenced feature folders.
3. **Ship** - move the entire folder to `features/completed/` when implementation ships.
4. **Audit** - `quality-worker-bee` writes audit reports into the feature's `reports/` subfolder as `<date>-qa-report.md`.

See `.cursor/skills/library-stinger/guides/03-feature-prd.md` for full workflow.
