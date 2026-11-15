# MCP Tool Contract Stability Across Harnesses

- **Source:** Hivemind repo (src/mcp, harnesses) + MCP versioning conventions
- **Fetched:** 2026-06-16
- **Authority:** internal + practitioner
- **Relevance:** high

## Key facts

- A tool name + its input shape + its parseable output shape form a public contract. Multiple independent consumers hard-code these.
- Additive changes (new tool, new optional param with default, widened bound, better description) are safe. Renames, removals, making params required, type/bound tightening, and output reshaping are breaking.
- Hivemind's consumers:
  - Hermes harness: `mcp_servers.hivemind` in `~/.hermes/config.yaml`, spawns `node .../.hermes/hivemind/bundle/...`, direct tool calls.
  - OpenClaw: plugin contracts `hivemind_search/read/index` plus `goal_add`, `kpi_add`.
  - pi: extension (`harnesses/pi/extension-source/hivemind.ts`) registers `hivemind_search/read/index` via `pi.registerTool({ name, ... })`.
  - Claude Code, Codex, Cursor: consume the same recall surface via installers/bundles.
- The three recall tools are duplicated across the MCP server and the pi extension by name BECAUSE they are a contract; they must stay in lockstep.
- Versions are kept consistent by `scripts/sync-versions.mjs` (runs as `prebuild`); the MCP `serverInfo.version` comes from `getVersion()`.

## Hivemind relevance

`hivemind_index` returns a header line + tab-separated rows (`path\tlast_updated\tproject\tdescription`) with `?`/empty placeholders for nulls - this format is part of the contract and is parsed downstream.
