# Guide 03: Registering the Hivemind MCP Server in Cursor

How to make Hivemind's MCP tools available inside Cursor. The server itself is `src/mcp/server.ts`; this guide covers registering it, not authoring it.

## What the server exposes

`src/mcp/server.ts` is a stdio MCP server that surfaces Hivemind's shared org memory as three tools:

| Tool | Purpose |
|---|---|
| `hivemind_search` | Keyword/regex search across summaries + sessions (one ranked SQL query) |
| `hivemind_read` | Read full content at a memory path (e.g. `/summaries/alice/abc.md`) |
| `hivemind_index` | List summary entries (one row per session) |

Auth: the server loads `~/.deeplake/credentials.json`. With no credentials it returns a clear "Not authenticated. Run `hivemind login`" message rather than crashing.

The tool definitions, Zod schemas, and transport are owned by `mcp-protocol-worker-bee`. This Bee only wires the server into Cursor.

## Two ways Cursor gets these tools

1. **The hooks harness already gives recall via the bundle.** After `hivemind cursor install`, the `session-start` and `pre-tool-use` hooks inject and fast-path memory recall without any MCP registration. For many users that is enough.
2. **Direct MCP registration** gives the agent first-class `hivemind_search` / `hivemind_read` / `hivemind_index` tool calls inside Cursor. This is a `mcp.json` entry, covered below.

## Config file hierarchy

Cursor reads MCP config from two places and merges them at startup:

| File | Scope | Priority |
|---|---|---|
| `.cursor/mcp.json` | Project; commit for team sharing | Higher (project wins on name conflict) |
| `~/.cursor/mcp.json` | Global; applies to all projects | Lower |

Restart Cursor after editing either file; it does not hot-reload MCP config.

## The `mcp.json` entry

The Hivemind MCP server is a stdio server. Point Cursor at the built entrypoint:

```json
{
  "mcpServers": {
    "hivemind": {
      "command": "node",
      "args": ["${userHome}/.hivemind/.../dist/mcp/server.js"],
      "env": {}
    }
  }
}
```

If running from a global install of `@deeplake/hivemind`, prefer invoking through the package's published bin or `npx` rather than hardcoding a path. The server reads `~/.deeplake/credentials.json` itself, so no secrets belong in `mcp.json`.

### Config interpolation variables

Resolved in `command`, `args`, and `env`:

| Variable | Value |
|---|---|
| `${env:NAME}` | Environment variable `NAME` |
| `${userHome}` | User home directory |
| `${workspaceFolder}` | Project root (where `.cursor/mcp.json` lives) |
| `${workspaceFolderBasename}` | Project folder name only |

Never hardcode secrets. The server authenticates via the credentials file, not via `mcp.json`.

## Auto-approval

By default Cursor asks before calling any MCP tool. To let the agent call the Hivemind tools without prompting: Cursor Settings > MCP > "Allow Agent to run tools without asking" (enable per-tool or globally). The Hivemind tools are read-only recall, so per-tool auto-approval is reasonable.

## Troubleshooting checklist

- **Tools not appearing:** check `mcp.json` syntax (a single trailing comma breaks the file); restart Cursor; confirm `node` can run the server entrypoint without errors.
- **"Not authenticated" responses:** run `hivemind login` so `~/.deeplake/credentials.json` exists.
- **Tool call errors:** check Output > "Cursor MCP" for the server's stderr.
- **Server spawned twice:** Cursor spawns one process per registration. If `hivemind` is registered both globally and per-project under the same name, you may see two; keep it in one place.

## Handoff boundary

Registering the server in Cursor is this Bee's job. The server's tool schemas, search logic, and transport are `mcp-protocol-worker-bee`'s. Harness wiring for other agents (Hermes registers these same tools) is `harness-integration-worker-bee`'s.
