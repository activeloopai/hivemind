# Analysis Workflow - From Zero to Full Knowledge Base

How to go from a repo with only ADRs and PRDs to a complete `library/knowledge/private/` knowledge base. The methodology: read every ADR and PRD, map them to domains, then author in dependency order.

---

## Step 1: Survey the source material

### Read all ADRs

List every ADR and note the domain it belongs to. For example, mapping this repo's ADRs:

```
system-overview            -> architecture/, integrations/
session-lifecycle          -> architecture/, ai/
desktop-harness-overview   -> integrations/, architecture/
```

As new ADRs land (e.g. a storage-substrate decision -> data/, a device-flow decision -> auth/, an MCP-server decision -> plugins/), add a row. This mapping tells you which domain folders to create and what ADRs each doc should reference.

### Read all PRDs (extract technical detail)

For each PRD, extract:
- **SQL DDL / column lists:** Every table or `ColumnDef` block -> contributes to `data/deeplake-tables-schema.md`
- **API specs:** Tool / command signatures -> contribute to `standards/api-design-conventions.md` and domain docs
- **Technical Considerations sections:** Implementation details -> contribute to the relevant domain docs
- **Files Touched sections:** Real file paths -> used to cite source code in knowledge docs
- **Architecture notes:** System-level observations -> contribute to `architecture/` docs

**Do NOT copy PRD content verbatim.** PRDs are specs ("what to build"). Knowledge docs are explanations ("how it works and why"). Transform spec language into narrative explanations.

---

## Step 2: Plan the domain structure

Create a planning table before writing any docs:

```
Domain           | Docs to create                          | Source material
-----------------|-----------------------------------------|----------------
architecture/    | system-overview, session-lifecycle,      | system-overview ADR,
                 | desktop-harness-overview                 | session-lifecycle ADR
ai/              | session-capture, hybrid-recall-pipeline, | session-lifecycle ADR + recall PRDs
                 | embeddings-daemon, skillify-pipeline     |
data/            | deeplake-tables-schema, schema-healing,  | src/deeplake-schema.ts + storage PRDs
                 | vfs-path-conventions                     |
integrations/    | six-harness-overview, adding-a-harness   | harness ADRs + per-harness PRDs
...
```

Confirm the domain list matches the ADRs and PRDs in this repo. Skip domains that aren't applicable (e.g., `frontend/` only if the repo ships the dashboard / graph-visualizer surfaces).

---

## Step 3: Author in dependency order

### Batch A first (sets the stage)

Always write these docs first - every other doc cross-references them:

1. `library/knowledge/private/overview.md` - the entry point doc
2. `library/knowledge/private/architecture/system-overview.md` - master diagram
3. `library/knowledge/private/architecture/session-lifecycle.md` - end-to-end capture/recall flow

These three docs force you to understand the system well enough to write everything else.

### Batches B-E can parallelize

After Batch A, the remaining domains are largely independent:

```
Batch B: ai/ + auth/ + data/
Batch C: integrations/ + plugins/
Batch D: frontend/ + collaboration/
Batch E: infrastructure/ + multi-tenant/ + security/ + standards/ + operations/
```

---

## Step 4: Writing each doc

### For narrative docs (architecture, AI, auth, security)

1. Open the relevant ADR(s). Understand the DECISION section.
2. Open the relevant PRD(s). Read the Technical Considerations section.
3. Write the doc opening with WHY (pulled from ADR's Context section), then WHAT (the component's role), then HOW (pulled from PRD's Technical Considerations).
4. Add a Mermaid diagram if the doc benefits from a visual.
5. Fill in the Related section.

### For schema docs (data/deeplake-tables-schema.md)

1. Collect ALL column definitions from `src/deeplake-schema.ts` (the 7 `*_COLUMNS` lists).
2. Organize one section per table (`memory`, `sessions`, `skills`, `rules`, `goals`, `kpis`, `codebase`).
3. Add explanatory prose above each table: what writes it, what reads it, the version-bump pattern where it applies.
4. Add the schema-healing note (SELECT-first `ALTER TABLE ADD COLUMN`) at the end.

### For pipeline docs (ai/hybrid-recall-pipeline.md)

1. Read `src/shell/grep-core.ts`.
2. Document the three responsibilities in order: `searchDeeplakeTables` (the `UNION ALL` across memory + sessions), `normalizeSessionContent` (JSON blob -> `Speaker: text`), `refineGrepMatches` (line-wise regex flags).
3. Add a `flowchart` of the query path and a worked example of a single recall.

### For standards docs

1. Look at any existing `tsconfig.json`, `eslint.config.js`, `.prettierrc`, and `package.json` (this repo uses npm, not pnpm).
2. Look at any existing convention notes in the codebase.
3. Make explicit what was implicit - the conventions developers follow by habit.
4. Add examples from the actual codebase (cite file paths).

---

## Step 5: Cross-link verification

After all docs are written, verify cross-links:

1. Every doc's Related section: do all linked files exist?
2. Every ADR reference: does the cited ADR exist at the expected path?
3. `overview.md` reading guide: do all paths it mentions exist?
4. No doc is an island - every doc should link to at least 2 others.

Quick check command:
```bash
# List all docs in the knowledge base
find library/knowledge/private -name "*.md" | grep -v "ADR-" | sort

# Check for broken relative links (manual inspection of Related sections)
grep -r "\]\(\.\./" library/knowledge/private/ | grep -v "ADR-"
```

---

## Step 6: Quality check checklist

Before declaring the knowledge base complete:

- [ ] Every domain folder has at least one doc (no empty folders)
- [ ] `overview.md` exists at the top level and has a reading guide
- [ ] `architecture/system-overview.md` has a Mermaid architecture diagram
- [ ] `data/deeplake-tables-schema.md` has DDL for all 7 tables (check against `src/deeplake-schema.ts`)
- [ ] Every doc has the standard header (Category, Version, Date, Status)
- [ ] Every doc has a Related section with at least 2 links
- [ ] No doc exceeds 500 lines without a good reason
- [ ] All Mermaid diagrams use standard formatting (no explicit colors, no click events)
- [ ] Security doc `trust-boundaries.md` has a trust boundary diagram
- [ ] Standards docs have concrete code examples (not just prose rules)

---

## Common Pitfalls

### Pitfall: Copying PRD content verbatim
PRDs are specs. Knowledge docs are explanations. "The system MUST do X" (spec language) becomes "The system does X" (knowledge language). "Implementation Notes" becomes narrative prose.

### Pitfall: Making one giant doc per domain
Split by coherent topic. `data/` should have separate files for the table schema, schema healing, and the VFS path conventions - not one 2000-line file.

### Pitfall: Skipping the overview.md
The overview is the map. Without it, someone arriving at the knowledge base cold doesn't know where to start. Write it after Batch A so you have a clear picture of the whole system.

### Pitfall: Diagrams with spaces in node IDs
`A[My Component]` is fine. `My Component --> Another Component` will break. Always use camelCase or underscores in Mermaid node IDs.

### Pitfall: Writing bullet soup instead of prose
If a section is 12 nested bullets with no connective tissue, rewrite as prose. Bullets are for true lists (tables, catalogs, checklists). For explanations, use paragraphs.

### Pitfall: Forgetting to update cross-references
When you add a new doc, add it to the Related section of its most related sibling. Knowledge bases rot when docs become islands.
