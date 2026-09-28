---
ai_description: |
  This folder contains internal engineering and business documentation.
  ADRs MUST live in architecture/ADR-<n>-<kebab-slug>.md.
  Engineering standards MUST live in standards/documentation-framework.md.
  Other domain folders (<domain>/) are repo-specific and may be created as
  needed. In this repo: ai/, architecture/, auth/, collaboration/, data/,
  frontend/, infrastructure/, integrations/, multi-tenant/, operations/,
  plugins/, security/, standards/.
  Do NOT file customer-facing content here (that goes in knowledge/public/).
  Write path: library/knowledge/private/<domain>/<kebab-slug>.md.
human_description: |
  Internal engineering and business documentation.
  - architecture/: Architecture Decision Records (ADRs)
  - standards/: Documentation framework and coding standards
  - <domain>/: Any repo-specific knowledge domain (ai/, auth/, data/, etc.)
  Default landing zone for any doc that does not need to be customer-facing.
  When creating a new domain folder, add a README.md explaining what belongs.
---

# Knowledge - Private

Internal documentation for engineers, product, and AI agents.

## Required sub-folders (always present)

| Folder | Contents |
|---|---|
| `architecture/` | ADRs: `ADR-<n>-<kebab-slug>.md`. Locked decisions with context, alternatives, consequences. |
| `standards/` | `documentation-framework.md` and any repo-specific writing rules. |

## Optional domain folders

Create any of these as needed (the set this repo uses): `ai/`, `auth/`, `collaboration/`, `data/`, `frontend/`, `infrastructure/`, `integrations/`, `multi-tenant/`, `operations/`, `plugins/`, `security/`. Add a `README.md` to any new domain folder explaining what belongs.

## What does NOT belong here

- Customer-facing content (put in `knowledge/public/`)
- PRDs or IRDs (put in `requirements/` or `issues/`)
- Binary asset