# Source: MCP Server Registration (Hermes)

- **Retrieved:** 2026-06-16
- **Source type:** Hivemind repo (authoritative) + Hermes config docs
- **In-repo anchors:** `src/cli/install-hermes.ts`, `src/cli/install-mcp-shared.ts`, `src/mcp/server.ts`

---

## When MCP is used

Hermes is the harness that registers the Hivemind MCP server. It wires three ways at once (per `src/cli/install-hermes.ts`):

1. Shell hooks via `~/.hermes/config.yaml` `hooks:` key - capture lifecycle.
2. The MCP server via `~/.hermes/config.yaml` `mcp_servers:` key - direct `hivemind_search`/`read`/`index` recall (read-only).
3. A skill (`hivemind-memory`) documenting the tools.

Claude Code and Cursor use hooks; pi and OpenClaw use native extensions. Do not assume every host has an MCP transport.

## The MCP server

`src/mcp/server.ts` exposes the contracted tools over MCP:
- `hivemind_search { query, limit? }` - keyword/regex search across summaries + sessions
- `hivemind_read { path }` - full content at a memory path
- `hivemind_index { prefix?, limit? }` - list summary entries

One `hivemind_search` call returns ranked hits across all summaries and sessions in a single SQL query.

## Registration via the shared helper

`install-mcp-shared.ts` exports `ensureMcpServerInstalled` and `MCP_SERVER_PATH`. The hermes installer uses them rather than hand-rolling the wiring; constants: `HERMES_HOME = ~/.hermes`, `CONFIG_PATH = ~/.hermes/config.yaml`, `SERVER_KEY = "hivemind"`.

```yaml
mcp_servers:
  hivemind:
    command: node
    args:
      - /home/<user>/.hermes/hivemind/bundle/mcp-server.js
```

## Idempotency

- Upsert the `hivemind` key under `mcp_servers` (replace, never append).
- Recognize an existing hivemind shell hook by bundle path before adding:

```typescript
function isHivemindHook(entry: unknown): boolean {
  const cmd = (entry as { command?: string })?.command;
  return typeof cmd === "string" && cmd.includes("/.hermes/hivemind/bundle/");
}
```

Re-running install converges on both surfaces with no duplicates. The MCP surface stays on the cross-host contract.
