# mcp-protocol-stinger

The procedural arsenal for `mcp-protocol-worker-bee` - the MCP protocol authority for Hivemind.

This stinger encodes audit and build procedures for Hivemind's MCP server and its tool contract: stdio vs HTTP transport choice, tool vs resource vs prompt design, zod (v3) input schemas, the JSON-RPC error model and result-vs-error channel, capability negotiation, contract stability across the six harnesses (Hermes, OpenClaw, pi, Claude Code, Codex, Cursor), and testing MCP servers with Vitest. It is grounded in the MCP specification, `@modelcontextprotocol/sdk` ^1.29, JSON-RPC 2.0, and the actual Hivemind server at `src/mcp/server.ts` (tools `hivemind_search` / `hivemind_read` / `hivemind_index`, `~/.deeplake/credentials.json` auth, `mcp/bundle/` build output).

See `SKILL.md` for the master guide index, template index, and critical directives.
See `research/research-summary.md` for the research summary and open questions.
