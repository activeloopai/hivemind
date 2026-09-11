# PRD Template - Schema v2

> Canonical blank template for a PRD index file.
> Copy to: `library/requirements/backlog/prd-<###>-<slug>/prd-<###>-<slug>-index.md`
> Replace every `<placeholder>` before saving.
> See `library-schema-v2.md` for naming rules and lifecycle conventions.

---

<!-- ============================================================
     COPY EVERYTHING BELOW THIS LINE INTO YOUR PRD FILE
     ============================================================ -->

# PRD-<###>: <Module Title>

> **Status:** Backlog
> **Priority:** P0 | P1 | P2 | P3
> **Effort:** XS (< 1h) | S (1-3h) | M (3-8h) | L (1-3d) | XL (> 3d)
> **Schema changes:** None | Additive | Breaking
> **ClickUp:** [<id>](https://app.clickup.com/t/<id>) *(delete line if not using ClickUp)*

---

## Overview

<!-- One paragraph: what this module does and why it exists. -->

---

## Goals

<!-- Specific, measurable outcomes this module achieves. -->

- 
- 

## Non-Goals

<!-- What this module explicitly does NOT do. Be precise. -->

- 
- 

---

## Sub-features

<!-- If the module has multiple discrete sub-features, list them here with links to their sub-PRD files.
     Sub-PRD naming: prd-<###>a-<slug>-<feature>.md, prd-<###>b-..., etc.
     Delete this section if the module is small enough to need no sub-PRDs. -->

| Sub-PRD | Scope | Status |
|---|---|---|
| [`prd-<###>a-<slug>-<feature>`](./prd-<###>a-<slug>-<feature>.md) | <scope description> | Draft |

---

## Acceptance criteria

<!-- Testable, binary criteria for the module as a whole.
     Sub-PRD-level criteria live in their respective files. -->

| ID | Criterion |
|---|---|
| AC-1 | Given <context>, when <action>, then <outcome>. |
| AC-2 | |

---

## Data model changes

<!-- Describe any new tables, columns, or index changes.
     Delete this section if no schema changes. -->

---

## API changes

<!-- New endpoints or changes to existing endpoints.
     Delete this section if no API changes. -->

---

## Open questions

<!-- Unresolved questions that must be answered before implementation. -->

- [ ] 

---

## Related

<!-- Link to relevant knowledge docs, ADRs, IRDs, or completed PRDs. Use relative paths. -->

- 
