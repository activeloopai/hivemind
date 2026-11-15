# mcp-tool-docs-stinger

The procedural arsenal for `mcp-tool-docs-worker-bee`, the Hive's tool, API, and CLI documentation specialist for Hivemind.

This stinger encodes everything needed to document Hivemind's real surfaces honestly: the MCP tools exposed by `src/mcp/server.ts` (name, purpose, zod input schema, output shape, side effects, examples), the OpenClaw goal/KPI tool contracts, the TypeScript public API rendered with TypeDoc, the `hivemind` CLI command reference, doc-to-code sync, and changelog discipline tied to the `@deeplake/hivemind` npm version.

**Research summary:** [`research/research-summary.md`](research/research-summary.md) - covers MCP tool/resource documentation conventions and TypeDoc, dated 2026-06-16.

Read `SKILL.md` first for the master index and the surface map. Then follow the guides in task order. Always read the source before writing - Hivemind docs are honest about the code or they are wrong.
