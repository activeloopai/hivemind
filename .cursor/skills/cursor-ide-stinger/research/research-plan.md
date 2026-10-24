# Research Plan: cursor-ide-stinger

Refocused 2026-06-16 on Hivemind's real Cursor surface.

- **Primary sources:** this repo's own artifacts (authoritative).
  - `src/cli/install-cursor.ts`: the hooks harness.
  - `harnesses/cursor/bundle/`: the built hook scripts.
  - `harnesses/cursor/extension/`: the first-party Cursor extension.
  - `src/mcp/server.ts`: the Hivemind MCP server.
  - `.cursor/rules/*.mdc`, `.cursor/agents/`, `.cursor/skills/`, `.cursor/commands/`, `.cursor/model-comparison-matrix.md`: the Army layout.
- **Backing reference:** Cursor official docs (hooks, rules, MCP).

## Queries

1. "Cursor 1.7 agent hooks hooks.json schema events 2026"
2. "Cursor .cursor/rules mdc frontmatter alwaysApply globs activation modes"
3. "Cursor mcp.json register stdio MCP server project vs global"

## Out of scope (other Bees)

- Cursor SDK / cloud agents / Agents Window: not part of Hivemind's Cursor integration; dropped.
- MCP protocol internals, harness wiring for other agents, TypeScript quality, extension React/CI: handed off per `research-summary.md`.
