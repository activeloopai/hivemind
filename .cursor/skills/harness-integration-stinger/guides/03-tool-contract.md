# Guide 03: The Cross-Host Tool and Command Contract

**Sources:** `research/external/2026-06-16-tool-contract.md`, `research/external/2026-06-16-mcp-registration.md`

---

## Why the contract exists

Hivemind is shared memory. A trace captured under Claude Code must be recallable from Cursor, pi, or hermes. That only works if every host exposes the same memory operations with the same names, args, and return shapes. The contract is the set of tools and commands that must be identical across all six adapters.

**Drift in one host silently breaks cross-harness recall.** If pi's `hivemind_search` returns a different shape than hermes', a teammate switching hosts gets inconsistent results with no error.

---

## The contracted tools

| Tool | Args | Returns | Hosts |
|---|---|---|---|
| `hivemind_search` | `{ query, limit? }` | ranked hits across summaries + sessions | all |
| `hivemind_read` | `{ path }` | full content at a memory path (e.g. `/summaries/alice/abc.md`) | all |
| `hivemind_index` | `{ prefix?, limit? }` | list of summary entries | all |
| `hivemind_goal_add` | `{ ... }` | goal record | OpenClaw (contracted) |
| `hivemind_kpi_add` | `{ ... }` | kpi record | OpenClaw (contracted) |

`hivemind_search` runs a single SQL query against the Deep Lake `summaries` + `sessions` tables and returns ranked hits - one call, not N. `hivemind_read` resolves a memory path to its full content. `hivemind_index` lists summary entries under an optional prefix.

> Source: `research/external/2026-06-16-tool-contract.md`

---

## The contracted commands

OpenClaw's `openclaw.plugin.json` also declares the command surface that must match across hosts:

```
hivemind_login        hivemind_capture       hivemind_whoami
hivemind_orgs         hivemind_switch_org    hivemind_workspaces
hivemind_switch_workspace                    hivemind_setup
hivemind_version      hivemind_update        hivemind_autoupdate
```

These map to `hivemind <subcommand>` in the CLI. The login/whoami/orgs/workspaces commands drive the `hivemind login` device flow and the per-host org/workspace selection.

---

## Where the contract is declared per host

| Host | Declaration |
|---|---|
| OpenClaw | `openclaw.plugin.json` → `contracts.tools` + `contracts.commands` |
| pi | `harnesses/pi/extension-source/hivemind.ts` registers `hivemind_search`/`read`/`index` |
| Hermes | `mcp_servers.hivemind` exposes the tools via `src/mcp/server.ts`; skill `hivemind-memory` documents them |
| Cursor | extension + hooks bundle |
| Claude Code | skills (`hivemind-memory`, `hivemind-goals`, `hivemind-graph`) document the surface; hooks deliver recall |

```jsonc
// harnesses/openclaw/openclaw.plugin.json - the contract source of truth for OpenClaw
{
  "contracts": {
    "tools": ["hivemind_search", "hivemind_read", "hivemind_index", "hivemind_goal_add", "hivemind_kpi_add"],
    "commands": ["hivemind_login", "hivemind_capture", "hivemind_whoami", "..."],
    "memoryCorpusSupplements": true
  }
}
```

---

## Adding a tool the right way (in lockstep)

A new contracted tool must land in **all** adapters in one change, or recall diverges:

1. Implement the operation in the shared core (`src/`).
2. Expose it in the MCP server (`src/mcp/server.ts`) for hermes.
3. Register it in the pi extension (`harnesses/pi/extension-source/hivemind.ts`).
4. Add it to `openclaw.plugin.json` `contracts.tools`.
5. Document it in the host skills (`hivemind-memory` etc.) and any AGENTS.md marker text.
6. Verify name, args, and return shape are byte-identical everywhere.

Flag a one-host-only tool change as a Critical contract-drift finding.

---

*See also:* `guides/05-mcp-registration.md` for exposing tools via MCP, `guides/04-extension-adapters.md` for the pi/OpenClaw registration paths, and `examples/wire-a-new-harness.md` for contract parity on a fresh adapter.
