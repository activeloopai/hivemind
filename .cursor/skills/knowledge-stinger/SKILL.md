---
name: knowledge-stinger
description: Authors narrative knowledge documentation for any repository - the human-readable, technically deep domain docs that live in `library/knowledge/private/<domain>/`. Covers system overviews, architecture narratives, data schemas, API patterns, security models, coding standards, and operational runbooks. Works from ADRs and PRDs as source material; produces Mermaid diagrams, SQL DDL, TypeScript samples, and sequence diagrams. Distinct from library-stinger: library-stinger owns PRDs and IRDs; knowledge-stinger owns the knowledge/ domain. Use when the user says "document the hybrid recall pipeline", "write a system overview", "create knowledge docs for this repo", "document how the embeddings daemon works", or "build out the knowledge base".
---

# knowledge-stinger

Companion skill to `library-stinger` for authoring **narrative knowledge documentation** - the technically deep, human-readable domain docs that explain HOW the system works, WHY it was designed that way, and WHAT the operational details are.

> **Scope boundary:** `library-stinger` owns PRDs, IRDs, and the documentation lifecycle. `knowledge-stinger` owns everything under `library/knowledge/private/<domain>/`. Neither touches the other's territory.
>
> **Agent entry point:** [`knowledge-worker-bee.md`](../../agents/knowledge-worker-bee.md)

---

## What This Skill Produces

Docs like:
- `library/knowledge/private/ai/hybrid-recall-pipeline.md` - narrative explanation of `src/shell/grep-core.ts`
- `library/knowledge/private/data/deeplake-tables-schema.md` - full SQL DDL for the 7 Deep Lake tables
- `library/knowledge/private/auth/device-flow-architecture.md` - sequence diagram + credential lifecycle
- `library/knowledge/private/security/trust-boundaries.md` - trust boundary diagram + analysis
- `library/knowledge/private/standards/coding-standards-typescript.md` - canonical coding rules

Reference quality: match the depth of the existing docs under `library/knowledge/private/`.

---

## Source Material (Always Read First)

| Source | What you extract |
|---|---|
| `library/knowledge/private/architecture/ADR-*.md` | The **WHY** - locked decisions, constraints, alternatives rejected |
| `library/requirements/backlog/prd-*/` | The **WHAT and HOW** - SQL DDL, API specs, file lists, technical considerations |
| Existing source code | Ground-truth for file paths, function names, type definitions |
| `library/knowledge/private/roadmap/PLAN.md` | Phase boundaries, feature relationships |

**Reading order:** ADRs first (understand decisions), then PRDs by domain (extract implementation details), then organize by topic domain (not by phase).

---

## The Document Format

Every knowledge doc follows this exact template:

```markdown
# Document Title

> Category: <Domain> | Version: 1.0 | Date: <Month YYYY> | Status: Active

One-sentence description of who should read this and what it covers.

**Related:**
- [`sibling-doc.md`](sibling-doc.md)
- [`../architecture/ADR-NNN-slug.md`](../architecture/ADR-NNN-slug.md)

---

## Section 1

[Narrative prose, progressive disclosure. Open with "why this exists."]

```mermaid
flowchart TD
    A[Component] --> B[Component]
```

## Section 2

[SQL DDL, TypeScript code, config samples - ground-truth technical content]

```sql
CREATE TABLE example ( ... );
```
```

**Rules:**
- Header category matches the domain folder name (capitalized)
- Related section links to sibling docs and the ADRs the doc implements
- Body: progressive disclosure - "why this exists" first, then deep detail
- Use Mermaid for all diagrams; never explicit colors
- Prose is narrative, not bullet soup
- 100-400 lines per doc; split if longer

See `guides/02-document-format.md` for the full spec.

---

## Domain Taxonomy (the folders this repo uses)

The domain folders under `library/knowledge/private/`. Create only the ones a given repo needs.

| Domain folder | What belongs here |
|---|---|
| `architecture/` | Narrative docs alongside ADRs: `system-overview.md`, `session-lifecycle.md`, the six-harness shared-core model |
| `ai/` | Session capture, the hybrid recall pipeline (`src/shell/grep-core.ts`), the embeddings daemon, skillify |
| `auth/` | Device-flow login, credential persistence, org/workspace binding |
| `collaboration/` | Cross-agent / cross-workspace memory sharing |
| `data/` | The 7 Deep Lake tables (full DDL from `src/deeplake-schema.ts`), schema healing, the VFS path conventions |
| `frontend/` | Dashboard and graph-visualizer surfaces |
| `infrastructure/` | Build pipeline (tsc + esbuild), CI, release, the embeddings runtime |
| `integrations/` | The six harnesses (Claude Code, Codex, Cursor, OpenClaw, Hermes, pi) and their shims |
| `multi-tenant/` | Org / workspace model and isolation |
| `plugins/` | The MCP server, MCP tool surface, plugin distribution |
| `security/` | Trust boundaries, data classification, credential handling |
| `standards/` | TypeScript conventions, API design, error handling, Git conventions |
| `operations/` | Session pruning, capacity, incident, on-call runbooks |

See `guides/01-domain-taxonomy.md` for full detail on each domain.

---

## Analysis Workflow

```
1. SURVEY - list all ADRs and group them by domain
2. PLAN - map each domain folder to its target docs
3. DRAFT BATCH A - overview.md + architecture narratives (these set the stage for all other docs)
4. DRAFT BATCHES B-E - remaining domains in parallel (they don't block each other after A)
5. CROSS-LINK - verify every doc's Related section links correctly
6. PUBLISH - confirm every doc has the standard header and is in the right path
```

See `guides/03-analysis-workflow.md` for the step-by-step process.

---

## Companion Resources

| File | Contents |
|---|---|
| `guides/01-domain-taxonomy.md` | What belongs in each domain folder, examples per domain |
| `guides/02-document-format.md` | Full document format spec with annotated example |
| `guides/03-analysis-workflow.md` | Step-by-step workflow for producing a full knowledge base from scratch |
| `templates/knowledge-doc-template.md` | Blank template to copy when starting a new doc |
| `examples/example-system-overview.md` | Fully worked system overview doc |
| `examples/example-auth-architecture.md` | Fully worked auth architecture doc with sequence diagram |
