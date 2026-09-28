# Domain Taxonomy - What Belongs Where

Full detail on each knowledge domain this repo uses. For each domain: what to include, what NOT to include, and how many docs to expect. Create only the domains a given repo actually needs - skip the rest rather than leaving empty folders.

---

## `architecture/`

Lives alongside the ADR files. Narrative docs that explain the system as a whole - not decisions (those are ADRs) but descriptions of the resulting architecture.

**What belongs:**
- `system-overview.md` - master architecture diagram (Mermaid `flowchart TB`), the six-harness shared-core model, component summary table, key design decisions table that cross-references ADRs
- `session-lifecycle.md` - sequence diagram of a capture-then-recall round trip end to end
- `desktop-harness-overview.md` - how a given harness shim wraps the shared core
- `{component}-placement.md` - why a central component (e.g. the embeddings daemon, the MCP server) is placed where it is

**What NOT to include:** ADRs themselves (those are `ADR-NNN-slug.md`). Decision rationale belongs in the ADR. This folder covers WHAT the system looks like, not WHY it was designed that way.

**Typical doc count:** 3-5

---

## `ai/`

Everything about how Hivemind captures sessions, recalls memory, and embeds content.

**What belongs:**
- `session-capture.md` - how shims normalize assistant events and write rows to the `sessions` / `memory` tables
- `hybrid-recall-pipeline.md` - the `UNION ALL` lexical-plus-semantic recall in `src/shell/grep-core.ts`: `searchDeeplakeTables`, `normalizeSessionContent`, `refineGrepMatches`
- `embeddings-daemon.md` - the nomic embed-daemon, its protocol, when `summary_embedding` / `message_embedding` get written
- `skillify-pipeline.md` - how sessions are distilled into skills (the `skills` table, version bumping)

**What NOT to include:** ADRs about these decisions (those go in `architecture/`). Application code itself.

**Typical doc count:** 4-8

---

## `auth/`

Authentication and credential handling: the device flow through stored credentials through org/workspace binding.

**What belongs:**
- `device-flow-architecture.md` - the browser device flow (`deviceFlowLogin`, `pollForToken`), the install-id polling key, sequence diagram of the full login
- `credential-lifecycle.md` - `saveCredentials` / `loadCredentials` / `deleteCredentials`, where the token lives, the default `apiUrl`
- `org-workspace-binding.md` - how org and workspace selection persists across commands

**What NOT to include:** The implementation code itself. That lives in `src/commands/auth.ts`.

**Typical doc count:** 2-4

---

## `data/`

All data storage docs. This is where someone looks when they need to know the schema.

**What belongs:**
- `deeplake-tables-schema.md` - the FULL DDL for all seven tables (`memory`, `sessions`, `skills`, `rules`, `goals`, `kpis`, `codebase`), derived from `src/deeplake-schema.ts`. One canonical reference, not split by feature.
- `schema-healing.md` - the SELECT-first `ALTER TABLE ADD COLUMN` healing rule and why it avoids blanket sweeps
- `vfs-path-conventions.md` - the VFS path conventions that back goals (`memory/goal/<owner>/<status>/<goal_id>.md`) and KPIs

**What NOT to include:** Per-feature schema changes (those are in individual PRDs). This is the canonical rolled-up reference.

**Typical doc count:** 3-5

---

## `integrations/`

The six host assistants and the shims that wrap the shared core.

**What belongs:**
- `six-harness-overview.md` - the matrix of Claude Code, Codex, Cursor, OpenClaw, Hermes, and pi: distribution model, native lifecycle events, shim location
- `{harness}-shim.md` - one doc per harness when its event mapping is non-trivial
- `adding-a-harness.md` - the procedure for wrapping a new assistant (new shim, not a new engine)

**What NOT to include:** The shared-core logic (that is `ai/` and `architecture/`).

**Typical doc count:** 2-7

---

## `plugins/`

The MCP server and the tool surface it exposes.

**What belongs:**
- `mcp-server.md` - the MCP server in `src/mcp/`: transport, lifecycle, which clients it serves
- `mcp-tool-surface.md` - each tool the server exposes, its input/output shape, and which Deep Lake table it touches
- `integration-model.md` - how the MCP server relates to the per-harness shims

**Typical doc count:** 2-4

---

## `frontend/`

The browser-side surfaces shipped by the plugin.

**What belongs:**
- `dashboard.md` - the dashboard surface, what it renders, how it reads from Deep Lake
- `graph-visualizer.md` - the graph visualizer, node/edge model, data source

**Typical doc count:** 1-3

---

## `infrastructure/`

Build, CI, release, and the embeddings runtime.

**What belongs:**
- `build-pipeline.md` - `npm run build` = `tsc` + `esbuild`, the per-harness bundle outputs
- `ci-release.md` - CI checks, the npm publish allowlist, release flow
- `embeddings-runtime.md` - how the embed daemon is provisioned and run

**Typical doc count:** 2-5

---

## `multi-tenant/`

Org and workspace model.

**What belongs:**
- `org-workspace-model.md` - the org/workspace hierarchy, how rows are scoped, isolation guarantees

**Typical doc count:** 1-3

---

## `security/`

Trust model, data classification, credential handling.

**What belongs:**
- `trust-boundaries.md` - trust boundary diagram, what each boundary enforces (host assistant, shared core, Deep Lake API)
- `data-classification.md` - what session content is captured, what leaves the machine, redaction
- `credential-handling.md` - how the API token is stored and never logged

**Typical doc count:** 2-5

---

## `standards/`

Coding conventions, API design, process rules.

**What belongs:**
- `coding-standards-typescript.md` - TypeScript conventions, strict config, the npm-not-pnpm rule for this repo
- `api-design-conventions.md` - how the Deep Lake SQL API is called, the no-ORM `ColumnDef` pattern
- `error-handling-conventions.md` - error shapes, client-safe messages
- `git-conventions.md` - Conventional Commits, PR template, merge strategy

**Typical doc count:** 3-5

---

## `collaboration/` and `operations/` (as needed)

`collaboration/` covers cross-agent or cross-workspace memory sharing. `operations/` covers runbooks: session pruning (`hivemind sessions prune`), capacity, incident severity, on-call steps. Create either only when the repo has real content for it.

**Typical doc count:** 1-4 each

---

## `overview.md` (top-level, not in a subfolder)

A single `overview.md` at the root of `library/knowledge/private/`. The human-curated entry point - the README for the entire knowledge base.

**Required sections:**
1. What this repo is (1-2 paragraphs, plain English: a memory plugin that wraps six coding assistants over a Deep Lake substrate)
2. Top-level architecture summary (shared core, per-harness shims, the 7 tables)
3. Key modules / components
4. Where to start reading (role-based reading guide)
5. Library coverage stats (total docs, ADR count, last updated)
