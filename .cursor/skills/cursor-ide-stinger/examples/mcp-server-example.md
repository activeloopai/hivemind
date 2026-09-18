# Registering the Hivemind MCP Server in Cursor

How to make Hivemind's three memory tools available as first-class tool calls inside Cursor. The server is `src/mcp/server.ts`; this is the registration, not the implementation.

## The tools

`src/mcp/server.ts` is a stdio MCP server that exposes:

- `hivemind_search { query, limit? }`: keyword/regex search across summaries + sessions, one ranked SQL query.
- `hivemind_read { path }`: read full content at a memory path (e.g. `/summaries/alice/abc.md`, `/index.md`).
- `hivemind_index { prefix?, limit? }`: list summary entries (one row per session).

Auth is via `~/.deeplake/credentials.json`. Missing credentials return "Not authenticated. Run `hivemind login`" rather than crashing.

## `.cursor/mcp.json` entry (project scope)

```json
{
  "mcpServers": {
    "hivemind": {
      "command": "node",
      "args": ["${userHome}/path/to/dist/mcp/server.js"],
      "env": {}
    }
  }
}
```

For a global install of `@deeplake/hivemind`, prefer launching through the package rather than a hardcoded path, for example:

```json
{
  "mcpServers": {
    "hivemind": {
      "command": "npx",
      "args": ["-y", "@deeplake/hivemind", "mcp"],
      "env": {}
    }
  }
}
```

Adjust the args to match the package's actual MCP launch command. No secrets go in `mcp.json`; the server reads the credentials file itself.

## After editing

1. Save `.cursor/mcp.json` (or `~/.cursor/mcp.json` for all projects).
2. Restart Cursor (it does not hot-reload MCP config).
3. In the agent panel ask: "Use `hivemind_search` to find prior work on X." Cursor calls the tool and shows ranked hits.
4. Check Output > "Cursor MCP" for server stderr if tools do not appear.

## Note

You may not need MCP registration at all: after `hivemind cursor install`, the `session-start` and `pre-tool-use` hooks already inject recall and fast-path memory grep. Register the MCP server when you want the agent to call `hivemind_search` / `hivemind_read` / `hivemind_index` explicitly as tools. The tool schemas and search internals are `mcp-protocol-worker-bee`'s domain.
