---
source_type: internal-artifact
authority: high
relevance: high
topic: mcp-integration
url: src/mcp/server.ts, harnesses/cursor/extension/
fetched: 2026-06-16
---

# Live Artifacts: MCP server + Cursor extension

## MCP server (src/mcp/server.ts)

A stdio MCP server exposing Hivemind's shared org memory as three tools:

- `hivemind_search { query, limit? }`: keyword/regex search across summaries + sessions, one ranked SQL query.
- `hivemind_read { path }`: read full content at a memory path.
- `hivemind_index { prefix?, limit? }`: list summary entries.

Auth loads `~/.deeplake/credentials.json`; missing credentials return a clear "Not authenticated. Run `hivemind login`" message. Tool schemas and search internals belong to `mcp-protocol-worker-bee`; this stinger only covers registering the server in Cursor via `mcp.json`.

## Cursor extension (harnesses/cursor/extension/)

First-party VS Code/Cursor extension `hivemind-cursor-extension` (publisher `deeplake`, `engines.vscode: ^1.85.0`). Own webpack + `package.json`; webpack aliases `@hivemind` to the repo `src/`. Contributions: `hivemind.*` commands (onboarding, login/logout, showStatus, wire/unwire hooks, openLogs, openDashboard), an activity-bar container, and a `hivemind.dashboard` webview. `activate()` wires a health poller + status bar, registers commands and the dashboard, runs the skill-bridge auto-sync, and prompts onboarding when not yet healthy. The extension merges `~/.cursor/hooks.json`; it does not replace the hook scripts, which run from `~/.cursor/hivemind/bundle/`.

## Relevance to the stinger

Source for `guides/03-mcp-integration.md`, `guides/06-extension-development.md`, and `examples/mcp-server-example.md`.
