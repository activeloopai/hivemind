# Research Summary: mcp-tool-docs-stinger

Generated 2026-06-16.

## Scope

Documenting Hivemind's real surfaces: the MCP tools exposed by `src/mcp/server.ts`, the OpenClaw goal/KPI tool contracts, the TypeScript public API rendered with TypeDoc, the `hivemind` CLI command surface, and changelog discipline tied to the `@deeplake/hivemind` npm version. The primary source of truth is the Hivemind source tree; external notes cover the general documentation conventions that frame how to render those facts honestly.

## Files written

| Subfolder | Count | Topics |
|---|---|---|
| `research/external/` | 2 | MCP tool/resource documentation (1), TypeDoc / TS API docs (1) |
| `research/` root | 3 | research-plan.md, index.md, research-summary.md |
| **Total** | **5** | |

---

## Key findings

### 1. MCP tool docs are a contract, not prose

(`external/2026-06-16-mcp-tool-resource-documentation.md`) A Model Context Protocol client selects and calls a tool purely off its name, description, and input schema. Those three are the contract. The honest documentation move is to transcribe the zod `inputSchema` field-for-field (name, type, required/optional, constraints, default, describe text), state the output `content` shape including empty/error cases, and state side effects plainly. This produced the six-part tool-doc shape used throughout the guides and `templates/mcp-tool-doc.md`.

### 2. Hivemind's MCP server is read-only

Confirmed against `src/mcp/server.ts`: the three tools (`hivemind_search`, `hivemind_read`, `hivemind_index`) run SQL `SELECT`s and create nothing; provisioning happens in per-agent SessionStart hooks, not in the server. Any doc claiming a write for these tools is wrong. The OpenClaw `hivemind_goal_add` / `hivemind_kpi_add` tools *do* write (lazily-created tables), and must say so.

### 3. TypeDoc gives one source of truth for the TS public API

(`external/2026-06-16-typedoc-typescript-api-docs.md`) TypeDoc generates the API reference from the TypeScript source and TSDoc comments, using the compiler, so the reference inherits the type guarantees and cannot contradict the code. Choose `entryPoints` deliberately, exclude internals, and gate the build with warnings-as-errors so undocumented exports break CI. The public API is a deliberate choice of entry points, not "every file in `src/`."

### 4. The changelog is tied to the npm version via sync-versions

Confirmed against `scripts/sync-versions.mjs`: the version is single-sourced from `package.json` and propagated to every manifest (plugin, harness, marketplace) as a `prebuild` hook. The changelog's top version must equal `package.json`. This anchors `guides/05-changelog.md`.

## What this skill does NOT cover (route elsewhere)

- MCP protocol/transport/handshake internals -> `mcp-protocol-worker-bee`.
- README authoring -> `readme-writing-worker-bee`.
- The `library/` knowledge convention -> `library-worker-bee` / `knowledge-worker-bee`.
- Deeplake dataset schema design -> `deeplake-dataset-worker-bee`.

## Verify-live items

- Pin the TypeDoc version in `devDependencies` and re-verify config keys against the installed version's docs.
- Confirm the public TS entry point(s) for `@deeplake/hivemind` before configuring `entryPoints`.
- Re-read `src/mcp/server.ts` and `src/cli/index.ts` each session - the tool set and CLI surface evolve.
