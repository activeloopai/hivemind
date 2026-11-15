---
source_url: https://archman.dev/docs/documentation-and-modeling/architecture-decision-records-adr/catalog-and-traceability
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: high
topic: supersession
stinger: adr-writing-stinger
---

# ADR Catalog & Traceability | ArchMan

## Summary

An enterprise-focused guide to ADR catalog management, status tracking, and supersession workflows. Particularly strong on the Superseded vs Deprecated distinction, migration playbooks, and the "supersession without migration" anti-pattern. Includes a detailed frontmatter schema for superseded ADRs including `superseded_by`, `reason`, `migration_deadline`, and `action_required`. Also covers governance: architecture board reviews, quarterly audits, team ADR ownership, and deprecation policy.

## Key quotations / statistics

- Status definitions: Proposed (under discussion), Accepted (decided, triggers implementation), Deprecated (no longer recommended but still in use), Superseded (replaced by newer ADR, links to replacement, signals migration needed)
- "Status transitions should be explicit and auditable. ADR-0001 accepted on 2025-02-10; superseded by ADR-0042 on 2025-10-15."
- Superseded ADR frontmatter example:
  ```
  status: Superseded
  superseded_by: ADR-0047
  reason: In-memory sessions lost on pod restart; Redis provides durability
  migration_deadline: 2025-06-30
  action_required: |
    - Migrate session code from InMemoryStore to RedisStore
    - Update configuration to point to Redis
    - Run integration tests
  ```
- "Create a 'migration playbook' for superseded decisions, guiding teams on how to migrate. Track adoption: which services still follow the old decision?"
- "Pitfall: Supersessions Without Migration. An ADR is superseded, but old code still follows the old decision. This creates architectural inconsistency."
- Bidirectional linking requirement: both superseded and superseding ADRs must reference each other
- Governance: architecture board approval, quarterly audits, team ownership assignment, deprecation retention policy
- ADR naming: `docs/adr/ADR-001`, `docs/adr/ADR-002` (three-digit vs four-digit is team convention)

## Annotations for stinger-forge

- `guides/04-supersession-workflow.md`: This is the single richest source for supersession patterns. The frontmatter schema with `migration_deadline` and `action_required` should be the template for the supersession guide.
- The Deprecated vs Superseded distinction is the most enterprise-articulated: Deprecated = no longer recommended but still running code; Superseded = formally replaced with migration path.
- The "supersession without migration" anti-pattern is a concrete failure mode to include as a warning in the guide.
- `guides/05-tooling-integration.md`: The quarterly audit and team ADR ownership governance pattern belongs in the tooling/maintenance section.
- Stinger-forge note: the `migration_deadline` field is a powerful addition over the basic Nygard model. Consider whether the stinger's default Nygard template should include optional migration metadata.
