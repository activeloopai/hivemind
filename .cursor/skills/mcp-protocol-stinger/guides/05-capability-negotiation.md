# 05 - Capability Negotiation and Lifecycle

The MCP handshake, what capabilities a server declares, and what the SDK does for you.

---

## The lifecycle, in order

Every MCP session follows this sequence over the chosen transport:

1. **`initialize` (request, client -> server).** The client sends its protocol version and its capabilities.
2. **`initialize` result (server -> client).** The server replies with the protocol version it agrees to, its `serverInfo` (name + version), and the set of capabilities it supports.
3. **`notifications/initialized` (notification, client -> server).** The client confirms it is ready. No response - notifications never get one.
4. **Normal operation.** `tools/list`, `tools/call`, and (if declared) `resources/*`, `prompts/*` flow.
5. **Shutdown.** For stdio, the client closes stdin and the process exits. There is no in-protocol "shutdown" RPC for stdio; transport closure ends the session.

---

## Capabilities are a contract, not decoration

The server declares which primitive groups it supports during `initialize`. A client must not call into a group the server did not declare. Common server capabilities:

- `tools` - the server exposes callable tools (optionally with `listChanged` if the tool set can change at runtime).
- `resources` - readable resources (optionally `subscribe`, `listChanged`).
- `prompts` - prompt templates (optionally `listChanged`).
- `logging` - the server can emit log notifications to the client.

Hivemind declares **tools only**, because it registers only tools. It does not advertise `resources` or `prompts`, so no client will attempt `resources/read` against it. That is correct: declaring a capability you do not implement is a contract lie that produces method-not-found (`-32601`) when a client takes you at your word.

---

## What the SDK handles

`McpServer` from `@modelcontextprotocol/sdk` performs the handshake for you. Hivemind's construction:

```typescript
const server = new McpServer({
  name: "hivemind",
  version: getVersion(),
});
```

- `name` and `version` populate `serverInfo` in the `initialize` result. `getVersion()` reads the synced package version (kept in lockstep by `scripts/sync-versions.mjs` so the bundle reports the same version as `package.json`).
- Each `registerTool(...)` call adds to the `tools` capability and the `tools/list` response. The SDK derives the `tools` capability declaration from the fact that tools were registered - you do not hand-write a capabilities object.
- Protocol-version negotiation, the `initialized` notification, and `tools/list` are all SDK-internal.

This means most capability-negotiation defects are *omissions or mismatches*, not handshake bugs:
- Wrong or stale `version` (fix the version sync, not the handshake).
- A misleading `name` that collides with another server in a multi-server harness config.
- Manually declaring `resources`/`prompts` capability while registering none.

---

## Audit checklist (capabilities + lifecycle)

- [ ] `serverInfo.name` is stable and unique across the harness's server set (`"hivemind"`).
- [ ] `serverInfo.version` reflects the real build version (synced, not hard-coded).
- [ ] Declared capabilities match implemented primitives - tools-only here, no phantom `resources`/`prompts`.
- [ ] No client-side calls into undeclared capability groups.
- [ ] `connect(transport)` is called exactly once; the handshake is left to the SDK.
- [ ] Notifications (e.g. `initialized`) are not awaited for a response.

---

*Sources: `research/2026-06-16-mcp-spec-lifecycle.md`, `research/2026-06-16-mcp-sdk-typescript.md`*
