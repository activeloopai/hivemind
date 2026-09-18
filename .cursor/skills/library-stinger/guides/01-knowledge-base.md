# Guide 01 - Knowledge-Base Authoring

Covers writing and filing reference documentation in `library/knowledge/`.

## Trigger phrases

- "document Z in the knowledge base"
- "write a guide for X"
- "add an architecture doc for Y"
- "write an ADR for decision Z"

## Public vs Private - the key decision

Before writing, decide where the doc belongs:

| Question | Result |
|---|---|
| Is this for end-users / customers? | `library/knowledge/public/<domain>/` |
| Is this internal to the team or for AI agents? | `library/knowledge/private/<domain>/` |
| Not sure? | Default to `private/`. Promote later. |

### Public knowledge

Target: `library/knowledge/public/<domain>/<slug>.md`

Approved sub-folders: `overview/`, `guides/`, `faqs/`. Other domains may be created for specific repos.

Use for:
- What-is-X explanations
- Step-by-step user guides
- FAQ answers
- Elevator pitches

### Private knowledge

Target: `library/knowledge/private/<domain>/<slug>.md`

Use for everything else: ADRs, architecture docs, engineering standards, domain-specific internal docs, business strategy, marketing strategy.

**Required sub-folders always present:**
- `architecture/` - ADRs only (see ADR rules below)
- `standards/` - `documentation-framework.md` + repo-specific writing rules

**Domain folders:** create as needed (ai/, auth/, data/, frontend/, security/, strategy/, etc.)

## ADRs (Architecture Decision Records)

ADRs **always** live at: `library/knowledge/private/architecture/ADR-<n>-<slug>.md`

- `<n>` is a monotonic integer, 3-digit zero-padded for n < 100.
- Before claiming a new number, list all `ADR-*.md` files in the folder and take `max + 1`.
- Every ADR must contain: Context, Decision, Consequences, Alternatives Considered.

## Document header

Every doc under `library/knowledge/` opens with:

```markdown
# <Document Title>

> Category: <Type> | Version: <X.Y> | Date: <Month YYYY> | Status: <Active | Draft | Archived>

<One-sentence description.>

**Related:**
- [Link to related doc]
```

## Filing a new doc

1. Decide: public or private?
2. Choose or create a domain folder.
3. Name the file: lowercase kebab-case, ≤ 60 chars, `.md` extension.
4. Write the doc with the header above.
5. Cross-link from any related PRDs, IRDs, or other docs.

## What does NOT go here

- PRDs or IRDs → `requirements/` or `issues/`
- QA reports -> `*/qa/` or `requirements/reports/`
- Binary assets (images, fonts, PDFs) -> an `assets/` or `public/` folder, never `librar