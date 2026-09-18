# Research Plan: mcp-tool-docs-stinger

- **Depth tier:** normal
- **Anchored to:** 2026-06-16
- **Scope:** documenting Hivemind's real surfaces - MCP tools/resources, the TypeScript public API via TypeDoc, the CLI, and changelog discipline tied to `@deeplake/hivemind`
- **Source breadth target:** the MCP specification + SDK conventions, TypeDoc official docs + TSDoc conventions, and the Hivemind source itself (`src/mcp/server.ts`, `src/cli/*`, `src/commands/*`, `scripts/sync-versions.mjs`)

## Queries

1. "Model Context Protocol tool documentation name description input schema 2026"
2. "MCP tool result content shape side effects read-only annotations 2026"
3. "TypeDoc TypeScript API reference entryPoints configuration 2026"
4. "TSDoc tags param returns example internal deprecated 2026"
5. "documenting CLI command reference usage flags side effects"
6. "changelog versioning single-source npm package version sync"

## Research execution notes

The most authoritative source for this skill is the Hivemind source tree itself - the tool schemas in `src/mcp/server.ts`, the CLI dispatch in `src/cli/index.ts`, and the version single-sourcing in `scripts/sync-versions.mjs` are facts, not opinions. External notes cover the general conventions (MCP tool/resource documentation, TypeDoc) that frame how to render those facts honestly. Findings filed to `research/external/` as individual source notes, dated 2026-06-16.
