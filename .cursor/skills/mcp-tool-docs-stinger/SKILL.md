---
name: mcp-tool-docs-stinger
description: Tool, API, and CLI documentation authority for Hivemind - documenting MCP tools/resources with honest name/purpose/zod-schema/output/side-effects/examples, the TypeScript public API via TypeDoc, and the `hivemind` CLI command surface, plus doc-to-code sync and changelog discipline tied to the @deeplake/hivemind npm package. Invoke when the user says "document the MCP tools", "write docs for hivemind_search", "is this tool description honest", "generate TypeDoc from the TS source", "document the hivemind CLI", "keep the docs in sync with the code", "write a changelog entry", or "audit the Hivemind docs". Do NOT invoke for MCP protocol/transport internals (mcp-protocol-worker-bee), README authoring (readme-writing-worker-bee), or library/knowledge-convention docs (library-worker-bee / knowledge-worker-bee).
---

# mcp-tool-docs-stinger

Procedural arsenal for `mcp-tool-docs-worker-bee`, the Hive's tool/API/CLI documentation specialist. This stinger encodes how to document Hivemind's real surfaces honestly: the MCP tools exposed by `src/mcp/server.ts` (and the OpenClaw goal/KPI contracts), the TypeScript public API rendered with TypeDoc, and the `hivemind` CLI command surface - plus the doc-sync discipline and the changelog discipline tied to the `@deeplake/hivemind` npm version.

## When this stinger applies

Load this stinger when `mcp-tool-docs-worker-bee` is invoked. Typical triggers:

- "Document the Hivemind MCP tools."
- "Is the description on `hivemind_search` honest? Does it match the code?"
- "Write the input schema and output shape for `hivemind_read`."
- "Generate the TypeScript API reference with TypeDoc."
- "Document the `hivemind install` / `status` / `login` CLI surface."
- "These docs drifted from the code - re-sync them."
- "Write a changelog entry for this release."
- "Audit the docs under docs/ and the README."

Do NOT load it for:

- MCP protocol, transport, or handshake internals (route to `mcp-protocol-worker-bee`).
- README authoring as a standalone deliverable (route to `readme-writing-worker-bee`).
- The `library/` knowledge convention or general knowledge capture docs (route to `library-worker-bee` / `knowledge-worker-bee`).
- Deeplake dataset schema design (route to `deeplake-dataset-worker-bee`).

## First action when this stinger is loaded

Read these in order before doing anything else:

1. **`guides/00-principles.md`** - doc honesty, the five quality gates, when to route elsewhere, and the core invariants.
2. **`guides/01-mcp-tool-docs.md`** - how to document an MCP tool from the zod schema and handler. Read this before documenting any tool.
3. **`research/research-summary.md`** - the gathered intelligence covering MCP tool documentation conventions and TypeDoc.

Then walk the remaining guides in task order. Always read the real source (`src/mcp/server.ts`, `src/cli/*`, `src/commands/*`) before writing - Hivemind docs are honest about the code or they are wrong.

## Folder layout

```text
mcp-tool-docs-stinger/
├── SKILL.md                          (this file)
├── README.md                         (one-page human overview)
├── guides/
│   ├── 00-principles.md              (doc honesty, five quality gates, scope boundary)
│   ├── 01-mcp-tool-docs.md           (documenting MCP tools from zod schema + handler)
│   ├── 02-typedoc.md                 (TypeDoc generation from TS source; the public API surface)
│   ├── 03-cli-docs.md                (documenting the hivemind CLI command surface)
│   ├── 04-doc-sync.md                (keeping docs in sync with code; drift detection)
│   ├── 05-changelog.md               (changelog tied to @deeplake/hivemind via sync-versions)
│   └── 06-done-checklist.md          (10-point validation before docs ship)
├── examples/
│   ├── hivemind-search-tool-doc.md   (full worked doc for the hivemind_search MCP tool)
│   ├── hivemind-cli-reference.md     (CLI reference for install / status / login)
│   ├── typedoc-setup.md              (TypeDoc config + npm script for the TS public API)
│   └── changelog-entry.md            (worked changelog entry for a real version bump)
├── templates/
│   ├── mcp-tool-doc.md               (MCP tool doc template: name/purpose/schema/output/side-effects/examples)
│   ├── cli-command-reference.md      (CLI command reference template)
│   ├── typedoc-json.md               (typedoc.json + package.json script template)
│   ├── docs-sync-workflow.yml        (CI workflow that fails when docs drift from code)
│   └── changelog-entry.md            (changelog entry template tied to the npm version)
├── reports/
│   └── README.md                     (how past audit summaries accumulate)
└── research/                         (DO NOT MODIFY without re-running research)
    ├── research-plan.md
    ├── research-summary.md
    ├── index.md
    └── external/                     (source notes on MCP tool docs + TypeDoc, dated 2026-06-16)
```

## Hivemind surfaces to document

| Surface | Source of truth | How it's documented |
|---|---|---|
| **MCP tools** | `src/mcp/server.ts` (stdio) | Name, purpose, zod input schema, output shape, side effects, examples |
| **OpenClaw goal/KPI tools** | `harnesses/openclaw/skills/hivemind-goals/SKILL.md` + `harnesses/openclaw/src/index.ts` | `hivemind_goal_add`, `hivemind_kpi_add` - same tool-doc shape |
| **TS public API** | exported types + functions in `src/` | TypeDoc, generated from the TS source |
| **CLI** | `src/cli/*` and `src/commands/*` | Command reference: usage, flags, side effects |
| **In-repo reference docs** | `README.md`, `docs/` (ARCHITECTURE, SKILLIFY, EMBEDDINGS, SUMMARIES, CAPTURE_TASKS) | Kept in sync with code; doc honesty enforced |
| **Changelog** | npm version in `package.json` (single-sourced by `scripts/sync-versions.mjs`) | Entry per released version |

The three MCP tools shipped today are `hivemind_search`, `hivemind_read`, and `hivemind_index` (stdio transport, read-only, auth via `~/.deeplake/credentials.json`). OpenClaw additionally contracts `hivemind_goal_add` and `hivemind_kpi_add`.

## CLI surface at a glance

| Command | Purpose |
|---|---|
| `hivemind install [--only <platforms>] [--skip-auth] [--token <value>]` | Auto-detect assistants and wire Hivemind into each |
| `hivemind <agent> install` (claude / codex / claw / cursor / hermes / pi) | Install for one specific assistant |
| `hivemind uninstall [--only <platforms>]` | Remove Hivemind from detected assistants |
| `hivemind login` | Device-flow login |
| `hivemind status` | Show which assistants are wired up |
| `hivemind update [--dry-run]` | Upgrade the CLI and refresh agent bundles |

Plus `hivemind goal`, `kpi`, `context`, `graph`, `dashboard`, `rules`, `skillify`, `embeddings <sub>`. Document from `src/cli/index.ts` routing - never from memory. See `guides/03-cli-docs.md`.

## Critical directives (lifted from the Command Brief)

These are non-negotiables. Full justification in `guides/00-principles.md`.

- **Read the source before writing a single line.** A tool doc that does not match `src/mcp/server.ts` is a bug, not documentation.
- **Tool descriptions and schemas must match real behavior.** The zod `inputSchema`, the output `content` shape, and the side effects are facts, not prose. Honest or wrong, no middle.
- **Every MCP tool doc carries six parts:** name, purpose, input schema (from zod), output shape, side effects, and at least one example.
- **TypeDoc renders from the TS types, not hand-written prose.** Fix the doc comment in the source; never fork the truth into a separate file.
- **The changelog is tied to the npm version.** `scripts/sync-versions.mjs` single-sources the version; the changelog tracks `@deeplake/hivemind` releases, not arbitrary dates.
- **Do not scope-creep into protocol internals or README authoring.** Route to `mcp-protocol-worker-bee` / `readme-writing-worker-bee`.

---

*Forged by `stinger-forge` from `mcp-tool-docs-worker-bee-command-brief.md` and `research/`. Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
