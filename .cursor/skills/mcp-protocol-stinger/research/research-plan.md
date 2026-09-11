# Research Plan: mcp-protocol-stinger

- **Depth tier:** normal
- **Date:** 2026-06-16
- **Scope:** the MCP protocol surface for Hivemind's MCP server (`src/mcp/server.ts`) and its tool contract across the six harnesses.
- **Source breadth target:** the MCP specification, the `@modelcontextprotocol/sdk` TypeScript SDK ^1.29, JSON-RPC 2.0, the zod v3/v4 boundary behavior, and Hivemind's own server + tests + harness consumers.

## Queries

1. "MCP specification lifecycle initialize capability negotiation 2026"
2. "@modelcontextprotocol/sdk TypeScript registerTool inputSchema 2026"
3. "zod v3 vs v4 MCP SDK JSON Schema generation"
4. "JSON-RPC 2.0 error codes -32602 invalid params"
5. "MCP tools vs resources vs prompts design"
6. "testing MCP server stdio Vitest mock"

## Internal ground-truth sweep

| Path | Topic |
|---|---|
| `src/mcp/server.ts` | the actual MCP server: three tools, stdio, zod/v3, credentials, error model |
| `tests/claude-code/mcp-server.test.ts` | the boundary-mock test pattern + branch coverage |
| `harnesses/pi/extension-source/hivemind.ts` | pi's `pi.registerTool` mirror of the recall tools |
| `src/cli/install-hermes.ts` | Hermes `mcp_servers.hivemind` registration |
| `harnesses/openclaw/*` | OpenClaw contracted tools incl. `goal_add`/`kpi_add` |
| `package.json` | deps: @modelcontextprotocol/sdk ^1.29, zod ^4, deeplake ^0.3.30; build/test scripts |

## Output

Flat `research/` with 6 dated source notes (no internal/external split - the ground truth is the SDK + this repo, not a web sweep).
