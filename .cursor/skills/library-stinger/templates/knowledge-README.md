---
ai_description: |
  This folder contains all reference documentation for this repository,
  split by intended audience: public/ for end-users, private/ for internal
  team and AI agents. When filing a new doc, default to private/. Promote
  to public/ only when the content is intentionally customer-facing.
  Allowed writes: knowledge/public/<domain>/<slug>.md and
  knowledge/private/<domain>/<slug>.md. ADRs always go in
  knowledge/private/architecture/ADR-<n>-<slug>.md.
  Never write to knowledge/ itself (write to the sub-folders).
human_description: |
  Reference documentation split by audience.
  - public/: docs that will eventually be surfaced to customers or published
  - private/: internal engineering, architecture, business, and strategy docs
  When adding a new doc, pick the right subdomain folder inside public/ or
  private/. If the domain doesn't exist yet, create it.
---

# Knowledge

Reference documentation for this repository, organized by audience.

## Sub-folders

| Folder | Audience | Typical content |
|---|---|---|
| `public/` | End-users, customers, external | Overviews, user guides, FAQs |
| `private/` | Internal team + AI agents | ADRs, standards, architecture, domain engineering docs |

## Decision rule: public vs private

> "Would I publish this on a help center or product docs site?"

Yes → `public/`. No → `private/`. When in doubt, `private/`.
