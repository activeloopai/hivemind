# Guide 05: Registering the MCP Server (Hermes)

**Sources:** `research/external/2026-06-16-mcp-registration.md`, `research/external/2026-06-16-tool-contract.md`

---

## When MCP is the right transport

Use the MCP server when the host speaks MCP and you want direct, read-only tool access rather than (or in addition to) lifecycle hooks. Of the six harnesses, **hermes** is the one that registers the Hivemind MCP server. Claude Code and Cursor deliver recall through hooks; pi and OpenClaw use native extensions. Do not assume every host has an MCP transport.

Hermes wires three ways at once (see `src/cli/install-hermes.ts`):
1. Shell hooks via `~/.hermes/config.yaml` `hooks:` key - capture lifecycle.
2. The MCP server via `~/.hermes/config.yaml` `mcp_servers:` key - direct `hivemind_search`/`read`/`index` recall.
3. A skill (`hivemind-memory`) documenting the tools for the agent.

---

## The MCP server

The shared MCP server lives at `src/mcp/server.ts`. It exposes the contracted tools over MCP:

- `hivemind_search { query, limit? }` - keyword/regex search across summaries + sessions
- `hivemind_read { path }` - read full content at a memory path (e.g. `/summaries/alice/abc.md`)
- `hivemind_index { prefix?, limit? }` - list summary entries

One `hivemind_search` call returns ranked hits across all summaries and sessions in a single SQL query.

> Source: `research/external/2026-06-16-mcp-registration.md`

---

## Registering it in hermes' config.yaml

The installer registers the server under the `mcp_servers.hivemind` key. Use the shared helper rather than hand-rolling the wiring:

```typescript
// src/cli/install-hermes.ts
import { ensureMcpServerInstalled, MCP_SERVER_PATH } from "./install-mcp-shared.js";

const HERMES_HOME = join(homedir(), ".hermes");
const CONFIG_PATH = join(HERMES_HOME, "config.yaml");
const SERVER_KEY = "hivemind";
```

The resulting `config.yaml` stanza:

```yaml
mcp_servers:
  hivemind:
    command: node
    args:
      - /home/<user>/.hermes/hivemind/bundle/mcp-server.js
    # transport: stdio (default)
```

`ensureMcpServerInstalled` lays down the bundled server (`MCP_SERVER_PATH`) and upserts the `hivemind` key. Reuse it for any future MCP-capable host so the registration logic stays in one place.

---

## Idempotent registration

Registering must converge on re-install. The hermes installer:

- Upserts the `hivemind` key under `mcp_servers` (replace, never append a duplicate).
- Recognizes an existing hivemind shell hook by its bundle path before adding one:

```typescript
function isHivemindHook(entry: unknown): boolean {
  const cmd = (entry as { command?: string })?.command;
  return typeof cmd === "string" && cmd.includes("/.hermes/hivemind/bundle/");
}
```

This guards against a re-install doubling either the MCP entry or the hook entries.

> Source: `research/external/2026-06-16-mcp-registration.md`

---

## Keep the MCP surface on the contract

The tools the MCP server exposes are the same contracted tools every other host exposes. When you add a tool to the MCP server, add it to the pi extension and the OpenClaw plugin in the same change so the surface stays identical (see `guides/03-tool-contract.md`). The MCP server is one expression of the contract, not a place to add host-specific tools.

---

*See also:* `examples/register-mcp-in-hermes.md` for the end-to-end registration, and `guides/03-tool-contract.md` for the tool surface.
