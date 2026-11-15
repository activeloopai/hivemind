# Research Summary: cursor-ide-stinger

Refocused 2026-06-16 on Hivemind's real Cursor surface: the Cursor 1.7+ hooks harness, the first-party Cursor extension, registering the Hivemind MCP server in Cursor, and the `.cursor/` Bee Army layout.

## Scope

The authoritative sources for this stinger are this repo's own artifacts, with Cursor's official docs as backing reference. The most influential sources:

### 1. `src/cli/install-cursor.ts` (internal, ground truth)
The definitive reference for the hooks wiring: the Cursor-specific `hooks.json` shape, the six lifecycle events, the idempotent + Windows-safe merge, and the trust-fingerprint-preserving conditional write. Everything in `guides/04`, the hooks template, and the hooks example derives from it.

### 2. Cursor Agent Hooks docs (`external/2026-06-16-cursor-hooks-official-docs.md`)
Backs the `hooks.json` schema and confirms how Cursor's shape differs from Claude Code / Codex (no outer wrapper, sibling `matcher`).

### 3. `.cursor/rules/*.mdc` live rules (internal)
The three shipped rules (`no-em-dashes`, `plan-construction-protocol`, `respect-agent-work-boundaries`) are the canonical `.mdc` examples and the Army's guardrails.

### 4. Cursor Rules official docs (`external/2026-05-20-cursor-rules-official-docs.md`)
The authoritative definition of the four activation modes and the three frontmatter fields, for `guides/01` and `guides/02`.

### 5. `src/mcp/server.ts` + `harnesses/cursor/extension/` (internal)
The MCP server's three tools and the extension's contributions/build, for `guides/03` and `guides/06`.

## Open questions

1. **Exact MCP launch command for a global install.** The `mcp.json` example uses a placeholder for how `@deeplake/hivemind` launches the MCP server; confirm the package's actual MCP bin/subcommand before shipping a copy-paste config.
2. **Cursor MCP auto-approval granularity.** Per-tool vs global auto-approval UI may shift across Cursor releases; re-verify on a major version.

## Handoff boundaries (not in scope for this stinger)

- MCP server tool schemas / transport -> `mcp-protocol-worker-bee`.
- Harness wiring for Claude / Codex / Hermes -> `harness-integration-worker-bee`.
- TypeScript quality of `install-cursor.ts` / extension -> `typescript-node-worker-bee`.
- TypeScript/UI code in the extension webview -> `typescript-node-worker-bee`.
- Extension publish / CI -> `ci-release-worker-bee`.
