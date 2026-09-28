# Source: The Cross-Host Tool and Command Contract

- **Retrieved:** 2026-06-16
- **Source type:** Hivemind repo (authoritative)
- **In-repo anchors:** `harnesses/openclaw/openclaw.plugin.json`, `src/mcp/server.ts`, `harnesses/pi/extension-source/hivemind.ts`

---

## Why

Hivemind is shared memory. A trace captured in one host must be recallable from another. That requires every adapter to expose the same operations with identical names, args, and return shapes. Drift in one host silently breaks cross-harness recall.

## Contracted tools

| Tool | Args | Returns |
|---|---|---|
| `hivemind_search` | `{ query, limit? }` | ranked hits across summaries + sessions (single SQL query) |
| `hivemind_read` | `{ path }` | full content at a memory path, e.g. `/summaries/alice/abc.md` |
| `hivemind_index` | `{ prefix?, limit? }` | list of summary entries |
| `hivemind_goal_add` | `{ ... }` | goal record (OpenClaw contracted) |
| `hivemind_kpi_add` | `{ ... }` | kpi record (OpenClaw contracted) |

## Contracted commands (OpenClaw `contracts.commands`)

`hivemind_login`, `hivemind_capture`, `hivemind_whoami`, `hivemind_orgs`, `hivemind_switch_org`, `hivemind_workspaces`, `hivemind_switch_workspace`, `hivemind_setup`, `hivemind_version`, `hivemind_update`, `hivemind_autoupdate`. These map to `hivemind <subcommand>`; login/whoami/orgs/workspaces drive the device-flow login and per-host org/workspace selection.

## Declaration points per host

- OpenClaw: `openclaw.plugin.json` → `contracts.tools` + `contracts.commands` + `memoryCorpusSupplements: true`.
- pi: `harnesses/pi/extension-source/hivemind.ts` registers search/read/index.
- Hermes: `mcp_servers.hivemind` exposes the tools via `src/mcp/server.ts`; skill `hivemind-memory` documents them.
- Claude Code: skills (`hivemind-memory`, `hivemind-goals`, `hivemind-graph`) document the surface; hooks deliver recall.

## Adding a tool in lockstep

Implement in `src/`, expose in the MCP server, register in the pi extension, add to `openclaw.plugin.json`, document in host skills/marker - all in one change. A one-host-only tool change is a Critical contract-drift defect.
