# Example: Register the MCP Server in Hermes

**Demonstrates:** `guides/05-mcp-registration.md`, `guides/03-tool-contract.md`

This example registers the Hivemind MCP server (`src/mcp/server.ts`) under `mcp_servers.hivemind` in `~/.hermes/config.yaml`, idempotently.

---

## Flow

```
Detect hermes → lay down the bundled MCP server → upsert mcp_servers.hivemind
  → upsert the shell hooks → verify no duplicate entries on re-run
```

---

## Step 1: Detect hermes and resolve paths

```typescript
import { join } from "node:path";
import { homedir } from "node:os";
import { ensureMcpServerInstalled, MCP_SERVER_PATH } from "./install-mcp-shared.js";

const HERMES_HOME  = join(homedir(), ".hermes");
const CONFIG_PATH  = join(HERMES_HOME, "config.yaml");
const HIVEMIND_DIR = join(HERMES_HOME, "hivemind");
const BUNDLE_DIR   = join(HIVEMIND_DIR, "bundle");
const SERVER_KEY   = "hivemind";
```

## Step 2: Lay down the bundled server and upsert the config key

Use the shared helper so the wiring logic lives in one place:

```typescript
await ensureMcpServerInstalled(BUNDLE_DIR);   // copies MCP_SERVER_PATH into the bundle

// Upsert mcp_servers.hivemind - replace, never append a duplicate
const config = readYaml(CONFIG_PATH);
config.mcp_servers ??= {};
config.mcp_servers[SERVER_KEY] = {
  command: "node",
  args: [join(BUNDLE_DIR, "mcp-server.js")],
};
writeYaml(CONFIG_PATH, config);
```

Resulting `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  hivemind:
    command: node
    args:
      - /home/<user>/.hermes/hivemind/bundle/mcp-server.js
```

The server exposes the contracted tools: `hivemind_search { query, limit? }`, `hivemind_read { path }`, `hivemind_index { prefix?, limit? }`.

## Step 3: Upsert the shell hooks (idempotent)

Hermes also gets the capture lifecycle via shell hooks. Recognize an existing hivemind hook by its bundle path before adding, so re-install does not duplicate:

```typescript
function isHivemindHook(entry: unknown): boolean {
  const cmd = (entry as { command?: string })?.command;
  return typeof cmd === "string" && cmd.includes("/.hermes/hivemind/bundle/");
}

config.hooks = (config.hooks ?? []).filter((e: unknown) => !isHivemindHook(e));
config.hooks.push(...hivemindHookEntries(BUNDLE_DIR));   // re-add the current set
```

## Step 4: Verify idempotency

Run the installer twice. `mcp_servers.hivemind` is replaced in place (one entry), and the hivemind hooks are filtered then re-added (no duplicates). Both surfaces converge.

---

## Key patterns demonstrated

1. **MCP only where supported** - hermes takes MCP; Claude Code/Cursor use hooks; pi/OpenClaw use extensions.
2. **Reuse `install-mcp-shared.ts`** - one place for MCP wiring across MCP-capable hosts.
3. **Upsert, never append** - replace the `hivemind` key; filter-then-readd the hooks.
4. **Recognize prior entries by bundle path** - `isHivemindHook` guards re-install.
5. **The MCP surface is on the contract** - identical tool names/args/returns to every other host.
