# Research Plan: harness-integration-stinger

- **Depth tier:** normal
- **Time window:** anchored to retrieval date 2026-06-16
- **Page budget target:** 7 source files (one per harness mechanism)
- **Source breadth target:** the Hivemind repo itself (src/cli/install-*.ts, src/mcp/server.ts, src/skillify/gate-runner.ts, harnesses/<agent>/, scripts/audit-openclaw-bundle.mjs) plus host docs for Claude Code plugins, Cursor 1.7+ hooks, Codex hooks, Hermes config, pi extensions, and OpenClaw/ClawHub.

## Investigation areas (from command brief)

1. The shared-core + per-harness-bundle build model (tsc + esbuild)
2. Capability detection + auto-install across the six installers
3. The capture/recall hook lifecycle and its events/timeouts
4. The cross-host tool/command contract
5. Native extension adapters (Cursor, pi, OpenClaw)
6. MCP server registration in hermes
7. Distribution gates: Claude Code marketplace plugin + OpenClaw ClawHub static scanner

## Source-of-truth log

| Area | Primary source (in-repo) |
|---|---|
| Build model + bundle paths | `harnesses/<agent>/`, `harnesses/claude-code/hooks/hooks.json` |
| Capability detection | `src/cli/install-scan.ts`, `src/cli/install-*.ts` |
| Hook lifecycle | `harnesses/claude-code/hooks/hooks.json` (7 events) |
| Tool/command contract | `harnesses/openclaw/openclaw.plugin.json`, `src/mcp/server.ts` |
| Extension adapters | `harnesses/cursor/extension/`, `harnesses/pi/extension-source/hivemind.ts`, `harnesses/openclaw/` |
| MCP registration | `src/cli/install-hermes.ts`, `src/cli/install-mcp-shared.ts`, `src/mcp/server.ts` |
| ClawHub audit | `src/skillify/gate-runner.ts`, `scripts/audit-openclaw-bundle.mjs` |
